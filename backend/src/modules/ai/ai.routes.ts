import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as aiService from './ai.service.js';
import {
  chatMessageSchema,
  voiceCommandSchema,
  strategyGenerateSchema,
  dataResponseSchema,
} from './ai.schema.js';

export async function aiRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All AI routes require authentication
  zApp.addHook('preHandler', authenticate);

  // GET /ai/providers - List available AI providers and active provider
  zApp.get('/providers', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    return { data: aiService.getProviderStatus() };
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
    const { message, conversationId, attachmentUrl } = request.body;
    const result = await aiService.chat(
      request.user.userId,
      message,
      conversationId,
      attachmentUrl,
    );
    return { data: result };
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
}
