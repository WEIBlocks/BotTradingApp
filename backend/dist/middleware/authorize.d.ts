import { FastifyRequest, FastifyReply } from 'fastify';
export declare function authorize(...roles: string[]): (request: FastifyRequest, _reply: FastifyReply) => Promise<void>;
