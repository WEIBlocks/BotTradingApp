import { readFileSync } from 'fs';
const env = readFileSync('D:/Weiblocks/Bot_App/backend/.env.development', 'utf8');
const get = (key: string) => (env.match(new RegExp(`^${key}=(.+)$`, 'm')) ?? [])[1]?.trim() ?? '';

const BACKEND = 'http://206.81.2.59';
const EMAIL = 'user@bottrade.com';
const PASSWORD = 'Password123!';
const BINANCE_KEY = get('BINANCE_API_KEY');
const BINANCE_SECRET = get('BINANCE_API_SECRET');
const IS_TESTNET = get('BINANCE_TESTNET') === 'true';

async function main() {
  // Test fetchBalance directly from server via a dedicated endpoint or by checking resync result
  const loginRes = await fetch(`${BACKEND}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { accessToken } = await loginRes.json() as any;

  // Get existing Binance connection
  const connRes = await fetch(`${BACKEND}/exchange/user/connections`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { data: conns } = await connRes.json() as any;
  const binance = conns?.find((c: any) => c.provider.toLowerCase() === 'binance');

  if (!binance) {
    console.log('No Binance connection found — connecting first...');
    const r = await fetch(`${BACKEND}/exchange/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ provider: 'Binance', apiKey: BINANCE_KEY, apiSecret: BINANCE_SECRET, sandbox: IS_TESTNET }),
    });
    const d = await r.json() as any;
    console.log('Connect:', r.status, d?.data?.id?.slice(0,8));
    return;
  }

  console.log(`Found Binance connection: ${binance.id.slice(0,8)} status:${binance.status} balance:$${binance.totalBalance}`);
  
  // Resync — this will hit fetchBalance on the server
  const resyncRes = await fetch(`${BACKEND}/exchange/${binance.id}/resync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({}),
  });
  const resyncData = await resyncRes.json() as any;
  console.log('Resync result:', resyncData?.data?.status, 'balance:$' + resyncData?.data?.totalBalance);
  if (resyncData?.data?.errorMessage) console.log('Error:', resyncData.data.errorMessage);
}
main();
