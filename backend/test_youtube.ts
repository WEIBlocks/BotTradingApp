const BACKEND = 'http://206.81.2.59';
const EMAIL = 'user@bottrade.com';
const PASSWORD = 'Password123!';

async function req(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

async function main() {
  const { accessToken } = await req('POST', '/auth/login', { email: EMAIL, password: PASSWORD }) as any;
  console.log('Token:', accessToken ? 'OK' : 'FAILED');

  // Test 1: Non-trading video (Rick Roll)
  console.log('\n--- Test 1: Non-trading video ---');
  const r1 = await req('POST', '/ai/youtube/learn', { url: 'https://youtu.be/dQw4w9WgXcQ' }, accessToken) as any;
  console.log('Response:', JSON.stringify(r1.data, null, 2));

  // Test 2: Trading video (Bitcoin/crypto related)
  console.log('\n--- Test 2: Trading video ---');
  const r2 = await req('POST', '/ai/youtube/learn', { url: 'https://youtu.be/bq3-qH-CpYQ' }, accessToken) as any;
  console.log('Response:', JSON.stringify(r2.data, null, 2));

  // Test 3: YouTube URL in chat message (non-trading)
  console.log('\n--- Test 3: YouTube URL in chat (non-trading) ---');
  const r3 = await req('POST', '/ai/chat', {
    message: 'Can you analyze this video? https://youtu.be/dQw4w9WgXcQ',
  }, accessToken) as any;
  console.log('Reply:', r3.reply?.substring(0, 300));

  // Test 4: YouTube URL in chat (trading)
  console.log('\n--- Test 4: YouTube URL in chat (trading) ---');
  const r4 = await req('POST', '/ai/chat', {
    message: `Analyze this trading video: https://youtu.be/bq3-qH-CpYQ`,
  }, accessToken) as any;
  console.log('Reply:', r4.reply?.substring(0, 400));
}
main();
