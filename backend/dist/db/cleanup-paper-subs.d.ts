/**
 * One-time cleanup: remove stopped paper-mode bot subscriptions.
 *
 * Safe to run because:
 *   - status = 'stopped' means the bot is no longer trading
 *   - mode = 'paper' means no real capital was ever allocated
 *   - Shadow sessions are stored in shadow_sessions table (unaffected)
 *   - Trades linked to these subscriptions use botSubscriptionId FK — we
 *     null that FK on trades rather than cascade-deleting trade history
 *
 * Run with: npx tsx src/db/cleanup-paper-subs.ts
 */
export {};
