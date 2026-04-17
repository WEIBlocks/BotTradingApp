const https = require('https');
const fs = require('fs');

const videoId = 'Xn7KWR9EOGQ';

const cookieLines = fs.readFileSync('/opt/bottradeapp/backend/youtube_cookies.txt', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'));
const cookies = cookieLines.map(l => {
  const p = l.split('\t');
  return p.length >= 7 ? `${p[5]}=${p[6]}` : '';
}).filter(Boolean).join('; ');

console.log('Cookie count:', cookieLines.length);

const options = {
  hostname: 'www.youtube.com',
  path: `/watch?v=${videoId}`,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Cookie': cookies,
  }
};

https.get(options, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const hasCaption = data.includes('captionTracks');
    const hasSignIn = data.includes('"SIGN_IN"') || data.includes('Sign in to confirm');
    console.log('Page length:', data.length);
    console.log('Has captionTracks:', hasCaption);
    console.log('Has sign-in block:', hasSignIn);

    if (hasCaption) {
      const m = data.match(/"captionTracks":(\[.*?\])/);
      if (m) {
        try {
          const tracks = JSON.parse(m[1]);
          console.log('Tracks:', tracks.length);
          tracks.slice(0,3).forEach(t => {
            console.log('  lang:', t.languageCode, 'url:', (t.baseUrl||'').substring(0,80));
          });
          if (tracks[0] && tracks[0].baseUrl) {
            const url = new URL(tracks[0].baseUrl);
            https.get({
              hostname: url.hostname,
              path: url.pathname + url.search,
              headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookies }
            }, r2 => {
              let body = '';
              r2.on('data', c => body += c);
              r2.on('end', () => {
                console.log('Transcript len:', body.length, 'preview:', body.substring(0, 150));
              });
            }).on('error', e => console.log('fetch err:', e.message));
          }
        } catch(e) { console.log('Parse error:', e.message); }
      }
    }
  });
}).on('error', e => console.log('Error:', e.message));
