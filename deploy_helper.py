import paramiko, time, sys, os
import io

HOST = '206.81.2.59'
USER = 'root'
PASS = "egwecsTDSi3%@n*&QERlU"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=20)
    return c

def run(cmd, timeout=120):
    c = ssh()
    transport = c.get_transport()
    chan = transport.open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = ''
    while True:
        if chan.recv_ready():
            chunk = chan.recv(4096).decode(errors='replace')
            out += chunk
            sys.stdout.buffer.write(chunk.encode('utf-8', errors='replace'))
            sys.stdout.buffer.flush()
        if chan.exit_status_ready():
            while chan.recv_ready():
                chunk = chan.recv(4096).decode(errors='replace')
                out += chunk
                sys.stdout.buffer.write(chunk.encode('utf-8', errors='replace'))
                sys.stdout.buffer.flush()
            break
        time.sleep(0.2)
    status = chan.recv_exit_status()
    c.close()
    return out, status

def run_simple(cmd, timeout=60):
    c = ssh()
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode(errors='replace')
    err = e.read().decode(errors='replace')
    c.close()
    return out, err

def upload_file(local_path, remote_path):
    c = ssh()
    sftp = c.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()
    c.close()
    print(f'Uploaded -> {remote_path}')

def upload_bytes(data: bytes, remote_path: str):
    c = ssh()
    sftp = c.open_sftp()
    f = sftp.open(remote_path, 'wb')
    f.write(data)
    f.close()
    sftp.close()
    c.close()
    print(f'Written  -> {remote_path}')

def write_remote(content: str, remote_path: str):
    upload_bytes(content.encode('utf-8'), remote_path)

def upload_dir_as_zip(local_dir, remote_zip, remote_extract_to):
    import zipfile, tempfile
    zip_path = tempfile.mktemp(suffix='.zip')
    print(f'Zipping {local_dir} ...')
    exclude = {'node_modules', 'dist', '.git', 'uploads', '__pycache__', '.nyc_output', 'coverage'}
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(local_dir):
            dirs[:] = [d for d in dirs if d not in exclude]
            for file in files:
                fp = os.path.join(root, file)
                arcname = os.path.relpath(fp, local_dir)
                zf.write(fp, arcname)
    size_mb = os.path.getsize(zip_path) / 1024 / 1024
    print(f'Zip size: {size_mb:.1f} MB  -> uploading ...')
    upload_file(zip_path, remote_zip)
    os.unlink(zip_path)
    print('Extracting on server ...')
    run(f'mkdir -p {remote_extract_to} && unzip -o {remote_zip} -d {remote_extract_to} && rm {remote_zip}', timeout=120)
    print('Done.')
