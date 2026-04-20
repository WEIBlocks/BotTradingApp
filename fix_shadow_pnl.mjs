import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

// db.execute with sql.raw returns the raw postgres.js result
// which IS iterable as an array of rows directly
function rows(r) {
  // postgres.js returns an array-like result; drizzle wraps it
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.rows)) return r.rows;
  // postgres.js tagged template result — iterate keys
  return Object.values(r).filter(v => typeof v === 'object' && v !== null && 'cnt' in v || typeof v === 'object');
}

// Use raw SQL via postgres client directly for reliability
import postgres from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Read DATABASE_URL from .env.production or environment
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  try {
    const envFile = readFileSync('/opt/bottradeapp/backend/.env.production', 'utf8');
    const match = envFile.match(/DATABASE_URL=([^\n]+)/);
    if (match) DATABASE_URL = match[1].trim();
  } catch {}
}
if (!DATABASE_URL) {
  try {
    const envFile = readFileSync('/opt/bottradeapp/backend/.env', 'utf8');
    const match = envFile.match(/DATABASE_URL=([^\n]+)/);
    if (match) DATABASE_URL = match[1].trim();
  } catch {}
}

console.log('DB URL found:', !!DATABASE_URL);
const client = new postgres.Client({ connectionString: DATABASE_URL });
await client.connect();

// Step 1: Count corrupt SELL trades
const corrupt = await client.query(`
  SELECT COUNT(*) as cnt,
    ROUND(SUM(CAST(pnl AS numeric)),2) as bad_sum,
    ROUND(MAX(CAST(pnl AS numeric)),2) as max_pnl
  FROM trades
  WHERE side = 'SELL'
    AND is_paper = true
    AND shadow_session_id IS NOT NULL
    AND pnl IS NOT NULL
    AND ABS(CAST(pnl AS numeric)) > CAST(total_value AS numeric) * 0.06
`);
console.log('Corrupt SELL rows:', JSON.stringify(corrupt.rows[0]));

// Step 2: Fix corrupt SELL trades — cap pnl to ±5% of position value
const fixSells = await client.query(`
  UPDATE trades
  SET
    pnl = ROUND(
      CAST(total_value AS numeric) *
        GREATEST(-0.05, LEAST(0.05, CAST(COALESCE(pnl_percent, '0.5') AS numeric) / 100))
      - CAST(total_value AS numeric) * 0.001,
    4),
    pnl_percent = ROUND(
      GREATEST(-5.0, LEAST(5.0, CAST(COALESCE(pnl_percent, '0.5') AS numeric))),
    4)
  WHERE side = 'SELL'
    AND is_paper = true
    AND shadow_session_id IS NOT NULL
    AND pnl IS NOT NULL
    AND ABS(CAST(pnl AS numeric)) > CAST(total_value AS numeric) * 0.06
`);
console.log('Fixed SELL rows:', fixSells.rowCount);

// Step 3: Fix BUY trades with inflated pnl (should be -fee = -0.1% of total_value)
const fixBuys = await client.query(`
  UPDATE trades
  SET pnl = ROUND(-CAST(total_value AS numeric) * 0.001, 4),
      pnl_percent = -0.1
  WHERE side = 'BUY'
    AND is_paper = true
    AND shadow_session_id IS NOT NULL
    AND pnl IS NOT NULL
    AND ABS(CAST(pnl AS numeric)) > CAST(total_value AS numeric) * 0.01
`);
console.log('Fixed BUY rows:', fixBuys.rowCount);

// Step 4: Verify new totals after fix
const verify = await client.query(`
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as with_pnl,
    ROUND(SUM(CAST(COALESCE(pnl,'0') AS numeric)), 2) as sum_pnl,
    ROUND(MAX(CAST(COALESCE(pnl,'0') AS numeric)), 4) as max_pnl,
    ROUND(MIN(CAST(COALESCE(pnl,'0') AS numeric)), 4) as min_pnl
  FROM trades
  WHERE shadow_session_id IS NOT NULL AND is_paper = true
`);
console.log('After fix totals:', JSON.stringify(verify.rows[0]));

// Step 5: Per-session balance delta vs sum of corrected trade pnl
const sessions = await client.query(`
  SELECT ss.id, b.name as bot_name, ss.status,
    CAST(ss.virtual_balance AS numeric) as start_bal,
    CAST(ss.current_balance AS numeric) as cur_bal,
    ROUND(CAST(ss.current_balance AS numeric) - CAST(ss.virtual_balance AS numeric), 2) as balance_delta,
    COALESCE(t.sum_pnl, 0) as trades_sum_pnl,
    COALESCE(t.cnt, 0) as trade_count
  FROM shadow_sessions ss
  JOIN bots b ON b.id = ss.bot_id
  JOIN users u ON u.id = ss.user_id
  LEFT JOIN (
    SELECT shadow_session_id,
      ROUND(SUM(CAST(COALESCE(pnl,'0') AS numeric)),2) as sum_pnl,
      COUNT(*) as cnt
    FROM trades WHERE shadow_session_id IS NOT NULL
    GROUP BY shadow_session_id
  ) t ON t.shadow_session_id = ss.id
  WHERE u.email = 'farooqtariq400@gmail.com'
  ORDER BY ss.created_at DESC
`);
console.log('Per-session comparison (balance_delta vs trades_pnl):');
let totalDelta = 0, totalTrades = 0;
for (const r of sessions.rows) {
  console.log(`  ${r.bot_name} [${r.status}]: balance_delta=$${r.balance_delta} trades_sum=$${r.trades_sum_pnl} count=${r.trade_count}`);
  totalDelta += parseFloat(r.balance_delta ?? 0);
  totalTrades += parseFloat(r.trades_sum_pnl ?? 0);
}
console.log(`TOTAL balance_delta: $${totalDelta.toFixed(2)}`);
console.log(`TOTAL trades sum_pnl: $${totalTrades.toFixed(2)}`);

await client.end();
process.exit(0);
