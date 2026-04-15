import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import run

# Find where the app actually lives
out, _ = run('find / -name "app.js" -path "*/bottradeapp/*" 2>/dev/null | head -5 || find / -name "app.js" -path "*/dist/*" 2>/dev/null | grep -v node_modules | head -10')
print("app.js locations:", out)

out, _ = run('ls /var/www/ 2>/dev/null || echo "no /var/www"; ls /root/ 2>/dev/null | head -20; ls /home/ 2>/dev/null')
print("dirs:", out)

out, _ = run('pm2 list 2>/dev/null || which pm2 2>/dev/null || echo "pm2 not in PATH"; which node 2>/dev/null; echo $PATH')
print("pm2/node:", out)
