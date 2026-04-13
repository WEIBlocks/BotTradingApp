import { db } from '../config/database.js';
import { arenaSessions, arenaGladiators } from '../db/schema/arena.js';
import { bots } from '../db/schema/bots.js';
import { trades } from '../db/schema/trades.js';
import { eq, desc, gte } from 'drizzle-orm';
async function checkArena() {
    const sessions = await db.select().from(arenaSessions).orderBy(desc(arenaSessions.createdAt)).limit(5);
    if (sessions.length === 0) {
        console.log('No arena sessions found. Run a battle first.');
        process.exit(0);
    }
    console.log(`\n=== ${sessions.length} recent session(s) ===`);
    for (const s of sessions) {
        console.log(`\nSession ${s.id}`);
        console.log(`  status: ${s.status} | mode: ${s.mode} | duration: ${s.durationSeconds}s`);
        console.log(`  startedAt: ${s.startedAt} | endedAt: ${s.endedAt}`);
        console.log(`  virtualBalance: ${s.virtualBalance} | perBotAllocation: ${s.perBotAllocation}`);
        console.log(`  hasCrypto: ${s.hasCrypto} | hasStocks: ${s.hasStocks} | isMixed: ${s.isMixed}`);
        const glads = await db.select({
            g: arenaGladiators,
            botName: bots.name,
            botConfig: bots.config,
        }).from(arenaGladiators)
            .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
            .where(eq(arenaGladiators.sessionId, s.id));
        console.log(`\n  Gladiators (${glads.length}):`);
        for (const { g, botName, botConfig } of glads) {
            const equity = Array.isArray(g.equityData) ? g.equityData : [];
            const decisions = Array.isArray(g.decisionLog) ? g.decisionLog : [];
            const cfg = (botConfig ?? {});
            console.log(`\n    Bot: ${botName}`);
            console.log(`      gladiatorId: ${g.id}`);
            console.log(`      rank: ${g.rank} | finalReturn: ${g.finalReturn}% | winRate: ${g.winRate}%`);
            console.log(`      totalTrades: ${g.totalTrades} | totalPnl: ${g.totalPnl}`);
            console.log(`      equityPoints: ${equity.length} | first: ${equity[0]?.toFixed(2)} | last: ${equity[equity.length - 1]?.toFixed(2)}`);
            console.log(`      decisionLog entries: ${decisions.length}`);
            console.log(`      botPairs: ${JSON.stringify(cfg.pairs ?? [])}`);
            if (decisions.length > 0) {
                const nonHold = decisions.filter((d) => d.action !== 'HOLD');
                console.log(`      non-HOLD decisions: ${nonHold.length}`);
                if (nonHold.length > 0)
                    console.log(`      last trade: ${JSON.stringify(nonHold[nonHold.length - 1])}`);
            }
        }
        // Check trades table
        if (s.startedAt) {
            const arenaTrades = await db.select().from(trades)
                .where(gte(trades.createdAt, s.startedAt))
                .limit(20);
            console.log(`\n  Trades in trades table (since session start): ${arenaTrades.length}`);
            if (arenaTrades.length > 0) {
                for (const t of arenaTrades.slice(0, 5)) {
                    console.log(`    ${t.side} ${t.symbol} @ ${t.price} | isPaper: ${t.isPaper} | pnl: ${t.pnl}`);
                }
            }
        }
    }
    process.exit(0);
}
checkArena().catch(e => { console.error(e.message); process.exit(1); });
