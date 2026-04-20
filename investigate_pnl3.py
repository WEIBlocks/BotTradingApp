"""
Phase 3: Final arena gladiator data + shadow/trades discrepancy deep dive
"""
import sys, time, json, paramiko
sys.path.insert(0, r'D:\Weiblocks\Bot_App')

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

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

# ── STEP A: Arena gladiators (without status column) ─────────────────────────
print("\n" + "="*70)
print("ARENA GLADIATORS - FULL DATA")
print("="*70)

arena_final = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);

const sessions = await db.execute(sql`
  SELECT id, status, started_at, ended_at, virtual_balance, per_bot_allocation
  FROM arena_sessions
  WHERE user_id = ${user.id}
  ORDER BY started_at DESC
`);
console.log(`ARENA SESSIONS: ${sessions.length}`);

let grandTotalPnl = 0;
let grandTotalGladiators = 0;
let grandTotalBuyDecisions = 0;
let grandTotalSellDecisions = 0;

for (const session of sessions) {
  console.log(`\n--- Session ${session.id} | status=${session.status} | virtual_balance=${session.virtual_balance} | per_bot_alloc=${session.per_bot_allocation} | started=${session.started_at} | ended=${session.ended_at} ---`);

  const gladiators = await db.execute(sql`
    SELECT
      g.id,
      g.bot_id,
      b.name as bot_name,
      g.total_pnl,
      g.final_return,
      g.win_rate,
      g.total_trades,
      g.is_winner,
      g.decision_log
    FROM arena_gladiators g
    LEFT JOIN bots b ON b.id = g.bot_id
    WHERE g.session_id = ${session.id}
    ORDER BY g.final_return DESC NULLS LAST
  `);

  let sessionPnl = 0;
  grandTotalGladiators += gladiators.length;

  for (const g of gladiators) {
    let buyCount = 0, sellCount = 0;
    let decisionLogLen = 0;
    try {
      if (g.decision_log) {
        const log = typeof g.decision_log === 'string' ? JSON.parse(g.decision_log) : g.decision_log;
        if (Array.isArray(log)) {
          decisionLogLen = log.length;
          buyCount = log.filter(d => d.action === 'BUY' || d.side === 'BUY').length;
          sellCount = log.filter(d => d.action === 'SELL' || d.side === 'SELL').length;
        }
      }
    } catch(e) {}

    const pnl = parseFloat(g.total_pnl || 0);
    sessionPnl += pnl;
    grandTotalBuyDecisions += buyCount;
    grandTotalSellDecisions += sellCount;
    console.log(`  Gladiator ${g.id}`);
    console.log(`    bot=${g.bot_name} | total_pnl=${g.total_pnl} | final_return=${g.final_return}% | win_rate=${g.win_rate}% | total_trades=${g.total_trades} | is_winner=${g.is_winner}`);
    console.log(`    decision_log entries=${decisionLogLen} (BUY=${buyCount}, SELL=${sellCount})`);
  }

  console.log(`  >>> SESSION TOTAL PNL (sum gladiator.total_pnl): ${sessionPnl.toFixed(4)}`);
  grandTotalPnl += sessionPnl;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`GRAND TOTAL ARENA SESSIONS: ${sessions.length}`);
console.log(`GRAND TOTAL ARENA GLADIATORS: ${grandTotalGladiators}`);
console.log(`GRAND TOTAL ARENA PNL (sum gladiator.total_pnl): ${grandTotalPnl.toFixed(4)}`);
console.log(`GRAND TOTAL BUY decisions in decision_log: ${grandTotalBuyDecisions}`);
console.log(`GRAND TOTAL SELL decisions in decision_log: ${grandTotalSellDecisions}`);

process.exit(0);
"""

upload_str(arena_final, f'{BASE}/arena_final.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < arena_final.mjs 2>&1', timeout=60)
print(out)

# ── STEP B: Why shadow totalPnl in trades is $789.70 but balance delta is -$107.09 ──
print("\n" + "="*70)
print("SHADOW PnL DISCREPANCY INVESTIGATION")
print("="*70)

shadow_detail = r"""
import { db } from './dist/config/database.js';
import { sql } from 'drizzle-orm';

const userEmail = 'farooqtariq400@gmail.com';
const [user] = await db.execute(sql`SELECT id FROM users WHERE email = ${userEmail}`);

