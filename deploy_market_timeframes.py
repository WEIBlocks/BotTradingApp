"""
Deploy market.service.js timeframe fixes:
- VALID_CRYPTO_TIMEFRAMES now includes 3m,30m,2h,6h,12h,3d
- KUCOIN_TF_MAP / KRAKEN_TF_MAP updated with all new intervals
- ALPACA_TF_MAP updated with 30m,2h,6h,12h (Alpaca supports all)
"""
import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'

print("=== Uploading market.service.js ===")
upload_file(
    r'D:\Weiblocks\Bot_App\backend\dist\modules\market\market.service.js',
    f'{BASE}/dist/modules/market/market.service.js',
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
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Done ===")
