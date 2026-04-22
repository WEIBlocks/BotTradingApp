"""
Deploy portfolio.routes.js to production server 206.81.2.59
"""
import sys, os
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'
local = r'D:\Weiblocks\Bot_App\backend\dist\modules\portfolio\portfolio.routes.js'
remote = f'{BASE}/dist/modules/portfolio/portfolio.routes.js'

print("=== Uploading file ===")
upload_file(local, remote)

print("\n=== Restarting backend ===")
out, status = run(f'''
{PATH}
pm2 restart bottradeapp --update-env 2>/dev/null || true
sleep 3
pm2 status 2>/dev/null | cat || echo "pm2 status done"
''', timeout=30)
print(out.encode('ascii', 'replace').decode())
print(f"\nRestart exit status: {status}")

print("\n=== Health check ===")
import time, urllib.request
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Deploy complete ===")
