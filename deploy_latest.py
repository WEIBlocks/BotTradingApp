"""
Deploy latest backend changes to 206.81.2.59
Uploads all changed dist/ files and restarts the server.
"""
import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file, write_remote

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

# ── 1. Upload all changed dist files ────────────────────────────────────────
print("=== Uploading dist files ===")

files = [
    # Core engine fixes (ghost positions, entryTradeId, SELL amount fallback)
    (r'backend\dist\lib\bot-engine.js',                    f'{BASE}/dist/lib/bot-engine.js'),
    (r'backend\dist\lib\bot-engine.d.ts',                  f'{BASE}/dist/lib/bot-engine.d.ts'),
    # Live trade job (rollbackPosition, SELL revert)
    (r'backend\dist\jobs\live-trade.job.js',               f'{BASE}/dist/jobs/live-trade.job.js'),
    # Bots service (ghost filter on all stats queries, toISO date fix)
    (r'backend\dist\modules\bots\bots.service.js',         f'{BASE}/dist/modules/bots/bots.service.js'),
    (r'backend\dist\modules\bots\bots.service.d.ts',       f'{BASE}/dist/modules/bots/bots.service.d.ts'),
    # AI chat service (deleteConversation, listConversations)
    (r'backend\dist\modules\ai\ai.service.js',             f'{BASE}/dist/modules/ai/ai.service.js'),
    (r'backend\dist\modules\ai\ai.service.d.ts',           f'{BASE}/dist/modules/ai/ai.service.d.ts'),
    # AI routes (delete conversation route)
    (r'backend\dist\modules\ai\ai.routes.js',              f'{BASE}/dist/modules/ai/ai.routes.js'),
    # DB schema (varchar 200 for strategy, chat schema)
    (r'backend\dist\db\schema\bots.js',                    f'{BASE}/dist/db/schema/bots.js'),
    (r'backend\dist\db\schema\bots.d.ts',                  f'{BASE}/dist/db/schema/bots.d.ts'),
    (r'backend\dist\db\schema\chat.js',                    f'{BASE}/dist/db/schema/chat.js'),
    (r'backend\dist\db\schema\chat.d.ts',                  f'{BASE}/dist/db/schema/chat.d.ts'),
    # Training service (document analysis fix)
    (r'backend\dist\modules\training\training.service.js', f'{BASE}/dist/modules/training/training.service.js'),
    # Exchange adapter fixes: getTickers() for Kraken, Coinbase, Alpaca; paper mode fix
    (r'backend\dist\modules\exchange\adapters\kraken.adapter.js',   f'{BASE}/dist/modules/exchange/adapters/kraken.adapter.js'),
    (r'backend\dist\modules\exchange\adapters\coinbase.adapter.js', f'{BASE}/dist/modules/exchange/adapters/coinbase.adapter.js'),
    (r'backend\dist\modules\exchange\adapters\alpaca.adapter.js',   f'{BASE}/dist/modules/exchange/adapters/alpaca.adapter.js'),
    # Bot engine: fix gpt-5.4-mini→gpt-4o-mini, remove synthetic seedPriceHistory, env-backed tunables, minOrderValue from sub
    # (bot-engine.js already in list above)
    # Env config: add MIN_CRYPTO_ORDER_USD, MIN_STOCK_ORDER_USD, LIMIT_ORDER_SLIPPAGE_PCT, AI_RATE_LIMIT_PER_HOUR
    (r'backend\dist\config\env.js',                        f'{BASE}/dist/config/env.js'),
    (r'backend\dist\config\env.d.ts',                      f'{BASE}/dist/config/env.d.ts'),
    # minOrderValue feature: schema, bots service, arena service, shadow-trade job
    (r'backend\dist\db\schema\bots.js',                    f'{BASE}/dist/db/schema/bots.js'),
    (r'backend\dist\db\schema\bots.d.ts',                  f'{BASE}/dist/db/schema/bots.d.ts'),
    (r'backend\dist\db\schema\arena.js',                   f'{BASE}/dist/db/schema/arena.js'),
    (r'backend\dist\db\schema\arena.d.ts',                 f'{BASE}/dist/db/schema/arena.d.ts'),
    (r'backend\dist\modules\bots\bots.service.js',         f'{BASE}/dist/modules/bots/bots.service.js'),
    (r'backend\dist\modules\bots\bots.service.d.ts',       f'{BASE}/dist/modules/bots/bots.service.d.ts'),
    (r'backend\dist\modules\bots\bots.schema.js',          f'{BASE}/dist/modules/bots/bots.schema.js'),
    (r'backend\dist\modules\bots\bots.routes.js',          f'{BASE}/dist/modules/bots/bots.routes.js'),
    (r'backend\dist\modules\arena\arena.service.js',       f'{BASE}/dist/modules/arena/arena.service.js'),
    (r'backend\dist\modules\arena\arena.service.d.ts',     f'{BASE}/dist/modules/arena/arena.service.d.ts'),
    (r'backend\dist\modules\arena\arena.routes.js',        f'{BASE}/dist/modules/arena/arena.routes.js'),
    (r'backend\dist\jobs\shadow-trade.job.js',             f'{BASE}/dist/jobs/shadow-trade.job.js'),
]

