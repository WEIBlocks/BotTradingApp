"""
Extract YouTube cookies from Chrome's SQLite database and convert to Netscape format.
Uses win32crypt to decrypt Chrome's encrypted cookies.
"""
import sys, os, sqlite3, json, shutil
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

def get_chrome_key():
    """Get Chrome's AES key from Local State file."""
    import base64
    local_state_path = r'C:\Users\faroo\AppData\Local\Google\Chrome\User Data\Local State'
    with open(local_state_path, 'r', encoding='utf-8') as f:
        local_state = json.load(f)
    encrypted_key = base64.b64decode(local_state['os_crypt']['encrypted_key'])
    # Remove DPAPI prefix 'DPAPI'
    encrypted_key = encrypted_key[5:]
    import ctypes, ctypes.wintypes
    # Use DPAPI to decrypt
    try:
        import win32crypt
        key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]
        return key
    except ImportError:
        # Manual DPAPI call
        class DATA_BLOB(ctypes.Structure):
            _fields_ = [('cbData', ctypes.wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]

        p = ctypes.create_string_buffer(encrypted_key, len(encrypted_key))
        blobin = DATA_BLOB(ctypes.sizeof(p), p)
        blobout = DATA_BLOB()
        retval = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blobin), None, None, None, None, 0, ctypes.byref(blobout))
        if not retval:
            raise RuntimeError('CryptUnprotectData failed')
        result = ctypes.string_at(blobout.pbData, blobout.cbData)
        ctypes.windll.kernel32.LocalFree(blobout.pbData)
        return result

def decrypt_cookie(encrypted_value, key):
    """Decrypt Chrome v10+ AES-256-GCM cookie."""
    try:
        from Crypto.Cipher import AES
        if encrypted_value[:3] == b'v10' or encrypted_value[:3] == b'v11':
            nonce = encrypted_value[3:3+12]
            ciphertext = encrypted_value[3+12:-16]
            tag = encrypted_value[-16:]
            cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
            return cipher.decrypt_and_verify(ciphertext, tag).decode('utf-8')
    except Exception:
        pass
    try:
        import win32crypt
        return win32crypt.CryptUnprotectData(encrypted_value, None, None, None, 0)[1].decode('utf-8')
    except Exception:
        return ''

def extract_youtube_cookies():
    db_path = r'C:\Users\faroo\AppData\Local\Google\Chrome\User Data\Default\Network\Cookies'
    tmp_db = r'C:\Users\faroo\AppData\Local\Temp\yt_cookies_tmp.db'

    # Copy locked database
    shutil.copy2(db_path, tmp_db)

    key = get_chrome_key()

    conn = sqlite3.connect(tmp_db)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly
        FROM cookies
        WHERE host_key LIKE '%youtube.com%' OR host_key LIKE '%google.com%'
    """)

    cookies = []
    for row in cursor.fetchall():
        host, name, enc_val, path, expires, secure, httponly = row
        value = decrypt_cookie(enc_val, key) if enc_val else ''
        if value:
            cookies.append((host, name, value, path, expires, secure))

    conn.close()
    os.unlink(tmp_db)

    # Convert to Netscape format
    lines = ['# Netscape HTTP Cookie File', '# https://curl.se/docs/http-cookies.html', '']
    for host, name, value, path, expires, secure in cookies:
        include_subdomains = 'TRUE' if host.startswith('.') else 'FALSE'
        secure_str = 'TRUE' if secure else 'FALSE'
        # Convert Chrome microseconds to Unix seconds
        exp_unix = (expires - 11644473600000000) // 1000000 if expires else 0
        lines.append(f'{host}\t{include_subdomains}\t{path}\t{secure_str}\t{exp_unix}\t{name}\t{value}')

    return '\n'.join(lines)

print("Extracting YouTube cookies from Chrome...")
try:
    cookies_txt = extract_youtube_cookies()

    cookies_local = r'D:\Weiblocks\Bot_App\youtube_cookies.txt'
    with open(cookies_local, 'w') as f:
        f.write(cookies_txt)

    line_count = len([l for l in cookies_txt.split('\n') if l and not l.startswith('#')])
    print(f"Extracted {line_count} cookies")

    if line_count > 5:
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
ls /tmp/yt_ctest* 2>/dev/null && echo "SUCCESS!" || echo "FAILED"
cat /tmp/yt_ctest*.vtt 2>/dev/null | head -6
rm -f /tmp/yt_ctest* 2>/dev/null
''')
        print(out.encode('ascii', errors='replace').decode())
    else:
        print("Too few cookies extracted - may not be logged in to YouTube in Chrome")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
