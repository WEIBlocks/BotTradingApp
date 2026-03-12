import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';

export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new ForbiddenError('Not authenticated');
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
    }
  };
}
