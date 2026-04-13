/**
 * requireSubscription middleware
 *
 * Usage in a route:
 *   preHandler: [authenticate, requireSubscription],
 *
 * Blocks the request with 403 if the authenticated user does not have an
 * active Pro subscription (or their subscription has expired).
 * Also stops all running bot instances when a subscription expires.
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';
export declare class SubscriptionRequiredError extends ForbiddenError {
    constructor();
}
/** Returns the user's active subscription row if they are Pro, null otherwise. */
export declare function getActiveProSubscription(userId: string): Promise<{
    id: string;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    currentPeriodEnd: Date | null;
    tier: "free" | "pro" | null;
} | null>;
/** Fastify preHandler — throws 403 if not Pro */
export declare function requireSubscription(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
