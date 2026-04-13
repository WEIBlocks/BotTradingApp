import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { trainingUploads } from '../../db/schema/training.js';
import { llmChat, getActiveProvider } from '../../config/ai.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
// ─── Upload Management ──────────────────────────────────────────────────────
export async function uploadFile(userId, botId, type, name, fileUrl, fileSize) {
    const [upload] = await db
        .insert(trainingUploads)
        .values({
        userId,
        botId,
        type,
        name,
        fileUrl,
        fileSize: fileSize ?? null,
        status: 'pending',
    })
        .returning();
    return upload;
}
export async function getUploads(userId, botId) {
    const uploads = await db
        .select()
        .from(trainingUploads)
        .where(and(eq(trainingUploads.userId, userId), eq(trainingUploads.botId, botId)));
    return uploads;
}
export async function getUploadById(userId, uploadId) {
    const [upload] = await db
        .select()
        .from(trainingUploads)
        .where(and(eq(trainingUploads.userId, userId), eq(trainingUploads.id, uploadId)));
    return upload ?? null;
}
// ─── Training Summary ───────────────────────────────────────────────────────
export async function getTrainingSummary(userId, botId) {
    const uploads = await db
        .select()
        .from(trainingUploads)
        .where(and(eq(trainingUploads.userId, userId), eq(trainingUploads.botId, botId)));
    const total = uploads.length;
    const complete = uploads.filter((u) => u.status === 'complete').length;
    const processing = uploads.filter((u) => u.status === 'processing').length;
    const pending = uploads.filter((u) => u.status === 'pending').length;
    const errors = uploads.filter((u) => u.status === 'error').length;
    const allPatterns = [];
    const allIndicators = [];
    const allEntryRules = [];
    const allExitRules = [];
    const summaries = [];
    for (const u of uploads) {
        if (u.status !== 'complete' || !u.analysisResult)
            continue;
        const r = u.analysisResult;
        if (Array.isArray(r.patterns))
            allPatterns.push(...r.patterns);
        if (Array.isArray(r.indicators)) {
            for (const ind of r.indicators) {
                if (typeof ind === 'string')
                    allIndicators.push(ind);
                else if (ind && typeof ind === 'object' && 'name' in ind)
                    allIndicators.push(ind.name);
            }
        }
        if (Array.isArray(r.entryRules))
            allEntryRules.push(...r.entryRules);
        if (Array.isArray(r.exitRules))
            allExitRules.push(...r.exitRules);
        if (typeof r.summary === 'string')
            summaries.push(r.summary);
    }
    return {
        total,
        complete,
        processing,
        pending,
        errors,
        trained: complete > 0,
        insights: {
            patterns: [...new Set(allPatterns)],
            indicators: [...new Set(allIndicators)],
            entryRules: [...new Set(allEntryRules)],
            exitRules: [...new Set(allExitRules)],
            summaries,
        },
        uploads: uploads.map((u) => ({
            id: u.id,
            name: u.name,
            type: u.type,
            status: u.status,
            analysisResult: u.analysisResult,
            errorMessage: u.errorMessage,
            fileSize: u.fileSize,
            createdAt: u.createdAt,
        })),
    };
}
// ─── File Content Reader ────────────────────────────────────────────────────
/**
 * Reads a document file from disk and returns its text content.
 * Supports plain text, CSV, and basic PDF text extraction.
 */
