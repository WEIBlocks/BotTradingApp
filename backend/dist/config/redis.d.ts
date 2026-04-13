import Redis from 'ioredis';
export declare const redis: Redis;
export declare function getSubscriber(): Redis;
export declare function publishMessage(channel: string, data: unknown): Promise<void>;
export declare function closeRedis(): Promise<void>;
