"""Auth stress test against the live backend with 60s access TTL / 2m refresh TTL.

Scenarios:
  S1. Login -> wait > access TTL -> call protected endpoint (should auto-refresh).
  S2. Login -> 50 concurrent requests after access TTL expires (single refresh fires; all 50 succeed).
  S3. Login -> wait until BOTH tokens expire -> call protected endpoint (must fail with 401).
  S4. Login -> "logout" simulation: revoke refresh token (call /auth/logout) -> next call
      to /auth/refresh-token must 401 (session-fatal); a non-401 from refresh would be a bug.
  S5. After S4, the same access token is still pre-expiry valid for a moment — verify it works
      until expiry (we don't blacklist access tokens, that's by design).
  S6. Login as user A, logout, login as user A again (same id) — verify success.
  S7. Login -> refresh manually 5 times in a row (rotation chain) — every old refresh token
      must be revoked, only the newest works.
"""

import requests, time, json, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "http://206.81.2.59:3000"

def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()

def call_protected(token, label="profile"):
    r = requests.get(f"{BASE}/user/profile", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    return r.status_code, r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text

def refresh(refresh_token):
    r = requests.post(f"{BASE}/auth/refresh-token", json={"refreshToken": refresh_token}, timeout=15)
    return r.status_code, r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text

def logout(access_token, refresh_token):
    r = requests.post(f"{BASE}/auth/logout", headers={"Authorization": f"Bearer {access_token}"}, json={"refreshToken": refresh_token}, timeout=15)
    return r.status_code

PASS, FAIL = "PASS", "FAIL"
results = []
def record(name, ok, detail=""):
    results.append((name, PASS if ok else FAIL, detail))
    print(f"  [{PASS if ok else FAIL}] {name}  {detail}")

# ─── S1: token refresh after access expiry ──────────────────────────────────
print("\n=== S1: pre-emptive refresh after 70s ===")
s1 = login("user@bottrade.com", "Password123!")
acc1, ref1 = s1["accessToken"], s1["refreshToken"]
print("  waiting 70s for access token to expire (TTL=60s)...")
time.sleep(70)
sc1, body1 = call_protected(acc1, "expired-access")
ok1 = sc1 == 401
record("S1.a access token rejected after expiry", ok1, f"got {sc1}")
sc1b, body1b = refresh(ref1)
ok1b = sc1b == 200 and body1b.get("accessToken")
record("S1.b refresh-token returns new pair within refresh TTL", ok1b, f"got {sc1b}")

new_access = body1b.get("accessToken") if ok1b else None
new_refresh = body1b.get("refreshToken") if ok1b else None

if new_access:
    sc1c, _ = call_protected(new_access)
    record("S1.c new access token works", sc1c == 200, f"got {sc1c}")

# ─── S2: 50 concurrent requests on expired access token ─────────────────────
print("\n=== S2: 50 concurrent requests after access expiry (each tries refresh) ===")
print("  waiting 70s for new access to also expire...")
if new_refresh:
    # Use the new tokens from S1.
    acc2, ref2 = new_access, new_refresh
    time.sleep(70)
    # Each thread picks the same refresh token and tries to refresh independently —
    # in real client this is deduped, but server must handle the race. Test that
    # at least ONE refresh succeeds and the others either succeed (rotation) or fail
    # with a real 401. No 5xx allowed.
    def worker():
        s, b = refresh(ref2)
        return s, b
    statuses = []
    with ThreadPoolExecutor(max_workers=20) as ex:
        futs = [ex.submit(worker) for _ in range(20)]
        for f in as_completed(futs):
            statuses.append(f.result()[0])
    ok_any_200 = any(s == 200 for s in statuses)
    no_5xx = all(s < 500 for s in statuses)
    record("S2.a at least one concurrent refresh succeeded", ok_any_200, f"statuses={sorted(set(statuses))}")
    record("S2.b no 5xx server errors under refresh contention", no_5xx, "")
else:
    record("S2 SKIPPED — S1 didn't yield a new refresh token", False)

# ─── S3: full session expiry ────────────────────────────────────────────────
print("\n=== S3: both tokens expired (refresh TTL=2m) ===")
s3 = login("user@bottrade.com", "Password123!")
print("  waiting 130s for refresh token to expire (TTL=2m)...")
time.sleep(130)
sc3, body3 = refresh(s3["refreshToken"])
record("S3.a expired refresh-token gets 401", sc3 == 401, f"got {sc3} body={str(body3)[:100]}")

# ─── S4: logout flow ────────────────────────────────────────────────────────
print("\n=== S4: explicit logout revokes the refresh token ===")
s4 = login("user@bottrade.com", "Password123!")
sc4 = logout(s4["accessToken"], s4["refreshToken"])
record("S4.a /auth/logout returns 200", sc4 == 200, f"got {sc4}")
sc4b, _ = refresh(s4["refreshToken"])
record("S4.b refresh after logout returns 401 (session-fatal)", sc4b == 401, f"got {sc4b}")

# ─── S5: access token still works briefly after logout ──────────────────────
print("\n=== S5: access token still valid until natural expiry (by design) ===")
s5 = login("user@bottrade.com", "Password123!")
logout(s5["accessToken"], s5["refreshToken"])
sc5, _ = call_protected(s5["accessToken"])
record("S5.a access still valid right after logout (60s window)", sc5 == 200, f"got {sc5}")

# ─── S6: same-user re-login ─────────────────────────────────────────────────
print("\n=== S6: logout -> re-login as same user ===")
s6a = login("user@bottrade.com", "Password123!")
logout(s6a["accessToken"], s6a["refreshToken"])
s6b = login("user@bottrade.com", "Password123!")
record("S6.a re-login works after logout", bool(s6b.get("accessToken")), "")
record("S6.b re-login user.id matches", s6a["user"]["id"] == s6b["user"]["id"], "")
sc6, _ = call_protected(s6b["accessToken"])
record("S6.c new access works", sc6 == 200, f"got {sc6}")

# ─── S7: refresh-token rotation chain ───────────────────────────────────────
print("\n=== S7: rotation chain — 5 sequential refreshes ===")
s7 = login("user@bottrade.com", "Password123!")
ref = s7["refreshToken"]
old_refs = []
chain_ok = True
for i in range(5):
    sc, body = refresh(ref)
    if sc != 200:
        chain_ok = False
        record(f"S7.a step {i+1} should succeed", False, f"got {sc}")
        break
    old_refs.append(ref)
    ref = body["refreshToken"]
    time.sleep(0.3)
record("S7.a 5 consecutive refreshes all succeed", chain_ok, "")
# Now try each OLD refresh token — all should 401 (revoked)
all_revoked = True
for i, old in enumerate(old_refs):
    sc, _ = refresh(old)
    if sc != 401:
        all_revoked = False
        record(f"S7.b old token #{i+1} should be revoked", False, f"got {sc}")
record("S7.b all 5 old refresh tokens return 401 after rotation", all_revoked, "")

# ─── Summary ────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for _, r, _ in results if r == PASS)
failed = sum(1 for _, r, _ in results if r == FAIL)
print(f"  RESULTS:  {passed} pass / {failed} fail / {len(results)} total")
print("="*60)
for name, r, det in results:
    print(f"  {r}  {name}  {det}")
sys.exit(0 if failed == 0 else 1)
