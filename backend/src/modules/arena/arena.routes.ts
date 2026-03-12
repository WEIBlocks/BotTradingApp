import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as arenaService from './arena.service.js';
import {
  createSessionBodySchema,
  sessionIdParamsSchema,
  dataResponseSchema,
} from './arena.schema.js';

export async function arenaRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All routes require auth
  zApp.addHook('preHandler', authenticate);

  // GET /bots - list available bots for arena
  zApp.get('/bots', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const bots = await arenaService.getAvailableBots();
    return { data: bots };
  });

  // POST /session - create arena session
  zApp.post('/session', {
    schema: {
      body: createSessionBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { botIds, durationSeconds } = request.body;
    const session = await arenaService.createSession(
      request.user.userId,
      botIds,
      durationSeconds,
    );
    return { data: session };
  });

  // GET /session/:id - get session details
  zApp.get('/session/:id', {
    schema: {
      params: sessionIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const session = await arenaService.getSession(id, request.user.userId);
    return { data: session };
  });

  // GET /session/:id/results - get final arena results
  zApp.get('/session/:id/results', {
    schema: {
      params: sessionIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const results = await arenaService.getSessionResults(id, request.user.userId);
    return { data: results };
  });
}
