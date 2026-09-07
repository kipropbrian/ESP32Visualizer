#!/usr/bin/env python3
"""Install the static Pin Lab release and gateway link, preserving existing access rules."""
import datetime, os, pathlib, re, shutil, subprocess, sys, tarfile
archive = pathlib.Path(sys.argv[1])
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
release = pathlib.Path('/var/www/esp32-releases') / stamp
current = pathlib.Path('/var/www/esp32-current')
nginx = pathlib.Path('/etc/nginx/sites-enabled/bioacoustics-voltus')
gateway = pathlib.Path('/var/www/voltus-gateway/index.html')
backup = pathlib.Path('/var/backups/esp32-pin-lab') / stamp
original_nginx, original_gateway = nginx.read_text(), gateway.read_text()
if 'server_name experiments.maiyoinstitute.org;' not in original_nginx:
    raise SystemExit('Expected experiments virtual host was not found.')
if current.exists() and not current.is_symlink():
    raise SystemExit('Current release path exists and is not a symlink; refusing to replace it.')
old_target = os.readlink(current) if current.is_symlink() else None
config = original_nginx
if '# BEGIN ESP32 PIN LAB' not in config:
    if re.search(r'location\s+[^\n{]*?/esp32', config):
        raise SystemExit('An existing ESP32 location needs manual review.')
    match = re.search(r'location /voltus/ \{(.*?)proxy_pass', config, re.S)
    if not match:
        raise SystemExit('Could not find the existing application access policy.')
    access = '\n'.join(line for line in match[1].splitlines() if re.match(r'\s*(allow|deny)\s', line))
    if 'deny all;' not in access:
        raise SystemExit('Expected access allowlist and deny-all were not found.')
    block = '''    # BEGIN ESP32 PIN LAB
    location = /esp32 { return 302 /esp32/; }
    location /esp32/ {
ACCESS
        alias /var/www/esp32-current/;
        index index.html;
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
    # END ESP32 PIN LAB

'''.replace('ACCESS', access)
    anchor = '    location = /voltus { return 302 /voltus/; }'
    if config.count(anchor) != 1:
        raise SystemExit('Expected gateway insertion point was not unique.')
    config = config.replace(anchor, block + anchor, 1)
page = original_gateway
if 'href="/esp32/"' not in page:
    if page.count('    </section>') != 1 or 'aria-label="Applications"' not in page:
        raise SystemExit('Expected homepage application section was not found.')
    card = '''      <a class="card" href="/esp32/">
        <div class="label"><h2>ESP32 Pin Lab</h2><span class="arrow" aria-hidden="true">&rarr;</span></div>
        <p>Learn electronics with a virtual breadboard, jumper wires, and guided wiring challenges.</p>
        <div class="path">/esp32/</div>
      </a>
'''
    page = page.replace('    </section>', card + '    </section>', 1)
backup.mkdir(parents=True)
shutil.copy2(nginx, backup / 'nginx.bak')
shutil.copy2(gateway, backup / 'gateway.bak')
(backup / 'previous-release.txt').write_text((old_target or '') + '\n')
release.mkdir(parents=True)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member.')
    tar.extractall(release)  # Members above exclude links, special files, and traversal.
if not (release / 'index.html').is_file() or not (release / 'assets').is_dir():
    raise SystemExit('Release is missing the static entry point or assets.')
for path in [release, *release.rglob('*')]:
    path.chmod(0o755 if path.is_dir() else 0o644)
def activate(target):
    pending = current.with_name('esp32-pending-' + stamp)
    pending.symlink_to(target)
    os.replace(pending, current)
try:
    activate(release)
    nginx.write_text(config)
    subprocess.run(['nginx', '-t'], check=True)
    gateway.write_text(page)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except BaseException:
    shutil.copy2(backup / 'nginx.bak', nginx)
    shutil.copy2(backup / 'gateway.bak', gateway)
    if old_target:
        activate(old_target)
    subprocess.run(['nginx', '-t'], check=False)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=False)
    raise
print('Release:', release)
print('Backups:', backup)
print('Homepage link: /esp32/')
