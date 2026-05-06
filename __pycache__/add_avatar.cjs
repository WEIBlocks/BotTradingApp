const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  // Idempotent ALTER — safe to run multiple times.
  await sql`ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_url text`;
  const r = await sql`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'bots' AND column_name LIKE 'avatar%'
    ORDER BY column_name
  `;
  console.log('avatar columns on bots table:');
  for (const row of r) console.log(' ', JSON.stringify(row));
  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
