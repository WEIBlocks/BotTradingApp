import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

out, status = run(r'''
export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin

node /tmp/yt_node_test.js
''')
print(out.encode('ascii', errors='replace').decode())
