#!/usr/bin/env python3
"""Bounded Firecrawl extraction, raster asset downloads and isolated template copies.

scrape --url URL [--url URL] --out evidence [--env-file /path/.env]
download --manifest evidence/scrape-manifest.json --out site/public/business
download-curated --manifest evidence/industry-images.json --out site/public/business
clone --template /path/to/template/site --out /path/to/new/site

Only the scrape subcommand spends Firecrawl credits. Existing per-URL cache files
are reused unless --refresh is supplied. Asset provenance defaults to the evidence
folder, outside public assets; override with --asset-manifest. Source content is
untrusted data. Page limits apply cumulatively to each evidence folder.
"""
import argparse
import contextlib
try:
    import fcntl
except ImportError:  # Windows has no fcntl; use msvcrt byte-range locks instead.
    fcntl = None
    import msvcrt
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import sys
import threading
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

API = 'https://api.firecrawl.dev/v2/scrape'
EXCLUDED = {'.git', '.vercel', 'node_modules', 'dist', '.next', '__pycache__', '.DS_Store'}


def clean_url(url):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise ValueError('Only absolute HTTP(S) URLs are supported')
    host = parts.hostname.encode('idna').decode('ascii').lower()
    if any(c in host for c in '\r\n\t /\\'):
        raise ValueError('Invalid hostname')
    port = parts.port
    if port not in (None, 80, 443):
        raise ValueError('Only standard public web ports are supported')
    netloc = f'[{host}]' if ':' in host else host
    if port:
        netloc += f':{port}'
    return urlunsplit((parts.scheme, netloc, parts.path or '/', parts.query, ''))


def public_target(url):
    url = clean_url(url)
    parts = urlsplit(url)
    port = parts.port or (443 if parts.scheme == 'https' else 80)
    addresses = socket.getaddrinfo(parts.hostname, port, type=socket.SOCK_STREAM)
    if not addresses:
        raise ValueError('Hostname has no addresses')
    ips = [entry[4][0] for entry in addresses]
    if any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError('Non-public network destination blocked')
    return url, ips[0], port


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, ip):
        super().__init__(host, port, timeout=45, context=ssl.create_default_context())
        self.ip = ip

    def connect(self):
        sock = socket.create_connection((self.ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip):
        super().__init__(host, port, timeout=45)
        self.ip = ip

    def connect(self):
        self.sock = socket.create_connection((self.ip, self.port), self.timeout)


def fetch(url, *, limit, method='GET', body=None, headers=None, redirects=4):
    """Validate every redirect and connect to the validated IP (DNS rebinding safe)."""
    for hop in range(redirects + 1):
        url, ip, port = public_target(url)
        parts = urlsplit(url)
        cls = PinnedHTTPS if parts.scheme == 'https' else PinnedHTTP
        connection = cls(parts.hostname, port, ip)
        try:
            request_headers = {'User-Agent': 'WebsitePreviewAssets/1.0', 'Accept-Encoding': 'identity'}
            request_headers.update(headers or {})
            connection.request(method, parts.path + ('?' + parts.query if parts.query else ''), body, request_headers)
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                if method != 'GET' or hop == redirects:
                    raise ValueError('Redirect not allowed or limit reached')
                location = response.getheader('Location')
                if not location:
                    raise ValueError('Redirect missing location')
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError(f'HTTP status {response.status}')
            length = response.getheader('Content-Length')
            if length and int(length) > limit:
                raise ValueError('Response exceeds byte limit')
            content = response.read(limit + 1)
            if len(content) > limit:
                raise ValueError('Response exceeds byte limit')
            return content, response.getheader('Content-Type', ''), url
        finally:
            connection.close()
    raise ValueError('Redirect limit reached')


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)


