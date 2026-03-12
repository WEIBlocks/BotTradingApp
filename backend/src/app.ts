import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/user/user.routes.js';
import { marketplaceRoutes } from './modules/marketplace/marketplace.routes.js';
import { botsRoutes } from './modules/bots/bots.routes.js';
import { portfolioRoutes } from './modules/portfolio/portfolio.routes.js';
import { tradesRoutes } from './modules/trades/trades.routes.js';
import { exchangeRoutes } from './modules/exchange/exchange.routes.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { creatorRoutes } from './modules/creator/creator.routes.js';
import { arenaRoutes } from './modules/arena/arena.routes.js';
import { trainingRoutes } from './modules/training/training.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { stripeWebhookRoute } from './modules/payments/stripe.webhook.js';
import { wsRoutes } from './modules/ws/ws.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod as validator/serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Register Stripe webhook BEFORE other body parsing plugins.
  // Stripe signature verification needs the raw request body.
  await app.register(async (rawApp) => {
    rawApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req: any, body: Buffer, done: (err: Error | null, result?: unknown) => void) => {
        try {
          _req.rawBody = body;
          done(null, JSON.parse(body.toString()));
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );
    await rawApp.register(stripeWebhookRoute);
  });

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // WebSocket support
  await app.register(websocket);

  // Swagger API docs
  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: 'BotTradeApp API',
        version: '1.0.0',
        description: 'Trading Bot Platform API',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  // Register route modules
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(userRoutes, { prefix: '/user' });
  await app.register(marketplaceRoutes, { prefix: '/marketplace' });
  await app.register(botsRoutes, { prefix: '/bots' });
  await app.register(portfolioRoutes, { prefix: '/portfolio' });
  await app.register(tradesRoutes, { prefix: '/trades' });
  await app.register(exchangeRoutes, { prefix: '/exchange' });
  await app.register(paymentsRoutes, { prefix: '/user/payment-methods' });
  await app.register(subscriptionsRoutes, { prefix: '/subscription' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(creatorRoutes, { prefix: '/creator' });
  await app.register(arenaRoutes, { prefix: '/arena' });
  await app.register(trainingRoutes, { prefix: '/training' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(adminRoutes, { prefix: '/admin' });

  // WebSocket routes
  await app.register(wsRoutes, { prefix: '/ws' });

  return app;
}
