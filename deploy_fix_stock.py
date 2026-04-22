"""Deploy market.routes.js (limit max 2000) + restart backend"""
import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

print("=== Uploading market.routes.js ===")
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\market\market.routes.js',
    f'{BASE}/dist/modules/market/market.routes.js',
)
print("Uploaded.")

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
time.sleep(3)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Test stock candles (QQQ, limit=1000) ===")
import json
try:
    import urllib.parse
    req = urllib.request.Request(
        'http://206.81.2.59:3000/market/candles?symbol=QQQ&timeframe=1d&limit=1000&exchange=alpaca',
        headers={'Authorization': 'Bearer test'}  # will 401 but that proves routing works
    )
    try:
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode())
        candles = data.get('data', {}).get('candles', [])
        print(f'Candles returned: {len(candles)}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'HTTP {e.code}: {body[:200]}')
except Exception as e:
    print('Test failed:', e)

print("\n=== Done ===")
