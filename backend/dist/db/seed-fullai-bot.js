/**
 * Create a Full-AI crypto trading bot for manual testing.
 * aiMode: full_ai — AI decides every tick, no rule fallthrough, no cooldown.
 * tradingFrequency: max — minimal delay between trades.
 *
 * Run: npx tsx src/db/seed-fullai-bot.ts
 */
import { db, queryClient } from '../config/database.js';
import { bots, botStatistics } from '../db/schema/bots.js';
import { users } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';
const BOT = {
    name: 'AI Alpha Brain',
    subtitle: 'Pure AI trading — every decision made by artificial intelligence, maximum frequency',
    description: 'This bot runs on full AI mode. No rules, no indicators-based shortcuts — every single tick is analyzed by AI which decides BUY, SELL, or HOLD based on real-time market data, technical indicators, past trade outcomes, and learned patterns. AI controls entry, exit, position sizing, and timing. Only hard stop-loss fires as a safety net. Designed for maximum trade frequency on BTC and ETH.',
    prompt: `You are an elite AI crypto trader with full autonomy. You make EVERY decision — entries, exits, sizing, timing. No rules override you except the hard stop-loss safety net.

TRADING PHILOSOPHY:
- You are a momentum scalper. Catch short moves, take quick profits, cut losses fast.
- BUY on dips: RSI < 45, price near or below lower Bollinger Band, MACD turning positive.
- SELL to lock profits: position P&L > 3%, RSI > 60, or momentum fading (MACD turning negative).
- SELL to cut losses: position P&L < -1.5% and no recovery signal.

AGGRESSIVE RULES:
- Always act. HOLD is only acceptable when there is genuinely zero signal.
- If RSI < 35, BUY with confidence 80+. This is your bread and butter.
- If holding a position with P&L > 2% and RSI > 55, SELL to lock profits.
- If MACD histogram just crossed above 0, BUY with confidence 70+.
- If MACD histogram just crossed below 0 and holding, SELL with confidence 75+.
- Target 8-12 trades per hour across both pairs.

POSITION SIZING:
- High confidence (80+): use 35-40% of balance
- Medium confidence (65-79): use 20-30% of balance
- Low confidence (55-64): use 10-15% of balance

LEARNING:
- Study your past results carefully. If a setup lost money 3+ times, avoid it.
- If a setup won 3+ times, increase confidence by 10.
- Adapt to current market conditions — trending vs ranging.

CRITICAL: You have full control. No rules will override your BUY/SELL. Only the emergency stop-loss can force a close. Make the most of this autonomy.`,
    strategy: 'AI Trading',
    category: 'Crypto',
    riskLevel: 'Very High',
    pairs: ['BTC/USDT', 'ETH/USDT'],
    stopLoss: 3,
    takeProfit: 8,
    maxPositionSize: 40,
    config: {
        pairs: ['BTC/USDT', 'ETH/USDT'],
        stopLoss: 3,
        takeProfit: 8,
        maxPositionSize: 40,
        tradeDirection: 'both',
        orderType: 'market',
        tradingFrequency: 'max',
        aiMode: 'full_ai',
        maxHoldsBeforeAI: 1,
        aiConfidenceThreshold: 55,
        maxOpenPositions: 2,
        tradingSchedule: '24_7',
    },
    tags: ['Crypto', 'Very High Risk', 'Full AI', 'Maximum Frequency', 'BTC', 'ETH', 'Scalping'],
};
async function main() {
    console.log('Creating Full-AI bot: AI Alpha Brain...\n');
    // Get admin user as creator
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@bottrade.com')).limit(1);
    const creatorId = admin?.id;
    if (!creatorId) {
        console.error('Admin user not found. Run seed first.');
        process.exit(1);
    }
    // Check if already exists
    const [existing] = await db.select({ id: bots.id }).from(bots).where(eq(bots.name, BOT.name));
    if (existing) {
        // Update existing
        await db.update(bots).set({
            subtitle: BOT.subtitle,
            description: BOT.description,
            prompt: BOT.prompt,
            strategy: BOT.strategy,
            category: BOT.category,
            riskLevel: BOT.riskLevel,
            config: BOT.config,
            tags: BOT.tags,
            priceMonthly: '0',
            isPublished: true,
            updatedAt: new Date(),
        }).where(eq(bots.id, existing.id));
        console.log(`Updated existing bot: ${existing.id}`);
    }
    else {
        // Create new
        const [newBot] = await db.insert(bots).values({
            name: BOT.name,
            subtitle: BOT.subtitle,
            description: BOT.description,
            prompt: BOT.prompt,
            strategy: BOT.strategy,
            category: BOT.category,
            riskLevel: BOT.riskLevel,
            config: BOT.config,
            tags: BOT.tags,
            creatorId,
            avatarColor: '#8B5CF6',
            avatarLetter: 'AI',
            priceMonthly: '0',
            isPublished: true,
            status: 'approved',
        }).returning();
        // Create initial stats row
        await db.insert(botStatistics).values({
            botId: newBot.id,
            return30d: '0',
            winRate: '0',
            maxDrawdown: '0',
            sharpeRatio: '0',
            activeUsers: 0,
        }).onConflictDoNothing();
        console.log(`Created new bot: ${newBot.id}`);
    }
    // Print config summary
    console.log(`\n  Name:      ${BOT.name}`);
    console.log(`  AI Mode:   ${BOT.config.aiMode} (AI decides every tick)`);
    console.log(`  Frequency: ${BOT.config.tradingFrequency} (minimal cooldown)`);
    console.log(`  Pairs:     ${BOT.pairs.join(', ')}`);
    console.log(`  SL: ${BOT.stopLoss}%  TP: ${BOT.takeProfit}% (TP deferred to AI, 2x safety cap at ${BOT.takeProfit * 2}%)`);
    console.log(`  Max Pos:   ${BOT.config.maxOpenPositions} simultaneous`);
    console.log(`  Threshold: ${BOT.config.aiConfidenceThreshold}% min confidence`);
    console.log(`  Schedule:  ${BOT.config.tradingSchedule}`);
    console.log(`  Price:     Free`);
    console.log(`\nTo test: Open the app → find "AI Alpha Brain" in marketplace → Start Shadow Mode or Go Live`);
    await queryClient.end();
    process.exit(0);
}
main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
