import { db, queryClient } from '../config/database.js';
import { bots, botStatistics } from './schema/bots.js';
import { inArray } from 'drizzle-orm';
const aggroNames = ['Ultra Scalper X', 'Momentum Blaster', 'Tesla Rocket', 'NVDA Surge'];
const rows = await db.select({ id: bots.id, name: bots.name }).from(bots);
const targets = rows.filter(r => aggroNames.includes(r.name));
const ids = targets.map(r => r.id);
console.log('Found:', targets.map(r => r.name));
if (ids.length > 0) {
    await db.update(botStatistics).set({
        return30d: '0', winRate: '0', maxDrawdown: '0', sharpeRatio: '0',
        activeUsers: 0, reviewCount: 0, avgRating: '0', updatedAt: new Date(),
    }).where(inArray(botStatistics.botId, ids));
    console.log('✅ Stats cleared to zero — will update as real trades happen.');
}
await queryClient.end();
process.exit(0);
