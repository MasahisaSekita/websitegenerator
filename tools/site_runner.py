#!/usr/bin/env python3
"""Website generator: builds the websites that dashboard Generate buttons ask for.

  watch [--once]                     poll the ledger for Generate requests and build them (Ctrl+C stops)
  run --job JOB_ID                   build one queued business now, as a worker
  prepare --job JOB_ID --worker W [--evidence DIR]   scrape the current site (or reuse evidence) and write the brief
  finish --job JOB_ID --worker W     check the page, embed photos, upload it to JetAI and mark the job delivered
  cloud                              one GitHub Actions run: find targets for queued batches, then build every request
  doctor                             check Claude Code, Firecrawl, JetAI and the ledger without changing anything

`run`, `watch` and `cloud` start Claude Code headless (claude -p) to write runs/JOB_ID/site/index.html
following references/website-prompt.md. Claude runs restricted: file tools only, confined to the
job folder, with no shell, web access or MCP connectors, because the scraped text it reads is
untrusted. In the coordinator workflow a builder subagent writes the page itself and calls
`prepare` and `finish`. The Google Sheets ledger is used when REVAMP_SHEETS_URL and
REVAMP_SHEETS_TOKEN are set (environment or .env); otherwise data/revamp.sqlite3.
`cloud` is what .github/workflows/website-generator.yml runs, so no computer has to stay on;
there the finished pages are also stored in the ledger owner's Google Drive (save-site).
"""
import argparse
import glob
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from types import SimpleNamespace
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import html_site  # noqa: E402
import jetai  # noqa: E402
import site_assets  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / 'runs'
PROMPT = ROOT / 'references' / 'website-prompt.md'
DEFAULTS = {'model': 'sonnet', 'max_parallel': 2, 'poll_seconds': 10, 'max_turns': 40, 'timeout_minutes': 20,
            'repair_rounds': 2, 'scrape_pages': 3, 'claude_cli': ''}
CLAUDE_TOOLS = 'Read,Write,Edit,Glob,Grep'


class BuildError(Exception):
    """A website could not be built; the message is safe to show in the dashboard."""


