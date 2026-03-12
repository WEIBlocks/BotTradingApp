import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as adminService from './admin.service.js';
import {
  paginationQuerySchema,
  usersQuerySchema,
  botsQuerySchema,
  userIdParamsSchema,
  botIdParamsSchema,
  updateUserBodySchema,
  rejectBotBodySchema,
  updateSettingsBodySchema,
  dataResponseSchema,
} from './admin.schema.js';

export async function adminRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All routes require admin auth
  zApp.addHook('preHandler', authenticate);
  zApp.addHook('preHandler', authorize('admin'));

  // ---- Users ----

  // GET /users
  zApp.get('/users', {
    schema: {
      querystring: usersQuerySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { page, limit, search } = request.query;
    const result = await adminService.listUsers(page, limit, search);
    return result;
  });

  // GET /users/:id
  zApp.get('/users/:id', {
    schema: {
      params: userIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const user = await adminService.getUser(id);
    return { data: user };
  });

  // PATCH /users/:id
  zApp.patch('/users/:id', {
    schema: {
      params: userIdParamsSchema,
      body: updateUserBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const user = await adminService.updateUser(id, request.body);
    return { data: user };
  });

  // DELETE /users/:id
  zApp.delete('/users/:id', {
    schema: {
      params: userIdParamsSchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const result = await adminService.deleteUser(id);
    return result;
  });

  // ---- Bots ----

  // GET /bots
  zApp.get('/bots', {
    schema: {
      querystring: botsQuerySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { page, limit, status } = request.query;
    const result = await adminService.listBots(page, limit, status);
    return result;
  });

  // PATCH /bots/:id/approve
  zApp.patch('/bots/:id/approve', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const bot = await adminService.approveBot(id);
    return { data: bot };
  });

  // PATCH /bots/:id/reject
  zApp.patch('/bots/:id/reject', {
    schema: {
      params: botIdParamsSchema,
      body: rejectBotBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const { reason } = request.body;
    const bot = await adminService.rejectBot(id, reason);
    return { data: bot };
  });

  // PATCH /bots/:id/suspend
  zApp.patch('/bots/:id/suspend', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const bot = await adminService.suspendBot(id);
    return { data: bot };
  });

  // ---- Subscriptions & Exchanges ----

  // GET /subscriptions
  zApp.get('/subscriptions', {
    schema: {
      querystring: paginationQuerySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { page, limit } = request.query;
    const result = await adminService.listSubscriptions(page, limit);
    return result;
  });

  // GET /exchanges
  zApp.get('/exchanges', {
    schema: {
      querystring: paginationQuerySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { page, limit } = request.query;
    const result = await adminService.listExchangeConnections(page, limit);
    return result;
  });

  // ---- Analytics ----

  // GET /analytics/revenue
  zApp.get('/analytics/revenue', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const analytics = await adminService.getRevenueAnalytics();
    return { data: analytics };
  });

  // GET /analytics/trades
  zApp.get('/analytics/trades', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const analytics = await adminService.getTradesAnalytics();
    return { data: analytics };
  });

  // GET /analytics/users
  zApp.get('/analytics/users', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const analytics = await adminService.getUsersAnalytics();
    return { data: analytics };
  });

  // GET /analytics/dashboard
  zApp.get('/analytics/dashboard', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const analytics = await adminService.getDashboardAnalytics();
    return { data: analytics };
  });

  // ---- Settings ----

  // GET /settings
  zApp.get('/settings', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const settings = await adminService.getSettings();
    return { data: settings };
  });

  // PATCH /settings
  zApp.patch('/settings', {
    schema: {
      body: updateSettingsBodySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const result = await adminService.updateSettings(request.body as Record<string, any>);
    return result;
  });

  // ---- System Health ----

  // GET /system/health
  zApp.get('/system/health', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, _reply) => {
    const health = await adminService.getSystemHealth();
    return { data: health };
  });
}