// BUY trades with pnl set - this is anomalous (BUY trades shouldn't have PnL)
const buyWithPnl = await db.execute(sql`
  SELECT id, symbol, side, amount, price, pnl, pnl_percent, shadow_session_id, reasoning, executed_at
  FROM trades
  WHERE user_id = ${user.id} AND shadow_session_id IS NOT NULL AND side = 'BUY' AND pnl IS NOT NULL
  ORDER BY executed_at DESC
  LIMIT 5
`);
console.log(`\nBUY TRADES WITH PNL SET (shadow): ${buyWithPnl.length} found`);
for (const t of buyWithPnl) {
  console.log(`  id=${t.id} | ${t.symbol} | pnl=${t.pnl} | pnl%=${t.pnl_percent} | amount=${t.amount} | price=${t.price}`);
  console.log(`    reasoning: ${(t.reasoning||'').substring(0, 100)}`);
}

// Session-by-session breakdown of trades pnl vs balance delta
const sessions = await db.execute(sql`
  SELECT id, status, virtual_balance, current_balance, total_trades, win_count, bot_id
  FROM shadow_sessions WHERE user_id = ${user.id}
`);

console.log('\nPER-SESSION COMPARISON: trades.sum(pnl) vs (current_balance - virtual_balance)');
let totalTradesPnl = 0;
let totalBalanceDelta = 0;
for (const s of sessions) {
  const trStats = await db.execute(sql`
    SELECT
      COUNT(*) as cnt,
      COALESCE(SUM(CASE WHEN pnl IS NOT NULL THEN pnl ELSE 0 END), 0) as sum_pnl,
      COUNT(CASE WHEN side='SELL' AND pnl IS NOT NULL THEN 1 END) as sell_with_pnl
    FROM trades
    WHERE shadow_session_id = ${s.id}
  `);
  const st = trStats[0];
  const balanceDelta = parseFloat(s.current_balance || 0) - parseFloat(s.virtual_balance || 0);
  const tradesPnl = parseFloat(st.sum_pnl);
  totalTradesPnl += tradesPnl;
  totalBalanceDelta += balanceDelta;
  console.log(`  Session ${s.id} | status=${s.status}`);
  console.log(`    balance delta (curr-virt): ${balanceDelta.toFixed(2)} | trades sum_pnl: ${tradesPnl.toFixed(2)} | trade_count: ${st.cnt} | sells_with_pnl: ${st.sell_with_pnl}`);
}
console.log(`\nTOTALS: balance_delta_sum=${totalBalanceDelta.toFixed(2)} | trades_pnl_sum=${totalTradesPnl.toFixed(2)}`);
console.log(`DISCREPANCY: ${(totalTradesPnl - totalBalanceDelta).toFixed(2)}`);

// Check the big $118 pnl trade
const bigPnl = await db.execute(sql`
  SELECT id, symbol, side, amount, price, pnl, pnl_percent, shadow_session_id, reasoning, executed_at
  FROM trades
  WHERE user_id = ${user.id} AND pnl IS NOT NULL AND pnl > 10
  ORDER BY pnl DESC
  LIMIT 10
`);
console.log('\nTOP PROFITABLE TRADES (pnl > $10):');
for (const t of bigPnl) {
  console.log(`  id=${t.id} | ${t.side} ${t.symbol} | pnl=${t.pnl} | pnl%=${t.pnl_percent} | amount=${t.amount} | price=${t.price}`);
  console.log(`    reasoning: ${(t.reasoning||'').substring(0, 120)}`);
}

// Check how shadow-trade job sets pnl
process.exit(0);
"""

upload_str(shadow_detail, f'{BASE}/shadow_detail.mjs')
out = run_cmd(f'{PATH} && cd {BASE} && node --input-type=module < shadow_detail.mjs 2>&1', timeout=60)
print(out)

# ── STEP C: Check shadow-trade job pnl calculation logic ─────────────────────
print("\n" + "="*70)
print("SHADOW-TRADE JOB: HOW PnL IS CALCULATED")
print("="*70)
out = run_cmd("grep -n 'pnl\\|balance\\|current_balance\\|virtual\\|totalValue\\|amount\\|profit' /opt/bottradeapp/backend/dist/jobs/shadow-trade.job.js 2>/dev/null | head -100", timeout=15)
print(out)

# ── STEP D: Check trades/summary shadow calculation ───────────────────────────
print("\n" + "="*70)
print("TRADES/SUMMARY SHADOW CALCULATION (source)")
print("="*70)
out = run_cmd("grep -n -A5 -B2 'shadow\\|totalPnl\\|byMode\\|sum.*pnl\\|pnl.*sum' /opt/bottradeapp/backend/dist/modules/trades/trades.service.js 2>/dev/null | head -80", timeout=15)
print(out)

print("\n" + "="*70)
print("INVESTIGATION COMPLETE")
print("="*70)
