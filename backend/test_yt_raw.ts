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

  // Full raw response for Rick Roll
  const r = await req('POST', '/ai/youtube/learn', { url: 'https://youtu.be/dQw4w9WgXcQ' }, token);
  console.log('FULL RESPONSE:', JSON.stringify(r, null, 2));
}
main();
