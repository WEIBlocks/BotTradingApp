/**
 * Arena Tick Job — Shared Balance Pool Battle System
 *
 * Each bot runs with its own slice of the shared pool.
 * Crypto bots split the crypto pool; stock bots split the stock pool.
 * Stock bots skip ticks when US market is closed.
 * State persisted to Redis for restart survival.
 */
export declare function startArenaTickJob(): Promise<void>;
