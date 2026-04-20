import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH_PREFIX = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'

# 1. Upload compiled arena files
print("=== Uploading arena dist files ===")
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\arena\arena.service.js',
    '/opt/bottradeapp/backend/dist/modules/arena/arena.service.js'
)
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\arena\arena.routes.js',
    '/opt/bottradeapp/backend/dist/modules/arena/arena.routes.js'
)
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\db\schema\arena.js',
    '/opt/bottradeapp/backend/dist/db/schema/arena.js'
)
# Upload arena tick job (paused sessions skip logic)
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\jobs\arena-tick.job.js',
    '/opt/bottradeapp/backend/dist/jobs/arena-tick.job.js'
)
print("All arena files uploaded.")

# 2. Run DB migration: add paused/killed enum values + new columns
print("\n=== Running DB migration ===")
out, status = run(f'''
{PATH_PREFIX}
cd /opt/bottradeapp/backend
node --input-type=module <<'JSEOF'
import {{ db }} from './dist/config/database.js';
import {{ sql }} from 'drizzle-orm';
try {{
  await db.execute(sql.raw(`ALTER TYPE arena_status ADD VALUE IF NOT EXISTS 'paused'`));
  console.log('Added paused to arena_status enum');
}} catch(e) {{ console.log('paused enum:', e.message); }}
try {{
  await db.execute(sql.raw(`ALTER TYPE arena_status ADD VALUE IF NOT EXISTS 'killed'`));
  console.log('Added killed to arena_status enum');
}} catch(e) {{ console.log('killed enum:', e.message); }}
try {{
  await db.execute(sql.raw(`ALTER TABLE arena_sessions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ`));
  console.log('Added paused_at column');
}} catch(e) {{ console.log('paused_at col:', e.message); }}
try {{
  await db.execute(sql.raw(`ALTER TABLE arena_sessions ADD COLUMN IF NOT EXISTS paused_duration_seconds INTEGER DEFAULT 0`));
  console.log('Added paused_duration_seconds column');
}} catch(e) {{ console.log('paused_duration_seconds col:', e.message); }}
console.log('Migration complete');
process.exit(0);
JSEOF
''')
print(out)
print(f"Migration status: {status}")

# 3. Restart PM2
print("\n=== Restarting PM2 ===")
out, status = run(f'''
{PATH_PREFIX}
pm2 restart bottradeapp --update-env 2>&1
''')
print(out)
print(f"PM2 restart status: {status}")

# 4. Quick test: hit /arena/sessions/active and /arena/session/ID/pause
print("\n=== Verifying routes on server ===")
out, status = run('''
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/arena/sessions/active -H "Authorization: Bearer test" 2>/dev/null || echo "unreachable"
''')
print(f"GET /arena/sessions/active HTTP status: {out.strip()}")
print("Deploy complete!")
