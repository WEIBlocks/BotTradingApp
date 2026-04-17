import sys
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run

# Try generating a visitor_data token via yt-dlp --print and use it to fetch transcript
# Alternative: use node script on server to fetch transcript using youtube-dl's internal API bypass
out, status = run(r'''
export PATH=$PATH:/usr/local/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | tail -1)/bin

# Try yt-dlp with a fresh user-agent rotate + sleep
# Check if node can fetch transcript using a different approach
node -e "
const https = require('https');

// Fetch YouTube initial data to get caption URLs (same as browser does)
const videoId = 'Xn7KWR9EOGQ';
const url = 'https://www.youtube.com/watch?v=' + videoId;

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Extract captionTracks from ytInitialPlayerResponse
    const match = data.match(/\"captionTracks\":(\[.*?\])/);
    if (match) {
      try {
        const tracks = JSON.parse(match[1]);
        console.log('Caption tracks found:', tracks.length);
        tracks.forEach(t => console.log(' -', t.languageCode, t.baseUrl ? t.baseUrl.substring(0, 80) : 'no url'));
      } catch(e) {
        console.log('Parse error:', e.message);
      }
    } else {
      // Check if page requires sign-in
      if (data.includes('Sign in')) console.log('BLOCKED: Sign in required');
      else if (data.includes('captionTracks')) console.log('captionTracks present but regex failed');
      else console.log('No captionTracks found. Page length:', data.length);
    }
  });
}).on('error', e => console.log('Error:', e.message));
" 2>&1
''')
print(out.encode('ascii', errors='replace').decode())
