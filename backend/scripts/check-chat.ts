import { db } from '../src/config/database.js';
import { conversations, chatMessages } from '../src/db/schema/chat.js';
import { eq, sql } from 'drizzle-orm';

async function main() {
  const [user] = await (db as any).execute(
    sql`SELECT id FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`
  );
  const userId = user?.id;
  console.log('userId:', userId);

  const convs = await db.select().from(conversations).where(eq(conversations.userId, userId));
  console.log('Conversations:', convs.length);
  for (const c of convs) {
    const msgs = await db.select({count: sql<number>`count(*)`}).from(chatMessages).where(eq(chatMessages.conversationId, c.id));
    console.log(` [${c.id}] "${c.title?.slice(0,40)}" — ${msgs[0]?.count} messages`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
