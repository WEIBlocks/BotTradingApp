/**
 * Subscription Expiry Job
 *
 * Runs every hour.  For each active Pro subscription that is about to expire
 * (within 24h) or already expired:
 *
 *  1. Attempt a re-verification of the stored purchase token with the store.
 *     If the store confirms still-active → extend period end, keep active.
 *  2. If expired and not renewed → mark status = 'expired',
 *     pause all running live bot subscriptions for that user,
 *     send a push notification.
 */
export declare function startSubscriptionExpiryJob(): Promise<void>;
