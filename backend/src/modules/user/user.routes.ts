import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as userService from './user.service.js';
import {
  updateProfileSchema,
  updateSettingsSchema,
  paginationQuery,
  quizBodySchema,
  dataResponseSchema,
} from './user.schema.js';

export async function userRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // All user routes require authentication
  zApp.addHook('preHandler', authenticate);

  // GET /profile
  zApp.get('/profile', {
    schema: {
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const profile = await userService.getProfile(request.user.userId);
    return reply.status(200).send(profile);
  });

  // PATCH /profile
  zApp.patch('/profile', {
    schema: {
      body: updateProfileSchema.body,
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const updated = await userService.updateProfile(request.user.userId, request.body);
    return reply.status(200).send(updated);
  });

  // GET /wallet
  zApp.get('/wallet', {
    schema: {
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const wallet = await userService.getWallet(request.user.userId);
    return reply.status(200).send(wallet);
  });

  // GET /activity
  zApp.get('/activity', {
    schema: {
      querystring: paginationQuery,
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { page, limit } = request.query;
    const activity = await userService.getActivity(request.user.userId, page, limit);
    return reply.status(200).send(activity);
  });

  // GET /settings
  zApp.get('/settings', {
    schema: {
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const settings = await userService.getSettings(request.user.userId);
    return reply.status(200).send(settings);
  });

  // PATCH /settings
  zApp.patch('/settings', {
    schema: {
      body: updateSettingsSchema.body,
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const updated = await userService.updateSettings(request.user.userId, request.body);
    return reply.status(200).send(updated);
  });

  // POST /quiz - Save investor quiz results
  zApp.post('/quiz', {
    schema: {
      body: quizBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await userService.saveQuizResults(request.user.userId, request.body);
    return reply.status(200).send({ data: result });
  });

  // GET /referral - Get referral code and stats
  zApp.get('/referral', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await userService.getReferralInfo(request.user.userId);
    return reply.status(200).send({ data: result });
  });
}
