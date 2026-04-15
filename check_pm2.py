import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import run

PM2 = '/root/.nvm/versions/node/v22.22.2/bin/pm2'

out, _ = run(f'{PM2} status')
print("PM2 status:", out)

out, _ = run(f'{PM2} logs bottradeapp --lines 50 --nostream 2>&1 | head -80')
print("PM2 logs:", out)

out, _ = run('netstat -tlnp 2>/dev/null | grep 3000 || ss -tlnp | grep 3000')
print("Port 3000:", out)
