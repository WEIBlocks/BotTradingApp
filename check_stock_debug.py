import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

out, status = run('''
export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin
pm2 logs bottradeapp --lines 50 --nostream 2>/dev/null
''', timeout=30)
print(out)
