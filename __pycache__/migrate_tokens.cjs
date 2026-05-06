const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  // Index for fast exact-hash lookups (replaces the per-user O(N) bcrypt scan).
  await sql`CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens(token_hash)`;

  // All existing rows hold bcrypt hashes; the new code does SHA-256 lookups,
  // so they'll never match anyway. Revoking them upfront prevents any zombie
  // from being inspected and shrinks the working set.
  const r = await sql`UPDATE refresh_tokens SET revoked = true WHERE revoked = false RETURNING id`;
  console.log(`Revoked ${r.length} legacy refresh-token rows.`);
  await sql.end();
})().catch(e => { console.error(e.message); process.exit(1); });
