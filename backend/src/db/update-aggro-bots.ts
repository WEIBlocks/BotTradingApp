/**
 * Update the 4 aggressive bots with:
 * - Full new config fields (tradingFrequency, aiMode, maxOpenPositions, tradingSchedule)
 * - Better prompts that favor positive/profitable decisions
 * - Tighter, more realistic SL/TP for better win rate
 * - Both shadow and live modes work (stocks use us_hours, crypto 24_7)
 *
 * Run: npx tsx src/db/update-aggro-bots.ts
 */

import { db, queryClient } from '../config/database.js';
import { bots, botStatistics } from './schema/bots.js';
import { eq } from 'drizzle-orm';

const updates = [
  // ── CRYPTO 1: Ultra Scalper X ───────────────────────────────────────────────
  {
    name: 'Ultra Scalper X',
    subtitle: 'High-frequency BTC/ETH scalper — catches micro-bounces for consistent gains',
    description: 'Ultra-aggressive scalping bot targeting BTC and ETH. Enters on RSI oversold dips and Bollinger Band lower-touch bounces. Exits quickly at 6-8% profit. Designed to fire as many winning trades as possible every 30 minutes.',
    prompt: `You are an ultra-aggressive crypto scalping bot focused on HIGH WIN RATE and MAXIMUM TRADE FREQUENCY.

ENTRY — BUY when:
- RSI drops below 40 (oversold momentum reversal incoming)
- Price touches or goes below lower Bollinger Band (mean-reversion buy)
- Price dips more than 1% in the last bar (short-term dip-buy)
Prefer BUY when RSI < 45 AND price < EMA20 — high-probability bounce setup.

EXIT — SELL when:
- RSI rises above 60 (momentum exhausted, lock in profit)
- Price reaches upper Bollinger Band (mean-reversion complete)
- Profit is above 5% (secure gains, never hold too long)
- Price falls 3% from entry (cut losses fast)

CRITICAL RULES:
- NEVER HOLD if a clear BUY or SELL signal exists — always act
- Prefer BUY on dips over HOLD — the market always bounces
- Target 6-10 trades per hour across BTC and ETH
- Always return BUY or SELL with confidence >= 65 when indicators align
- Only HOLD if no signal at all`,
    strategy: 'Scalping',
    category: 'Crypto',
    riskLevel: 'Very High',
    pairs: ['BTC/USDT', 'ETH/USDT'],
    stopLoss: 3,
    takeProfit: 6,
    maxPositionSize: 40,
    config: {
      pairs: ['BTC/USDT', 'ETH/USDT'],
      stopLoss: 3,
      takeProfit: 6,
      maxPositionSize: 40,
      tradeDirection: 'both',
      orderType: 'market',
      tradingFrequency: 'max',
      aiMode: 'hybrid',
      maxHoldsBeforeAI: 2,
      aiConfidenceThreshold: 55,
      maxOpenPositions: 2,
      tradingSchedule: '24_7',
    },
    tags: ['Crypto', 'Very High Risk', 'High Frequency', 'Scalping', 'BTC', 'ETH'],
  },

  // ── CRYPTO 2: Momentum Blaster ──────────────────────────────────────────────
  {
    name: 'Momentum Blaster',
    subtitle: 'ETH/SOL momentum hunter — rides breakouts for 8-15% gains',
    description: 'Momentum-driven bot targeting ETH and SOL. Enters on MACD crossovers and EMA breakouts during strong momentum. Holds through the wave for bigger gains and exits on reversal signals. Balanced between frequency and profit per trade.',
    prompt: `You are an aggressive crypto momentum bot. Your goal is MAXIMUM PROFITABLE TRADES by riding momentum waves on ETH and SOL.

ENTRY — BUY when momentum confirms:
- MACD histogram crosses above 0 (bullish momentum shift — high probability)
- Price breaks above EMA20 after being below it (trend resumption)
- RSI is between 45-60 and rising (momentum building, not overbought yet)
- Price gains more than 1.5% in one bar (breakout momentum)
Strongest signal: MACD > 0 AND price > EMA20 — always BUY this.

EXIT — SELL to lock profits:
- MACD histogram crosses below 0 (momentum reversing)
- Price falls below EMA20 after gaining (trend break)
- RSI above 65 (overbought, take profits)
- Profit above 10% (excellent gain, secure it)

CRITICAL RULES:
- Act fast on momentum — waiting means missing the move
- Always BUY on MACD crossover above 0 — this is the core signal
- Always SELL when momentum reverses (MACD < 0 after gain)
- Target 4-6 trades per hour with 65%+ win rate
- Confidence should be 70+ when MACD and EMA align together`,
    strategy: 'Momentum',
    category: 'Crypto',
    riskLevel: 'Very High',
    pairs: ['ETH/USDT', 'SOL/USDT'],
    stopLoss: 4,
    takeProfit: 10,
    maxPositionSize: 40,
    config: {
      pairs: ['ETH/USDT', 'SOL/USDT'],
      stopLoss: 4,
      takeProfit: 10,
      maxPositionSize: 40,
      tradeDirection: 'both',
      orderType: 'market',
      tradingFrequency: 'aggressive',
      aiMode: 'hybrid',
      maxHoldsBeforeAI: 3,
      aiConfidenceThreshold: 55,
      maxOpenPositions: 2,
      tradingSchedule: '24_7',
    },
    tags: ['Crypto', 'Very High Risk', 'Momentum', 'ETH', 'SOL'],
  },

  // ── STOCKS 1: Tesla Rocket ──────────────────────────────────────────────────
  {
    name: 'Tesla Rocket',
    subtitle: 'TSLA intraday scalper — trades every volatility spike for fast profits',
    description: 'TSLA is one of the most volatile stocks in the market. This bot scalps every RSI oversold bounce and EMA crossover during US market hours. Tight stop-loss at 3%, takes profit at 6-7%. Fires 3-6 trades per session.',
    prompt: `You are an aggressive TSLA intraday scalping bot trading during US market hours (9:30 AM - 4:00 PM ET). Focus on HIGH FREQUENCY and POSITIVE RETURNS.

ENTRY — BUY TSLA when:
- RSI drops below 42 (TSLA frequently overshoots down — strong bounce signal)
- Price drops below EMA20 and starts recovering (dip-buy on mean reversion)
- Price falls more than 1.5% intraday (TSLA always bounces — scalp the dip)
- MACD histogram turns positive after being negative (momentum shift — act immediately)
Strongest: RSI < 40 AND price < EMA20 — always BUY, TSLA always bounces.

EXIT — SELL to capture profits:
- RSI rises above 62 (overbought after bounce — take profits)
- Price recovers above EMA20 and keeps rising (exit on strength)
- Profit above 5% (secure gains before reversal)
- Price drops 3% from entry (stop-loss)

CRITICAL RULES:
- TSLA is highly volatile — every dip is a buying opportunity
- Always BUY on RSI < 40, TSLA bounces 80% of the time from oversold
- Never hold through major reversals — cut at 3% loss
- Target 4-6 trades during US session with 60%+ win rate
- Respond with BUY/SELL confidently (70+) when signals align`,
    strategy: 'Scalping',
    category: 'Stocks',
    riskLevel: 'Very High',
    pairs: ['TSLA'],
    stopLoss: 3,
    takeProfit: 6,
    maxPositionSize: 35,
    config: {
      pairs: ['TSLA'],
      stopLoss: 3,
      takeProfit: 6,
      maxPositionSize: 35,
      tradeDirection: 'both',
      orderType: 'market',
      tradingFrequency: 'aggressive',
      aiMode: 'hybrid',
      maxHoldsBeforeAI: 3,
      aiConfidenceThreshold: 55,
      maxOpenPositions: 1,
      tradingSchedule: 'us_hours',
    },
    tags: ['Stocks', 'Very High Risk', 'Scalping', 'TSLA', 'US Hours'],
  },

  // ── STOCKS 2: NVDA Surge ────────────────────────────────────────────────────
  {
    name: 'NVDA Surge',
    subtitle: 'NVDA momentum + reversal scalper — rides AI stock volatility',
    description: 'NVDA moves in explosive momentum waves driven by AI sector sentiment. This bot combines Bollinger Band squeezes, RSI oversold bounces, and MACD crossovers to catch every major move during US market hours. Tight risk management with 3% SL and 7% TP.',
    prompt: `You are a high-frequency NVDA momentum + scalping bot. Trade ONLY during US market hours. Goal: MAXIMUM WINNING TRADES with strong risk control.

ENTRY — BUY NVDA when:
- RSI drops below 38 (NVDA oversold — high-probability reversal incoming)
- Price bounces off lower Bollinger Band (BB squeeze release — strong buy)
- MACD histogram crosses above 0 after being negative (momentum turning bullish)
- Price drops 2%+ intraday then shows any recovery (dip-buy opportunity)
Top signal combo: RSI < 38 + price at lower BB = very high confidence BUY (85+).

EXIT — SELL to lock in profits:
- RSI rises above 63 (overbought — take profits)
- Price reaches upper Bollinger Band (mean reversion complete)
- MACD crosses below 0 after gains (momentum exhausted — exit)
- Profit above 6% (secure the gain)
- Loss hits 3% (stop loss — protect capital)

CRITICAL RULES:
- NVDA is driven by AI sector news — always trade the momentum direction
- RSI < 38 is a VERY strong buy signal for NVDA specifically
- Lower BB touch almost always means bounce — always BUY with confidence 75+
- Never hold a losing position past 3% — NVDA can reverse hard
- Target 4-7 trades per US session with 65%+ win rate`,
    strategy: 'Scalping',
    category: 'Stocks',
    riskLevel: 'Very High',
    pairs: ['NVDA'],
    stopLoss: 3,
    takeProfit: 7,
    maxPositionSize: 35,
    config: {
      pairs: ['NVDA'],
      stopLoss: 3,
      takeProfit: 7,
      maxPositionSize: 35,
      tradeDirection: 'both',
      orderType: 'market',
      tradingFrequency: 'aggressive',
      aiMode: 'hybrid',
      maxHoldsBeforeAI: 3,
      aiConfidenceThreshold: 55,
      maxOpenPositions: 1,
      tradingSchedule: 'us_hours',
    },
    tags: ['Stocks', 'Very High Risk', 'Scalping', 'NVDA', 'US Hours'],
  },
];

async function main() {
  console.log('🔄 Updating 4 aggressive bots with improved config...\n');

  for (const u of updates) {
    const [existing] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.name, u.name));

    if (!existing) {
      console.log(`  ⚠️  "${u.name}" not found — skipping (run seed-aggro-bots.ts first)`);
      continue;
    }

    await db.update(bots).set({
      subtitle: u.subtitle,
      description: u.description,
      prompt: u.prompt,
      strategy: u.strategy,
      category: u.category as any,
      riskLevel: u.riskLevel as any,
      config: u.config,
      tags: u.tags,
      updatedAt: new Date(),
    }).where(eq(bots.id, existing.id));

    // Clear cached rules so engine picks up new config on next run
    console.log(`  ✅ "${u.name}" updated — SL:${u.stopLoss}% TP:${u.takeProfit}% | freq:${u.config.tradingFrequency} | aiMode:${u.config.aiMode} | schedule:${u.config.tradingSchedule}`);
  }

  console.log('\n✅ All bots updated. Restart the backend to clear rule/indicator caches.');
  await queryClient.end();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
