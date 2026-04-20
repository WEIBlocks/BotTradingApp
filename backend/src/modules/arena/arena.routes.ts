import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requireSubscription } from '../../middleware/requireSubscription.js';
import * as arenaService from './arena.service.js';
import { createSessionBodySchema, sessionIdParamsSchema, dataResponseSchema } from './arena.schema.js';

export async function arenaRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('preHandler', authenticate);

  // GET /bots - list available bots for arena
  zApp.get('/bots', {
    schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const bots = await arenaService.getAvailableBots(request.user.userId);
    return { data: bots };
  });

  // GET /history - list user's past arena sessions
  zApp.get('/history', {
    schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const history = await arenaService.getHistory(request.user.userId);
    return { data: history };
  });

  // GET /session/active - get active running session (single, legacy)
  zApp.get('/session/active', {
    schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const session = await arenaService.getActiveSession(request.user.userId);
    return { data: session };
  });

  // GET /sessions/active - get ALL active sessions (running + paused)
  zApp.get('/sessions/active', {
    schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const sessions = await arenaService.getActiveSessions(request.user.userId);
    return { data: sessions };
  });

  // POST /session - create arena session (Pro only)
  zApp.post('/session', {
    schema: { body: createSessionBodySchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
    preHandler: [requireSubscription],
  }, async (request) => {
    const { botIds, durationSeconds, mode, virtualBalance, cryptoBalance, stockBalance, minOrderValue } = request.body as any;
    const session = await arenaService.createSession(
      request.user.userId, botIds, durationSeconds, mode, virtualBalance, cryptoBalance, stockBalance, minOrderValue,
    );
    return { data: session };
  });

  // GET /session/:id - get session details (live updates)
  zApp.get('/session/:id', {
    schema: { params: sessionIdParamsSchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { id } = request.params;
    const session = await arenaService.getSession(id, request.user.userId);
    return { data: session };
  });

  // GET /session/:id/results - get final results
  zApp.get('/session/:id/results', {
    schema: { params: sessionIdParamsSchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { id } = request.params;
    const results = await arenaService.getSessionResults(id, request.user.userId);
    return { data: results };
  });

  // POST /session/:id/pause
  zApp.post('/session/:id/pause', {
    schema: { params: sessionIdParamsSchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const result = await arenaService.pauseSession(request.params.id, request.user.userId);
    return { data: result };
  });

  // POST /session/:id/resume
  zApp.post('/session/:id/resume', {
    schema: { params: sessionIdParamsSchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const result = await arenaService.resumeSession(request.params.id, request.user.userId);
    return { data: result };
  });

  // POST /session/:id/kill
  zApp.post('/session/:id/kill', {
    schema: { params: sessionIdParamsSchema, response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const result = await arenaService.killSession(request.params.id, request.user.userId);
    return { data: result };
  });
}
