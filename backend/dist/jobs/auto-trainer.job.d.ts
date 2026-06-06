/**
 * Auto-Trainer Job
 *
 * Runs every 30 minutes, checks all active bots for performance drift,
 * triggers the trainer agent when thresholds are breached.
 *
 * Feature 4: Auto training and strategy fixing, automated
 */
export declare function startAutoTrainerJob(): Promise<void>;
export declare function stopAutoTrainerJob(): Promise<void>;
