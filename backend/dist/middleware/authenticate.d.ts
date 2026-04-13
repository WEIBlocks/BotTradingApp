import { FastifyRequest, FastifyReply } from 'fastify';
import { TokenPayload } from '../lib/jwt.js';
declare module 'fastify' {
    interface FastifyRequest {
        user: TokenPayload;
    }
}
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
/** Like authenticate but does not throw — sets request.user if token is valid, leaves it unset otherwise */
export declare function optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
