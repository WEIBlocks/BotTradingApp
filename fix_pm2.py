import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import run

NVM_NODE_BIN = '/root/.nvm/versions/node/v22.22.2/bin'
PM2 = f'{NVM_NODE_BIN}/pm2'
REMOTE_BASE = '/opt/bottradeapp/backend'

print("=== Start with correct entry point (index.js) ===")
out, _ = run(
    f'export PATH="{NVM_NODE_BIN}:$PATH" && '
    f'{PM2} delete bottradeapp 2>/dev/null || true && '
    'sleep 1 && '
    f'cd {REMOTE_BASE} && '
    f'{PM2} start dist/index.js --name bottradeapp -i 1 && '
    'sleep 5 && '
    f'{PM2} status && '
    'ss -tlnp | grep 3000'
)
# Print without encoding errors
out_safe = out.encode('ascii', errors='replace').decode('ascii')
print(out_safe)
