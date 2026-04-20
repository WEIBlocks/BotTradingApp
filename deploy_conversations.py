import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

# 1. Upload compiled JS files
print("=== Uploading compiled files ===")
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\db\schema\chat.js',
    '/opt/bottradeapp/backend/dist/db/schema/chat.js'
)
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\ai\ai.service.js',
    '/opt/bottradeapp/backend/dist/modules/ai/ai.service.js'
)
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\ai\ai.routes.js',
    '/opt/bottradeapp/backend/dist/modules/ai/ai.routes.js'
)
print("All files uploaded.")

PATH_PREFIX = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'

# 2. Run DB migration to create conversations table
print("\n=== Running DB migration ===")
out, status = run(f'''
{PATH_PREFIX}
cd /opt/bottradeapp/backend
node --input-type=module <<'JSEOF'
import {{ db }} from './dist/config/database.js';
import {{ sql }} from 'drizzle-orm';
await db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
`));
console.log('Migration done: conversations table created');
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
