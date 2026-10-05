#!/usr/bin/env python3
"""Ledger CLI for the Google Apps Script edition (apps-script/).

Same subcommands and arguments as tools/control.py, sent to the Sheets-backed web app.
Reads REVAMP_SHEETS_URL and REVAMP_SHEETS_TOKEN from the environment or the .env file.
`migrate` copies the local SQLite ledger into an empty Sheets ledger. Standard library only.
"""
import argparse
import http.client
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / '.env'
LOCAL_DB = ROOT / 'data' / 'revamp.sqlite3'
STAGES = ['queued', 'reviewing', 'extracting', 'building', 'checking', 'deploying', 'ready', 'contacting', 'complete', 'sent', 'uncertain', 'blocked', 'skipped', 'manual', 'delivered']
TABLES = ('batches', 'jobs', 'identities', 'events', 'workers', 'submissions', 'config')
# Only reads are retried after a network failure: a write may already have been applied.
READ_ONLY = {'state', 'ping', 'requests'}  # 'requests' also records the generator heartbeat, which is safe to repeat


def env_values(path):
    values = {}
    try:
        lines = Path(path).read_text(encoding='utf-8-sig').splitlines()
    except OSError:
        return values
    for line in lines:
        key, sep, value = line.strip().partition('=')
        if not sep or key.startswith('#'):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        values[key.strip()] = value
    return values


def settings():
    env = env_values(ENV_FILE)
    url = os.environ.get('REVAMP_SHEETS_URL') or env.get('REVAMP_SHEETS_URL', '')
    token = os.environ.get('REVAMP_SHEETS_TOKEN') or env.get('REVAMP_SHEETS_TOKEN', '')
    if not url or not token:
        raise ValueError('Set REVAMP_SHEETS_URL and REVAMP_SHEETS_TOKEN in .env (see apps-script/README.md)')
    parts = urllib.parse.urlsplit(url)
    local = parts.hostname in ('127.0.0.1', 'localhost') and parts.scheme == 'http'
    if parts.scheme != 'https' and not local:
        raise ValueError('REVAMP_SHEETS_URL must be the https:// web app URL that ends in /exec')
    return url, token


