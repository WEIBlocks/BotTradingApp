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
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

export async function trainingRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All routes require auth
  zApp.addHook('preHandler', authenticate);

  // POST /upload-file — multipart file upload
  zApp.post('/upload-file', {
    schema: {
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    // Extract botId from the multipart fields
    const fields = data.fields as Record<string, any>;
    const botIdField = fields.botId;
    const botId = botIdField?.value;
    if (!botId) {
      return reply.status(400).send({ error: 'botId field is required' });
    }

    // Determine file type from mimetype
    const mime = data.mimetype || '';
    let fileType: 'image' | 'video' | 'document' = 'document';
    if (mime.startsWith('image/')) fileType = 'image';
    else if (mime.startsWith('video/')) fileType = 'video';

    // Generate unique filename and save
    const ext = path.extname(data.filename || '.bin');
    const uniqueName = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    // Ensure uploads dir exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Stream file to disk
    const writeStream = fs.createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
      data.file.pipe(writeStream);
      data.file.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const fileSize = writeStream.bytesWritten;
    const fileUrl = `/uploads/${uniqueName}`;

    // Save to DB
    const upload = await trainingService.uploadFile(
      request.user.userId,
      botId,
      fileType,
      data.filename || 'Untitled',
      fileUrl,
      fileSize,
    );

    return { data: upload };
  });

  // POST /upload — JSON metadata upload (legacy)
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

  // GET /summary/:botId — training summary with aggregated insights
  zApp.get('/summary/:botId', {
    schema: {
      params: uploadsParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { botId } = request.params;
    const summary = await trainingService.getTrainingSummary(
      request.user.userId,
      botId,
    );
    return { data: summary };
  });

  // GET /upload/:uploadId — single upload with analysis result
  zApp.get('/upload/:uploadId', {
    schema: {
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };
    const upload = await trainingService.getUploadById(
      request.user.userId,
      uploadId,
    );
    if (!upload) {
      return reply.status(404).send({ error: 'Upload not found' });
    }
    return { data: upload };
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
