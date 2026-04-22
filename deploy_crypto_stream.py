"""
Deploy crypto-stream (fully real-time WS for Kraken/Coinbase/KuCoin) to 206.81.2.59
"""
import sys, os
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'
LOCAL = r'D:\Weiblocks\Bot_App'

print("=== Uploading changed files ===")
files = [
    (r'backend\dist\lib\crypto-stream.js',            f'{BASE}/dist/lib/crypto-stream.js'),
    (r'backend\dist\lib\crypto-stream.d.ts',          f'{BASE}/dist/lib/crypto-stream.d.ts'),
    (r'backend\dist\modules\ws\ws.handler.js',        f'{BASE}/dist/modules/ws/ws.handler.js'),
    (r'backend\dist\modules\ws\ws.handler.d.ts',      f'{BASE}/dist/modules/ws/ws.handler.d.ts'),
]

for local_rel, remote in files:
    local = os.path.join(LOCAL, local_rel)
    if os.path.exists(local):
        upload_file(local, remote)
    else:
        print(f'  SKIP (not found): {local_rel}')

print("\n=== Restarting backend ===")
out, status = run(f'''
{PATH}
pm2 restart bottradeapp --update-env 2>/dev/null || pm2 restart all 2>/dev/null || true
sleep 3
pm2 status 2>/dev/null || true
''', timeout=30)
print(out)

print("\n=== Health check ===")
import time, urllib.request
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Deploy complete ===")
