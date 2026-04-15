"""Deploy all agentic v2 changes (11 tasks)."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import upload_file, run

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REMOTE_BASE = '/opt/bottradeapp/backend'
NVM_NODE_BIN = '/root/.nvm/versions/node/v22.22.2/bin'
PM2 = f'{NVM_NODE_BIN}/pm2'

files_to_deploy = [
    # AI core
    (f'{BASE_DIR}/backend/dist/modules/ai/ai.service.js',   f'{REMOTE_BASE}/dist/modules/ai/ai.service.js'),
    (f'{BASE_DIR}/backend/dist/modules/ai/ai.service.d.ts', f'{REMOTE_BASE}/dist/modules/ai/ai.service.d.ts'),
    (f'{BASE_DIR}/backend/dist/modules/ai/ai.routes.js',    f'{REMOTE_BASE}/dist/modules/ai/ai.routes.js'),
    # RAG isolation fix
    (f'{BASE_DIR}/backend/dist/lib/rag.js',                 f'{REMOTE_BASE}/dist/lib/rag.js'),
    # DexScreener + price caching
    (f'{BASE_DIR}/backend/dist/lib/market-scanner.js',      f'{REMOTE_BASE}/dist/lib/market-scanner.js'),
    (f'{BASE_DIR}/backend/dist/lib/market-scanner.d.ts',    f'{REMOTE_BASE}/dist/lib/market-scanner.d.ts'),
    # Embedding model version field
    (f'{BASE_DIR}/backend/dist/db/schema/embeddings.js',    f'{REMOTE_BASE}/dist/db/schema/embeddings.js'),
    # Config env (BRAVE_SEARCH_API_KEY)
    (f'{BASE_DIR}/backend/dist/config/env.js',              f'{REMOTE_BASE}/dist/config/env.js'),
]

print("=== Uploading files ===")
for local, remote in files_to_deploy:
    if not os.path.exists(local):
        print(f"  MISSING: {local}")
        continue
    upload_file(local, remote)
    print(f"  OK: {os.path.basename(local)}")

print("\n=== Line counts on server ===")
for local, remote in files_to_deploy:
    out, _ = run(f'wc -l {remote} 2>/dev/null || echo "missing"')
    print(f"  {out.strip()}")

print("\n=== Restarting PM2 ===")
out, _ = run(
    f'export PATH="{NVM_NODE_BIN}:$PATH" && '
    f'{PM2} delete bottradeapp 2>/dev/null || true && sleep 2 && '
    f'cd {REMOTE_BASE} && '
    f'{PM2} start dist/index.js --name bottradeapp -i 1 && sleep 8 && '
    f'{PM2} status && ss -tlnp | grep 3000'
)
out_safe = out.encode('ascii', errors='replace').decode('ascii')
print(out_safe)
