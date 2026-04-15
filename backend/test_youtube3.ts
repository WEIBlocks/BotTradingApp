const BACKEND = 'http://206.81.2.59';
async function req(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

async function main() {
  const login = await req('POST', '/auth/login', { email: 'user@bottrade.com', password: 'Password123!' }) as any;
  const token = login.accessToken ?? login.data?.accessToken;
  console.log('Login:', token ? 'OK' : 'FAILED');

  // Test 1: Non-trading video (Rick Roll) — should be REJECTED
  console.log('\n[1] Non-trading video (Rick Roll) → expect REJECTED');
  const r1 = await req('POST', '/ai/youtube/learn', { url: 'https://youtu.be/dQw4w9WgXcQ' }, token) as any;
  const d1 = r1.data;
  console.log(d1?.rejected ? `✅ REJECTED: ${d1.message}` : `❌ Should have rejected — chunksStored:${d1?.chunksStored}`);

  // Test 2: Trading video (Bitcoin price prediction / crypto)
  console.log('\n[2] Trading video → expect ACCEPTED');
  const r2 = await req('POST', '/ai/youtube/learn', { url: 'https://youtu.be/bq3-qH-CpYQ' }, token) as any;
  const d2 = r2.data;
  console.log(d2?.rejected ? `❌ Wrongly rejected: ${d2.title}` : `✅ ACCEPTED: "${d2?.title}" — chunks:${d2?.chunksStored} transcript:${d2?.hasTranscript}`);

  // Test 3: Chat with non-trading YouTube URL
  console.log('\n[3] Chat with non-trading YouTube URL → expect rejection message');
  const r3 = await req('POST', '/ai/chat', {
    message: 'Can you analyze this? https://youtu.be/dQw4w9WgXcQ',
  }, token) as any;
  const reply3 = r3.data?.reply || r3.reply || '';
  const rejected3 = reply3.toLowerCase().includes('only learn') || reply3.toLowerCase().includes('not related') || reply3.toLowerCase().includes('trading');
  console.log(rejected3 ? `✅ Correctly declined: ${reply3.substring(0, 150)}` : `❌ Should have declined — got: ${reply3.substring(0, 150)}`);

  // Test 4: Chat with trading YouTube URL — user's actual video from screenshot
  console.log('\n[4] Chat with trading URL (user screenshot video) → expect analysis');
  const r4 = await req('POST', '/ai/chat', {
    message: `Analyze this trading video: https://youtu.be/bq3-qH-CpYQ?si=FFPc7iqJkaa5xCRK`,
  }, token) as any;
  const reply4 = r4.data?.reply || r4.reply || '';
  console.log(`Reply (${r4.data?.provider}): ${reply4.substring(0, 300)}`);
}
main();
