#!/usr/bin/env python3
"""Upload finished websites to JetAI (YoboLabs) as prototypes. Standard library only.

  ping                                       check the key and the API address (read-only)
  upload --file F --name N [--slug S] [--description D] [--id PROTOTYPE_ID]
                                             create a draft prototype, or replace the html of an existing one
  get --id PROTOTYPE_ID                      metadata only, without the html source
  publish --id PROTOTYPE_ID                  make it public: only when the operator asks for it
  unpublish --id PROTOTYPE_ID

The key comes from JETAI_API_KEY in the environment or in the .env file named by
jetai.env_file in settings.json. It is only ever sent as "Authorization: Bearer ..." to
jetai.api_base and is never printed. Uploads stay drafts unless publishing is requested.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = 'https://slides.yobolabs.ai/api/v1'
MAX_HTML = 5_000_000          # the API's limit for the html field, in characters
MAX_NAME = 255
MAX_SLUG = 100
MAX_DESCRIPTION = 1000


class JetAIError(ValueError):
    """A safe, key-free description of what went wrong."""
    def __init__(self, message, status=None, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


def settings():
    try:
        config = json.loads((ROOT / 'settings.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        config = {}
    jetai = config.get('jetai') if isinstance(config.get('jetai'), dict) else {}
    return jetai


def env_value(name, env_file):
    if os.environ.get(name):
        return os.environ[name]
    try:
        lines = Path(env_file).read_text(encoding='utf-8-sig').splitlines()
    except OSError:
        return ''
    for line in lines:
        key, sep, value = line.strip().removeprefix('export ').partition('=')
        if sep and key.strip() == name:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
                value = value[1:-1]
            return value
    return ''


class Client:
    def __init__(self, base=None, key=None, site_id=None):
        config = settings()
        self.base = (base or os.environ.get('JETAI_API_BASE') or config.get('api_base') or DEFAULT_BASE).rstrip('/')
        parts = urllib.parse.urlsplit(self.base)
        local = parts.scheme == 'http' and parts.hostname in ('127.0.0.1', 'localhost')
        if parts.scheme != 'https' and not local:
            raise JetAIError('jetai.api_base must be an https:// address')
        env_file = config.get('env_file') or '.env'
        env_path = env_file if Path(env_file).is_absolute() else ROOT / env_file
        self.key = key or env_value(config.get('key_name') or 'JETAI_API_KEY', env_path)
        if not self.key:
            raise JetAIError('Set JETAI_API_KEY in .env (the JetAI API key) to upload websites')
        if any(c in self.key for c in '\r\n '):
            raise JetAIError('JETAI_API_KEY has an invalid format')
        self.site_id = site_id if site_id is not None else config.get('site_id') or None

    def request(self, method, path, body=None, attempts=3):
        data = None if body is None else json.dumps(body).encode('utf-8')
        for attempt in range(attempts):
            request = urllib.request.Request(self.base + path, data=data, method=method, headers={
                'Authorization': 'Bearer ' + self.key,
                'Accept': 'application/json',
                **({'Content-Type': 'application/json'} if data is not None else {}),
            })
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    text = response.read().decode('utf-8', errors='replace')
                    status = response.status
            except urllib.error.HTTPError as error:
                status = error.code
                try:
                    text = error.read().decode('utf-8', errors='replace')
                finally:
                    error.close()
                # A rate-limited request was not processed, so repeating it is safe for any method.
                if status == 429 and attempt + 1 < attempts:
                    time.sleep(min(30, int(error.headers.get('Retry-After') or 2 ** (attempt + 1))))
                    continue
                if status >= 500 and method == 'GET' and attempt + 1 < attempts:
                    time.sleep(2 ** attempt)
                    continue
                raise api_error(status, text) from None
            except (urllib.error.URLError, OSError) as error:
                if method == 'GET' and attempt + 1 < attempts:
                    time.sleep(2 ** attempt)
                    continue
                note = '' if method == 'GET' else ' The change may or may not have been applied.'
                raise JetAIError(f'Could not reach JetAI ({getattr(error, "reason", error)}).{note}') from None
            if status == 204 or not text.strip():
                return {}
            try:
                reply = json.loads(text)
            except ValueError:
                raise JetAIError(f'JetAI answered HTTP {status} without JSON') from None
            if isinstance(reply, dict) and reply.get('success') is False:
                raise api_error(status, text)
            return reply.get('data', reply) if isinstance(reply, dict) else reply
        raise JetAIError('JetAI kept rate-limiting the request; try again later', status=429)

    # -- prototypes -------------------------------------------------------

    def list_prototypes(self, limit=1, search=None):
        query = {'limit': limit}
        if search:
            query['search'] = search
        return self.request('GET', '/prototypes?' + urllib.parse.urlencode(query))

    def get(self, prototype_id):
        return self.request('GET', '/prototypes/' + safe_id(prototype_id))

    def create(self, name, html, slug=None, description=None):
        body = {'name': name[:MAX_NAME], 'language': 'html', 'html': html}
        if slug:
            body['slug'] = slug
        if description:
            body['description'] = description[:MAX_DESCRIPTION]
        if self.site_id:
            body['siteId'] = self.site_id
        return self.request('POST', '/prototypes', body)

    def replace_html(self, prototype_id, html, description=None):
        body = {'html': html}
        if description:
            body['description'] = description[:MAX_DESCRIPTION]
        return self.request('PATCH', '/prototypes/' + safe_id(prototype_id), body)

    def publish(self, prototype_id):
        return self.request('POST', f'/prototypes/{safe_id(prototype_id)}/publish', {})

    def unpublish(self, prototype_id):
        return self.request('POST', f'/prototypes/{safe_id(prototype_id)}/unpublish', {})

    def upload(self, html, name, slug=None, description=None, prototype_id=None, publish=False):
        """Replaces the html of prototype_id when it still exists, otherwise creates a new draft."""
        if not isinstance(html, str) or not html.strip():
            raise JetAIError('The website file is empty')
        if len(html) > MAX_HTML:
            raise JetAIError(f'The website is {len(html):,} characters; JetAI accepts at most {MAX_HTML:,}')
        name = ' '.join(str(name or '').split())[:MAX_NAME] or 'Website preview'
        slug = slugify(slug or name)
        data = None
        if prototype_id:
            try:
                data = self.replace_html(prototype_id, html, description)
            except JetAIError as error:
                if error.status != 404:
                    raise
        if data is None:
            for attempt in range(1, 6):
                suffix = '' if attempt == 1 else f'-{attempt}'
                try:
                    data = self.create(name if attempt == 1 else f'{name} ({attempt})', html,
                                       slug[:MAX_SLUG - len(suffix)].rstrip('-') + suffix, description)
                    break
                except JetAIError as error:
                    if error.status != 409 or attempt == 5:
                        raise
        if publish:
            data = self.publish(data['id'])
        return summary(data)


def api_error(status, text):
    code, message = None, ''
    try:
        reply = json.loads(text)
        error = reply.get('error') if isinstance(reply, dict) else None
        if isinstance(error, dict):
            code, message = error.get('code'), error.get('message') or ''
    except ValueError:
        pass
    hints = {401: ' Check JETAI_API_KEY and jetai.api_base in settings.json.', 403: ' This key is not allowed to do that.', 413: ' The website is too large.'}
    text = f'JetAI answered HTTP {status}' + (f' {code}' if code else '') + (f': {message}' if message else '') + hints.get(status, '')
    return JetAIError(text[:500], status=status, code=code)


def safe_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9-]{1,64}', value):
        raise JetAIError('Invalid prototype id')
    return value


def slugify(text):
    plain = unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^a-z0-9]+', '-', plain.lower()).strip('-')
    return value[:MAX_SLUG].rstrip('-') or 'website'


def summary(data):
    """The prototype fields worth keeping in the ledger (never the html blob)."""
    data = data if isinstance(data, dict) else {}
    keep = {'prototype_id': data.get('id'), 'name': data.get('name'), 'slug': data.get('slug'),
            'status': data.get('status'), 'updated_at': data.get('updatedAt'), 'published_at': data.get('publishedAt')}
    for key in ('url', 'publicUrl', 'previewUrl'):
        if isinstance(data.get(key), str) and data[key].startswith('https://'):
            keep['url'] = data[key]
            break
    template = settings().get('app_url') or ''
    if template and keep['prototype_id']:
        keep['app_url'] = template.replace('{id}', keep['prototype_id']).replace('{slug}', keep.get('slug') or '')
    return {key: value for key, value in keep.items() if value is not None}


def read_html(path):
    data = Path(path).read_bytes()
    return data.decode('utf-8-sig')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ping')
    s = sub.add_parser('upload'); s.add_argument('--file', type=Path, required=True); s.add_argument('--name', required=True)
    s.add_argument('--slug'); s.add_argument('--description'); s.add_argument('--id', dest='prototype_id')
    s.add_argument('--publish', action='store_true', help='Also make it public (only when the operator asked for that)')
    for name in ('get', 'publish', 'unpublish'):
        sub.add_parser(name).add_argument('--id', dest='prototype_id', required=True)
    args = parser.parse_args(argv)
    try:
        client = Client()
        if args.cmd == 'ping':
            page = client.list_prototypes(limit=1)
            total = page.get('pagination', {}).get('total') if isinstance(page, dict) else None
            result = {'ok': True, 'api_base': client.base, 'prototypes': total}
        elif args.cmd == 'upload':
            result = client.upload(read_html(args.file), args.name, args.slug, args.description, args.prototype_id, args.publish)
        elif args.cmd == 'get':
            result = summary(client.get(args.prototype_id))
        elif args.cmd == 'publish':
            result = summary(client.publish(args.prototype_id))
        else:
            result = summary(client.unpublish(args.prototype_id))
        print(json.dumps(result, indent=2))
        return 0
    except (JetAIError, OSError, UnicodeDecodeError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