def settings():
    try:
        return json.loads((ROOT / 'settings.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def generator_settings():
    value = settings().get('generator')
    return {**DEFAULTS, **(value if isinstance(value, dict) else {})}


def upload_enabled():
    value = settings().get('jetai')
    return not isinstance(value, dict) or value.get('upload', True) is not False


def rel(path):
    path = Path(path).resolve()
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path)


def log(message):
    print(time.strftime('[%H:%M:%S] ') + message, flush=True)


def in_actions():
    return os.environ.get('GITHUB_ACTIONS') == 'true'


def label(job):
    """Log label: GitHub Actions logs can be public, so they show job IDs, not business names."""
    return job['id'] if in_actions() else f"{job['name']} ({job['id']})"


# ---------------------------------------------------------------------------
# Ledgers

class LocalLedger:
    """data/revamp.sqlite3 through tools/control.py."""
    kind = 'local'

    def __init__(self, module=None):
        if module is None:
            import control as module
        self.c = module

    def state(self): return self.c.snapshot()
    def requests(self, heartbeat=None): return self.c.pending_requests(heartbeat)
    def claim(self, job, worker): return self.c.claim(None, worker, job)
    def update(self, job, worker, stage=None, detail='', fields=None): return self.c.update(job, worker, stage, detail, fields)
    def recover(self, job, reason): return self.c.recover(job, reason)
    def touch(self, job, worker): return self.c.touch(job, worker)
    def note(self, message, job=None): return self.c.note(message, job)
    def batch_status(self, batch, status): return self.c.batch_status(batch, status)
    def add_target(self, name, url, batch, generate=False, by='the website generator', reason='', aliases=()):
        return self.c.add_target(name, url, batch, generate, by, reason, aliases)
    def save_site(self, job, worker, name, html): return None  # the file stays on this computer


class SheetsLedger:
    """The Google Sheets ledger through tools/sheets_ledger.py."""
    kind = 'sheets'

    def __init__(self):
        import sheets_ledger
        self.s = sheets_ledger
        sheets_ledger.settings()  # fail early on a missing or invalid URL/token

    def state(self): return self.s.call('state')
    def requests(self, heartbeat=None): return self.s.call('requests', {'heartbeat': heartbeat})
    def claim(self, job, worker): return self.s.call('claim', {'job': job, 'worker': worker})
    def update(self, job, worker, stage=None, detail='', fields=None):
        return self.s.call('update', {'job': job, 'worker': worker, 'stage': stage, 'detail': detail, 'fields': fields})
    def recover(self, job, reason): return self.s.call('recover', {'job': job, 'reason': reason})
    def touch(self, job, worker): return self.s.call('touch', {'job': job, 'worker': worker})
    def note(self, message, job=None): return self.s.call('note', {'message': message, 'job': job})
    def batch_status(self, batch, status): return self.s.call('batch-status', {'batch': batch, 'status': status})
    def add_target(self, name, url, batch, generate=False, by='the website generator', reason='', aliases=()):
        return self.s.call('add-target', {'name': name, 'url': url, 'batch': batch, 'generate': generate, 'by': by,
                                          'reason': reason, 'alias': list(aliases)})
    def save_site(self, job, worker, name, html):
        """Stores the finished page in the ledger owner's Google Drive; GitHub's machine is wiped after each run."""
        return self.s.call('save-site', {'job': job, 'worker': worker, 'name': name, 'html': html}, attempts=1)


def default_ledger():
    import sheets_ledger
    configured = sheets_ledger.env_values(sheets_ledger.ENV_FILE)
    if any(os.environ.get(k) or configured.get(k) for k in ('REVAMP_SHEETS_URL', 'REVAMP_SHEETS_TOKEN')):
        return SheetsLedger()
    return LocalLedger()


def find_job(ledger, job_id):
    job = next((j for j in ledger.state().get('jobs', []) if j.get('id') == job_id), None)
    if job is None:
        raise BuildError(f'Unknown job {job_id}')
    if not isinstance(job.get('data'), dict):
        job['data'] = {}
    return job


# ---------------------------------------------------------------------------
# Claude Code

def find_claude():
    """The Claude Code CLI: settings, CLAUDE_CLI, PATH, then the copy bundled with the Claude desktop app."""
    configured = generator_settings().get('claude_cli') or os.environ.get('CLAUDE_CLI')
    if configured:
        return configured if Path(configured).is_file() else shutil.which(configured)
    found = shutil.which('claude')
    if found:
        return found
    candidates = []
    appdata = os.environ.get('APPDATA')
    if appdata:
        candidates += glob.glob(os.path.join(appdata, 'Claude', 'claude-code', '*', '*', 'claude.exe'))
        candidates += glob.glob(os.path.join(appdata, 'Claude', 'claude-code', '*', 'claude.exe'))
    home = Path.home()
    candidates += [str(p) for p in (home / '.local' / 'bin' / 'claude', home / '.local' / 'bin' / 'claude.exe', home / '.claude' / 'local' / 'claude')]
    candidates += glob.glob(str(home / 'Library' / 'Application Support' / 'Claude' / 'claude-code' / '*' / 'claude'))

    def version(path):
        numbers = re.findall(r'(\d+)\.(\d+)\.(\d+)', path)
        return tuple(int(n) for n in numbers[-1]) if numbers else (0, 0, 0)

    existing = [c for c in candidates if Path(c).is_file()]
    return max(existing, key=lambda p: (version(p), Path(p).stat().st_mtime)) if existing else None


CLAUDE_KEYS = ('ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN')


def child_env():
    env = os.environ.copy()
    for key in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'):
        env.pop(key, None)  # a nested Claude Code session started from another one
    for key in CLAUDE_KEYS:
        if not env.get(key):
            env.pop(key, None)  # an unset GitHub secret arrives as an empty variable
    return env


def claude_ready(cli):
    if any(os.environ.get(key) for key in CLAUDE_KEYS):
        return True, ''
    if in_actions():
        return False, 'Add an ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN secret to the GitHub repository so Claude Code can sign in.'
    try:
        out = subprocess.run([cli, 'auth', 'status'], capture_output=True, text=True, encoding='utf-8', errors='replace',
                             timeout=60, env=child_env(), stdin=subprocess.DEVNULL)
        status = json.loads(out.stdout or '{}')
    except (OSError, ValueError, subprocess.SubprocessError):
        return True, ''  # cannot tell; the run itself will report a login problem
    if status.get('loggedIn'):
        return True, ''
    return False, f'Claude Code is not signed in on this computer. Run once in a terminal: "{cli}" auth login'


def preflight(upload=None, scrape=True):
    """Problems that stop every build, as dashboard-ready sentences. Changes nothing."""
    problems = []
    cli = find_claude()
    if not cli:
        problems.append('Claude Code was not found. Install it (or the Claude desktop app), or set generator.claude_cli in settings.json.')
    else:
        ready, message = claude_ready(cli)
        if not ready:
            problems.append(message)
    where = 'as a GitHub secret' if in_actions() else 'in .env'
    if scrape:
        try:
            site_assets.api_key(firecrawl_env())
        except (ValueError, OSError):
            problems.append(f'Set FIRECRAWL_API_KEY {where} so the generator can read business websites.')
    if upload if upload is not None else upload_enabled():
        try:
            jetai.Client()
        except jetai.JetAIError as error:
            problems.append(str(error).replace('in .env', where))
    return problems


def firecrawl_env():
    name = settings().get('firecrawl_env_file') or '.env'
    return str(name if Path(name).is_absolute() else ROOT / name)


def compose_prompt(job, job_dir, brief, problems=None):
    phone, email = confirmed_contacts(brief)
    lines = [PROMPT.read_text(encoding='utf-8').strip(), '', '## This job', '',
             f"- Business name: {job['name']}",
             f"- Current website: {job['url']}",
             '- Your working directory is the job folder. Read `brief.md`, look at the screenshots and photos it lists, and write `site/index.html`.',
             f"- Main phone (confirmed on the site): {phone or 'none confirmed; see the brief'}",
             f"- Main email (confirmed on the site): {email or 'none confirmed; see the brief'}",
             '- You cannot run commands in this session. When you finish, the pipeline checks the page and sends you any problems to fix.',
             '- This is a headless build started from the dashboard. Ignore other instructions about batches, outreach or the rest of this repository.']
    if problems:
        lines += ['', '## Fix these problems', '',
                  '`site/index.html` already exists. The checker found the problems below. Edit the file to fix every one, and keep everything else as it is.', '']
        lines += [f'- {problem}' for problem in problems]
    return '\n'.join(lines) + '\n'


def run_claude(job_dir, prompt, config, tools=CLAUDE_TOOLS):
    cli = find_claude()
    if not cli:
        raise BuildError('Claude Code was not found on this computer')
    command = [cli, '-p', '--output-format', 'json', '--model', str(config['model']),
               '--restricted', '--strict-mcp-config', '--tools', tools,
               '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
               '--no-session-persistence', '--disable-slash-commands', '--max-turns', str(int(config['max_turns']))]
    started = time.monotonic()
    try:
        out = subprocess.run(command, input=prompt, cwd=job_dir, capture_output=True, text=True, encoding='utf-8',
                             errors='replace', timeout=float(config['timeout_minutes']) * 60, env=child_env())
    except subprocess.TimeoutExpired:
        raise BuildError(f"Claude Code did not finish within {config['timeout_minutes']} minutes") from None
    except OSError as error:
        raise BuildError(f'Claude Code could not start ({type(error).__name__})') from None
    result = None
    for line in reversed((out.stdout or '').strip().splitlines()):
        try:
            result = json.loads(line)
            break
        except ValueError:
            continue
    if not isinstance(result, dict):
        detail = (out.stderr or out.stdout or '').strip().splitlines()[-1:] or ['no output']
        raise BuildError(f'Claude Code stopped without a result (exit {out.returncode}): {detail[0][:300]}')
    text = str(result.get('result') or '')
    if result.get('is_error') or result.get('subtype') not in (None, 'success'):
        if re.search(r'not logged in|/login|authenticat|invalid api key|oauth', text, re.I):
            if in_actions():
                raise BuildError('Claude Code could not sign in: check the ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN secret on GitHub')
            raise BuildError(f'Claude Code is not signed in on this computer. Run once: "{cli}" auth login')
        raise BuildError('Claude Code reported a problem: ' + (text or str(result.get('subtype')))[:300])
    return {'seconds': round(time.monotonic() - started), 'turns': result.get('num_turns'),
            'cost_usd': result.get('total_cost_usd'), 'summary': text[:600]}


# ---------------------------------------------------------------------------
# Pipeline steps

def job_dir_for(job_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{3,80}', job_id or ''):
        raise BuildError('Invalid job id')
    return RUNS / job_id


def scrape(url, evidence, pages):
    """Homepage with a screenshot, then up to pages-1 inner pages (services, about, contact...)."""
    env_file = firecrawl_env()
    args = SimpleNamespace(url=[url], out=str(evidence), max_pages=max(1, pages), env_file=env_file, refresh=False, screen=True)
    site_assets.scrape(args)
    loaded = html_site.load_pages([evidence])
    links, bases = [], [url]
    for page in loaded:
        data = page['data']
        metadata = data.get('metadata') if isinstance(data.get('metadata'), dict) else {}
        for key in ('url', 'sourceURL'):
            if isinstance(metadata.get(key), str):
                bases.append(metadata[key])
        links += [link for link in data.get('links', []) if isinstance(link, str)]
    def clean(value):
        try:
            return site_assets.clean_url(value)
        except ValueError:
            return None

    done = {clean(p['url']) for p in loaded}
    extra = []
    for base in dict.fromkeys(bases):
        for candidate in html_site.pick_pages(links, base, pages - 1 - len(extra)):
            if clean(candidate) and candidate not in extra and clean(candidate) not in done:
                extra.append(candidate)
    if extra:
        try:
            site_assets.scrape(SimpleNamespace(url=extra[:pages - 1], out=str(evidence), max_pages=max(1, pages),
                                               env_file=env_file, refresh=False, screen=False))
        except (ValueError, OSError) as error:
            log(f'Inner pages skipped: {error if isinstance(error, ValueError) else type(error).__name__}')
    return evidence


def prepare(ledger, job, worker, evidence=None, pages=None):
    """reviewing → extracting → building: evidence, brief and photos for the page writer."""
    job_dir = job_dir_for(job['id'])
    job_dir.mkdir(parents=True, exist_ok=True)
    stage = job.get('stage')
    if stage == 'reviewing':
        ledger.update(job['id'], worker, 'extracting', 'Reading the current website')
        stage = 'extracting'
    if stage not in ('extracting', 'building'):
        raise BuildError(f'The job is at {stage}; prepare needs reviewing, extracting or building')
    evidence_dirs = [Path(e) for e in (evidence or [])]
    if not evidence_dirs:
        own = job_dir / 'evidence'
        # Target finding leaves only the screened homepage here; read the inner pages once (the homepage is cached).
        if not (own / '.complete').exists():
            try:
                scrape(job['url'], own, int(pages or generator_settings()['scrape_pages']))
            except (ValueError, OSError) as error:
                if not (own / 'scrape-manifest.json').exists():
                    raise BuildError(f'Could not read {job["url"]}: {error if isinstance(error, ValueError) else type(error).__name__}') from None
                log(f'Using the pages read earlier: {error}')
            (own / '.complete').write_text('', encoding='utf-8')
        evidence_dirs = [own]
    batch = next((b for b in ledger.state().get('batches', []) if b.get('id') == job.get('batch_id')), {})
    hand_picked = batch.get('industry') == 'Hand-picked websites'
    city = '' if hand_picked else batch.get('city', '')
    industry = '' if hand_picked else batch.get('industry', '')
    try:
        brief = html_site.write_brief(job_dir, evidence_dirs, job['name'], job['url'], city, industry)
    except (ValueError, OSError) as error:
        raise BuildError(f'Could not prepare the brief: {error}') from None
    fields = {'workspace': rel(job_dir)}
    data = job.get('data') or {}
    try:  # findings saved when the GitHub runner qualified this business
        packet = json.loads((job_dir / 'qualification.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        packet = {}
    for key in ('qualification', 'source_urls', 'screenshots'):
        if packet.get(key) and not data.get(key):
            fields[key] = packet[key]
    if not data.get('source_urls') and 'source_urls' not in fields:
        fields['source_urls'] = [p['url'] for p in brief['pages']]
    if not data.get('screenshots') and 'screenshots' not in fields and brief['screenshots']:
        fields['screenshots'] = [rel(job_dir / s) for s in brief['screenshots']]
    photos = sum(1 for p in brief['images'] if p.get('file'))
    if stage == 'extracting':
        ledger.update(job['id'], worker, 'building', f"Writing the website from {len(brief['pages'])} page(s) of the current site and {photos} photo(s)", fields)
    else:
        ledger.update(job['id'], worker, None, 'Brief refreshed', fields)
    return {'job_dir': rel(job_dir), 'brief': rel(job_dir / 'brief.md'), 'page': rel(job_dir / 'site' / 'index.html'),
            'pages': len(brief['pages']), 'photos': photos, 'screenshots': brief['screenshots']}


def confirmed_contacts(brief):
    """Contacts the checker enforces: linked from the old site (tel:/mailto:) or shown on two or more of its pages."""
    def pages(item):
        return len({source.rsplit(' on ', 1)[-1] for source in item.get('sources', [])})
    phone = next((p['display'] for p in brief.get('phones', []) if p.get('href') or pages(p) >= 2), None)
    email = next((e['email'] for e in brief.get('emails', []) if any('mailto' in s for s in e.get('sources', [])) or pages(e) >= 2), None)
    return phone, email


def finish(ledger, job, worker, upload=None):
    """building → checking → delivered, or back to building with the problems to fix."""
    job_dir = job_dir_for(job['id'])
    page = job_dir / 'site' / 'index.html'
    if not page.is_file():
        raise BuildError('site/index.html was not written')
    try:
        brief = json.loads((job_dir / 'brief.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        brief = {}
    phone, email = confirmed_contacts(brief)
    hosts = brief.get('domains') or [urlsplit(job['url']).hostname or '']
    if job.get('stage') != 'checking':
        ledger.update(job['id'], worker, 'checking', 'Checking the website')
        job['stage'] = 'checking'
    result = html_site.check(page, job['name'], phone, email, hosts)
    if result['ok']:
        out = job_dir / (jetai.slugify(job['name'])[:60] + '.html')
        result = html_site.inline(page, out, name=job['name'], phone=phone, email=email, image_hosts=hosts)
    if not result['ok']:
        ledger.update(job['id'], worker, 'building', f"Fixing {len(result['errors'])} problem(s) found by the checker: {result['errors'][0]}"[:400],
                      {'qa_passed': False})
        job['stage'] = 'building'
        return {'ok': False, 'errors': result['errors'], 'warnings': result['warnings']}
    fields = {'qa_passed': True, 'site_file': rel(out), 'workspace': rel(job_dir)}
    size = f"{out.stat().st_size / 1_000_000:.1f} MB" if out.stat().st_size > 1_000_000 else f"{out.stat().st_size // 1000} KB"
    if settings().get('delivery') == 'vercel':
        # Hosting and outreach follow; the job stays at checking with passing QA until it is deployed.
        ledger.update(job['id'], worker, None, f'Website checked ({size}); ready to deploy', fields)
        return {'ok': True, 'file': rel(out), 'next': 'deploy', 'warnings': result['warnings'], 'stats': result['stats']}
    detail = f'Website ready ({size})'
    try:
        saved = ledger.save_site(job['id'], worker, out.name, out.read_text(encoding='utf-8'))
    except Exception as error:  # the file is still uploaded to JetAI below
        saved = None
        log(f"{label(job)}: could not store the file in Google Drive: {error}")
    if isinstance(saved, dict) and isinstance(saved.get('url'), str) and saved['url'].startswith('https://'):
        fields['site_file'] = saved['url']
        detail += ', saved in Google Drive'
    if in_actions():
        fields.pop('workspace', None)  # GitHub's machine is wiped after the run
    if upload if upload is not None else upload_enabled():
        previous = (job.get('data') or {}).get('jetai') or {}
        try:
            info = upload_with_retry(job, out, previous.get('prototype_id'))
            fields['jetai'] = info
            detail += f" and uploaded to JetAI as a {info.get('status', 'draft')} prototype"
        except jetai.JetAIError as error:
            fields['jetai'] = {'error': str(error)[:300]}
            detail += f'; the JetAI upload failed: {str(error)[:200]}'
    ledger.update(job['id'], worker, 'delivered', detail, fields)
    return {'ok': True, 'file': rel(out), 'jetai': fields.get('jetai'), 'warnings': result['warnings'], 'stats': result['stats']}


def upload_with_retry(job, path, prototype_id=None, attempts=3):
    client = jetai.Client()
    domain = urlsplit(job['url']).hostname or ''
    description = (f"Website preview for {job['name']} ({domain.removeprefix('www.')}), built by the Website Generator "
                   f"from the business's current website. Ledger job {job['id']}.")
    config = settings().get('jetai')
    # Publishing makes the page public, so it only happens when the operator set jetai.publish to true.
    publish = isinstance(config, dict) and config.get('publish') is True
    for attempt in range(attempts):
        try:
            return client.upload(path.read_text(encoding='utf-8'), f"{job['name']} · website preview",
                                 f"{jetai.slugify(job['name'])[:80]}-{job['id'][-6:]}", description, prototype_id, publish)
        except jetai.JetAIError as error:
            # Only network trouble on a create is ambiguous; never create twice after it.
            if attempt + 1 >= attempts or error.status not in (500, 502, 503, 504):
                raise
            time.sleep(5 * (attempt + 1))


class KeepAlive:
    """Touches the worker every few minutes while a long step runs, so dashboards don't call it stalled."""
    def __init__(self, ledger, job_id, worker, every=90):
        self.stop = threading.Event()
        def beat():
            while not self.stop.wait(every):
                try:
                    ledger.touch(job_id, worker)
                except Exception:
                    pass  # a missed beat only delays the next one
        self.thread = threading.Thread(target=beat, daemon=True, name='keepalive-' + job_id)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.stop.set()


def run_job(ledger, job_id, worker=None, upload=None):
    """Claims one queued business and builds, checks and uploads its website."""
    config = generator_settings()
    worker = worker or f"generator-{job_id.removeprefix('site-')[:8]}"
    ledger.claim(job_id, worker)
    try:
        job = find_job(ledger, job_id)
        log(f"Building {label(job)}")
        with KeepAlive(ledger, job_id, worker):
            prepare(ledger, job, worker)
            job['stage'] = 'building'
            job_dir = job_dir_for(job_id)
            brief = json.loads((job_dir / 'brief.json').read_text(encoding='utf-8'))
            problems, runs = None, []
            for attempt in range(int(config['repair_rounds']) + 1):
                runs.append(run_claude(job_dir, compose_prompt(job, job_dir, brief, problems), config))
                result = finish(ledger, job, worker, upload)
                if result['ok']:
                    log(f"Delivered {label(job)}")
                    return result
                problems = result['errors']
                log(f"{label(job)}: fixing {len(problems)} problem(s)")
        raise BuildError(f'The page still had {len(problems)} problem(s) after {len(runs)} attempts: {problems[0]}')
    except Exception as error:
        message = str(error) if isinstance(error, (BuildError, ValueError)) else f'{type(error).__name__}: {error}'
        try:
            ledger.recover(job_id, f'Website generation stopped: {message}'[:1000])
        except Exception as recovery:  # keep the original failure visible
            log(f'Could not return {job_id} to the queue: {recovery}')
        raise BuildError(message) from None


# ---------------------------------------------------------------------------
# Watcher

def watch(ledger=None, once=False, quiet=True, stop=None, poll=None, deadline=None):
    """Builds requested websites until stopped. With once=True, handles the current requests and returns.

    The heartbeat goes out on every poll, including while builds run, so dashboards can tell a busy
    generator from a stopped one. No new build starts after `deadline` (a time.monotonic() value).
    """
    ledger = ledger or default_ledger()
    config = generator_settings()
    stop = stop or threading.Event()
    poll = float(poll or config['poll_seconds'])
    limit = max(1, min(5, int(config['max_parallel'])))
    host = 'GitHub Actions' if in_actions() else socket.gethostname()[:60]
    running, results = {}, {}
    checked, problems = 0.0, []
    if not quiet:
        log(f'Website generator watching the {ledger.kind} ledger for Generate requests')

    def work(job_id):
        try:
            results[job_id] = run_job(ledger, job_id)
        except Exception as error:
            results[job_id] = {'ok': False, 'error': str(error)}
            if 'capacity' not in str(error).lower():
                log(f'{job_id}: {error}')

    while not stop.is_set():
        for job_id, thread in list(running.items()):
            if not thread.is_alive():
                running.pop(job_id)
        if time.monotonic() - checked > 60:
            problems, checked = preflight(), time.monotonic()
            if problems and not quiet:
                log('Waiting: ' + problems[0])
        heartbeat = {'host': host, 'ready': not problems, 'max_parallel': limit, 'running': list(running),
                     'note': problems[0] if problems else (f'Building {len(running)} website(s)' if running else 'Ready')}
        try:
            pending = ledger.requests(heartbeat).get('requests', [])
        except Exception as error:
            if not quiet:
                log(f'Could not read the ledger: {error}')
            pending = []
        late = deadline is not None and time.monotonic() > deadline
        # One pass handles each request once; a failed build waits for a new Generate press.
        fresh = [item for item in pending if item['id'] not in running and not (once and item['id'] in results)]
        for item in fresh:
            if problems or late or len(running) >= limit:
                break
            thread = threading.Thread(target=work, args=(item['id'],), daemon=True, name='build-' + item['id'])
            running[item['id']] = thread
            thread.start()
        if once and not running and (problems or late or not fresh):
            return {'problems': problems, 'results': results}
        if once and not running:
            continue  # more requests than build slots: start the next ones right away
        stop.wait(poll)
    return {'problems': problems, 'results': results}


def cloud(ledger=None, budget_minutes=None, finder=None):
    """One GitHub Actions run: find targets for the queued batches, then build every requested website."""
    if finder is None:
        import discover as finder
    discover = finder
    # discover.py calls back into this module (run_claude, settings, RUNS); hand it this very module.
    module = sys.modules.get(__name__)
    runner = module if module is not None and getattr(module, 'cloud', None) is cloud else SimpleNamespace(**globals())
    ledger = ledger or default_ledger()
    if ledger.kind != 'sheets' and in_actions():
        raise BuildError('Add the REVAMP_SHEETS_URL and REVAMP_SHEETS_TOKEN secrets on GitHub so the run can reach your ledger')
    config = generator_settings()
    deadline = time.monotonic() + float(budget_minutes or config.get('cloud_budget_minutes') or 270) * 60
    summary = {'ok': True, 'batches': [], 'builds': {}, 'problems': []}
    for _ in range(20):
        for batch in discover.pending_batches(ledger.state()):
            if time.monotonic() > deadline:
                break
            problems = preflight(upload=False)
            if problems:
                ledger.requests({'host': 'GitHub Actions' if in_actions() else socket.gethostname()[:60], 'ready': False, 'note': problems[0], 'running': []})
                summary.update(ok=False, problems=problems)
                return summary
            summary['batches'].append(discover.discover_batch(ledger, batch, runner, deadline=deadline))
        result = watch(ledger, once=True, deadline=deadline)
        summary['builds'].update(result['results'])
        if result['problems']:
            summary.update(ok=False, problems=result['problems'])
            return summary
        state = ledger.state()
        waiting = [j for j in state.get('jobs', []) if j.get('stage') == 'queued' and not j.get('worker')
                   and (j.get('data') or {}).get('generate_requested_at') and j['id'] not in summary['builds']]
        if time.monotonic() > deadline or not (waiting or discover.pending_batches(state)):
            break
    summary['ok'] = all(item.get('ok') for item in summary['builds'].values()) if summary['builds'] else True
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('watch'); s.add_argument('--once', action='store_true')
    s = sub.add_parser('run'); s.add_argument('--job', required=True); s.add_argument('--no-upload', action='store_true')
    s = sub.add_parser('prepare'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True)
    s.add_argument('--evidence', action='append', default=[], help='Existing Firecrawl evidence folder (repeatable); scrapes when omitted')
    s.add_argument('--pages', type=int)
    s = sub.add_parser('finish'); s.add_argument('--job', required=True); s.add_argument('--worker', required=True); s.add_argument('--no-upload', action='store_true')
    s = sub.add_parser('cloud', help='One GitHub Actions run: find targets for queued batches, then build every request')
    s.add_argument('--budget-minutes', type=float, help='Stop starting new work after this long (default generator.cloud_budget_minutes)')
    sub.add_parser('pending', help='Is anything waiting? (sets work=true|false for the next GitHub Actions steps)')
    sub.add_parser('doctor')
    args = parser.parse_args(argv)
    try:
        if args.cmd == 'watch':
            try:
                result = watch(once=args.once, quiet=False)
            except KeyboardInterrupt:
                return 0
        elif args.cmd == 'cloud':
            result = cloud(budget_minutes=args.budget_minutes)
            for problem in result.get('problems', []):
                log('Problem: ' + problem)
            # Actions logs can be public: counts only, details are in the dashboard.
            builds = result.get('builds', {}).values()
            result = {'ok': result['ok'], 'problems': result.get('problems', []),
                      'batches': [{k: b.get(k) for k in ('batch', 'found', 'screened', 'skipped', 'queries', 'error') if k in b} for b in result.get('batches', [])],
                      'websites_built': sum(1 for b in builds if b.get('ok')), 'websites_failed': sum(1 for b in builds if not b.get('ok'))}
        elif args.cmd == 'pending':
            import discover
            ledger = default_ledger()
            if in_actions() and ledger.kind != 'sheets':
                raise BuildError('Add the REVAMP_SHEETS_URL and REVAMP_SHEETS_TOKEN secrets on GitHub so the run can reach your ledger')
            state = ledger.state()
            requests = [j for j in state.get('jobs', []) if j.get('stage') == 'queued' and not j.get('worker')
                        and (j.get('data') or {}).get('generate_requested_at')]
            batches = discover.pending_batches(state)
            result = {'work': bool(requests or batches), 'requests': len(requests), 'batches': len(batches)}
            if os.environ.get('GITHUB_OUTPUT'):
                with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
                    output.write(f"work={'true' if result['work'] else 'false'}\n")
        elif args.cmd == 'doctor':
            ledger = default_ledger()
            result = {'ledger': ledger.kind, 'claude_cli': find_claude(), 'problems': preflight(),
                      'pending_requests': len(ledger.requests().get('requests', []))}
        else:
            ledger = default_ledger()
            if args.cmd == 'run':
                result = run_job(ledger, args.job, upload=False if args.no_upload else None)
            elif args.cmd == 'prepare':
                result = prepare(ledger, find_job(ledger, args.job), args.worker, args.evidence, args.pages)
            else:
                result = finish(ledger, find_job(ledger, args.job), args.worker, upload=False if args.no_upload else None)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if not isinstance(result, dict) or result.get('ok', True) else 1
    except (BuildError, ValueError, OSError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    # Windows: re-run in UTF-8 mode so files and non-English business names read/write correctly.
    if sys.platform == 'win32' and not sys.flags.utf8_mode:
        try:
            sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))
        except KeyboardInterrupt:
            sys.exit(130)
    sys.exit(main())
