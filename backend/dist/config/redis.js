import Redis from 'ioredis';
import { env } from './env.js';
const redisOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
        if (times > 3)
            return null;
        return Math.min(times * 200, 2000);
    },
};
export const redis = new Redis(env.REDIS_URL, redisOptions);
redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
});
redis.on('connect', () => {
    console.log('Redis connected');
});
// Separate subscriber instance for pub/sub (pub/sub connections cannot be used for commands)
let _subscriber = null;
export function getSubscriber() {
    if (!_subscriber) {
        _subscriber = new Redis(env.REDIS_URL, {
            ...redisOptions,
            lazyConnect: false,
        });
        _subscriber.on('error', (err) => {
            console.error('Redis subscriber error:', err.message);
        });
    }
    return _subscriber;
}
export async function publishMessage(channel, data) {
    try {
        await redis.publish(channel, JSON.stringify(data));
    }
    catch (err) {
        console.warn('Redis publish failed:', err.message);
    }
}
export async function closeRedis() {
    await redis.quit().catch(() => { });
    if (_subscriber) {
        await _subscriber.quit().catch(() => { });
        _subscriber = null;
    }
}
