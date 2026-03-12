import Redis from 'ioredis';
import { env } from './env.js';

const redisOptions = {
  maxRetriesPerRequest: null as null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
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
let _subscriber: Redis | null = null;

export function getSubscriber(): Redis {
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

export async function publishMessage(channel: string, data: unknown): Promise<void> {
  try {
    await redis.publish(channel, JSON.stringify(data));
  } catch (err) {
    console.warn('Redis publish failed:', (err as Error).message);
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit().catch(() => {});
  if (_subscriber) {
    await _subscriber.quit().catch(() => {});
    _subscriber = null;
  }
}
