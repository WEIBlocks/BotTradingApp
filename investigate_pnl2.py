"""
Phase 2: Introspect real schema then run corrected PnL queries
"""
import sys, time, json
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, write_remote

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkODVmNzIwNS0yMmIwLTQ0YTYtOTcwMi03NjE3ODczOTFmMjkiLCJyb2xlIjoiY3JlYXRvciIsImlhdCI6MTc3NjY5Mjg3OCwiZXhwIjoxNzc2NzA3Mjc4fQ.-d8-5GdqfysmSuxG2gQZ4jykXZiRjwZgkxp8KJzBpHg"

# ── STEP 1: Introspect actual DB schema ───────────────────────────────────────
print("\n" + "="*70)
print("SCHEMA INTROSPECTION")
print("="*70)

schema_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

// Get columns for key tables
const tables = ['arena_sessions', 'arena_gladiators', 'shadow_sessions', 'trades'];
for (const table of tables) {
  const cols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `);
  console.log(`\n=== ${table} columns ===`);
  for (const c of cols) {
    console.log(`  ${c.column_name}  (${c.data_type}, nullable=${c.is_nullable})`);
  }
}

process.exit(0);
"""

write_remote = None
import paramiko, io

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect('206.81.2.59', username='root', password='egwecsTDSi3%@n*&QERlU', timeout=20)
    return c

def upload_str(content, remote_path):
    c = ssh()
    sftp = c.open_sftp()
    f = sftp.open(remote_path, 'wb')
    f.write(content.encode('utf-8'))
    f.close()
    sftp.close()
    c.close()

def run_cmd(cmd, timeout=120):
    c = ssh()
    transport = c.get_transport()
    chan = transport.open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = ''
    start = time.time()
    while True:
        if chan.recv_ready():
            chunk = chan.recv(65536).decode(errors='replace')
            out += chunk
        if chan.exit_status_ready():
            while chan.recv_ready():
                chunk = chan.recv(65536).decode(errors='replace')
                out += chunk
            break
        if time.time() - start > timeout:
            break
        time.sleep(0.2)
    c.close()
    return out

upload_str(schema_script, f'{BASE}/schema_check.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < schema_check.mjs 2>&1', timeout=30)
print(out)

# ── STEP 2: Corrected Arena query (no total_rounds) ───────────────────────────
print("\n" + "="*70)
print("CORRECTED ARENA ANALYSIS")
print("="*70)

arena_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id, email, name FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }
console.log('USER:', JSON.stringify(user));

// Get all arena sessions (without total_rounds)
const sessions = await db.execute(sql`
  SELECT
    s.id,
    s.status,
    s.started_at,
    s.ended_at
  FROM arena_sessions s
  WHERE s.user_id = ${user.id}
  ORDER BY s.started_at DESC
`);
console.log(`\nTOTAL ARENA SESSIONS: ${sessions.length}`);

let grandTotalPnl = 0;
let grandTotalGladiators = 0;

for (const session of sessions) {
  console.log(`\n--- Session ${session.id} | status=${session.status} | started=${session.started_at} ---`);

  const gladiators = await db.execute(sql`
    SELECT
      g.id,
      g.bot_id,
      b.name as bot_name,
      g.total_pnl,
      g.final_return,
      g.status,
      g.decision_log
    FROM arena_gladiators g
    LEFT JOIN bots b ON b.id = g.bot_id
    WHERE g.session_id = ${session.id}
    ORDER BY g.total_pnl DESC NULLS LAST
  `);

  let sessionPnl = 0;
  grandTotalGladiators += gladiators.length;

  for (const g of gladiators) {
    let buyCount = 0, sellCount = 0;
    try {
      if (g.decision_log) {
        const log = typeof g.decision_log === 'string' ? JSON.parse(g.decision_log) : g.decision_log;
        if (Array.isArray(log)) {
          buyCount = log.filter(d => d.action === 'BUY' || d.side === 'BUY').length;
          sellCount = log.filter(d => d.action === 'SELL' || d.side === 'SELL').length;
        }
      }
    } catch(e) {}

    const pnl = parseFloat(g.total_pnl || 0);
    sessionPnl += pnl;
    console.log(`  Gladiator ${g.id} | bot=${g.bot_name} | total_pnl=${g.total_pnl} | final_return=${g.final_return} | status=${g.status} | decisions BUY=${buyCount} SELL=${sellCount}`);
  }

  console.log(`  SESSION PNL SUM: ${sessionPnl.toFixed(4)}`);
  grandTotalPnl += sessionPnl;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`GRAND TOTAL: ${sessions.length} sessions, ${grandTotalGladiators} gladiators`);
console.log(`GRAND TOTAL ARENA PNL (sum gladiator.total_pnl): ${grandTotalPnl.toFixed(4)}`);

process.exit(0);
"""

upload_str(arena_script, f'{BASE}/arena_v2.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < arena_v2.mjs 2>&1', timeout=60)
print(out)

# ── STEP 3: Corrected Shadow Sessions (no exchanges table) ────────────────────
print("\n" + "="*70)
print("CORRECTED SHADOW ANALYSIS")
print("="*70)

shadow_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }

const sessions = await db.execute(sql`
  SELECT
    ss.id,
    ss.status,
    ss.current_balance,
    ss.virtual_balance,
    ss.total_trades,
    ss.win_count,
    ss.started_at,
    b.name as bot_name
  FROM shadow_sessions ss
  LEFT JOIN bots b ON b.id = ss.bot_id
  WHERE ss.user_id = ${user.id}
  ORDER BY ss.started_at DESC
`);

console.log(`\nTOTAL SHADOW SESSIONS: ${sessions.length}`);
let totalActualPnl = 0;
for (const s of sessions) {
  const curr = parseFloat(s.current_balance || 0);
  const virt = parseFloat(s.virtual_balance || 0);
  const actualPnl = curr - virt;
  totalActualPnl += actualPnl;
  console.log(`  Session ${s.id} | bot=${s.bot_name} | status=${s.status}`);
  console.log(`    virtual_balance=${s.virtual_balance} | current_balance=${s.current_balance}`);
  console.log(`    actual_pnl(curr-virt)=${actualPnl.toFixed(4)} | total_trades=${s.total_trades} | win_count=${s.win_count}`);
}
console.log(`\nSUM actual PnL (current_balance - virtual_balance) all shadow sessions: ${totalActualPnl.toFixed(4)}`);

// Trades table for shadow (without arena_gladiator_id column - check actual column names first)
const tradeStats = await db.execute(sql`
  SELECT
    COUNT(*) as total_count,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as pnl_not_null,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as pnl_null,
    COALESCE(SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END), 0) as sum_pnl,
    MAX(pnl) as max_pnl,
    MIN(pnl) as min_pnl
  FROM trades
  WHERE user_id = ${user.id}
    AND shadow_session_id IS NOT NULL
