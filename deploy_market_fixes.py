"""
Deploy market/candle fixes, live-trade job updates, and bot-engine improvements.
Changes: Kraken WS fallback, bSOL/exotic candle chain, autoStopLossPercent,
stale exchangeConnId auto-heal, Binance LOT_SIZE exotic fix, slippage guard.
"""
import sys, os, time, urllib.request
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'
BASE = '/opt/bottradeapp/backend'
LOCAL = r'D:\Weiblocks\Bot_App'

files = [
    # Market service — MATIC/POL/bSOL candle fallback chain, cache empty-result fix
    (r'backend\dist\modules\market\market.service.js',   f'{BASE}/dist/modules/market/market.service.js'),
    (r'backend\dist\modules\market\market.routes.js',    f'{BASE}/dist/modules/market/market.routes.js'),
    # Live-trade job — autoStopLossPercent enforcement, stale exchangeConnId auto-heal
    (r'backend\dist\jobs\live-trade.job.js',             f'{BASE}/dist/jobs/live-trade.job.js'),
    # Price-sync job — KuCoin fallback + expanded CoinGecko map
    (r'backend\dist\jobs\price-sync.job.js',             f'{BASE}/dist/jobs/price-sync.job.js'),
    # Bot engine — slippage guard, fresh balance confirmation
    (r'backend\dist\lib\bot-engine.js',                  f'{BASE}/dist/lib/bot-engine.js'),
    (r'backend\dist\lib\bot-engine.d.ts',                f'{BASE}/dist/lib/bot-engine.d.ts'),
    # Bots module — exchangeConnId in purchase flow
    (r'backend\dist\modules\bots\bots.routes.js',        f'{BASE}/dist/modules/bots/bots.routes.js'),
    (r'backend\dist\modules\bots\bots.schema.js',        f'{BASE}/dist/modules/bots/bots.schema.js'),
    (r'backend\dist\modules\bots\bots.service.js',       f'{BASE}/dist/modules/bots/bots.service.js'),
    (r'backend\dist\modules\bots\bots.service.d.ts',     f'{BASE}/dist/modules/bots/bots.service.d.ts'),
    # Binance adapter — LOT_SIZE fallback for exotic pairs
    (r'backend\dist\modules\exchange\adapters\binance.adapter.js', f'{BASE}/dist/modules/exchange/adapters/binance.adapter.js'),
]

print("=== Uploading dist files ===")
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
pm2 status 2>/dev/null
''', timeout=30)
print(out)

print("\n=== Health check ===")
time.sleep(4)
try:
    res = urllib.request.urlopen('http://206.81.2.59:3000/health', timeout=10)
    print('Health:', res.read().decode())
except Exception as e:
    print('Health check failed:', e)

print("\n=== Deploy complete ===")
