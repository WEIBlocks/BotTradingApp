import { Queue, Worker } from 'bullmq';
import type { Processor, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
export declare const redisConnection: IORedis;
export declare function createQueue(name: string): Queue<any, any, string, any, any, string>;
export declare function createWorker(name: string, processor: Processor, opts?: Partial<WorkerOptions>): Worker<any, any, string>;
