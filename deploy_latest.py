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
