import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';
// Shared IORedis instance for direct Redis operations in jobs
export const redisConnection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
redisConnection.on('error', (err) => {
    console.error('BullMQ Redis error:', err.message);
});
// BullMQ connection config — uses host/port/password so BullMQ manages its own pool
const parsedUrl = new URL(env.REDIS_URL);
const connection = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '6379', 10),
    password: parsedUrl.password || undefined,
    username: parsedUrl.username || undefined,
    tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};
export function createQueue(name) {
    return new Queue(name, { connection });
}
export function createWorker(name, processor, opts) {
    return new Worker(name, processor, {
        connection,
        concurrency: 1,
        ...opts,
    });
}