`);
console.log('\nTRADES TABLE (shadow only - shadow_session_id IS NOT NULL):');
console.log(JSON.stringify(tradeStats[0], null, 2));

process.exit(0);
"""

upload_str(shadow_script, f'{BASE}/shadow_v2.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < shadow_v2.mjs 2>&1', timeout=60)
print(out)

# ── STEP 4: Corrected Trades Analysis ─────────────────────────────────────────
print("\n" + "="*70)
print("CORRECTED TRADES TABLE ANALYSIS")
print("="*70)

trades_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }
console.log(`User ID: ${user.id}`);

// Determine actual trades columns relevant to mode detection
const tradeCols = await db.execute(sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trades'
  ORDER BY ordinal_position
`);
console.log('\nTrades table columns: ' + tradeCols.map(c => c.column_name).join(', '));

// Group trades by mode (using shadow_session_id to detect shadow)
const grouped = await db.execute(sql`
  SELECT
    side,
    CASE
      WHEN shadow_session_id IS NOT NULL THEN 'shadow'
      ELSE 'live_or_arena'
    END as trade_type,
    COUNT(*) as count,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as pnl_not_null_count,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as pnl_null_count,
    COALESCE(SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END), 0) as sum_pnl,
    MAX(pnl) as max_pnl,
    MIN(pnl) as min_pnl
  FROM trades
  WHERE user_id = ${user.id}
  GROUP BY side, trade_type
  ORDER BY trade_type, side
`);

