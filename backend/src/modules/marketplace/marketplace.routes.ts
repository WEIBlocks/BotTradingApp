import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { listBots, getFeaturedBot, getTrendingBots, getBotById } from './marketplace.service.js';
import { optionalAuthenticate } from '../../middleware/authenticate.js';
import {
  listBotsQuerySchema,
  trendingQuerySchema,
  botIdParamsSchema,
  botResponseSchema,
} from './marketplace.schema.js';

export async function marketplaceRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /bots - list with filters
  zApp.get('/bots', {
    schema: {
      querystring: listBotsQuerySchema,
    },
  }, async (request, reply) => {
    const query = request.query;
    const result = await listBots({
      category: query.category,
      risk_level: query.risk,
      search: query.search,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    return result;
  });

  // GET /bots/featured
  zApp.get('/bots/featured', {
    schema: {
      response: { 200: botResponseSchema },
    },
  }, async (request, reply) => {
    const bot = await getFeaturedBot();
    return { data: bot };
  });

  // GET /bots/trending
  zApp.get('/bots/trending', {
    schema: {
      querystring: trendingQuerySchema,
      response: { 200: botResponseSchema },
    },
  }, async (request, reply) => {
    const limit = request.query.limit;
    const bots = await getTrendingBots(limit);
    return { data: bots };
  });

  // GET /bots/:id
  zApp.get('/bots/:id', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: botResponseSchema },
    },
    onRequest: [optionalAuthenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = (request as any).user?.userId;
    const bot = await getBotById(id, userId);
    return { data: bot };
  });
}
