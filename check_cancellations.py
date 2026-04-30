"""Check server logs for bot cancellation events"""
import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

PATH = 'export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin'

# Search both pm2 logs and recent log files for cancellation patterns
out, status = run(f'''
{PATH}
echo "=== Searching pm2 out log for cancel/stop/auto patterns ==="
grep -iE "cancel|auto.?stop|expired|terminat|ShadowTrade.*end|deactivat" /root/.pm2/logs/bottradeapp-out-0.log 2>/dev/null | tail -80

echo ""
echo "=== Searching pm2 error log for cancel patterns ==="
grep -iE "cancel|auto.?stop|expired|terminat" /root/.pm2/logs/bottradeapp-error-0.log 2>/dev/null | tail -40

echo ""
echo "=== ShadowTrade lines (last 60) ==="
grep "ShadowTrade" /root/.pm2/logs/bottradeapp-out-0.log 2>/dev/null | tail -60
''', timeout=45)
print(out)
