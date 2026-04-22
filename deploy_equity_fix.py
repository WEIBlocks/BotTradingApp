"""
Deploy equity graph separation fix to 206.81.2.59
- portfolio.service: separate live vs shadow equity
- portfolio-update.job: UTC date fix for snapshots
- shadow-trade.job: real-time WS push after shadow trades
- ws.handler: new shadow_equity_update channel
"""
import sys, os
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'
base_local = r'D:\Weiblocks\Bot_App'

print("=== Uploading dist files ===")

files = [
    # Portfolio service — separate live vs shadow equity
    (r'backend\dist\modules\portfolio\portfolio.service.js', f'{BASE}/dist/modules/portfolio/portfolio.service.js'),
    (r'backend\dist\modules\portfolio\portfolio.service.d.ts', f'{BASE}/dist/modules/portfolio/portfolio.service.d.ts'),
    # Portfolio update job — UTC date fix
    (r'backend\dist\jobs\portfolio-update.job.js', f'{BASE}/dist/jobs/portfolio-update.job.js'),
    (r'backend\dist\jobs\portfolio-update.job.d.ts', f'{BASE}/dist/jobs/portfolio-update.job.d.ts'),
    # Shadow trade job — real-time WS push
    (r'backend\dist\jobs\shadow-trade.job.js', f'{BASE}/dist/jobs/shadow-trade.job.js'),
    (r'backend\dist\jobs\shadow-trade.job.d.ts', f'{BASE}/dist/jobs/shadow-trade.job.d.ts'),
    # WS handler — shadow_equity_update channel
    (r'backend\dist\modules\ws\ws.handler.js', f'{BASE}/dist/modules/ws/ws.handler.js'),
    (r'backend\dist\modules\ws\ws.handler.d.ts', f'{BASE}/dist/modules/ws/ws.handler.d.ts'),
]

for local_rel, remote in files:
    local = os.path.join(base_local, local_rel)
    if os.path.exists(local):
        upload_file(local, remote)
    else:
        print(f'  SKIP (not found): {local_rel}')

print("\n=== Restarting backend ===")
out, status = run(f'''
{PATH}
pm2 restart bottradeapp --update-env 2>/dev/null || pm2 restart all 2>/dev/null || true
sleep 3
pm2 status 2>/dev/null | cat || echo "pm2 status done"
''', timeout=30)
print(out.encode('ascii', 'replace').decode())

print("\n=== Health check ===")
import time, urllib.request
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Deploy complete ===")
