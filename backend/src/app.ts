import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
import { iapRoutes } from './modules/payments/iap.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { creatorRoutes } from './modules/creator/creator.routes.js';
import { arenaRoutes } from './modules/arena/arena.routes.js';
import { trainingRoutes } from './modules/training/training.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { tradingRoomRoutes } from './modules/trading-room/trading-room.routes.js';
import { supportRoutes } from './modules/support/support.routes.js';
import { marketRoutes } from './modules/market/market.routes.js';

import { wsRoutes } from './modules/ws/ws.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    bodyLimit: 1048576, // 1MB
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod as validator/serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Error handler
  app.setErrorHandler(errorHandler);


  // CORS — allow all origins for now (no domain configured yet)
  // Once a domain is set, replace true with: (process.env.CORS_ORIGINS || 'https://yourdomain.com').split(',')
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Multipart file uploads (10MB limit)
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Serve uploaded files
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
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

  // Security headers
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    // HSTS removed — no domain/SSL configured yet, would cause browser to force HTTPS permanently
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  // Platform config (public, no auth)
  app.get('/config/platform', async () => ({
    data: {
      platformFeeRate: 0.07,
      proDiscountRate: 0.03,
      tradingPairs: [
        'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'MATIC/USDT',
        'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT',
        'LINK/USDT', 'ATOM/USDT',
      ],
      strategies: [
        'Trend Following', 'Scalping', 'Grid', 'Arbitrage', 'DCA',
        'Mean Reversion', 'Momentum', 'Breakout',
      ],
      riskLevels: ['Very Low', 'Low', 'Med', 'High', 'Very High'],
      categories: ['All', 'Crypto', 'Stocks', 'Top Performers'],
    },
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
  await app.register(iapRoutes, { prefix: '/payments/iap' });
  await app.register(subscriptionsRoutes, { prefix: '/subscription' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(creatorRoutes, { prefix: '/creator' });
  await app.register(arenaRoutes, { prefix: '/arena' });
  await app.register(trainingRoutes, { prefix: '/training' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(tradingRoomRoutes, { prefix: '/trading-room' });
  await app.register(supportRoutes);
  await app.register(marketRoutes, { prefix: '/market' });

  // WebSocket routes
  await app.register(wsRoutes, { prefix: '/ws' });

  return app;
}
