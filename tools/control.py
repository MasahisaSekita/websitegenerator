#!/usr/bin/env python3
"""Local, transactional job ledger and contact-sheet server. Standard library only."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import uuid
import mimetypes
for _kind, _ext in (('text/javascript', '.js'), ('text/javascript', '.mjs'), ('text/css', '.css'), ('image/svg+xml', '.svg'), ('application/json', '.json'), ('text/html', '.html')):
    mimetypes.add_type(_kind, _ext)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from quick_site import create as create_quick_site, TEMPLATES

ROOT = Path(__file__).resolve().parents[1]
DB = Path(os.environ.get('REVAMP_DB', ROOT / 'data' / 'revamp.sqlite3'))
STAGES = ['queued', 'reviewing', 'extracting', 'building', 'checking', 'deploying', 'ready', 'contacting', 'complete', 'sent', 'uncertain', 'blocked', 'skipped', 'manual']
NEXT = {'queued': ['reviewing'], 'reviewing': ['extracting'], 'extracting': ['building'], 'building': ['checking'], 'checking': ['building', 'deploying'], 'deploying': ['checking', 'ready'], 'ready': ['contacting'], 'contacting': ['complete', 'sent', 'uncertain', 'blocked']}

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')

def ident(prefix):
    return prefix + '-' + uuid.uuid4().hex[:12]

def domain(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('A public HTTP(S) business URL without credentials is required')
    value = parsed.hostname.lower().rstrip('.').encode('idna').decode()
    value = value.removeprefix('www.')
    if '.' not in value or value in ('localhost',) or value.endswith(('.local', '.localhost')):
        raise ValueError('Use a public business domain')
    return value

def identity(value):
    kind, sep, raw = value.partition(':')
    if not sep: raise ValueError('Identity must use domain:, phone: or email:')
    kind = kind.lower().strip(); raw = raw.strip()
    if kind == 'domain': return 'domain:' + domain(raw if '://' in raw else 'https://' + raw)
    if kind == 'email':
        raw = raw.lower()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', raw): raise ValueError('Invalid email identity')
        return 'email:' + raw
    if kind == 'phone':
        raw = re.sub(r'[ ()\-.]', '', raw)
        if not re.fullmatch(r'\+[1-9][0-9]{7,14}', raw): raise ValueError('Use an international phone number with +country code')
        return 'phone:' + raw
    raise ValueError('Identity must use domain:, phone: or email:')

@contextlib.contextmanager
def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB, timeout=15, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('PRAGMA foreign_keys=ON')
    con.executescript('''
    CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY, industry TEXT NOT NULL, city TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, requested_count INTEGER NOT NULL DEFAULT 5);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES batches(id),name TEXT NOT NULL,url TEXT NOT NULL,domain TEXT UNIQUE NOT NULL,stage TEXT NOT NULL,worker TEXT,detail TEXT DEFAULT '',reason TEXT DEFAULT '',preview_url TEXT DEFAULT '',contact_status TEXT DEFAULT 'not_sent',data TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS identities(identity TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,message TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY,job_id TEXT,status TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions(job_id TEXT PRIMARY KEY REFERENCES jobs(id),message TEXT NOT NULL,message_hash TEXT NOT NULL,form_url TEXT NOT NULL,status TEXT NOT NULL,evidence TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT OR IGNORE INTO config VALUES ('max_workers','3');
    ''')
    if 'requested_count' not in {row['name'] for row in con.execute('PRAGMA table_info(batches)')}:
        con.execute('ALTER TABLE batches ADD COLUMN requested_count INTEGER NOT NULL DEFAULT 5')
    try:
        con.execute('BEGIN IMMEDIATE')
        yield con
        con.execute('COMMIT')
    except BaseException:
        if con.in_transaction: con.execute('ROLLBACK')
        raise
    finally:
        con.close()

def event(c, job, message):
    c.execute('INSERT INTO events(job_id,message,created_at) VALUES(?,?,?)', (job, message[:4000], now()))

def batch_progress(c, bid):
    row = c.execute('SELECT requested_count FROM batches WHERE id=?', (bid,)).fetchone()
    if row is None: raise ValueError('Unknown batch')
    counts = dict(c.execute('SELECT stage, COUNT(*) FROM jobs WHERE batch_id=? GROUP BY stage', (bid,)).fetchall())
    completed = sum(counts.get(stage, 0) for stage in ('complete', 'sent'))
    active = sum(count for stage, count in counts.items() if stage not in ('complete', 'sent', 'skipped', 'blocked', 'uncertain', 'manual'))
    remaining = max(0, row['requested_count'] - completed)
    return {'completed_count': completed, 'active_count': active, 'remaining_count': remaining,
            'manual_count': counts.get('manual', 0), 'available_count': max(0, remaining - active)}

def batch_status(bid, status):
    if status not in ('running', 'complete', 'blocked', 'exhausted'): raise ValueError('Invalid batch status')
    with connect() as c:
        progress = batch_progress(c, bid)
        if status in ('complete', 'exhausted') and progress['active_count']:
            raise ValueError('Batch has unfinished jobs')
        if status == 'complete' and progress['remaining_count']:
            raise ValueError(f"Batch needs {progress['remaining_count']} more completed outreach jobs")
        c.execute('UPDATE batches SET status=? WHERE id=?', (status, bid))
        return {'status': status, **progress}

def snapshot():
    with connect() as c:
        out = {table: [dict(r) for r in c.execute('SELECT * FROM ' + table + (' ORDER BY id DESC LIMIT 200' if table == 'events' else ''))] for table in ('batches', 'jobs', 'events', 'workers')}
        for j in out['jobs']: j['data'] = json.loads(j['data'])
        for b in out['batches']: b.update(batch_progress(c, b['id']))
        out['settings'] = {'batch_size': 5, 'max_workers': int(c.execute("SELECT value FROM config WHERE key='max_workers'").fetchone()[0])}
        out['server_time'] = now()
        return out

def batch(industry, city, requested_count=5):
    if not isinstance(industry, str) or not isinstance(city, str) or not industry.strip() or not city.strip():
        raise ValueError('Industry and city are required')
    if len(industry)>150 or len(city)>150: raise ValueError('Use an industry and city under 150 characters')
    if isinstance(requested_count, bool) or not isinstance(requested_count, int) or not 1 <= requested_count <= 100:
        raise ValueError('Website count must be a whole number from 1 to 100')
    with connect() as c:
        bid = ident('batch')
        c.execute('INSERT INTO batches(id,industry,city,status,created_at,requested_count) VALUES (?,?,?,?,?,?)', (bid, industry.strip(), city.strip(), 'queued', now(), requested_count))
        event(c, None, f'Batch queued: {requested_count} websites for {industry.strip()} in {city.strip()}. Waiting for Codex coordinator.')
        return {'id': bid, 'status': 'queued', 'requested_count': requested_count}

def cancel_batch(bid, reason):
    """Stop an unsubmitted batch while retaining its audit and dedupe records."""
    if not reason.strip(): raise ValueError('Provide a cancellation reason')
    with connect() as c:
        batch_row = c.execute('SELECT id FROM batches WHERE id=?', (bid,)).fetchone()
        if batch_row is None: raise ValueError('Unknown batch')
        active = c.execute("SELECT id,stage FROM jobs WHERE batch_id=? AND stage NOT IN ('complete','sent','uncertain','blocked','skipped','manual')", (bid,)).fetchall()
        for job in active:
            # A submission attempt must never be silently cancelled or made retryable.
            attempted = c.execute('SELECT 1 FROM submissions WHERE job_id=?', (job['id'],)).fetchone()
            stage = 'uncertain' if attempted else 'skipped'
            detail = f'{reason} No outreach submission was made.' if not attempted else f'{reason} Submission history retained as uncertain; do not retry.'
            c.execute('UPDATE jobs SET stage=?,detail=?,worker=NULL,updated_at=?,contact_status=? WHERE id=?', (stage, detail, now(), 'uncertain' if attempted else 'not_sent', job['id']))
            c.execute("UPDATE workers SET status='idle',updated_at=? WHERE job_id=?", (now(), job['id']))
            event(c, job['id'], f'Batch cancelled: {detail}')
        c.execute("UPDATE batches SET status='cancelled' WHERE id=?", (bid,))
        event(c, None, f'Batch {bid} cancelled: {reason}')
        return {'id': bid, 'status': 'cancelled', 'stopped_jobs': len(active)}

def clear_all(reason):
    """Clear dashboard work records while retaining operational configuration."""
    if not reason.strip(): raise ValueError('Provide a reset reason')
    with connect() as c:
        counts = {table: c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in ('batches','jobs','identities','events','workers','submissions')}
        # Delete children before their referenced parents. `config` intentionally survives.
        for table in ('submissions','events','workers','identities','jobs','batches'):
            c.execute(f'DELETE FROM {table}')
        return {'cleared': counts, 'reason': reason}

def add(bid, name, url, aliases=()):
    d = domain(url)
    with connect() as c:
        row = c.execute('SELECT requested_count FROM batches WHERE id=?', (bid,)).fetchone()
        if row is None: raise ValueError('Unknown batch')
        if not batch_progress(c, bid)['available_count']:
            raise ValueError('Completed and in-progress jobs cover the target; wait for an outcome before adding replacements')
        jid = ident('site')
        c.execute('INSERT INTO jobs(id,batch_id,name,url,domain,stage,updated_at) VALUES(?,?,?,?,?,?,?)', (jid,bid,name,url,d,'queued',now()))
        for key in set(['domain:'+d, *(identity(a) for a in aliases)]):
            c.execute('INSERT INTO identities VALUES (?,?)',(key,jid))
        event(c,jid,'Prospect registered; exclusive identity reserved.')
        return {'id':jid}

def own(c, jid, worker):
    j = c.execute('SELECT * FROM jobs WHERE id=?', (jid,)).fetchone()
    if j is None: raise ValueError('Unknown job')
    if not worker or j['worker'] != worker: raise ValueError('Worker does not own this job')
    if not c.execute("SELECT 1 FROM workers WHERE id=? AND job_id=? AND status='running'", (worker,jid)).fetchone():
        raise ValueError('Worker assignment is no longer active')
    return j

def claim(bid, worker):
    with connect() as c:
        if c.execute("SELECT 1 FROM workers WHERE id=? AND status='running'",(worker,)).fetchone(): raise ValueError('Worker already owns a running job')
        limit = int(c.execute("SELECT value FROM config WHERE key='max_workers'").fetchone()[0])
        if c.execute("SELECT COUNT(*) FROM workers WHERE status='running'").fetchone()[0]>=limit: raise ValueError('Worker capacity reached')
        j = c.execute("SELECT * FROM jobs WHERE batch_id=? AND stage='queued' AND worker IS NULL ORDER BY rowid LIMIT 1",(bid,)).fetchone()
        if j is None: return {'job': None}
        c.execute("UPDATE jobs SET worker=?,stage='reviewing',updated_at=? WHERE id=?",(worker,now(),j['id']))
        c.execute('INSERT INTO workers VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET job_id=excluded.job_id,status=excluded.status,updated_at=excluded.updated_at',(worker,j['id'],'running',now()))
        c.execute("UPDATE batches SET status='running' WHERE id=?",(bid,))
        event(c,j['id'],f'{worker} claimed this business.')
        return {'job':dict(c.execute('SELECT * FROM jobs WHERE id=?',(j['id'],)).fetchone())}

def update(jid, worker, stage=None, detail='', fields=None):
    fields = fields or {}
    if not isinstance(fields,dict): raise ValueError('Fields must be a JSON object')
    allowed = {'reason','preview_url','qa_passed','preview_verified','source_urls','screenshots','browser_id','tab_id','workspace','booking_url','logo_decision','cost','failure','contact_url','qualification','seo_checked','outreach_mode','contact_email','contact_phone'}
    if set(fields)-allowed: raise ValueError('Unknown fields: '+str(set(fields)-allowed))
    with connect() as c:
        j=own(c,jid,worker)
        new=stage or j['stage']
        if new not in STAGES: raise ValueError('Unknown stage')
        if new in ('contacting','complete','sent','uncertain','manual') and new!=j['stage']: raise ValueError('Use contact-begin, contact-finish or manual-outreach')
        if new!=j['stage'] and new not in NEXT.get(j['stage'],[]) + (['blocked','skipped'] if j['stage'] not in ('complete','sent','uncertain','blocked','skipped','manual','contacting') else []):
            raise ValueError('Invalid stage transition')
        data=json.loads(j['data']); data.update(fields)
        if new != j['stage'] and new in ('building', 'checking'):
            data['qa_passed'] = False
            data['preview_verified'] = False
        if new=='deploying' and data.get('qa_passed') is not True: raise ValueError('Passing QA evidence required')
        if new=='ready' and (data.get('preview_verified') is not True or not data.get('preview_url',j['preview_url']).startswith('https://')): raise ValueError('Verified HTTPS preview required')
        c.execute('UPDATE jobs SET stage=?,detail=?,reason=?,preview_url=?,data=?,updated_at=? WHERE id=?',(new,detail or j['detail'],fields.get('reason',j['reason']),fields.get('preview_url',j['preview_url']),json.dumps(data),now(),jid))
        c.execute('UPDATE workers SET updated_at=? WHERE id=?',(now(),worker))
        if new in ('blocked','skipped'): c.execute("UPDATE workers SET status='idle',updated_at=? WHERE id=?",(now(),worker))
        event(c,jid,detail or f'Stage: {new}')
        return {'id':jid,'stage':new}

def contact_begin(jid,worker,message,form_url):
    if not message.strip(): raise ValueError('Message is empty')
    domain(form_url)
    with connect() as c:
        j=own(c,jid,worker); data=json.loads(j['data'])
        if data.get('outreach_mode') == 'manual':
            raise ValueError('This job is routed to manual outreach; do not submit automatically')
        if j['stage']!='ready' or data.get('qa_passed') is not True or data.get('preview_verified') is not True or not j['reason']:
            raise ValueError('Ready stage, specific reason, verified preview and passing QA required')
        qualification=data.get('qualification') or {}
        findings=qualification.get('findings',[]) if isinstance(qualification,dict) else []
        if len([f for f in findings if isinstance(f,str) and f.strip()]) < 2 or not data.get('source_urls') or not data.get('screenshots'):
            raise ValueError('Two qualification findings, source URLs and screenshot evidence required')
        if not c.execute('SELECT 1 FROM identities WHERE identity=? AND job_id=?',('domain:'+domain(form_url),jid)).fetchone():
            raise ValueError('Contact form must be on the original or verified alias domain')
        c.execute('INSERT INTO submissions VALUES(?,?,?,?,?,?,?)',(jid,message,hashlib.sha256(message.encode()).hexdigest(),form_url,'attempting',None,now()))
        c.execute("UPDATE jobs SET stage='contacting',contact_status='attempting',updated_at=? WHERE id=?",(now(),jid))
        event(c,jid,'Submission reserved. One submit attempt permitted; never auto-retry an uncertain result.')
        return {'id':jid,'status':'attempting'}

def contact_finish(jid,worker,status,evidence):
    if status not in ('submitted','sent','uncertain','blocked') or not evidence.strip(): raise ValueError('Provide result and observed evidence')
    with connect() as c:
        j=own(c,jid,worker)
        if j['stage']!='contacting': raise ValueError('No submission in progress')
        c.execute('UPDATE submissions SET status=?,evidence=? WHERE job_id=?',(status,evidence,jid))
        c.execute('UPDATE jobs SET stage=?,contact_status=?,detail=?,updated_at=? WHERE id=?',('complete' if status == 'submitted' else status,status,evidence,now(),jid))
        c.execute("UPDATE workers SET status='idle',updated_at=? WHERE id=?",(now(),worker))
        event(c,jid,f'Contact {status}: {evidence}')
        return {'id':jid,'status':status}

def manual_outreach(jid, worker, reason, message, email='', phone=''):
    if not reason.strip() or not message.strip():
        raise ValueError('Manual outreach needs a reason and prepared message')
    if email: email = identity('email:' + email).removeprefix('email:')
    if phone: phone = identity('phone:' + phone).removeprefix('phone:')
    with connect() as c:
        j = own(c, jid, worker)
        data = json.loads(j['data'])
        if j['stage'] != 'ready' or data.get('qa_passed') is not True or data.get('preview_verified') is not True or not j['preview_url'].startswith('https://'):
            raise ValueError('Manual outreach requires a ready, QA-passed, verified public website')
        if c.execute('SELECT 1 FROM submissions WHERE job_id=?', (jid,)).fetchone():
            raise ValueError('A reserved/attempted submission cannot become manual outreach automatically')
        if not data.get('source_urls') or j['preview_url'] not in message:
            raise ValueError('Contact sources and the verified preview URL in the message are required')
        qualification = data.get('qualification') or {}
        findings = qualification.get('findings', []) if isinstance(qualification, dict) else []
        if not j['reason'] or not data.get('screenshots') or len([f for f in findings if isinstance(f, str) and f.strip()]) < 2:
            raise ValueError('Manual outreach requires visual qualification and screenshot evidence')
        data['manual_outreach'] = {'reason': reason.strip(), 'message': message, 'email': email,
                                  'phone': phone, 'source_urls': data['source_urls']}
        data['outreach_mode'] = 'manual'
        c.execute("UPDATE jobs SET stage='manual', contact_status='manual_required', detail=?, data=?, updated_at=? WHERE id=?",
                  (reason.strip(), json.dumps(data), now(), jid))
        c.execute("UPDATE workers SET status='idle',updated_at=? WHERE id=?", (now(), worker))
        event(c, jid, 'Manual outreach required: ' + reason.strip())
        return {'id': jid, 'stage': 'manual', 'contact_status': 'manual_required'}

def serve(port):
    static=(ROOT/'dashboard').resolve()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send(self,code,body,kind='application/json'):
            if not isinstance(body,bytes): body=json.dumps(body).encode()
            self.send_response(code); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store'); self.send_header('X-Robots-Tag','noindex, nofollow'); self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers(); self.wfile.write(body)
        def valid_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')
        def do_GET(self):
            if not self.valid_host(): return self.send(403,{'error':'Local host required'})
            path=urlsplit(self.path).path
            if path=='/api/sites':
                results=[]
                for manifest in sorted((ROOT/'runs/quick').glob('*/website.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:100]:
                    try:
                        item=json.loads(manifest.read_text())
                        item['preview_url']='/preview/'+item['id']+'/'
                        results.append(item)
                    except (ValueError,OSError): continue
                return self.send(200,results)
            if path=='/api/templates': return self.send(200,[{'id': k, 'name': v['name']} for k,v in TEMPLATES.items()])
            if path.startswith('/preview/'):
                parts=path.split('/')
                if len(parts)<4 or not re.fullmatch(r'[a-z0-9-]+',parts[2]): return self.send(404,{'error':'Not found'})
                site=(ROOT/'runs/quick'/parts[2]/'site').resolve()
                if not site.is_dir(): return self.send(404,{'error':'Not found'})
                target=(site/'/'.join(parts[3:])).resolve()
                if not target.is_relative_to(site): return self.send(404,{'error':'Not found'})
                if not target.is_file():
                    if target.suffix: return self.send(404,{'error':'Not found'})
                    target=site/'index.html'
                body=target.read_bytes()
                if target.name=='index.html':
                    prefix='/preview/'+parts[2]
                    page=body.decode().replace('src="/', 'src="'+prefix+'/').replace('href="/', 'href="'+prefix+'/')
                    body=page.encode()
                elif target.name=='business.js':
                    body=('window.WEBSITE_BASE = '+json.dumps('/preview/'+parts[2])+';\n').encode()+body
                return self.send(200,body,mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
            if path=='/api/state': return self.send(200,snapshot())
            files={'/':('index.html','text/html; charset=utf-8'),'/style.css':('style.css','text/css'),'/app.js':('app.js','text/javascript'),'/styles.css':('styles.css','text/css')}
            if path not in files: return self.send(404,{'error':'Not found'})
            name,kind=files[path]
            try: self.send(200,(static/name).read_bytes(),kind)
            except FileNotFoundError: self.send(404,{'error':'Dashboard asset unavailable'})
        def do_POST(self):
            origin=self.headers.get('Origin')
            if not self.valid_host() or origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
                return self.send(403,{'error':'Same-origin browser request required'})
            if self.path not in ('/api/batches','/api/sites'): return self.send(404,{'error':'Not found'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size<1 or size>8192 or self.headers.get_content_type()!='application/json': raise ValueError('JSON body required (8 KB maximum)')
                data=json.loads(self.rfile.read(size))
                if self.path=='/api/sites':
                    result=create_quick_site(data)
                    result['preview_url']='/preview/'+result['id']+'/'
                    self.send(201,result)
                else: self.send(201,batch(data.get('industry'),data.get('city'),data.get('requested_count',5)))
            except (ValueError,AttributeError) as e: self.send(400,{'error':str(e)})
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(f'Contact sheet: http://127.0.0.1:{server.server_port}',flush=True)
    server.serve_forever()

def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('state')
    s=sub.add_parser('serve'); s.add_argument('--port',type=int,default=4310)
    s=sub.add_parser('batch'); s.add_argument('--industry',required=True); s.add_argument('--city',required=True); s.add_argument('--count',type=int,default=5)
    s=sub.add_parser('add'); s.add_argument('--batch',required=True); s.add_argument('--name',required=True); s.add_argument('--url',required=True); s.add_argument('--alias',action='append',default=[])
    s=sub.add_parser('claim'); s.add_argument('--batch',required=True); s.add_argument('--worker',required=True)
    s=sub.add_parser('update'); s.add_argument('--job',required=True); s.add_argument('--worker',required=True); s.add_argument('--stage',choices=STAGES); s.add_argument('--detail',default=''); s.add_argument('--fields',type=Path)
    s=sub.add_parser('alias'); s.add_argument('--job',required=True); s.add_argument('--worker',required=True); s.add_argument('--identity',required=True)
    s=sub.add_parser('capacity'); s.add_argument('count',type=int,choices=range(1,6))
    s=sub.add_parser('contact-begin'); s.add_argument('--job',required=True); s.add_argument('--worker',required=True); s.add_argument('--message-file',type=Path,required=True); s.add_argument('--form-url',required=True)
    s=sub.add_parser('contact-finish'); s.add_argument('--job',required=True); s.add_argument('--worker',required=True); s.add_argument('--status',choices=['submitted','sent','uncertain','blocked'],required=True); s.add_argument('--evidence',required=True)
    s=sub.add_parser('manual-outreach'); s.add_argument('--job',required=True); s.add_argument('--worker',required=True); s.add_argument('--reason',required=True); s.add_argument('--message-file',type=Path,required=True); s.add_argument('--email',default=''); s.add_argument('--phone',default='')
    s=sub.add_parser('recover'); s.add_argument('--job',required=True); s.add_argument('--reason',required=True)
    s=sub.add_parser('batch-status'); s.add_argument('--batch',required=True); s.add_argument('--status',choices=['running','complete','blocked','exhausted'],required=True)
    s=sub.add_parser('cancel-batch'); s.add_argument('--batch',required=True); s.add_argument('--reason',required=True)
    s=sub.add_parser('clear-all'); s.add_argument('--reason',required=True)
    a=p.parse_args()
    try:
        if a.cmd=='serve': return serve(a.port)
        if a.cmd=='state': result=snapshot()
        elif a.cmd=='batch': result=batch(a.industry,a.city,a.count)
        elif a.cmd=='add': result=add(a.batch,a.name,a.url,a.alias)
        elif a.cmd=='claim': result=claim(a.batch,a.worker)
        elif a.cmd=='update': result=update(a.job,a.worker,a.stage,a.detail,json.loads(a.fields.read_text()) if a.fields else None)
        elif a.cmd=='contact-begin': result=contact_begin(a.job,a.worker,a.message_file.read_text(),a.form_url)
        elif a.cmd=='contact-finish': result=contact_finish(a.job,a.worker,a.status,a.evidence)
        elif a.cmd=='manual-outreach': result=manual_outreach(a.job,a.worker,a.reason,a.message_file.read_text(),a.email,a.phone)
        elif a.cmd=='capacity':
            with connect() as c: c.execute("UPDATE config SET value=? WHERE key='max_workers'",(str(a.count),))
            result={'max_workers':a.count}
        elif a.cmd=='alias':
            with connect() as c:
                own(c,a.job,a.worker); c.execute('INSERT INTO identities VALUES(?,?)',(identity(a.identity),a.job)); event(c,a.job,'Verified identity added: '+identity(a.identity))
            result={'ok':True}
        elif a.cmd=='batch-status': result=batch_status(a.batch,a.status)
        elif a.cmd=='cancel-batch': result=cancel_batch(a.batch,a.reason)
        elif a.cmd=='clear-all': result=clear_all(a.reason)
        elif a.cmd=='recover':
            with connect() as c:
                j=c.execute('SELECT * FROM jobs WHERE id=?',(a.job,)).fetchone()
                if not j: raise ValueError('Unknown job')
                # Never recycle an outreach attempt, even after a process crash.
                attempt=c.execute('SELECT 1 FROM submissions WHERE job_id=?',(a.job,)).fetchone()
                if j['stage'] in ('complete','sent','manual'): raise ValueError('Sent or manual outreach jobs cannot be automatically recovered')
                target='uncertain' if attempt else 'queued'
                c.execute('UPDATE jobs SET stage=?,worker=NULL,updated_at=?,contact_status=? WHERE id=?',(target,now(),'uncertain' if attempt else j['contact_status'],a.job))
                c.execute("UPDATE workers SET status='idle',updated_at=? WHERE job_id=?",(now(),a.job))
                if attempt: c.execute("UPDATE submissions SET status='uncertain',evidence=? WHERE job_id=?",(a.reason,a.job))
                event(c,a.job,'Coordinator recovery after worker stopped: '+a.reason)
            result={'stage':target}
        print(json.dumps(result,indent=2))
    except (ValueError,sqlite3.IntegrityError) as e:
        print(json.dumps({'error':str(e)}),file=sys.stderr); sys.exit(1)

if __name__ == '__main__':
    # Windows: re-run in UTF-8 mode so files and non-English business names read/write correctly.
    if sys.platform == 'win32' and not sys.flags.utf8_mode:
        import subprocess
        try:
            sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))
        except KeyboardInterrupt:
            sys.exit(130)
    main()
