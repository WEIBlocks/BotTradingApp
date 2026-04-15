"""Test YouTube learn endpoint with Claude AI classification."""
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy_helper import run

def get_token(email, password):
    out, _ = run(
        f'curl -s -X POST http://localhost:3000/auth/login '
        f'-H "Content-Type: application/json" '
        f'-d \'{{"email":"{email}","password":"{password}"}}\''
    )
    try:
        data = json.loads(out)
        return data.get('accessToken') or data.get('data', {}).get('accessToken', '')
    except:
        return ''

def learn(token, url):
    out, _ = run(
        f'curl -s -w "\\nHTTP_STATUS:%{{http_code}}" -X POST http://localhost:3000/ai/youtube/learn '
        f'-H "Content-Type: application/json" '
        f'-H "Authorization: Bearer {token}" '
        f'-d \'{{"url":"{url}"}}\''
    )
    # split body from status
    parts = out.rsplit('\nHTTP_STATUS:', 1)
    body = parts[0].strip()
    status = parts[1].strip() if len(parts) > 1 else '?'
    print(f"  HTTP {status}")
    try:
        return json.loads(body)
    except:
        return {'raw': body[:300]}

print("=== Login as admin ===")
token = get_token('admin@bottrade.com', 'Password123!')
print(f"Token: {'OK' if token else 'FAILED'}")

print("\n--- Test 1: Rick Roll → expect REJECTED ---")
r = learn(token, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
data = r.get('data', {})
if data.get('rejected'):
    print(f"PASS - {data.get('title')}")
    for s in (data.get('stages') or []):
        print(f"  > {s}")
else:
    print(f"FAIL: {json.dumps(r)[:400]}")

print("\n--- Test 2: Coin Bureau Bitcoin video → expect ACCEPTED ---")
r = learn(token, 'https://www.youtube.com/watch?v=1YyAzVmP9xQ')
data = r.get('data', {})
if data.get('rejected'):
    print(f"FAIL - Rejected: {data.get('title')}")
    print(f"  msg: {data.get('message')}")
elif 'chunksStored' in data:
    print(f"PASS - {data.get('title')}, chunks={data.get('chunksStored')}")
    for s in (data.get('stages') or []):
        print(f"  > {s}")
else:
    print(f"Unknown: {json.dumps(r)[:400]}")

print("\n--- Test 3: Cooking video → expect REJECTED ---")
r = learn(token, 'https://www.youtube.com/watch?v=BXv1oD979H4')
data = r.get('data', {})
if data.get('rejected'):
    print(f"PASS - {data.get('title')}")
    print(f"  Reason: {data.get('message')}")
elif 'chunksStored' in data:
    print(f"FAIL - Accepted: {data.get('title')}")
else:
    print(f"Unknown: {json.dumps(r)[:400]}")
