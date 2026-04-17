"""
Run this script AFTER closing Chrome completely.
It exports your YouTube cookies to a Netscape-format cookies.txt file
and uploads it to the server so yt-dlp can bypass bot-detection.

Usage:
  1. Close Chrome completely (all windows)
  2. Run: python export_youtube_cookies.py
"""
import sys, os, subprocess
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

cookies_local = r'D:\Weiblocks\Bot_App\youtube_cookies.txt'

print("Exporting YouTube cookies from Chrome (Chrome must be closed)...")
result = subprocess.run(
    [sys.executable, '-m', 'yt_dlp',
     '--cookies-from-browser', 'chrome',
     '--cookies', cookies_local,
     '--skip-download', '--quiet', '--no-warnings',
     'https://www.youtube.com/'],
    capture_output=True, text=True
)

if result.returncode != 0:
    print("Chrome failed, trying Edge...")
    result = subprocess.run(
        [sys.executable, '-m', 'yt_dlp',
         '--cookies-from-browser', 'edge',
         '--cookies', cookies_local,
         '--skip-download', '--quiet', '--no-warnings',
         'https://www.youtube.com/'],
        capture_output=True, text=True
    )

if os.path.exists(cookies_local) and os.path.getsize(cookies_local) > 500:
    print(f"Cookies exported: {os.path.getsize(cookies_local)} bytes")
    upload_file(cookies_local, '/opt/bottradeapp/backend/youtube_cookies.txt')
    print("Uploaded to server!")

    # Test on server
    out, _ = run(r'''
export PATH=$PATH:/usr/local/bin
yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt \
  --output /tmp/yt_ctest \
  --cookies /opt/bottradeapp/backend/youtube_cookies.txt \
  --no-warnings --quiet \
  "https://www.youtube.com/watch?v=Xn7KWR9EOGQ" 2>&1
ls /tmp/yt_ctest* 2>/dev/null && echo "SUCCESS - transcripts working!" || echo "FAILED"
rm -f /tmp/yt_ctest* 2>/dev/null
''')
    print(out.encode('ascii', errors='replace').decode())
else:
    print("ERROR: Cookie export failed.")
    print("stderr:", result.stderr[:300])
    print("Make sure Chrome/Edge is fully closed and you are logged into YouTube.")