import os
base_local = r'D:\Weiblocks\Bot_App'
for local_rel, remote in files:
    local = os.path.join(base_local, local_rel)
    if os.path.exists(local):
        upload_file(local, remote)
    else:
        print(f'  SKIP (not found): {local_rel}')

# ── 2. Run DB migrations on server ──────────────────────────────────────────
print("\n=== Running DB migrations ===")
out, status = run(f'''
{PATH}
cd {BASE}
node --input-type=module <<'JSEOF'
import {{ db }} from './dist/config/database.js';
import {{ sql }} from 'drizzle-orm';

try {{
  // Expand strategy column to varchar(200)
  await db.execute(sql`ALTER TABLE bots ALTER COLUMN strategy TYPE varchar(200)`);
  console.log('strategy column expanded to varchar(200)');
}} catch(e) {{
  console.log('strategy column already varchar(200) or error:', e.message);
}}

try {{
  // Ensure conversations table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  console.log('conversations table ready');
}} catch(e) {{
  console.log('conversations table error:', e.message);
}}

try {{
  await db.execute(sql`ALTER TABLE bot_subscriptions ADD COLUMN IF NOT EXISTS min_order_value numeric(10,2) DEFAULT 10`);
  console.log('bot_subscriptions.min_order_value ready');
}} catch(e) {{
  console.log('bot_subscriptions.min_order_value:', e.message);
}}

try {{
  await db.execute(sql`ALTER TABLE shadow_sessions ADD COLUMN IF NOT EXISTS min_order_value numeric(10,2) DEFAULT 10`);
  console.log('shadow_sessions.min_order_value ready');
}} catch(e) {{
  console.log('shadow_sessions.min_order_value:', e.message);
}}

try {{
  await db.execute(sql`ALTER TABLE arena_sessions ADD COLUMN IF NOT EXISTS min_order_value numeric(10,2) DEFAULT 10`);
  console.log('arena_sessions.min_order_value ready');
}} catch(e) {{
  console.log('arena_sessions.min_order_value:', e.message);
}}

process.exit(0);
JSEOF
''', timeout=60)
print(out)

# ── 3. Restart backend ───────────────────────────────────────────────────────
print("\n=== Restarting backend ===")
out, status = run(f'''
{PATH}
pm2 restart bottradeapp --update-env 2>/dev/null || pm2 restart all 2>/dev/null || true
sleep 3
pm2 status 2>/dev/null || echo "pm2 not found, trying direct restart"
''', timeout=30)
print(out)

# ── 4. Health check ──────────────────────────────────────────────────────────
print("\n=== Health check ===")
import time, urllib.request
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Deploy complete ===")
