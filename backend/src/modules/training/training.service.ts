import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { trainingUploads } from '../../db/schema/training.js';
import { llmChat, getActiveProvider } from '../../config/ai.js';
import { AppError } from '../../lib/errors.js';

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
      status: 'processing',
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

export async function startTraining(userId: string, botId: string) {
  // Fetch all pending uploads for this bot
  const pendingUploads = await db
    .select()
    .from(trainingUploads)
    .where(
      and(
        eq(trainingUploads.userId, userId),
        eq(trainingUploads.botId, botId),
        eq(trainingUploads.status, 'processing'),
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
    let analysis: Record<string, unknown> | null = null;
    let status = 'complete';

    try {
      if (!hasProvider) {
        // No AI provider configured: mark as complete without analysis
        analysis = {
          note: 'AI analysis unavailable - no AI provider API key configured',
        };
      } else if (upload.type === 'image') {
        analysis = await analyzeImage(upload.fileUrl);
      } else if (upload.type === 'document') {
        analysis = await analyzeDocument(upload.fileUrl, upload.name);
      } else if (upload.type === 'video') {
        analysis = {
          note: 'Video files require manual review. Automated video analysis is not yet supported.',
          status: 'manual_review_required',
        };
      }
    } catch (err) {
      status = 'error';
      analysis = {
        error:
          err instanceof Error ? err.message : 'Unknown analysis error',
      };
    }

    // Update the upload record with analysis results
    await db
      .update(trainingUploads)
      .set({
        status: status as 'complete' | 'error',
      })
      .where(eq(trainingUploads.id, upload.id!));

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
