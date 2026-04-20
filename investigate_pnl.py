"""
Deep PnL accuracy investigation for user farooqtariq400@gmail.com
"""
import sys, time, json
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, write_remote

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

# ── STEP 1: Login and get auth token ──────────────────────────────────────────
print("\n" + "="*70)
print("STEP 1: Login for farooqtariq400@gmail.com")
print("="*70)
out, status = run("""curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"farooqtariq400@gmail.com","password":"Password123!"}' """, timeout=15)
print(out)

# Extract token
token = None
try:
    data = json.loads(out.strip())
    token = data.get('token') or data.get('data', {}).get('token') or data.get('accessToken')
    if not token and 'data' in data:
        token = data['data'].get('accessToken') or data['data'].get('token')
    print(f"\nExtracted token: {token[:40] if token else 'NOT FOUND'}...")
except Exception as e:
    print(f"Could not parse login response: {e}")

# ── STEP 2: Arena sessions and gladiator PnL ──────────────────────────────────
print("\n" + "="*70)
print("STEP 2: Arena sessions and gladiator PnL")
print("="*70)

arena_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';

// Get user
const [user] = await db.execute(sql`SELECT id, email, name FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }
console.log('\nUSER:', JSON.stringify(user));

// Get all arena sessions
const sessions = await db.execute(sql`
  SELECT
    s.id,
    s.status,
    s.started_at,
    s.ended_at,
    s.total_rounds,
    s.min_order_value
  FROM arena_sessions s
  WHERE s.user_id = ${user.id}
  ORDER BY s.started_at DESC
`);
console.log(`\nTOTAL ARENA SESSIONS: ${sessions.length}`);

let grandTotalPnl = 0;
let grandTotalGladiators = 0;

for (const session of sessions) {
  console.log(`\n--- Session ${session.id} | status=${session.status} | rounds=${session.total_rounds} | started=${session.started_at} ---`);

  // Get gladiators for this session
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
    // Count actual BUY/SELL decisions in decision_log
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
    console.log(`  Gladiator ${g.id} | bot=${g.bot_name} | total_pnl=${g.total_pnl} | final_return=${g.final_return} | status=${g.status} | decisions: BUY=${buyCount} SELL=${sellCount}`);
  }

  console.log(`  SESSION TOTAL PNL (sum gladiators): ${sessionPnl.toFixed(4)}`);
  grandTotalPnl += sessionPnl;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`GRAND TOTAL: ${sessions.length} sessions, ${grandTotalGladiators} gladiators`);
console.log(`GRAND TOTAL ARENA PNL (sum all gladiator total_pnl): ${grandTotalPnl.toFixed(4)}`);

process.exit(0);
"""

write_remote(arena_script, f'{BASE}/debug_arena.mjs')
out, status = run(f'''
{PATH}
cd {BASE}
node --input-type=module < debug_arena.mjs 2>&1
''', timeout=60)
print(out)

# ── STEP 3: /trades/summary for arena ─────────────────────────────────────────
print("\n" + "="*70)
print("STEP 3: /trades/summary API response")
print("="*70)

if token:
    out, status = run(f'''curl -s http://localhost:3000/trades/summary \
      -H "Authorization: Bearer {token}"''', timeout=15)
    print(out)
    try:
        summary_data = json.loads(out.strip())
        print("\nParsed summary:")
        print(json.dumps(summary_data, indent=2))
    except:
        pass
else:
    print("SKIP - no token")

# ── STEP 4: /trades/history?mode=arena ────────────────────────────────────────
print("\n" + "="*70)
print("STEP 4: /trades/history?mode=arena")
print("="*70)

if token:
    out, status = run(f'''curl -s "http://localhost:3000/trades/history?mode=arena&limit=100" \
      -H "Authorization: Bearer {token}"''', timeout=15)
    print(out[:3000])
    try:
        hist_data = json.loads(out.strip())
        trades = hist_data.get('trades') or hist_data.get('data') or []
        if isinstance(trades, list):
            pnl_null = sum(1 for t in trades if t.get('pnl') is None)
            pnl_nonNull = sum(1 for t in trades if t.get('pnl') is not None)
            pnl_sum = sum(float(t.get('pnl') or 0) for t in trades)
            print(f"\nTotal trades returned: {len(trades)}")
            print(f"Trades with pnl=null: {pnl_null}")
            print(f"Trades with pnl set: {pnl_nonNull}")
            print(f"Sum of pnl: {pnl_sum:.4f}")
        else:
            print(f"Response structure: {list(hist_data.keys()) if isinstance(hist_data, dict) else type(hist_data)}")
    except Exception as e:
        print(f"Parse error: {e}")
else:
    print("SKIP - no token")

# ── STEP 5: Shadow sessions ────────────────────────────────────────────────────
print("\n" + "="*70)
print("STEP 5: Shadow sessions for user")
print("="*70)

shadow_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';

const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }

// Get all shadow sessions
const sessions = await db.execute(sql`
  SELECT
    ss.id,
    ss.status,
    ss.current_balance,
    ss.virtual_balance,
    ss.total_trades,
    ss.win_count,
    ss.started_at,
    b.name as bot_name,
    ex.name as exchange_name
  FROM shadow_sessions ss
  LEFT JOIN bots b ON b.id = ss.bot_id
  LEFT JOIN exchanges ex ON ex.id = ss.exchange_id
  WHERE ss.user_id = ${user.id}
  ORDER BY ss.started_at DESC
`);

console.log(`\nTOTAL SHADOW SESSIONS: ${sessions.length}`);

let totalActualPnl = 0;
for (const s of sessions) {
  const actualPnl = parseFloat(s.current_balance || 0) - parseFloat(s.virtual_balance || 0);
  totalActualPnl += actualPnl;
  console.log(`  Session ${s.id} | bot=${s.bot_name} | status=${s.status}`);
  console.log(`    virtual_balance(start)=${s.virtual_balance} | current_balance=${s.current_balance}`);
  console.log(`    actual_pnl(current-virtual)=${actualPnl.toFixed(4)} | total_trades=${s.total_trades} | win_count=${s.win_count}`);
}

console.log(`\nSUM actual PnL across all shadow sessions: ${totalActualPnl.toFixed(4)}`);

// Compare to trades table
const tradeStats = await db.execute(sql`
  SELECT
    COUNT(*) as total_count,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as pnl_not_null,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as pnl_null,
    SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) as sum_pnl,
    MAX(pnl) as max_pnl,
    MIN(pnl) as min_pnl
  FROM trades
  WHERE user_id = ${user.id}
    AND shadow_session_id IS NOT NULL
