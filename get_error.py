import sys, json
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

out, _ = run("""
export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin
cd /opt/bottradeapp/backend

node --input-type=module << 'JSEOF'
const loginRes = await fetch('http://localhost:3000/auth/login', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'farooqtariq400@gmail.com', password: 'Password123!'})
});
const { accessToken } = await loginRes.json();

const res = await fetch('http://localhost:3000/portfolio/equity-history?days=30&granularity=daily', {
  headers: {'Authorization': 'Bearer ' + accessToken}
});
const data = await res.json();
console.log('FULL RESPONSE:', JSON.stringify(data));
JSEOF
""", timeout=20)
print(out)
