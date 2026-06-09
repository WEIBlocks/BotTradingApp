/**
 * Auto-Trainer Job
 *
 * Runs every 30 minutes:
 * 1. Checks all active bots for performance drift → triggers trainer agent
 * 2. FIX 3: Checks pending trainer suggestions whose shadow validation window
 *    has expired → compares post-change performance vs pre-change baseline →
 *    auto-promotes if improved, discards if not (for AUTO mode bots)
 */
export declare function startAutoTrainerJob(): Promise<void>;
export declare function stopAutoTrainerJob(): Promise<void>;
