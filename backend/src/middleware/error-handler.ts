import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.log.error(error);

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(422).send({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Custom app errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  // Fastify validation errors
  if ('validation' in error && error.validation) {
    return reply.status(400).send({
      error: 'Bad Request',
      code: 'VALIDATION_ERROR',
      details: error.validation,
    });
  }

  // Unknown errors
  const statusCode = 'statusCode' in error ? (error as any).statusCode : 500;
  return reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.message,
    code: 'INTERNAL_ERROR',
  });
}
