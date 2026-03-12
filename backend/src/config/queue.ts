import { Queue, Worker } from 'bullmq';
import type { Processor, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
  password: new URL(env.REDIS_URL).password || undefined,
  maxRetriesPerRequest: null,
};

export function createQueue(name: string) {
  return new Queue(name, { connection });
}

export function createWorker(
  name: string,
  processor: Processor,
  opts?: Partial<WorkerOptions>,
) {
  return new Worker(name, processor, {
    connection,
    ...opts,
  });
}
