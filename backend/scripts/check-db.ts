import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  const tables = ['users', 'bots', 'bot_subscriptions', 'bot_statistics', 'trades', 'bot_positions'];
  for (const t of tables) {
    const [r] = await (db as any).execute(sql.raw(`SELECT COUNT(*)::int as cnt FROM ${t}`));
    console.log(`${t}: ${r?.cnt ?? 0} rows`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
