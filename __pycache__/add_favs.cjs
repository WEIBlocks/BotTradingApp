const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  // Idempotent: safe to re-run.
  await sql`
    CREATE TABLE IF NOT EXISTS bot_favorites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      bot_id uuid NOT NULL REFERENCES bots(id),
      created_at timestamptz DEFAULT now()
    )
  `;
  // Unique constraint
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bot_favorites_user_bot_unique'
      ) THEN
        ALTER TABLE bot_favorites
          ADD CONSTRAINT bot_favorites_user_bot_unique UNIQUE (user_id, bot_id);
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS bot_favorites_user_id_idx ON bot_favorites(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS bot_favorites_bot_id_idx ON bot_favorites(bot_id)`;

  // Verify
  const r = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'bot_favorites' ORDER BY ordinal_position
  `;
  console.log('bot_favorites columns:');
  for (const row of r) console.log(' ', JSON.stringify(row));
  const c = await sql`
    SELECT conname FROM pg_constraint WHERE conrelid = 'bot_favorites'::regclass
  `;
  console.log('constraints:', c.map(x => x.conname).join(', '));
  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
