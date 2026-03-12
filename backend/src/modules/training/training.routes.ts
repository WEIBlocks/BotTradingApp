import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as trainingService from './training.service.js';
import {
  uploadFileBodySchema,
  uploadsParamsSchema,
  startTrainingBodySchema,
  dataResponseSchema,
} from './training.schema.js';

export async function trainingRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All routes require auth
  zApp.addHook('preHandler', authenticate);

  // POST /upload
  zApp.post('/upload', {
    schema: {
      body: uploadFileBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { botId, type, name, fileUrl, fileSize } = request.body;
    const upload = await trainingService.uploadFile(
      request.user.userId,
      botId,
      type,
      name,
      fileUrl,
      fileSize,
    );
    return { data: upload };
  });

  // GET /uploads/:botId
  zApp.get('/uploads/:botId', {
    schema: {
      params: uploadsParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { botId } = request.params;
    const uploads = await trainingService.getUploads(request.user.userId, botId);
    return { data: uploads };
  });

  // POST /start
  zApp.post('/start', {
    schema: {
      body: startTrainingBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { botId } = request.body;
    const result = await trainingService.startTraining(request.user.userId, botId);
    return { data: result };
  });
}
