import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requireSubscription } from '../../middleware/requireSubscription.js';
import * as aiService from './ai.service.js';
import {
  chatMessageSchema,
  voiceCommandSchema,
  strategyGenerateSchema,
  dataResponseSchema,
} from './ai.schema.js';
import { getTopAssets, getMarketOverview } from '../../lib/market-scanner.js';
import { getVideoInfo, getTranscript } from '../../lib/youtube.js';
import { llmChat } from '../../config/ai.js';
import { db } from '../../config/database.js';

// ─── Per-user rate limiter (sliding window, in-memory) ───────────────────────
// 20 requests per minute per user. Protects OpenAI quota.

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string, maxRequests = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of rateLimitMap.entries()) {
    const fresh = timestamps.filter(t => now - t < 60_000);
    if (fresh.length === 0) rateLimitMap.delete(userId);
    else rateLimitMap.set(userId, fresh);
  }
}, 300_000);

export async function aiRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All AI routes require authentication + active Pro subscription
  zApp.addHook('preHandler', authenticate);
  zApp.addHook('preHandler', requireSubscription);

  // GET /ai/providers - List available AI providers and active provider
  zApp.get('/providers', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    return { data: aiService.getProviderStatus() };
  });

  // ── Conversation management — auth only, no subscription required ────────────
  // These operate on the user's own history so they must work regardless of plan.

  // GET /ai/bot-name - Get user's chatbot display name
  app.get('/bot-name', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const name = await aiService.getBotName((request as any).user.userId);
    return reply.send({ data: { botName: name } });
  });

  // PATCH /ai/bot-name - Set user's chatbot display name
  app.patch('/bot-name', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const { botName } = (request as any).body ?? {};
    if (typeof botName !== 'string') {
      return reply.status(400).send({ message: 'botName must be a string' });
    }
    const saved = await aiService.setBotName((request as any).user.userId, botName);
    return reply.send({ data: { botName: saved || null } });
  });

  // GET /ai/conversations - List all conversations
  app.get('/conversations', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const result = await aiService.listConversations((request as any).user.userId);
    return reply.send({ data: result });
  });

  // GET /ai/conversations/:conversationId - Load specific conversation
  app.get('/conversations/:conversationId', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const { conversationId } = (request as any).params;
    const result = await aiService.getConversation((request as any).user.userId, conversationId);
    return reply.send({ data: result });
  });

  // DELETE /ai/conversations/:conversationId - Delete conversation
  app.delete('/conversations/:conversationId', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const { conversationId } = (request as any).params;
    const result = await aiService.deleteConversation((request as any).user.userId, conversationId);
    return reply.send({ data: result });
  });

  // PATCH /ai/conversations/:conversationId - Rename conversation
  app.patch('/conversations/:conversationId', {
    preHandler: [authenticate as any],
  }, async (request, reply) => {
    const { conversationId } = (request as any).params;
    const { title } = (request as any).body;
    if (!title || typeof title !== 'string') {
      return reply.status(400).send({ message: 'title is required' });
    }
    const result = await aiService.renameConversation((request as any).user.userId, conversationId, title);
    return reply.send({ data: result });
  });

  // GET /ai/chat/history - Load latest conversation
  zApp.get('/chat/history', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const result = await aiService.getChatHistory(request.user.userId);
    return { data: result };
  });

  // POST /ai/chat/stream - Streaming SSE version of the chat endpoint
  // Uses Server-Sent Events: each event is "data: {...}\n\n"
  // Token events: { token: "..." }
  // Tool events:  { tool: "toolName" }
  // Done event:   { done: true, conversationId, model, toolsUsed?, cleanPrompt, strategyPreview? }
  app.post('/chat/stream', {
    preHandler: [authenticate, requireSubscription as any],
  }, async (request, reply) => {
    if (!checkRateLimit((request as any).user.userId)) {
      return (reply as any).status(429).send({ message: 'Too many requests. You can send up to 20 messages per minute.' });
    }
    const { message, conversationId, attachmentUrl, botId } = request.body as any;
    if (!message) return (reply as any).status(400).send({ message: 'message is required' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    try {
      const gen = aiService.chatStream(
        (request as any).user.userId,
        message,
        conversationId,
        attachmentUrl,
        botId,
      );
      for await (const chunk of gen) {
        if (reply.raw.destroyed) break;
        reply.raw.write(chunk);
      }
    } catch (err: any) {
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
      }
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  // POST /ai/chat - Conversational AI trading assistant
  zApp.post('/chat', {
    schema: {
      body: chatMessageSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    if (!checkRateLimit(request.user.userId)) {
      console.warn(`[AI:rate] User ${request.user.userId} exceeded 20 req/min`);
      return (reply as any).status(429).send({ message: 'Too many requests. You can send up to 20 messages per minute.' });
    }
    const { message, conversationId, attachmentUrl, botId } = request.body;
    const result = await aiService.chat(
      request.user.userId,
      message,
      conversationId,
      attachmentUrl,
      botId,
    );
    return { data: result };
  });

  // POST /ai/chat/image - Chat with image attachment (multipart/form-data)
  app.post('/chat/image', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const data = await (request as any).file();
      if (!data) {
        return reply.status(400).send({ message: 'No file uploaded' });
      }

      // Extract fields from multipart
      const fields = data.fields as Record<string, any>;
      const message = fields.message?.value || '';
      const conversationId = fields.conversationId?.value || undefined;

      if (!message) {
        return reply.status(400).send({ message: 'Message is required' });
      }

      // Save file to uploads directory
      const path = await import('path');
      const fs = await import('fs');
      const crypto = await import('crypto');
      const ext = path.default.extname(data.filename || '.jpg');
      const safeName = crypto.randomUUID() + ext;
      const uploadsDir = path.default.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.default.join(uploadsDir, safeName);
      const writeStream = fs.createWriteStream(filePath);
      await data.file.pipe(writeStream);
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const attachmentUrl = `/uploads/${safeName}`;

      const result = await aiService.chat(
        (request as any).user.userId,
        message,
        conversationId,
        attachmentUrl,
      );
      return { data: result };
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ message: err.message || 'Failed to process image' });
    }
  });

  // POST /ai/voice - Parse voice commands into trading actions
  zApp.post('/voice', {
    schema: {
      body: voiceCommandSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { transcript } = request.body;
    const result = await aiService.voiceCommand(
      request.user.userId,
      transcript,
    );
    return { data: result };
  });

  // POST /ai/strategy/generate - Generate a complete trading strategy from description
  zApp.post('/strategy/generate', {
    schema: {
      body: strategyGenerateSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { description, pairs, riskLevel } = request.body;
    const result = await aiService.generateStrategy(
      request.user.userId,
      description,
      pairs,
      riskLevel,
    );
    return { data: result };
  });

  // GET /ai/market/top - Market scanner: top assets
  zApp.get('/market/top', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { limit = 10, type = 'crypto' } = request.query as any;
    const assets = await getTopAssets(Math.min(+limit, 50), type);
    return { data: assets };
  });

  // GET /ai/market/overview - Market overview with gainers/losers
  zApp.get('/market/overview', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const overview = await getMarketOverview();
    return { data: overview };
  });

  // POST /ai/youtube/analyze - Analyze a YouTube video
  zApp.post('/youtube/analyze', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { url } = request.body as any;
    if (!url) return { error: 'URL required' };
    const info = await getVideoInfo(url);
    const transcript = await getTranscript(url);
    return { data: { info, hasTranscript: !!transcript, transcriptPreview: transcript?.substring(0, 500) } };
  });

  // POST /ai/youtube/learn - Store YouTube video knowledge in RAG
  zApp.post('/youtube/learn', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { url, botId } = request.body as any;
    if (!url) return { error: 'URL required' };

    const stages: string[] = [];

    // Stage 1 — fetch metadata
    stages.push('Fetching video info...');
    const info = await getVideoInfo(url);
    if (!info) return { error: 'Could not fetch video info. Please check the URL and try again.' };
    stages.push(`Found: "${info.title}" by ${info.channelTitle}`);

    // Stage 2 — get transcript
    stages.push('Getting transcript...');
    const transcript = await getTranscript(url);
    stages.push(transcript ? 'Transcript retrieved.' : 'No transcript available — using title and description.');

    // Stage 3 — AI classification (Claude decides if it's trading-related)
    stages.push('Analyzing content with AI...');
    const classifyContext = [
      `Title: ${info.title}`,
      `Channel: ${info.channelTitle}`,
      info.description ? `Description: ${info.description.substring(0, 600)}` : '',
      transcript ? `Transcript excerpt: ${transcript.substring(0, 800)}` : '',
    ].filter(Boolean).join('\n');

    let isTradingRelated = false;
    let classifyReason = '';
    try {
      const classifyReply = await llmChat(
        [{ role: 'user', content: `Analyze this YouTube video and determine if it is specifically about crypto, stocks, trading, or investing.\n\n${classifyContext}\n\nRespond with EXACTLY one line: "YES: <one sentence reason>" or "NO: <one sentence reason>". Nothing else.` }],
        { maxTokens: 60, temperature: 0 },
      );
      const reply = (classifyReply.text ?? '').trim();
      isTradingRelated = reply.toUpperCase().startsWith('YES');
      classifyReason = reply.replace(/^(YES|NO):\s*/i, '').trim();
    } catch {
      // If classification fails, fall back to accepting the video
      isTradingRelated = true;
      classifyReason = 'Classification unavailable — storing anyway.';
    }

    if (!isTradingRelated) {
      stages.push(`Rejected: ${classifyReason}`);
      return {
        data: {
          rejected: true,
          title: info.title,
          stages,
          message: `I can only learn from videos about crypto, stocks, or trading. "${info.title}" — ${classifyReason}. Please share a trading or investing video.`,
        },
      };
    }

    stages.push(`Accepted: ${classifyReason}`);

    // Stage 4 — store in RAG
    stages.push('Storing knowledge...');
    let chunksStored = 0;
    const content = `Video: ${info.title}\nChannel: ${info.channelTitle}\n${info.description || ''}\n${transcript || ''}`;

    if (content.length > 50) {
      const { storeTrainingChunks } = await import('../../lib/rag.js');
      chunksStored = await storeTrainingChunks({
        userId: request.user.userId,
        botId,
        sourceType: 'youtube',
        sourceId: url,
        text: content,
        metadata: { title: info.title, channel: info.channelTitle },
      });
    }

    stages.push(`${chunksStored} knowledge chunks stored.`);

    return {
      data: {
        title: info.title,
        chunksStored,
        hasTranscript: !!transcript,
        stages,
        message: transcript
          ? `Successfully learned from "${info.title}" — ${chunksStored} knowledge chunks stored.`
          : `Stored video metadata for "${info.title}" but no transcript was available. The bot will use the title and description for context.`,
      },
    };
  });

  // GET /ai/knowledge/stats - User's knowledge base statistics
  zApp.get('/knowledge/stats', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { knowledgeEmbeddings } = await import('../../db/schema/embeddings.js');
    const { eq, sql } = await import('drizzle-orm');

    const stats = await db.select({
      sourceType: knowledgeEmbeddings.sourceType,
      count: sql<number>`count(*)::int`,
    })
    .from(knowledgeEmbeddings)
    .where(eq(knowledgeEmbeddings.userId, request.user.userId))
    .groupBy(knowledgeEmbeddings.sourceType);

    return { data: stats };
  });
}
