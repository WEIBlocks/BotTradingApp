"""Search server logs for actual cancellation events and reasons"""
import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'

out, status = run(f'''
{PATH}
echo "=== Log file sizes & rotation ==="
ls -lh /root/.pm2/logs/bottradeapp-*.log 2>/dev/null
echo ""

echo "=== Search ALL pm2 logs (including rotated) for cancel/auto-stop ==="
for f in /root/.pm2/logs/bottradeapp-out*.log* /root/.pm2/logs/bottradeapp-error*.log*; do
  [ -f "$f" ] || continue
  echo "--- $f ---"
  zgrep -iE "cancel|auto.?stop|expired|complet.*shadow|status.*cancelled|stopShadow" "$f" 2>/dev/null | grep -v "Skipping" | head -30
done
echo ""

echo "=== Recent stop actions in logs ==="
grep -iE "stop|deactivat|terminat" /root/.pm2/logs/bottradeapp-out-0.log 2>/dev/null | grep -v "stopLoss\\|Skipping\\|StopProfit" | tail -40
echo ""

echo "=== Look for [ShadowTrade] complete/end/duration patterns ==="
grep -iE "ShadowTrade.*complet|ShadowTrade.*duration|ShadowTrade.*end|ShadowTrade.*expire" /root/.pm2/logs/bottradeapp-out-0.log 2>/dev/null | tail -30
''', timeout=30)
print(out.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
