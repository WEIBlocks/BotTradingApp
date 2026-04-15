"""
Deploy YouTube AI classification fix + admin subscription bypass.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import upload_file, run

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REMOTE_BASE = '/opt/bottradeapp/backend'
NVM_NODE_BIN = '/root/.nvm/versions/node/v22.22.2/bin'
PM2 = f'{NVM_NODE_BIN}/pm2'

files_to_deploy = [
    (os.path.join(BASE_DIR, 'backend/dist/lib/youtube.js'),
     f'{REMOTE_BASE}/dist/lib/youtube.js'),
    (os.path.join(BASE_DIR, 'backend/dist/modules/ai/ai.routes.js'),
     f'{REMOTE_BASE}/dist/modules/ai/ai.routes.js'),
    (os.path.join(BASE_DIR, 'backend/dist/modules/ai/ai.service.js'),
     f'{REMOTE_BASE}/dist/modules/ai/ai.service.js'),
    (os.path.join(BASE_DIR, 'backend/dist/middleware/requireSubscription.js'),
     f'{REMOTE_BASE}/dist/middleware/requireSubscription.js'),
]

print("=== Uploading files ===")
for local, remote in files_to_deploy:
    if not os.path.exists(local):
        print(f"  MISSING: {local}")
        continue
    upload_file(local, remote)

print("\n=== Line counts on server ===")
for _, remote in files_to_deploy:
    out, _ = run(f'wc -l {remote} 2>&1')
    print(f"  {out.strip()}")

print("\n=== Restarting PM2 with index.js ===")
out, _ = run(
    f'export PATH="{NVM_NODE_BIN}:$PATH" && '
    f'{PM2} delete bottradeapp 2>/dev/null || true && sleep 2 && '
    f'cd {REMOTE_BASE} && '
    f'{PM2} start dist/index.js --name bottradeapp -i 1 && sleep 6 && '
    f'{PM2} status && ss -tlnp | grep 3000'
)
out_safe = out.encode('ascii', errors='replace').decode('ascii')
print(out_safe)