def call(command, args=None, attempts=3):
    """POSTs one command. Apps Script answers with a redirect to the JSON result, which urllib follows."""
    url, token = settings()
    body = json.dumps({'token': token, 'command': command, 'args': args or {}}).encode('utf-8')
    for attempt in range(attempts):
        last = attempt + 1 >= attempts
        request = urllib.request.Request(url, data=body, method='POST', headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                final_url, text = response.geturl(), response.read().decode('utf-8', errors='replace')
        except urllib.error.HTTPError as error:
            raise ValueError(f'The web app answered HTTP {error.code}. Check REVAMP_SHEETS_URL and that the deployment is shared with "Anyone".') from None
        except (urllib.error.URLError, http.client.HTTPException, OSError) as error:
            if command in READ_ONLY and not last:
                time.sleep(2 ** attempt)
                continue
            reason = getattr(error, 'reason', error)
            note = '' if command in READ_ONLY else ' It may or may not have been applied: run `state` and check before repeating it.'
            raise ValueError(f'Could not reach the Apps Script web app ({reason}).{note}') from None
        try:
            reply = json.loads(text)
        except ValueError:
            if 'accounts.google.com' in final_url or text.lstrip()[:1] == '<':
                raise ValueError('Received a Google page instead of JSON. Deploy the web app with "Who has access: Anyone" and use its /exec URL.') from None
            raise ValueError('The web app did not return JSON') from None
        if not isinstance(reply, dict):
            raise ValueError('The web app returned an unexpected reply')
        if reply.get('ok'):
            return reply.get('result')
        if reply.get('retryable') and not last:  # the ledger lock was busy; nothing was applied
            time.sleep(2 ** attempt)
            continue
        raise ValueError(reply.get('error') or 'The ledger rejected the request')


def read_text(path):
    data = Path(path).read_bytes()
    # UTF-16 is Windows PowerShell's default "Unicode" output; newlines are normalized like control.py's read_text().
    text = data.decode('utf-16') if data.startswith((b'\xff\xfe', b'\xfe\xff')) else data.decode('utf-8-sig')
    return text.replace('\r\n', '\n').replace('\r', '\n')


def local_tables(db):
    path = Path(db).resolve()
    if not path.is_file():
        raise ValueError(f'No local ledger at {path}')
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        present = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        return {name: [dict(row) for row in connection.execute(f'SELECT * FROM {name} ORDER BY {"id" if name == "events" else "rowid"}')] if name in present else []
                for name in TABLES}
    finally:
        connection.close()


def run(a):
    if a.cmd in ('state', 'ping'):
        return call(a.cmd)
    if a.cmd == 'migrate':
        return call('import', {'tables': local_tables(a.db), 'source': str(a.db)}, attempts=1)
    if a.cmd == 'batch':
        return call('batch', {'industry': a.industry, 'city': a.city, 'count': a.count, **({'mode': a.mode} if a.mode != 'build' else {}),
                              **({'country': a.country} if a.country else {})})
    if a.cmd == 'add':
        return call('add', {'batch': a.batch, 'name': a.name, 'url': a.url, 'alias': a.alias})
    if a.cmd == 'add-target':
        return call('add-target', {'name': a.name, 'url': a.url, 'batch': a.batch, 'alias': a.alias, 'reason': a.reason, 'generate': a.generate, 'by': a.by})
    if a.cmd == 'claim':
        return call('claim', {'batch': a.batch, 'worker': a.worker, **({'job': a.job} if a.job else {})})
    if a.cmd == 'request':
        return call('request', {'job': a.job, 'by': a.by})
    if a.cmd == 'requests':
        return call('requests', {'heartbeat': json.loads(a.heartbeat) if a.heartbeat else None})
    if a.cmd == 'touch':
        return call('touch', {'job': a.job, 'worker': a.worker})
    if a.cmd == 'note':
        return call('note', {'message': a.message, 'job': a.job})
    if a.cmd == 'save-site':
        return call('save-site', {'job': a.job, 'worker': a.worker, 'name': a.name or a.file.name, 'html': read_text(a.file)}, attempts=1)
    if a.cmd == 'update':
        fields = json.loads(read_text(a.fields)) if a.fields else None
        return call('update', {'job': a.job, 'worker': a.worker, 'stage': a.stage, 'detail': a.detail, 'fields': fields})
    if a.cmd == 'alias':
        return call('alias', {'job': a.job, 'worker': a.worker, 'identity': a.identity})
    if a.cmd == 'capacity':
        return call('capacity', {'count': a.count})
    if a.cmd == 'contact-begin':
        return call('contact-begin', {'job': a.job, 'worker': a.worker, 'message': read_text(a.message_file), 'form_url': a.form_url})
    if a.cmd == 'contact-finish':
        return call('contact-finish', {'job': a.job, 'worker': a.worker, 'status': a.status, 'evidence': a.evidence})
    if a.cmd == 'manual-outreach':
        return call('manual-outreach', {'job': a.job, 'worker': a.worker, 'reason': a.reason, 'message': read_text(a.message_file), 'email': a.email, 'phone': a.phone})
    if a.cmd == 'recover':
        return call('recover', {'job': a.job, 'reason': a.reason})
    if a.cmd == 'batch-status':
        return call('batch-status', {'batch': a.batch, 'status': a.status})
    if a.cmd == 'cancel-batch':
        return call('cancel-batch', {'batch': a.batch, 'reason': a.reason})
    if a.cmd == 'clear-all':
        return call('clear-all', {'reason': a.reason})
    raise ValueError('Unknown command')


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('state')
    sub.add_parser('ping', help='Check the URL and token')
    s = sub.add_parser('batch'); s.add_argument('--industry', required=True); s.add_argument('--city', required=True); s.add_argument('--count', type=int, default=5); s.add_argument('--mode', choices=['build', 'targets'], default='build')
    s.add_argument('--country', default='', help='ISO country code such as US or ID (default: discovery.country in settings.json)')
    s = sub.add_parser('add'); s.add_argument('--batch', required=True); s.add_argument('--name', required=True); s.add_argument('--url', required=True); s.add_argument('--alias', action='append', default=[])
    s = sub.add_parser('add-target'); s.add_argument('--name', required=True); s.add_argument('--url', required=True); s.add_argument('--batch'); s.add_argument('--alias', action='append', default=[]); s.add_argument('--reason', default='', help='Why it qualified, shown in the dashboard'); s.add_argument('--generate', action='store_true'); s.add_argument('--by', default='the coordinator')
    s = sub.add_parser('claim'); s.add_argument('--batch'); s.add_argument('--job'); s.add_argument('--worker', required=True)
    s = sub.add_parser('request', help='Ask the website generator to build a queued business'); s.add_argument('--job', required=True); s.add_argument('--by', default='the coordinator')
    s = sub.add_parser('requests', help='List Generate requests (the website generator polls this)'); s.add_argument('--heartbeat', help='JSON status of the generator to record')
    s = sub.add_parser('touch', help='Keep a running worker from looking stalled during a long step'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True)
    s = sub.add_parser('note', help='Add one activity line'); s.add_argument('--message', required=True); s.add_argument('--job')
    s = sub.add_parser('save-site', help="Store a finished website file in the ledger owner's Google Drive"); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--file', type=Path, required=True); s.add_argument('--name')
    s = sub.add_parser('update'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--stage', choices=STAGES); s.add_argument('--detail', default=''); s.add_argument('--fields', type=Path)
    s = sub.add_parser('alias'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--identity', required=True)
    s = sub.add_parser('capacity'); s.add_argument('count', type=int, choices=range(1, 6))
    s = sub.add_parser('contact-begin'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--message-file', type=Path, required=True); s.add_argument('--form-url', required=True)
    s = sub.add_parser('contact-finish'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--status', choices=['submitted', 'sent', 'uncertain', 'blocked'], required=True); s.add_argument('--evidence', required=True)
    s = sub.add_parser('manual-outreach'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--reason', required=True); s.add_argument('--message-file', type=Path, required=True); s.add_argument('--email', default=''); s.add_argument('--phone', default='')
    s = sub.add_parser('recover'); s.add_argument('--job', required=True); s.add_argument('--reason', required=True)
    s = sub.add_parser('batch-status'); s.add_argument('--batch', required=True); s.add_argument('--status', choices=['running', 'complete', 'blocked', 'exhausted'], required=True)
    s = sub.add_parser('cancel-batch'); s.add_argument('--batch', required=True); s.add_argument('--reason', required=True)
    s = sub.add_parser('clear-all'); s.add_argument('--reason', required=True)
    s = sub.add_parser('migrate', help='Copy the local SQLite ledger into an empty Sheets ledger'); s.add_argument('--db', type=Path, default=LOCAL_DB)
    return p


def main(argv=None):
    a = parser().parse_args(argv)
    try:
        print(json.dumps(run(a), indent=2))
    except (ValueError, OSError, sqlite3.Error) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