function readDocumentContent(fileUrl, name) {
    try {
        // Resolve the actual path on disk
        let filePath = fileUrl;
        if (fileUrl.startsWith('/uploads/')) {
            filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
        }
        if (!fs.existsSync(filePath)) {
            return '';
        }
        const ext = path.extname(name).toLowerCase();
        const buffer = fs.readFileSync(filePath);
        // Plain text / CSV / markdown
        if (['.txt', '.csv', '.md', '.json'].includes(ext)) {
            return buffer.toString('utf8').substring(0, 8000);
        }
        // PDF: extract raw text by reading printable ASCII bytes
        // (basic extraction — good enough for strategy docs without a PDF library)
        if (ext === '.pdf') {
            const raw = buffer.toString('latin1');
            // Extract text between BT/ET markers (PDF text objects) or just printable chars
            const textChunks = [];
            const btMatches = raw.matchAll(/BT([\s\S]*?)ET/g);
            for (const m of btMatches) {
                // Extract strings from Tj / TJ operators
                const strMatches = m[1].matchAll(/\(([^)]{1,200})\)\s*Tj/g);
                for (const s of strMatches) {
                    const decoded = s[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
                    textChunks.push(decoded);
                }
            }
            const extracted = textChunks.join(' ').replace(/\s+/g, ' ').trim();
            if (extracted.length > 100)
                return extracted.substring(0, 8000);
            // Fallback: grab all printable ASCII sequences ≥ 4 chars
            const printable = raw.match(/[ -~]{4,}/g) || [];
            return printable.join(' ').substring(0, 8000);
        }
        // DOC/DOCX: extract printable text sequences
        if (['.doc', '.docx'].includes(ext)) {
            const raw = buffer.toString('utf8', 0, Math.min(buffer.length, 100000));
            // For DOCX (zip), extract w:t tag content
            const wtMatches = raw.matchAll(/<w:t[^>]*>([^<]{1,500})<\/w:t>/g);
            const chunks = [];
            for (const m of wtMatches)
                chunks.push(m[1]);
            if (chunks.length > 0)
                return chunks.join(' ').substring(0, 8000);
            // Fallback printable
            const printable = raw.match(/[ -~]{4,}/g) || [];
            return printable.join(' ').substring(0, 8000);
        }
        // Generic fallback: printable ASCII
        const raw = buffer.toString('latin1');
        const printable = raw.match(/[ -~]{4,}/g) || [];
        return printable.join(' ').substring(0, 8000);
    }
    catch (err) {
        console.warn('[Training] Could not read file:', err);
        return '';
    }
}
// ─── Pre-upload Relevance Check ─────────────────────────────────────────────
/**
 * Quickly checks if a file name or extracted text looks trading-related
 * BEFORE running the expensive AI analysis. Returns rejection reason if not.
 */
