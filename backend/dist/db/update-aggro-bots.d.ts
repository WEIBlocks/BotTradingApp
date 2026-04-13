/**
 * Update the 4 aggressive bots with:
 * - Full new config fields (tradingFrequency, aiMode, maxOpenPositions, tradingSchedule)
 * - Better prompts that favor positive/profitable decisions
 * - Tighter, more realistic SL/TP for better win rate
 * - Both shadow and live modes work (stocks use us_hours, crypto 24_7)
 *
 * Run: npx tsx src/db/update-aggro-bots.ts
 */
export {};
