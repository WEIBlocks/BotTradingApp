/**
 * Seed 4 aggressive high-frequency bots:
 *   - 2 Crypto (BTC/USDT, ETH/USDT) — Scalp + Momentum
 *   - 2 Stocks (TSLA, NVDA) — Breakout + Reversal
 *
 * All bots: Very High risk, 1-min cooldown, tight scalp rules, big position size
 * Run: npx tsx src/db/seed-aggro-bots.ts
 */

import { db, queryClient } from '../config/database.js';
import { bots, botStatistics } from './schema/bots.js';
import { users } from './schema/users.js';
import { eq } from 'drizzle-orm';

async function main() {
  // Find creator user
  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'creator@bottrade.com'));

  if (!creator) {
    console.error('❌ creator@bottrade.com not found. Run db:seed first.');
    process.exit(1);
  }

  const creatorId = creator.id;

  const aggroBots = [
    // ── CRYPTO 1: Ultra Scalper ─────────────────────────────────────────────
    {
      name: 'Ultra Scalper X',
      subtitle: 'High-frequency BTC/ETH micro-scalps every minute',
      description: 'Fires buy/sell signals on every RSI dip below 35 or spike above 65. Rides Bollinger Band bounces with a 1-minute cooldown. Max position 50%. Designed to trade as many times as possible.',
      prompt: `You are an ultra-aggressive scalping bot. Your ONLY goal is maximum trade frequency.
- BUY immediately when RSI < 35 OR price touches lower Bollinger Band
- SELL immediately when RSI > 65 OR price touches upper Bollinger Band OR take profit hit
- Never hold for more than 5 minutes — always look for exit
- Use 50% of portfolio per trade
- Stop loss: 5%, Take profit: 8%
- Cooldown between trades: 1 minute
- Always prefer BUY or SELL over HOLD — only HOLD if absolutely no signal`,
      strategy: 'Scalping',
      category: 'Crypto' as const,
      riskLevel: 'Very High' as const,
      pairs: ['BTC/USDT', 'ETH/USDT'],
      stopLoss: 5,
      takeProfit: 8,
      maxPositionSize: 50,
      avatarColor: '#F97316',
      avatarLetter: 'UX',
      priceMonthly: '0',
      config: {
        pairs: ['BTC/USDT', 'ETH/USDT'],
        stopLoss: 5,
        takeProfit: 8,
        maxPositionSize: 50,
        cooldownMinutes: 1,
        tradeDirection: 'both',
        orderType: 'market',
        riskLevel: 'Very High',
      },
    },

    // ── CRYPTO 2: Momentum Blaster ───────────────────────────────────────────
    {
      name: 'Momentum Blaster',
      subtitle: 'Rides ETH/SOL momentum waves with aggressive entries',
      description: 'Catches breakout momentum using MACD crossovers and EMA divergence. Enters large positions on momentum confirmation, exits on reversal. Trades ETH and SOL every 1-2 minutes.',
      prompt: `You are a momentum-chasing bot with Very High risk tolerance.
- BUY when MACD histogram crosses above 0 AND price > EMA20
- BUY when price breaks 2% above EMA50 with volume surge
- SELL when MACD histogram crosses below 0 OR price drops 3% from entry
- SELL when price drops below EMA20 after a gain
- Position size: 45% per trade
- Stop loss: 6%, Take profit: 12%
- Cooldown: 1 minute — always be in the market
- Chase momentum hard, cut losses fast`,
      strategy: 'Momentum',
      category: 'Crypto' as const,
      riskLevel: 'Very High' as const,
      pairs: ['ETH/USDT', 'SOL/USDT'],
      stopLoss: 6,
      takeProfit: 12,
      maxPositionSize: 45,
      avatarColor: '#8B5CF6',
      avatarLetter: 'MB',
      priceMonthly: '0',
      config: {
        pairs: ['ETH/USDT', 'SOL/USDT'],
        stopLoss: 6,
        takeProfit: 12,
        maxPositionSize: 45,
        cooldownMinutes: 1,
        tradeDirection: 'both',
        orderType: 'market',
        riskLevel: 'Very High',
      },
    },

    // ── STOCKS 1: Tesla Rocket ───────────────────────────────────────────────
    {
      name: 'Tesla Rocket',
      subtitle: 'Aggressive TSLA breakout scalper — rides the volatility',
      description: 'TSLA is one of the most volatile stocks. This bot scalps every breakout above VWAP and reversal from oversold RSI. Fires trades every 1-2 minutes during active sessions.',
      prompt: `You are an aggressive TSLA scalping bot.
- BUY when RSI < 38 (oversold bounce incoming)
- BUY when price breaks above EMA20 with momentum
- SELL when RSI > 62 (take profit on bounce)
- SELL when price falls below EMA20 (cut loss fast)
- SELL at 7% gain — never hold winners too long
- Position size: 40% of portfolio
- Stop loss: 4%, Take profit: 7%
- Cooldown: 1 minute
- TSLA moves fast — always react, never hesitate`,
      strategy: 'Scalping',
      category: 'Stocks' as const,
      riskLevel: 'Very High' as const,
      pairs: ['TSLA', 'TSLA'],
      stopLoss: 4,
      takeProfit: 7,
      maxPositionSize: 40,
      avatarColor: '#EF4444',
      avatarLetter: 'TR',
      priceMonthly: '0',
      config: {
        pairs: ['TSLA'],
        stopLoss: 4,
        takeProfit: 7,
        maxPositionSize: 40,
        cooldownMinutes: 1,
        tradeDirection: 'both',
        orderType: 'market',
        riskLevel: 'Very High',
      },
    },

    // ── STOCKS 2: NVDA Surge ─────────────────────────────────────────────────
    {
      name: 'NVDA Surge',
      subtitle: 'High-frequency NVDA momentum + reversal trader',
      description: 'NVDA is AI-driven and moves in explosive waves. This bot combines Bollinger Band squeezes with RSI divergence to catch every significant move. 1-minute cooldown for maximum trade count.',
      prompt: `You are a high-frequency NVDA momentum bot with maximum aggression.
- BUY on every RSI < 35 (strong oversold signal)
- BUY when price bounces off lower Bollinger Band
- BUY when MACD flips positive after a dip
- SELL immediately when RSI > 65
- SELL when price hits upper Bollinger Band
- SELL at 8% profit or 5% loss — no exceptions
- Position size: 45% per trade
- Cooldown: 1 minute — never sit idle
- NVDA is volatile — trade every single signal`,
      strategy: 'Scalping',
      category: 'Stocks' as const,
      riskLevel: 'Very High' as const,
      pairs: ['NVDA', 'NVDA'],
      stopLoss: 5,
      takeProfit: 8,
      maxPositionSize: 45,
      avatarColor: '#10B981',
      avatarLetter: 'NS',
      priceMonthly: '0',
      config: {
        pairs: ['NVDA'],
        stopLoss: 5,
        takeProfit: 8,
        maxPositionSize: 45,
        cooldownMinutes: 1,
        tradeDirection: 'both',
        orderType: 'market',
        riskLevel: 'Very High',
      },
    },
  ];

  console.log('🤖 Inserting 4 aggressive bots...\n');

  for (const b of aggroBots) {
    // Check if already exists
    const [existing] = await db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.name, b.name));

    if (existing) {
      console.log(`  ⚠️  "${b.name}" already exists — skipping`);
      continue;
    }

    const [inserted] = await db.insert(bots).values({
      creatorId,
      name: b.name,
      subtitle: b.subtitle,
      description: b.description,
      prompt: b.prompt,
      strategy: b.strategy,
      category: b.category,
      riskLevel: b.riskLevel,
      priceMonthly: b.priceMonthly,
      avatarColor: b.avatarColor,
      avatarLetter: b.avatarLetter,
      status: 'approved',
      isPublished: true,
      config: b.config,
      tags: [b.category, 'Very High Risk', 'High Frequency', b.strategy],
    }).returning();

    // Insert blank statistics row — will be populated by real trades
    await db.insert(botStatistics).values({
      botId: inserted.id,
    }).onConflictDoNothing();

    console.log(`  ✅ "${b.name}" inserted (${b.category} | ${b.strategy} | Very High)`);
  }

  console.log('\n✅ Done. Restart the backend and the bots will appear in the marketplace.');
  await queryClient.end();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
