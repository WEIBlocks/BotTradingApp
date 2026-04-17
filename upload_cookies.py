"""
After exporting youtube_cookies.txt using the browser extension,
run this script to upload the cookies to the server.
"""
import sys, os
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

cookies_local = r'D:\Weiblocks\Bot_App\youtube_cookies.txt'

if not os.path.exists(cookies_local):
    print("ERROR: youtube_cookies.txt not found at", cookies_local)
    sys.exit(1)

size = os.path.getsize(cookies_local)
with open(cookies_local) as f:
    lines = [l for l in f if l.strip() and not l.startswith('#')]

print(f"Cookie file: {size} bytes, {len(lines)} cookie entries")

upload_file(cookies_local, '/opt/bottradeapp/backend/youtube_cookies.txt')
print("Uploaded!")

out, _ = run(r'''
export PATH=$PATH:/usr/local/bin
yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt \
  --output /tmp/yt_ctest \
  --cookies /opt/bottradeapp/backend/youtube_cookies.txt \
  --no-warnings --quiet \
  "https://www.youtube.com/watch?v=Xn7KWR9EOGQ" 2>&1
ls /tmp/yt_ctest* 2>/dev/null && echo "SUCCESS - transcripts working!" || echo "FAILED"
cat /tmp/yt_ctest*.vtt 2>/dev/null | head -6
rm -f /tmp/yt_ctest* 2>/dev/null
''')
print(out.encode('ascii', errors='replace').decode())