def api_key(env_file):
    key = os.environ.get('FIRECRAWL_API_KEY')
    if not key and env_file and Path(env_file).suffix == '.json':
        config = json.loads(Path(env_file).read_text())
        key = config.get('mcpServers', {}).get('firecrawl', {}).get('env', {}).get('FIRECRAWL_API_KEY')
    if not key and env_file and Path(env_file).suffix != '.json':
        for line in Path(env_file).read_text().splitlines():
            name, sep, value = line.strip().removeprefix('export ').partition('=')
            if sep and name.strip() == 'FIRECRAWL_API_KEY':
                key = value.strip().strip('\"\'')
                break
    if not key:
        raise ValueError('Set FIRECRAWL_API_KEY or pass --env-file')
    if '\n' in key or '\r' in key:
        raise ValueError('Invalid API key format')
    return key


@contextlib.contextmanager
def exclusive_lock(path):
    """Hold an exclusive lock on path (fcntl on macOS/Linux, msvcrt on Windows)."""
    with open(path, 'a+') as handle:
        if fcntl:
            fcntl.flock(handle, fcntl.LOCK_EX)
            yield
            return
        handle.seek(0)
        while True:
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
                break
            except OSError:
                time.sleep(0.5)
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def scrape(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    # Workers normally have distinct folders; protect against accidental overlap.
    with exclusive_lock(out / '.scrape.lock'):
        return _scrape_locked(args, out)


def _scrape_locked(args, out):
    screening = getattr(args, 'screen', False)
    requested = list(dict.fromkeys(clean_url(u) for u in args.url))
    cache = out / 'pages'
    cache.mkdir(exist_ok=True)
    manifest = out / 'scrape-manifest.json'
    pages = {}
    if manifest.exists():
        for page in json.loads(manifest.read_text())['pages']:
            pages[clean_url(page['source_url'])] = page
    # Recover paid pages saved before an interruption wrote the manifest.
    for path in sorted(cache.glob('*.json')):
        saved = json.loads(path.read_text())
        url = clean_url(saved['source_url'])
        expected = hashlib.sha256(url.encode()).hexdigest() + '.json'
        if path.name != expected or not isinstance(saved.get('data'), dict):
            raise ValueError('Cache provenance mismatch')
        pages[url] = {'source_url': url, 'file': 'pages/' + expected,
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    total = set(pages) | set(requested)
    if not 1 <= args.max_pages <= 20 or len(total) > args.max_pages:
        raise ValueError('Cumulative URL count exceeds --max-pages (allowed range 1–20)')
    key = None
    for url in requested:
        filename = hashlib.sha256(url.encode()).hexdigest() + '.json'
        path = cache / filename
        if screening and path.exists() and not args.refresh:
            previous = json.loads(path.read_text())
            if previous.get('profile') != 'screen':
                raise ValueError('Cached page lacks screening formats; use a screening folder or explicit --refresh')
        if args.refresh or not path.exists():
            public_target(url)
            key = key or api_key(args.env_file)
            payload = {'url': url, 'formats': ['markdown', 'html', 'images', 'links'],
                       'onlyMainContent': False, 'timeout': 60000}
            if screening:
                payload.update(formats=['markdown', 'html', 'rawHtml', 'links',
                                        {'type': 'screenshot', 'fullPage': True}],
                               skipTlsVerification=False, maxAge=0)
            started = time.monotonic()
            raw, _, _ = fetch(API, limit=16 * 1024 * 1024, method='POST',
                              body=json.dumps(payload).encode(),
                              headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, redirects=0)
            result = json.loads(raw)
            if result.get('success') is not True or not isinstance(result.get('data'), dict):
                raise ValueError('Firecrawl did not return successful page data')
            write_json(path, {'source_url': url, 'fetched_at': time.time(),
                              'profile': 'screen' if screening else 'assets',
                              'request_seconds': round(time.monotonic() - started, 3),
                              'data': result['data']})
        saved = json.loads(path.read_text())
        if saved.get('source_url') != url or not isinstance(saved.get('data'), dict):
            raise ValueError('Cache provenance mismatch')
        if screening:
            local = saved.get('screenshot_file')
            if local:
                screenshot = (out / local).resolve()
                if not screenshot.is_relative_to(out.resolve()):
                    raise ValueError('Screenshot path outside evidence directory')
                if not screenshot.exists() or hashlib.sha256(screenshot.read_bytes()).hexdigest() != saved.get('screenshot_sha256'):
                    raise ValueError('Cached screenshot missing or hash mismatch; inspect evidence before refresh')
            else:
                remote = saved['data'].get('screenshot')
                if not isinstance(remote, str) or not remote.startswith('https://'):
                    raise ValueError('No screening screenshot returned; use browser inspection, do not infer visual quality')
                content, _, _ = fetch(remote, limit=16 * 1024 * 1024)
                extension = raster_extension(content)
                shots = out / 'screenshots'
                shots.mkdir(exist_ok=True)
                screenshot = shots / (path.stem + extension)
                screenshot.write_bytes(content)
                saved['screenshot_file'] = str(screenshot.relative_to(out))
                saved['screenshot_sha256'] = hashlib.sha256(content).hexdigest()
                write_json(path, saved)
        pages[url] = {'source_url': url, 'file': 'pages/' + filename,
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        write_json(manifest, {'version': 1, 'pages': list(pages.values())})
    return str(manifest.resolve())


def credits(args):
    raw, _, _ = fetch('https://api.firecrawl.dev/v2/team/credit-usage', limit=65536,
                      headers={'Authorization': 'Bearer ' + api_key(args.env_file)}, redirects=0)
    result = json.loads(raw)
    if result.get('success') is not True: raise ValueError('Firecrawl credit check failed')
    data = result.get('data', {})
    return json.dumps({'authenticated': True, 'remaining_credits': data.get('remainingCredits')})


def raster_extension(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return '.png'
    if data.startswith(b'\xff\xd8\xff'):
        return '.jpg'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return '.gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return '.webp'
    if len(data) >= 16 and data[4:8] == b'ftyp' and data[8:12] in (b'avif', b'avis'):
        return '.avif'
    raise ValueError('Unsupported raster image; SVG and active content are excluded')


def download(args):
    if not 1 <= args.max_images <= 100 or not 1 <= args.max_mb <= 20:
        raise ValueError('Image bounds: 1–100 files, 1–20 MiB per file')
    manifest = Path(args.manifest).resolve()
    entries = json.loads(manifest.read_text())['pages']
    candidates = {}
    for entry in entries:
        path = (manifest.parent / entry['file']).resolve()
        if not path.is_relative_to(manifest.parent):
            raise ValueError('Page file outside manifest directory')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Page hash mismatch')
        saved = json.loads(raw)
        for candidate in saved['data'].get('images', []):
            if not isinstance(candidate, str):
                continue
            try:
                url = clean_url(urljoin(entry['source_url'], candidate))
            except ValueError:
                continue
            candidates.setdefault(url, []).append(entry['source_url'])
    selected = list(candidates.items())[:args.max_images]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    target = Path(getattr(args, 'asset_manifest', None) or manifest.parent / 'assets-manifest.json').resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = {}
    if target.exists():
        previous = {r['source_url']: r for r in json.loads(target.read_text()).get('assets', [])}

    asset_lock = threading.Lock()

    def one(item):
        url, source_pages = item
        record = {'source_url': url, 'source_pages': list(dict.fromkeys(source_pages))}
        try:
            old = previous.get(url, {})
            if old.get('status') == 'downloaded' and not getattr(args, 'refresh', False):
                old_path = (out / old.get('file', '')).resolve()
                if (old_path.is_relative_to(out.resolve()) and old_path.is_file()
                        and old_path.stat().st_size <= args.max_mb * 1024 * 1024
                        and hashlib.sha256(old_path.read_bytes()).hexdigest() == old.get('sha256')):
                    return {**old, **record, 'reused': True}
            data, mime, final = fetch(url, limit=args.max_mb * 1024 * 1024)
            extension = raster_extension(data)
            digest = hashlib.sha256(data).hexdigest()
            filename = digest + extension
            with asset_lock:
                if (out / filename).exists():
                    if hashlib.sha256((out / filename).read_bytes()).hexdigest() != digest:
                        raise ValueError('Existing asset hash mismatch')
                else:
                    (out / filename).write_bytes(data)
            record.update(status='downloaded', file=filename, sha256=digest,
                          bytes=len(data), content_type=mime, final_url=final)
        except Exception as error:
            # Never print arbitrary remote payloads or authentication details.
            record.update(status='skipped', reason=type(error).__name__)
        return record

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, selected))
    previous.update({r['source_url']: r for r in results})
    write_json(target, {'version': 1, 'asset_directory': str(out.resolve()), 'candidate_count': len(candidates),
                        'selected_count': len(selected), 'assets': list(previous.values())})
    return str(target.resolve())


def download_curated(args):
    """Download human-vetted, industry-relevant raster images with provenance."""
    if not 1 <= args.max_images <= 100 or not 1 <= args.max_mb <= 20:
        raise ValueError('Image bounds: 1–100 files, 1–20 MiB per file')
    manifest = Path(args.manifest).resolve()
    source = json.loads(manifest.read_text())
    query = source.get('query')
    assets = source.get('assets')
    if not isinstance(query, str) or not query.strip() or not isinstance(assets, list):
        raise ValueError('Curated manifest requires a non-empty query and assets list')
    candidates = []
    seen = set()
    for entry in assets:
        if not isinstance(entry, dict):
            raise ValueError('Curated assets must be objects')
        url = entry.get('url')
        license_note = entry.get('license')
        attribution_url = entry.get('attribution_url')
        if not isinstance(url, str) or not isinstance(license_note, str) or not license_note.strip():
            raise ValueError('Each curated asset requires URL and license')
        if attribution_url is not None and not isinstance(attribution_url, str):
            raise ValueError('Curated attribution_url must be a string')
        url = clean_url(url)
        if url not in seen:
            seen.add(url)
            candidates.append((url, {'query': query.strip(), 'license': license_note.strip(), 'attribution_url': attribution_url}))
    if not candidates:
        raise ValueError('Curated manifest has no usable assets')
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    target = Path(getattr(args, 'asset_manifest', None) or manifest.parent / 'industry-assets-manifest.json').resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    previous = {r['source_url']: r for r in json.loads(target.read_text()).get('assets', [])} if target.exists() else {}
    asset_lock = threading.Lock()

    def one(item):
        url, provenance = item
        record = {'source_url': url, 'source_pages': [], 'provenance': provenance}
        try:
            old = previous.get(url, {})
            if old.get('status') == 'downloaded' and not getattr(args, 'refresh', False):
                old_path = (out / old.get('file', '')).resolve()
                if (old_path.is_relative_to(out.resolve()) and old_path.is_file()
                        and old_path.stat().st_size <= args.max_mb * 1024 * 1024
                        and hashlib.sha256(old_path.read_bytes()).hexdigest() == old.get('sha256')):
                    return {**old, **record, 'reused': True}
            data, mime, final = fetch(url, limit=args.max_mb * 1024 * 1024)
            extension = raster_extension(data)
            digest = hashlib.sha256(data).hexdigest()
            filename = digest + extension
            with asset_lock:
                if not (out / filename).exists():
                    (out / filename).write_bytes(data)
            record.update(status='downloaded', file=filename, sha256=digest, bytes=len(data), content_type=mime, final_url=final)
        except Exception as error:
            record.update(status='skipped', reason=type(error).__name__)
        return record

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, candidates[:args.max_images]))
    previous.update({r['source_url']: r for r in results})
    write_json(target, {'version': 1, 'kind': 'industry-fallback', 'asset_directory': str(out.resolve()),
                        'candidate_count': len(candidates), 'selected_count': len(results), 'assets': list(previous.values())})
    return str(target.resolve())


