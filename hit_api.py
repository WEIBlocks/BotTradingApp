import sys, json
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

# Login and hit the equity endpoint directly on prod
out, _ = run("""
export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin
cd /opt/bottradeapp/backend

node --input-type=module << 'JSEOF'
import { readFileSync } from 'fs';

// Login first
const loginRes = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'farooqtariq400@gmail.com', password: 'Password123!'})
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.data?.accessToken;
console.log('Login status:', loginRes.status, 'token:', token ? token.slice(0,20)+'...' : 'MISSING');

if (!token) { console.log('Full login response:', JSON.stringify(loginData)); process.exit(1); }

// Hit equity endpoint
const res = await fetch('http://localhost:3000/portfolio/equity-history?days=30&granularity=daily', {
  headers: {'Authorization': 'Bearer ' + token}
});
const data = await res.json();
console.log('Status:', res.status);
console.log('Top-level keys:', Object.keys(data));
console.log('data.data keys:', data.data ? Object.keys(data.data) : 'N/A');
console.log('equityData:', JSON.stringify(data.data?.equityData?.slice(0,5)));
console.log('isRealData:', data.data?.isRealData);
console.log('dates sample:', JSON.stringify(data.data?.dates?.slice(0,2)));
JSEOF
""", timeout=20)
print(out)
