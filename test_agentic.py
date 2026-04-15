"""Test agentic OpenAI tool-calling chat."""
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

def chat(token, message):
    payload = json.dumps({"message": message})
    out, _ = run(
        f'curl -s -w "\\nHTTP_STATUS:%{{http_code}}" -X POST http://localhost:3000/ai/chat '
        f'-H "Content-Type: application/json" '
        f'-H "Authorization: Bearer {token}" '
        f"-d '{payload}'"
    )
    parts = out.rsplit('\nHTTP_STATUS:', 1)
    body = parts[0].strip()
    status = parts[1].strip() if len(parts) > 1 else '?'
    try:
        r = json.loads(body)
        d = r.get('data', r)
        return status, d.get('reply', ''), d.get('model', ''), d.get('cleanPrompt', '')
    except:
        return status, body[:300], '', ''

print("=== Login ===")
token = get_token('admin@bottrade.com', 'Password123!')
print(f"Token: {'OK' if token else 'FAILED'}")
if not token:
    exit(1)

print("\n--- Test 1: Crypto price (should call get_crypto_price tool) ---")
status, reply, model, _ = chat(token, "What is the current price of BTC and ETH?")
print(f"HTTP {status} | Model: {model}")
print(f"Reply: {reply[:400]}")

print("\n--- Test 2: Market overview (should call get_market_overview tool) ---")
status, reply, model, _ = chat(token, "Show me the top 5 crypto coins right now")
print(f"HTTP {status} | Model: {model}")
print(f"Reply: {reply[:400]}")

print("\n--- Test 3: Strategy request (should produce strategy-json) ---")
status, reply, model, clean = chat(token, "Build me a BTC momentum scalping bot with high risk")
print(f"HTTP {status} | Model: {model}")
print(f"Reply snippet: {reply[:300]}")
if '```strategy-json' in reply:
    print("PASS: strategy-json block present")
else:
    print("INFO: No strategy-json block in reply")

print("\n--- Test 4: General question (conversational, no tool needed) ---")
status, reply, model, _ = chat(token, "Explain what RSI is and how to use it")
print(f"HTTP {status} | Model: {model}")
print(f"Reply: {reply[:400]}")