function quickRelevanceCheck(fileName, content) {
    const text = (fileName + ' ' + content).toLowerCase();
    const tradingKeywords = /\b(trade|trading|stock|crypto|bitcoin|ethereum|market|price|chart|candlestick|indicator|strategy|portfolio|profit|loss|buy|sell|position|risk|volume|trend|bullish|bearish|support|resistance|moving average|rsi|macd|ema|sma|atr|bollinger|fibonacci|momentum|scalp|swing|breakout|dca|grid|futures|options|forex|leverage|margin|order|bid|ask|spread|technical|fundamental|equity|fund|etf|ticker|dividend|earnings|p\/e|yield)\b/i;
    if (!tradingKeywords.test(text)) {
        return { valid: false, reason: 'Content does not appear to be related to trading, markets, or finance. Only upload trading strategies, market analysis, or financial documents.' };
    }
    return { valid: true, reason: '' };
}
// ─── AI Analysis ────────────────────────────────────────────────────────────
const CHART_ANALYSIS_SYSTEM = `You are an expert technical analyst reviewing images for a trading bot training platform.

IMPORTANT: First determine if this image is actually a trading/financial chart or graph. If it is NOT a trading chart (e.g. it is a photo, selfie, meme, screenshot of text, logo, random image, nature photo, food, person, animal, or anything unrelated to financial markets), you MUST respond with:
{ "isTrading": false, "rejected": true, "reason": "Image is not a trading or financial chart." }

Only if the image IS a trading/financial chart, extract:
1. Chart patterns (head and shoulders, double top/bottom, triangles, flags, etc.)
2. Support & resistance levels visible
3. Trend direction and strength
4. Technical indicators shown
5. Volume analysis if visible
6. Potential trade setup
7. Timeframe if identifiable

Respond with valid JSON only:
{
  "isTrading": true,
  "patterns": string[],
  "supportLevels": string[],
  "resistanceLevels": string[],
  "trend": { "direction": "bullish" | "bearish" | "sideways", "strength": "strong" | "moderate" | "weak" },
  "indicators": { "name": string, "reading": string }[],
  "tradeSetup": string,
  "timeframe": string,
  "summary": string,
  "confidence": number (0-100)
}`;
const DOCUMENT_ANALYSIS_SYSTEM = `You are an expert trading strategy analyst reviewing documents for a bot training platform.

Analyze the provided trading strategy document content and extract:
1. **Strategy Type**: The overall type of strategy described
2. **Entry Rules**: Conditions for entering trades
3. **Exit Rules**: Conditions for exiting trades (take profit, stop loss)
4. **Risk Management**: Position sizing, max drawdown limits, etc.
5. **Indicators Used**: Technical indicators the strategy relies on
6. **Markets/Pairs**: Which markets or trading pairs this applies to
7. **Timeframe**: Recommended trading timeframe
8. **Key Parameters**: Any specific numerical parameters mentioned

Respond with valid JSON only:
{
  "strategyType": string,
  "entryRules": string[],
  "exitRules": string[],
  "riskManagement": string[],
  "indicators": string[],
  "pairs": string[],
  "timeframe": string,
  "parameters": { "name": string, "value": string }[],
  "summary": string,
  "applicability": "high" | "medium" | "low"
}`;
function parseJsonResponse(rawText) {
    try {
        return JSON.parse(rawText);
    }
    catch {
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            }
            catch { }
        }
        // Try to find bare JSON object
        const objMatch = rawText.match(/\{[\s\S]*\}/);
        if (objMatch) {
            try {
                return JSON.parse(objMatch[0]);
            }
            catch { }
        }
        return { summary: rawText.substring(0, 500), parseError: true };
    }
}
async function analyzeImage(fileUrl) {
    const response = await llmChat([{ role: 'user', content: 'Is this a trading or financial chart? If yes, analyze it. If no, reject it.' }], { system: CHART_ANALYSIS_SYSTEM, maxTokens: 1500, imageUrl: fileUrl });
    const result = parseJsonResponse(response.text);
    // Hard reject: AI explicitly said this is not a trading chart
    if (result.isTrading === false || result.rejected === true) {
        return {
            rejected: true,
            reason: typeof result.reason === 'string'
                ? result.reason
                : 'Image is not a trading or financial chart. Only upload chart screenshots or financial graphs.',
        };
    }
    return result;
}
async function analyzeDocument(fileUrl, name) {
    // Read the actual file content from disk
    const fileContent = readDocumentContent(fileUrl, name);
    if (!fileContent || fileContent.trim().length < 50) {
        return {
            summary: `Document "${name}" could not be read — file may be empty, corrupted, or in an unsupported format.`,
            parseError: true,
            unreadable: true,
        };
    }
    const response = await llmChat([
        {
            role: 'user',
            content: `Analyze this trading strategy document titled "${name}":\n\n${fileContent}\n\nExtract the strategy details and parameters for bot training.`,
        },
    ], { system: DOCUMENT_ANALYSIS_SYSTEM, maxTokens: 1500 });
    return parseJsonResponse(response.text);
}
// ─── Start Training ─────────────────────────────────────────────────────────
export async function startTraining(userId, botId) {
    const pendingUploads = await db
        .select()
        .from(trainingUploads)
        .where(and(eq(trainingUploads.userId, userId), eq(trainingUploads.botId, botId), eq(trainingUploads.status, 'pending')));
    if (pendingUploads.length === 0) {
        return { message: 'No files to process', filesProcessed: 0, results: [] };
    }
    const hasProvider = getActiveProvider() !== null;
    const results = [];
    for (const upload of pendingUploads) {
        await db
            .update(trainingUploads)
            .set({ status: 'processing' })
            .where(eq(trainingUploads.id, upload.id));
        let analysis = null;
        let status = 'complete';
        let errorMessage = null;
        try {
            // ── STEP 1: Pre-check relevance before spending AI tokens ──────────────
            if (upload.type === 'video') {
                // Local video files cannot be analyzed — only YouTube links (handled via /ai/youtube/learn)
                // Check if it's a relevant video by name keywords
                const nameCheck = quickRelevanceCheck(upload.name, '');
                if (!nameCheck.valid) {
                    status = 'error';
                    errorMessage = 'Not relevant to trading: ' + nameCheck.reason;
                    analysis = { rejected: true, reason: nameCheck.reason };
                }
                else {
                    // Local video: we can't extract content, mark it accepted but note limitation
                    analysis = {
                        summary: `Video file "${upload.name}" uploaded. For full AI analysis, use the YouTube URL option in the Videos tab to provide a video with a transcript.`,
                        note: 'Local video files cannot be analyzed directly. Use the YouTube URL feature for transcript-based training.',
                        type: 'video_local',
                    };
                }
            }
            else if (upload.type === 'document') {
                // Read file content first
                const fileContent = readDocumentContent(upload.fileUrl ?? '', upload.name);
                const relevanceCheck = quickRelevanceCheck(upload.name, fileContent);
                if (!relevanceCheck.valid) {
                    // Reject immediately — no need to call AI
                    status = 'error';
                    errorMessage = 'Not relevant to trading: ' + relevanceCheck.reason;
                    analysis = { rejected: true, reason: relevanceCheck.reason };
                }
                else if (!hasProvider) {
                    analysis = {
                        note: 'AI analysis unavailable — no AI provider API key configured.',
                        summary: 'Document uploaded successfully.',
                    };
                }
                else {
                    analysis = await analyzeDocument(upload.fileUrl ?? '', upload.name);
                }
            }
            else if (upload.type === 'image') {
                if (!hasProvider) {
                    analysis = {
                        note: 'AI analysis unavailable — no AI provider API key configured.',
                        summary: 'Image uploaded successfully.',
                    };
                }
                else {
                    analysis = await analyzeImage(upload.fileUrl ?? '');
                    // analyzeImage returns { rejected: true } for non-chart images
                    if (analysis.rejected === true) {
                        status = 'error';
                        errorMessage = typeof analysis.reason === 'string'
                            ? analysis.reason
                            : 'Image is not a trading chart. Only upload chart screenshots or financial graphs.';
                    }
                }
            }
        }
        catch (err) {
            status = 'error';
            errorMessage = err instanceof Error ? err.message : 'Unknown analysis error';
            analysis = { error: errorMessage };
        }
        // ── STEP 2: If analysis succeeded, validate trading relevance from AI output ──
        if (status === 'complete' && analysis && hasProvider) {
            try {
                const { validateTrainingContent } = await import('../ai/ai.service.js');
                const analysisSummary = [
                    typeof analysis.summary === 'string' ? analysis.summary : '',
                    Array.isArray(analysis.patterns) ? analysis.patterns.join(' ') : '',
                    Array.isArray(analysis.entryRules) ? analysis.entryRules.join(' ') : '',
                    Array.isArray(analysis.exitRules) ? analysis.exitRules.join(' ') : '',
                    Array.isArray(analysis.indicators)
                        ? analysis.indicators.map(i => typeof i === 'string' ? i : i?.name || '').join(' ')
                        : '',
                    typeof analysis.strategyType === 'string' ? analysis.strategyType : '',
                    typeof analysis.tradeSetup === 'string' ? analysis.tradeSetup : '',
                ].filter(Boolean).join(' ');
                const validation = validateTrainingContent(analysisSummary || upload.name);
                if (!validation.valid && !analysis.unreadable) {
                    status = 'error';
                    errorMessage = 'Not relevant to trading: ' + validation.reason;
                    analysis = { rejected: true, reason: validation.reason };
                }
            }
            catch { }
        }
        // ── STEP 3: Persist result ───────────────────────────────────────────────
        await db
            .update(trainingUploads)
            .set({
            status: status,
            analysisResult: analysis,
            errorMessage,
        })
            .where(eq(trainingUploads.id, upload.id));
        // ── STEP 4: Store in RAG only if relevant ────────────────────────────────
        if (status === 'complete' && analysis && !analysis.rejected) {
            try {
                const { storeTrainingChunks } = await import('../../lib/rag.js');
                await storeTrainingChunks({
                    userId,
                    botId,
                    sourceType: upload.type ?? 'document',
                    sourceId: upload.id,
                    text: JSON.stringify(analysis),
                    metadata: { fileName: upload.name, uploadId: upload.id },
                });
            }
            catch (ragErr) {
                console.error('[Training] RAG storage failed:', ragErr);
            }
        }
        results.push({ id: upload.id, name: upload.name, type: upload.type, status, analysis });
    }
    const successCount = results.filter((r) => r.status === 'complete').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    return {
        message: `Training complete: ${successCount} files analyzed${errorCount > 0 ? `, ${errorCount} not relevant or failed` : ''}`,
        filesProcessed: results.length,
        successCount,
        errorCount,
        results,
    };
}
