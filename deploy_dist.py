"""Deploy dist/ to server, install prod deps, restart PM2."""
import os, sys, zipfile, tempfile
sys.path.insert(0, os.path.dirname(__file__))
import deploy_helper as dh

LOCAL_DIST = r'D:\Weiblocks\Bot_App\backend\dist'
LOCAL_PKG  = r'D:\Weiblocks\Bot_App\backend\package.json'
LOCAL_LOCK = r'D:\Weiblocks\Bot_App\backend\package-lock.json'
REMOTE_DIR = '/opt/bottradeapp/backend'

# ── 1. zip dist ──────────────────────────────────────────────────────────────
zip_path = tempfile.mktemp(suffix='.zip')
print('Zipping dist ...')
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(LOCAL_DIST):
        for f in files:
            fp = os.path.join(root, f)
            arcname = os.path.relpath(fp, LOCAL_DIST)
            zf.write(fp, arcname)
size = os.path.getsize(zip_path) / 1024 / 1024
print(f'Zip: {size:.1f} MB')

# ── 2. upload zip + package files ─────────────────────────────────────────────
print('Uploading dist.zip ...')
dh.upload_file(zip_path, f'{REMOTE_DIR}/dist.zip')
os.unlink(zip_path)

print('Uploading package.json ...')
dh.upload_file(LOCAL_PKG, f'{REMOTE_DIR}/package.json')

if os.path.exists(LOCAL_LOCK):
    print('Uploading package-lock.json ...')
    dh.upload_file(LOCAL_LOCK, f'{REMOTE_DIR}/package-lock.json')

# ── 3. find npm/pm2 and run server commands ────────────────────────────────────
# First find where npm and pm2 live on the server
print('\nLocating npm and pm2 on server ...')
out, _ = dh.run('which npm || find /usr/local/bin /usr/bin /root/.nvm -name npm 2>/dev/null | head -1', timeout=15)
npm_path = out.strip().splitlines()[0].strip() if out.strip() else '/usr/bin/npm'

out2, _ = dh.run('which pm2 || find /usr/local/bin /usr/bin /root/.nvm -name pm2 2>/dev/null | head -1', timeout=15)
pm2_path = out2.strip().splitlines()[0].strip() if out2.strip() else '/usr/local/bin/pm2'

print(f'npm: {npm_path}')
print(f'pm2: {pm2_path}')

# ── 4. extract, install, restart ─────────────────────────────────────────────
cmd = (
    f'export PATH="/usr/local/bin:/usr/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH" && '
    f'cd {REMOTE_DIR} && '
    f'rm -rf dist && '
    f'unzip -o dist.zip -d dist && '
    f'rm -f dist.zip && '
    f'{npm_path} ci --omit=dev --prefer-offline 2>&1 | tail -5 && '
    f'{pm2_path} restart bottradeapp 2>&1 && '
    f'sleep 3 && '
    f'{pm2_path} logs bottradeapp --lines 30 --nostream 2>&1'
)
print('\nRunning on server ...')
out, status = dh.run(cmd, timeout=300)
print(f'\nExit status: {status}')