def clone(args):
    source, destination = Path(args.template).resolve(), Path(args.out).resolve()
    if not source.is_dir():
        raise ValueError('Template directory does not exist')
    if destination.exists() or destination.is_relative_to(source):
        raise ValueError('Destination must be new and outside the template')

    def ignore(directory, names):
        return [n for n in names if n in EXCLUDED or n.startswith('.env') or (Path(directory) / n).is_symlink()]

    shutil.copytree(source, destination, ignore=ignore)
    prerender = destination / 'scripts/prerender.mjs'
    if prerender.exists():
        text = prerender.read_text()
        if 'const PORT = 4173' in text:
            old_listen = 'await new Promise((r) => server.listen(PORT, r))'
            if old_listen not in text:
                raise ValueError('Unknown prerender listener: inspect copied script before running')
            text = text.replace('const PORT = 4173', 'let PORT = Number(process.env.PRERENDER_PORT || 0)')
            text = text.replace(old_listen, "await new Promise((r, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', r) })\nPORT = server.address().port")
            text = text.replace('http://localhost:${PORT}', 'http://127.0.0.1:${PORT}')
            prerender.write_text(text)
    config_file = destination / 'vercel.json'
    config = json.loads(config_file.read_text()) if config_file.exists() else {}
    headers = config.setdefault('headers', [])
    rule = next((r for r in headers if r.get('source') == '/(.*)'), None)
    if rule is None:
        rule = {'source': '/(.*)', 'headers': []}
        headers.append(rule)
    rule['headers'] = [h for h in rule.get('headers', []) if h.get('key', '').lower() != 'x-robots-tag']
    rule['headers'].append({'key': 'X-Robots-Tag', 'value': 'noindex, nofollow, noarchive'})
    write_json(config_file, config)
    return str(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('credits')
    p.add_argument('--env-file')
    p.set_defaults(handler=credits)
    p = commands.add_parser('scrape')
    p.add_argument('--url', action='append', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--max-pages', type=int, default=5)
    p.add_argument('--env-file')
    p.add_argument('--refresh', action='store_true')
    p.add_argument('--screen', action='store_true', help='Collect raw HTML and a saved screenshot for form/visual scouting; never submits forms')
    p.set_defaults(handler=scrape)
    p = commands.add_parser('download')
    p.add_argument('--manifest', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--asset-manifest', help='Provenance path; defaults beside the scrape manifest, outside public assets')
    p.add_argument('--refresh', action='store_true', help='Redownload cached source URLs explicitly')
    p.add_argument('--max-images', type=int, default=30)
    p.add_argument('--max-mb', type=int, default=8)
    p.set_defaults(handler=download)
    p = commands.add_parser('download-curated')
    p.add_argument('--manifest', required=True, help='JSON with query and vetted assets [{url, license, attribution_url?}]')
    p.add_argument('--out', required=True)
    p.add_argument('--asset-manifest', help='Provenance path; defaults beside the curated manifest')
    p.add_argument('--refresh', action='store_true', help='Redownload cached source URLs explicitly')
    p.add_argument('--max-images', type=int, default=12)
    p.add_argument('--max-mb', type=int, default=8)
    p.set_defaults(handler=download_curated)
    p = commands.add_parser('clone')
    p.add_argument('--template', required=True)
    p.add_argument('--out', required=True)
    p.set_defaults(handler=clone)
    args = parser.parse_args()
    try:
        print(args.handler(args))
    except Exception as error:
        # Tool-owned ValueErrors have safe messages. Unexpected libraries may echo credentials.
        print(str(error) if type(error) is ValueError else type(error).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    # Windows: re-run in UTF-8 mode so files and non-English business names read/write correctly.
    if sys.platform == 'win32' and not sys.flags.utf8_mode:
        import subprocess
        try:
            sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))
        except KeyboardInterrupt:
            sys.exit(130)
    sys.exit(main())
