#!/usr/bin/env python3
"""Create a website from a prepared industry template, without installing or building per business."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = {'electrician': {'name': 'Electrician · base design', 'path': ROOT / 'templates/electrician'}}


def fingerprint(template):
    # Platform-independent: POSIX-style paths, case-sensitive order and LF line endings for text
    # files, so a Windows checkout (backslashes, CRLF from git autocrlf) matches a macOS build.
    digest = hashlib.sha256()
    files = sorted((p.relative_to(template).as_posix(), p) for p in template.rglob('*')
                   if p.is_file() and not any(x in p.relative_to(template).parts for x in ('node_modules', 'dist', '.vercel')))
    for relative, p in files:
        data = p.read_bytes()
        if b'\0' not in data:
            data = data.replace(b'\r\n', b'\n')
        digest.update(relative.encode())
        digest.update(data)
    return digest.hexdigest()


NPM = shutil.which('npm') or 'npm'  # finds npm.cmd on Windows


def prepare(template='electrician'):
    source = TEMPLATES[template]['path']
    if not (source / 'node_modules').exists():
        subprocess.run([NPM, 'ci', '--no-audit', '--no-fund'], cwd=source, check=True)
    subprocess.run([NPM, 'run', 'lint'], cwd=source, check=True)
    subprocess.run([NPM, 'run', 'build'], cwd=source, check=True)
    (source / 'dist/.prepared.json').write_text(json.dumps({'fingerprint': fingerprint(source)}))


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Business details must be an object')
    template = data.get('template', 'electrician')
    if template not in TEMPLATES:
        raise ValueError('Choose an available template: electrician')
    color = data.get('theme_color', '#7cc0f7')
    if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        raise ValueError('Theme color must be a six-digit hex color, e.g. #2563eb')
    result = {'theme_color': color.lower()}
    for key in ('name', 'phone', 'email', 'street', 'city', 'zip'):
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > 180 or any(ord(c) < 32 for c in value):
            raise ValueError(f'Invalid {key}')
        result[key] = value.strip()
    if not result['name']:
        raise ValueError('Business name is required')
    if not result['phone'] and not result['email']:
        raise ValueError('Provide a phone number or email address')
    if result['phone'] and not re.fullmatch(r'\+?[0-9 () .-]{5,40}', result['phone']):
        raise ValueError('Use a phone number with digits, spaces, +, brackets or dashes')
    if result['email'] and not re.fullmatch(r'[^\s@<>"\\]+@[^\s@<>"\\]+\.[^\s@<>"\\]+', result['email']):
        raise ValueError('Enter a valid email address')
    return template, {k: v for k, v in result.items() if v}


def create(data, output_root=None):
    started = time.perf_counter()
    template, business = validate(data)
    source = TEMPLATES[template]['path']
    cache = source / 'dist'
    stamp = cache / '.prepared.json'
    if not stamp.exists() or json.loads(stamp.read_text())['fingerprint'] != fingerprint(source):
        raise ValueError('Template needs preparation. Run: python tools/quick_site.py prepare (python3 on macOS/Linux)')
    parent = Path(output_root) if output_root else ROOT / 'runs/quick'
    parent.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r'[^a-z0-9]+', '-', business['name'].lower()).strip('-')[:48] or 'business'
    identifier = slug + '-' + uuid.uuid4().hex[:8]
    destination = parent / identifier
    staging = Path(tempfile.mkdtemp(prefix='.creating-', dir=parent))
    try:
        site = staging / 'site'
        shutil.copytree(cache, site, ignore=shutil.ignore_patterns('.prepared.json'))
        # Data lives in its own JavaScript file. JSON escaping prevents source injection.
        (site / 'business.js').write_text('window.WEBSITE_BUSINESS = ' + json.dumps(business, ensure_ascii=True) + ';\n')
        page = (site / 'index.html').read_text().replace('Your Company', html.escape(business['name'], quote=True))
        page = page.replace('in your area', 'for your home').replace('in your local area', 'for your home')
        (site / 'index.html').write_text(page)
        shutil.copyfile(source / 'vercel.json', site / 'vercel.json')
        shutil.copyfile(source / 'stock-images.json', staging / 'stock-images.json')
        result = {'id': identifier, 'template': template, 'business': business, 'site': str(destination / 'site'), 'seconds': round(time.perf_counter()-started, 3)}
        (staging / 'website.json').write_text(json.dumps(result, indent=2))
        staging.rename(destination)
        return result
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('prepare', help='Build the reusable template once after template edits')
    p.add_argument('--template', choices=TEMPLATES, default='electrician')
    commands.add_parser('templates')
    p = commands.add_parser('create', help='Generate a ready-to-host website')
    p.add_argument('--template', choices=TEMPLATES, default='electrician')
    p.add_argument('--name', required=True)
    p.add_argument('--theme-color', dest='theme_color', default='#7cc0f7', help='Brand color as #RRGGBB')
    for field in ('phone', 'email', 'street', 'city', 'zip'):
        p.add_argument('--' + field, default='')
    p = commands.add_parser('batch', help='Generate websites from a JSON array of business details')
    p.add_argument('file', type=Path)
    args = vars(parser.parse_args())
    command = args.pop('command')
    try:
        if command == 'prepare': prepare(**args)
        elif command == 'templates': print(json.dumps({k: v['name'] for k, v in TEMPLATES.items()}, indent=2))
        elif command == 'create': print(json.dumps(create(args), indent=2))
        else:
            records = json.loads(args['file'].read_text())
            if not isinstance(records, list): raise ValueError('Batch file must contain a JSON array')
            for record in records: validate(record)
            print(json.dumps([create(record) for record in records], indent=2))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')

if __name__ == '__main__':
    # Windows: re-run in UTF-8 mode so files and non-English business names read/write correctly.
    if sys.platform == 'win32' and not sys.flags.utf8_mode:
        try:
            sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))
        except KeyboardInterrupt:
            sys.exit(130)
    main()
