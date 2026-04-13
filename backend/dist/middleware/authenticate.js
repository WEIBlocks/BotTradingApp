import { verifyAccessToken } from '../lib/jwt.js';
import { UnauthorizedError } from '../lib/errors.js';
export async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }
    const token = authHeader.substring(7);
    try {
        const payload = verifyAccessToken(token);
        request.user = payload;
    }
    catch {
        throw new UnauthorizedError('Invalid or expired token');
    }
}
/** Like authenticate but does not throw — sets request.user if token is valid, leaves it unset otherwise */
export async function optionalAuthenticate(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return;
    const token = authHeader.substring(7);
    try {
        request.user = verifyAccessToken(token);
    }
    catch {
        // Invalid token — just ignore, treat as unauthenticated
    }
}
