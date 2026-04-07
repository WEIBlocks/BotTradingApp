import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';

async function clearArena() {
  await db.execute(sql`DELETE FROM arena_gladiators`);
  await db.execute(sql`DELETE FROM arena_sessions`);
  console.log('✓ All arena sessions and gladiators cleared.');
  process.exit(0);
}

clearArena().catch(e => { console.error(e.message); process.exit(1); });