`);
console.log('\nTRADES TABLE (shadow_session_id IS NOT NULL):');
console.log(JSON.stringify(tradeStats[0], null, 2));

process.exit(0);
"""

write_remote(shadow_script, f'{BASE}/debug_shadow.mjs')
out, status = run(f'''
{PATH}
cd {BASE}
node --input-type=module < debug_shadow.mjs 2>&1
''', timeout=60)
print(out)

# ── STEP 6: Trades table direct analysis ──────────────────────────────────────
print("\n" + "="*70)
print("STEP 6: Trades table direct analysis for user")
print("="*70)

trades_script = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);
if (!user) { console.log('USER NOT FOUND'); process.exit(1); }

console.log(`User ID: ${user.id}`);

// GROUP BY side and shadow_session presence
const grouped = await db.execute(sql`
  SELECT
    side,
    CASE WHEN shadow_session_id IS NOT NULL THEN 'shadow'
         WHEN arena_gladiator_id IS NOT NULL THEN 'arena'
         ELSE 'live' END as trade_type,
    COUNT(*) as count,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as pnl_not_null_count,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as pnl_null_count,
    SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) as sum_pnl,
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
    SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) as total_pnl,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as with_pnl,
    COUNT(CASE WHEN pnl IS NULL THEN 1 END) as null_pnl
  FROM trades
  WHERE user_id = ${user.id}
`);
console.log('\nOVERALL TOTALS:');
console.log(JSON.stringify(totals[0], null, 2));

// Arena-specific: check arena_gladiator_id is set
const arenaTrades = await db.execute(sql`
  SELECT
    COUNT(*) as count,
    COUNT(CASE WHEN pnl IS NOT NULL THEN 1 END) as pnl_set,
    SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END) as sum_pnl
  FROM trades
  WHERE user_id = ${user.id}
    AND arena_gladiator_id IS NOT NULL
`);
console.log('\nARENA TRADES (arena_gladiator_id IS NOT NULL):');
console.log(JSON.stringify(arenaTrades[0], null, 2));

// Sample arena trades to see structure
const sampleArena = await db.execute(sql`
  SELECT id, side, symbol, quantity, price, pnl, arena_gladiator_id, created_at
  FROM trades
  WHERE user_id = ${user.id} AND arena_gladiator_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 5
`);
console.log('\nSAMPLE ARENA TRADES (latest 5):');
for (const t of sampleArena) {
  console.log(`  id=${t.id} | side=${t.side} | symbol=${t.symbol} | qty=${t.quantity} | price=${t.price} | pnl=${t.pnl} | gladiator=${t.arena_gladiator_id} | at=${t.created_at}`);
}

process.exit(0);
"""

write_remote(trades_script, f'{BASE}/debug_trades.mjs')
out, status = run(f'''
{PATH}
cd {BASE}
node --input-type=module < debug_trades.mjs 2>&1
''', timeout=60)
print(out)

print("\n" + "="*70)
print("INVESTIGATION COMPLETE")
print("="*70)
