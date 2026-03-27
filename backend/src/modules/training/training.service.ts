import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { trainingUploads } from '../../db/schema/training.js';
import { llmChat, getActiveProvider } from '../../config/ai.js';

// ─── Upload Management ──────────────────────────────────────────────────────

export async function uploadFile(
  userId: string,
  botId: string,
  type: 'image' | 'video' | 'document',
  name: string,
  fileUrl: string,
  fileSize?: number,
) {
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

export async function getUploads(userId: string, botId: string) {
  const uploads = await db
    .select()
    .from(trainingUploads)
    .where(
      and(
        eq(trainingUploads.userId, userId),
        eq(trainingUploads.botId, botId),
      ),
    );

  return uploads;
}

export async function getUploadById(userId: string, uploadId: string) {
  const [upload] = await db
    .select()
    .from(trainingUploads)
    .where(
      and(
        eq(trainingUploads.userId, userId),
        eq(trainingUploads.id, uploadId),
      ),
    );
  return upload ?? null;
}

// ─── Training Summary ───────────────────────────────────────────────────────

export async function getTrainingSummary(userId: string, botId: string) {
  const uploads = await db
    .select()
    .from(trainingUploads)
    .where(
      and(
        eq(trainingUploads.userId, userId),
        eq(trainingUploads.botId, botId),
      ),
    );

  const total = uploads.length;
  const complete = uploads.filter((u) => u.status === 'complete').length;
  const processing = uploads.filter((u) => u.status === 'processing').length;
  const pending = uploads.filter((u) => u.status === 'pending').length;
  const errors = uploads.filter((u) => u.status === 'error').length;

  // Aggregate insights from all completed analyses
  const allPatterns: string[] = [];
  const allIndicators: string[] = [];
  const allEntryRules: string[] = [];
  const allExitRules: string[] = [];
  const summaries: string[] = [];

  for (const u of uploads) {
    if (u.status !== 'complete' || !u.analysisResult) continue;
    const r = u.analysisResult as Record<string, unknown>;

    if (Array.isArray(r.patterns)) allPatterns.push(...r.patterns);
    if (Array.isArray(r.indicators)) {
      for (const ind of r.indicators) {
        if (typeof ind === 'string') allIndicators.push(ind);
        else if (ind && typeof ind === 'object' && 'name' in (ind as any))
          allIndicators.push((ind as any).name);
      }
    }
    if (Array.isArray(r.entryRules)) allEntryRules.push(...r.entryRules);
    if (Array.isArray(r.exitRules)) allExitRules.push(...r.exitRules);
    if (typeof r.summary === 'string') summaries.push(r.summary);
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

// ─── AI Analysis ────────────────────────────────────────────────────────────

const CHART_ANALYSIS_SYSTEM = `You are an expert technical analyst reviewing trading charts and images for a bot training platform.

Analyze the provided chart image and extract:
1. **Identified Patterns**: List any chart patterns (head and shoulders, double top/bottom, triangles, flags, wedges, channels, etc.)
2. **Support & Resistance Levels**: Key price levels visible on the chart
3. **Trend Direction**: Current trend (bullish, bearish, sideways) and strength
4. **Indicators Visible**: Any technical indicators shown and their current readings
5. **Volume Analysis**: Volume patterns if visible
6. **Potential Trade Setup**: Based on the patterns, what trade setups could be derived
7. **Timeframe Estimate**: Estimated timeframe of the chart if identifiable

Respond with valid JSON:
{
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

Analyze the provided trading strategy document and extract:
1. **Strategy Type**: The overall type of strategy described
2. **Entry Rules**: Conditions for entering trades
3. **Exit Rules**: Conditions for exiting trades (take profit, stop loss)
4. **Risk Management**: Position sizing, max drawdown limits, etc.
5. **Indicators Used**: Technical indicators the strategy relies on
6. **Markets/Pairs**: Which markets or trading pairs this applies to
7. **Timeframe**: Recommended trading timeframe
8. **Key Parameters**: Any specific numerical parameters mentioned

Respond with valid JSON:
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

async function analyzeImage(fileUrl: string): Promise<Record<string, unknown>> {
  const response = await llmChat(
    [{ role: 'user', content: 'Analyze this trading chart and extract insights for bot training.' }],
    {
      system: CHART_ANALYSIS_SYSTEM,
      maxTokens: 1500,
      imageUrl: fileUrl,
    },
  );

  const rawText = response.text;

  try {
    return JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        return { summary: rawText, parseError: true };
      }
    }
    return { summary: rawText, parseError: true };
  }
}

async function analyzeDocument(
  fileUrl: string,
  name: string,
): Promise<Record<string, unknown>> {
  const response = await llmChat(
    [
      {
        role: 'user',
        content: `Analyze this trading strategy document titled "${name}" available at: ${fileUrl}\n\nExtract the strategy details and parameters for bot training.`,
      },
    ],
    {
      system: DOCUMENT_ANALYSIS_SYSTEM,
      maxTokens: 1500,
    },
  );

  const rawText = response.text;

  try {
    return JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        return { summary: rawText, parseError: true };
      }
    }
    return { summary: rawText, parseError: true };
  }
}

// ─── Start Training ─────────────────────────────────────────────────────────

export async function startTraining(userId: string, botId: string) {
  // Fetch all pending/processing uploads for this bot
  const pendingUploads = await db
    .select()
    .from(trainingUploads)
    .where(
      and(
        eq(trainingUploads.userId, userId),
        eq(trainingUploads.botId, botId),
        eq(trainingUploads.status, 'pending'),
      ),
    );

  if (pendingUploads.length === 0) {
    return {
      message: 'No files to process',
      filesProcessed: 0,
      results: [],
    };
  }

  const hasProvider = getActiveProvider() !== null;
  const results: Array<{
    id: string | null;
    name: string;
    type: string | null;
    status: string;
    analysis: Record<string, unknown> | null;
  }> = [];

  for (const upload of pendingUploads) {
    // Mark as processing
    await db
      .update(trainingUploads)
      .set({ status: 'processing' as const })
      .where(eq(trainingUploads.id, upload.id!));

    let analysis: Record<string, unknown> | null = null;
    let status = 'complete';
    let errorMessage: string | null = null;

    try {
      if (!hasProvider) {
        analysis = {
          note: 'AI analysis unavailable - no AI provider API key configured',
          summary: 'File uploaded successfully. AI analysis requires an API key to be configured.',
        };
      } else if (upload.type === 'image') {
        analysis = await analyzeImage(upload.fileUrl);
      } else if (upload.type === 'document') {
        analysis = await analyzeDocument(upload.fileUrl, upload.name);
      } else if (upload.type === 'video') {
        // Try to extract YouTube URL from metadata or file name
        const youtubeUrl = (upload as any).metadata?.youtubeUrl || '';
        if (youtubeUrl) {
          try {
            const { getVideoInfo, getTranscript } = await import('../../lib/youtube.js');
            const info = await getVideoInfo(youtubeUrl);
            const transcript = await getTranscript(youtubeUrl);
            if (info && transcript) {
              const aiResult = await llmChat(
                [{
                  role: 'user',
                  content: `Analyze this trading video transcript and extract strategies, key concepts, and actionable insights:\n\nTitle: ${info.title}\nChannel: ${info.channelTitle}\nTranscript:\n${transcript.substring(0, 5000)}`,
                }],
                {
                  system: 'You are a trading education analyst. Extract trading strategies, indicators, patterns, and key lessons from video content. Return as structured JSON with: strategies[], indicators[], patterns[], keyTakeaways[], actionableInsights[]',
                  maxTokens: 1500,
                },
              );
              const rawText = aiResult.text;
              try {
                analysis = JSON.parse(rawText);
              } catch {
                const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (jsonMatch) {
                  try { analysis = JSON.parse(jsonMatch[1].trim()); } catch { analysis = { summary: rawText, parseError: true }; }
                } else {
                  analysis = { summary: rawText, parseError: true };
                }
              }
            } else {
              analysis = {
                summary: `Video: ${info?.title || 'Unknown'}. Transcript not available — analysis limited.`,
                title: info?.title,
                channel: info?.channelTitle,
                type: 'video_partial',
              };
            }
          } catch (videoErr) {
            analysis = {
              summary: 'Video uploaded. YouTube analysis failed — for best results, upload chart screenshots or documents.',
              type: 'video_error',
            };
          }
        } else {
          // Fallback for non-YouTube videos
          analysis = {
            summary: 'Video uploaded. For best results, upload chart screenshots or documents for detailed analysis, or provide a YouTube URL for transcript-based analysis.',
            type: 'video_uploaded',
          };
        }
      }
    } catch (err) {
      status = 'error';
      errorMessage =
        err instanceof Error ? err.message : 'Unknown analysis error';
      analysis = { error: errorMessage };
    }

    // Persist analysis result + status
    await db
      .update(trainingUploads)
      .set({
        status: status as 'complete' | 'error',
        analysisResult: analysis,
        errorMessage,
      })
      .where(eq(trainingUploads.id, upload.id!));

    // Validate and store analysis in RAG for retrieval during chat
    if (status === 'complete' && analysis) {
      try {
        const { validateTrainingContent } = await import('../ai/ai.service.js');
        const { storeTrainingChunks } = await import('../../lib/rag.js');
        const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);

        // Validate content before storing in knowledge base
        const validation = validateTrainingContent(analysisText);
        if (validation.valid) {
          await storeTrainingChunks({
            userId,
            botId,
            sourceType: upload.type ?? 'document',
            sourceId: upload.id!,
            text: analysisText,
            metadata: { fileName: upload.name, uploadId: upload.id },
          });
        } else {
          console.warn(`[Training] Content rejected for RAG: ${validation.reason}`);
        }
      } catch (ragErr) {
        console.error('[Training] RAG storage failed:', ragErr);
      }
    }

    results.push({
      id: upload.id,
      name: upload.name,
      type: upload.type,
      status,
      analysis,
    });
  }

  const successCount = results.filter((r) => r.status === 'complete').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return {
    message: `Training complete: ${successCount} files analyzed${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
    filesProcessed: results.length,
    successCount,
    errorCount,
    results,
  };
}
