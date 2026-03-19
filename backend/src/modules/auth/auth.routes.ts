import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as authService from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  oauthSchema,
  logoutSchema,
  changePasswordSchema,
  appleAuthSchema,
  authResponseSchema,
  refreshTokenResponseSchema,
  messageResponseSchema,
} from './auth.schema.js';

export async function authRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // POST /register
  zApp.post('/register', {
    schema: {
      body: registerSchema.body,
      response: { 201: authResponseSchema },
    },
  }, async (request, reply) => {
    const { name, email, password } = request.body;
    const result = await authService.register(name, email, password);
    return reply.status(201).send(result);
  });

  // POST /login
  zApp.post('/login', {
    schema: {
      body: loginSchema.body,
      response: { 200: authResponseSchema },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const result = await authService.login(email, password);
    return reply.status(200).send(result);
  });

  // POST /refresh-token
  zApp.post('/refresh-token', {
    schema: {
      body: refreshTokenSchema.body,
      response: { 200: refreshTokenResponseSchema },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const result = await authService.refreshToken(refreshToken);
    return reply.status(200).send(result);
  });

  // POST /logout (requires authentication)
  zApp.post('/logout', {
    preHandler: [authenticate],
    schema: {
      body: logoutSchema.body,
      response: { 200: messageResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    await authService.logout(request.user.userId, refreshToken || '');
    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  // POST /change-password (requires auth)
  zApp.post('/change-password', {
    preHandler: [authenticate],
    schema: {
      body: changePasswordSchema.body,
      response: { 200: z.any() },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const result = await authService.changePassword(request.user.userId, currentPassword, newPassword);
    return reply.status(200).send(result);
  });

  // POST /google - Google OAuth (verify ID token from mobile SDK)
  zApp.post('/google', {
    schema: {
      body: oauthSchema.body,
      response: { 200: authResponseSchema },
    },
  }, async (request, reply) => {
    const { idToken } = request.body;
    const result = await authService.googleAuth(idToken);
    return reply.status(200).send(result);
  });

  // POST /apple - Apple Sign-In (verify identity token from mobile SDK)
  zApp.post('/apple', {
    schema: {
      body: appleAuthSchema.body,
      response: { 200: authResponseSchema },
    },
  }, async (request, reply) => {
    const { identityToken, fullName } = request.body;
    const result = await authService.appleAuth(identityToken, fullName);
    return reply.status(200).send(result);
  });
}
