const BACKEND = 'http://206.81.2.59';
async function req(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0,300) }; }
}

async function main() {
  const loginData = await req('POST', '/auth/login', { email: 'user@bottrade.com', password: 'Password123!' }) as any;
  const token = loginData.accessToken ?? loginData.data?.accessToken;

  // Check actual response shape from chat
  const r = await req('POST', '/ai/chat', {
    message: 'Can you analyze this video? https://youtu.be/dQw4w9WgXcQ',
  }, token) as any;
  console.log('Full chat response keys:', Object.keys(r));
  console.log('data keys:', r.data ? Object.keys(r.data) : 'no data');
  console.log('Reply:', (r.reply || r.data?.reply)?.substring(0, 300));

  // Check rick roll transcript keyword issue — look at what was stored
  console.log('\n--- Rick Roll transcript snippet check ---');
  const transcript_test = await req('POST', '/ai/youtube/analyze', { url: 'https://youtu.be/dQw4w9WgXcQ' }, token) as any;
  console.log('Has transcript:', transcript_test.data?.hasTranscript);
  console.log('Preview:', transcript_test.data?.transcriptPreview?.substring(0, 200));
}
main();
