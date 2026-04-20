import { db } from '../src/config/database.js';
import { conversations, chatMessages } from '../src/db/schema/chat.js';
import { eq, sql } from 'drizzle-orm';

async function main() {
  const [user] = await (db as any).execute(
    sql`SELECT id FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`
  );
  const userId = user?.id;

  // Show all distinct conversationIds in chatMessages
  const msgConvIds = await (db as any).execute(sql`
    SELECT conversation_id, COUNT(*)::int as cnt, MIN(content) as sample
    FROM chat_messages
    WHERE user_id = ${userId}::uuid
    GROUP BY conversation_id
    ORDER BY MIN(created_at) DESC
    LIMIT 10
  `);
  console.log('ConversationIds in chatMessages:');
  msgConvIds.forEach((r: any) => console.log(` [${r.conversation_id}] ${r.cnt} msgs — "${r.sample?.slice(0,40)}"`));

  // Show conversations table
  const convRows = await (db as any).execute(sql`
    SELECT id, title FROM conversations WHERE user_id = ${userId}::uuid
  `);
  console.log('\nConversations table:');
  convRows.forEach((r: any) => console.log(` [${r.id}] "${r.title}"`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
