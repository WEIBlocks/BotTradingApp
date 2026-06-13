/**
 * Auto-Trainer Job
 *
 * Two independent timers:
 *
 * 1. ANALYSIS TIMER — every 30 min
 *    For each bot with training ON:
 *    - Skip if already retraining or shadow_validating
 *    - Check triggers (first-time, schedule, performance drop)
 *    - If triggered → run trainer agent → store pending in Redis
 *
 * 2. APPLY TIMER — every 10 min
 *    For each bot with AUTO mode that has a pending improvement:
 *    - Check if 30 min have passed since the pending was stored
 *    - If yes → promote to live (update bot prompt + config)
 *    - For SUGGESTIONS mode → just log that it's ready for creator review
 *    - Shadow validation: compare WR/PF before vs after → discard if no improvement
 */
export declare function startAutoTrainerJob(): Promise<void>;
export declare function stopAutoTrainerJob(): Promise<void>;