console.log('\nTRADES grouped by (side, trade_type):');
for (const row of grouped) {
  console.log(`  side=${row.side} | type=${row.trade_type} | count=${row.count} | pnl_set=${row.pnl_not_null_count} | pnl_null=${row.pnl_null_count} | sum_pnl=${row.sum_pnl} | max=${row.max_pnl} | min=${row.min_pnl}`);
}

// Overall totals
const totals = await db.execute(sql`
  SELECT
    COUNT(*) as total,
    COALESCE(SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END), 0) as total_pnl,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as with_pnl,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as null_pnl
  FROM trades
  WHERE user_id = ${user.id}
`);
console.log('\nOVERALL TOTALS for this user:');
console.log(JSON.stringify(totals[0], null, 2));

// Shadow trades SELL pnl detail (these should have pnl)
const shadowSells = await db.execute(sql`
  SELECT id, side, symbol, pnl, shadow_session_id, created_at
  FROM trades
  WHERE user_id = ${user.id} AND shadow_session_id IS NOT NULL AND side = 'SELL'
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('\nSAMPLE SHADOW SELL TRADES (latest 10):');
for (const t of shadowSells) {
  console.log(`  id=${t.id} | ${t.symbol} | pnl=${t.pnl} | session=${t.shadow_session_id} | at=${t.created_at}`);
}

// Non-shadow trades (live/arena) SELL pnl detail
const nonShadowSells = await db.execute(sql`
  SELECT id, side, symbol, pnl, shadow_session_id, created_at
  FROM trades
  WHERE user_id = ${user.id} AND shadow_session_id IS NULL AND side = 'SELL'
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('\nSAMPLE NON-SHADOW SELL TRADES (latest 10, live or arena):');
for (const t of nonShadowSells) {
  console.log(`  id=${t.id} | ${t.symbol} | pnl=${t.pnl} | at=${t.created_at}`);
}

process.exit(0);
"""

upload_str(trades_script, f'{BASE}/trades_v2.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < trades_v2.mjs 2>&1', timeout=60)
print(out)

# ── STEP 5: How trades/summary calculates arena PnL ──────────────────────────
print("\n" + "="*70)
print("HOW /trades/summary CALCULATES ARENA PnL - check trades service source")
print("="*70)
out = run_cmd("grep -n 'arena\\|totalPnl\\|total_pnl\\|gladiator' /opt/bottradeapp/backend/dist/modules/trades/trades.service.js 2>/dev/null | head -60", timeout=15)
print(out)

# ── STEP 6: Check arena service PnL calculation ───────────────────────────────
print("\n" + "="*70)
print("HOW arena_gladiators.total_pnl IS CALCULATED - arena service")
print("="*70)
out = run_cmd("grep -n 'total_pnl\\|totalPnl\\|pnl\\|final_return' /opt/bottradeapp/backend/dist/modules/arena/arena.service.js 2>/dev/null | head -80", timeout=15)
print(out)

print("\n" + "="*70)
print("ARENA TICK JOB - how gladiator pnl is updated")
print("="*70)
out = run_cmd("grep -n 'total_pnl\\|pnl\\|balance\\|final_return' /opt/bottradeapp/backend/dist/jobs/arena-tick.job.js 2>/dev/null | head -80", timeout=15)
print(out)

print("\n" + "="*70)
print("INVESTIGATION COMPLETE")
print("="*70)
