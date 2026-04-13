import { authenticate } from '../../middleware/authenticate.js';
import { requireSubscription } from '../../middleware/requireSubscription.js';
import * as aiService from './ai.service.js';
import { chatMessageSchema, voiceCommandSchema, strategyGenerateSchema, dataResponseSchema, } from './ai.schema.js';
import { getTopAssets, getMarketOverview } from '../../lib/market-scanner.js';
import { getVideoInfo, getTranscript } from '../../lib/youtube.js';
import { db } from '../../config/database.js';
export async function aiRoutes(app) {
    const zApp = app.withTypeProvider();
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
    // GET /ai/conversations - List all conversations
    zApp.get('/conversations', {
        schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
    }, async (request) => {
        const result = await aiService.listConversations(request.user.userId);
        return { data: result };
    });
    // GET /ai/conversations/:conversationId - Load specific conversation
    zApp.get('/conversations/:conversationId', {
        schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
    }, async (request) => {
        const { conversationId } = request.params;
        const result = await aiService.getConversation(request.user.userId, conversationId);
        return { data: result };
    });
    // DELETE /ai/conversations/:conversationId - Delete conversation
    zApp.delete('/conversations/:conversationId', {
        schema: { security: [{ bearerAuth: [] }] },
    }, async (request) => {
        const { conversationId } = request.params;
        const result = await aiService.deleteConversation(request.user.userId, conversationId);
        return { data: result };
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
    // POST /ai/chat - Conversational AI trading assistant
    zApp.post('/chat', {
        schema: {
            body: chatMessageSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { message, conversationId, attachmentUrl, botId } = request.body;
        const result = await aiService.chat(request.user.userId, message, conversationId, attachmentUrl, botId);
        return { data: result };
    });
    // POST /ai/chat/image - Chat with image attachment (multipart/form-data)
    app.post('/chat/image', {
        preHandler: [authenticate],
    }, async (request, reply) => {
        try {
            const data = await request.file();
            if (!data) {
                return reply.status(400).send({ message: 'No file uploaded' });
            }
            // Extract fields from multipart
            const fields = data.fields;
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
            if (!fs.existsSync(uploadsDir))
                fs.mkdirSync(uploadsDir, { recursive: true });
            const filePath = path.default.join(uploadsDir, safeName);
            const writeStream = fs.createWriteStream(filePath);
            await data.file.pipe(writeStream);
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            const attachmentUrl = `/uploads/${safeName}`;
            const result = await aiService.chat(request.user.userId, message, conversationId, attachmentUrl);
            return { data: result };
        }
        catch (err) {
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
        const result = await aiService.voiceCommand(request.user.userId, transcript);
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
        const result = await aiService.generateStrategy(request.user.userId, description, pairs, riskLevel);
        return { data: result };
    });
    // GET /ai/market/top - Market scanner: top assets
    zApp.get('/market/top', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const { limit = 10, type = 'crypto' } = request.query;
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
        const { url } = request.body;
        if (!url)
            return { error: 'URL required' };
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
        const { url, botId } = request.body;
        if (!url)
            return { error: 'URL required' };
        const info = await getVideoInfo(url);
        const transcript = await getTranscript(url);
        if (!info)
            return { error: 'Could not fetch video info' };
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
        return { data: { title: info.title, chunksStored, hasTranscript: !!transcript } };
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
            count: sql `count(*)::int`,
        })
            .from(knowledgeEmbeddings)
            .where(eq(knowledgeEmbeddings.userId, request.user.userId))
            .groupBy(knowledgeEmbeddings.sourceType);
        return { data: stats };
    });
}
