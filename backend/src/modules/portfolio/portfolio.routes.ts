import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { getSummary, getAssets, getAllocation } from './portfolio.service.js';
import { dataResponseSchema } from './portfolio.schema.js';

export async function portfolioRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('onRequest', authenticate);

  // GET /summary
  zApp.get('/summary', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getSummary(request.user.userId);
    return { data: result };
  });

  // GET /assets
  zApp.get('/assets', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getAssets(request.user.userId);
    return { data: result };
  });

  // GET /allocation
  zApp.get('/allocation', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getAllocation(request.user.userId);
    return { data: result };
  });
}
