import { FastifyInstance } from 'fastify';
export declare function invalidateActiveBotsCache(userId: string): void;
export declare function botsRoutes(app: FastifyInstance): Promise<void>;
