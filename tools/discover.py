#!/usr/bin/env python3
"""Find target businesses for queued dashboard batches without a browser (the GitHub runner's first step).

For each queued batch: search Firecrawl for the industry and place, keep only results ranked
91–100 (Google's page 10, like the manual workflow), skip directories, social profiles and
businesses already in the ledger, screen each remaining homepage with Firecrawl (screenshot), let
Claude Code judge it from the screenshot (references/qualify-prompt.md) and register the qualified
ones with their reason. In a 'build' batch each registered business is also queued for the website
generator. Scraped text is untrusted: Claude reads it with file tools only, in a folder of its own.

site_runner.py cloud calls discover_batch(); this module has no command line of its own.
"""
import json
from pathlib import Path
import re
import shutil
import time
from types import SimpleNamespace
from urllib.parse import urlsplit

import html_site
import site_assets

ROOT = Path(__file__).resolve().parents[1]
SEARCH_API = 'https://api.firecrawl.dev/v2/search'
QUALIFY_PROMPT = ROOT / 'references' / 'qualify-prompt.md'
HAND_PICKED = 'Hand-picked websites'
DEFAULTS = {'country': 'US', 'first_result': 91, 'results': 100, 'max_queries': 6, 'max_candidates': 30}
QUERIES = ['{industry} {place}', '{industry} near {place}', '{industry} company {place}', '{industry} services {place}',
           'local {industry} {place}', 'best {industry} {place}']
# Never a business's own website. The first ones also go to Firecrawl so they don't use up results.
DIRECTORIES = [
    'yelp.com', 'angi.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com', 'bbb.org', 'yellowpages.com',
    'facebook.com', 'instagram.com', 'linkedin.com', 'nextdoor.com', 'houzz.com', 'porch.com', 'mapquest.com',
    'manta.com', 'bark.com', 'expertise.com', 'threebestrated.com', 'indeed.com', 'ziprecruiter.com',
    'glassdoor.com', 'wikipedia.org', 'reddit.com', 'youtube.com', 'x.com', 'twitter.com', 'tiktok.com',
    'pinterest.com', 'google.com', 'apple.com', 'bing.com', 'yahoo.com', 'chamberofcommerce.com', 'superpages.com',
    'dexknows.com', 'merchantcircle.com', 'local.com', 'citysearch.com', 'hotfrog.com', 'cylex.us.com', 'birdeye.com',
    'networx.com', 'fixr.com', 'buildzoom.com', 'craigslist.org', 'todayshomeowner.com', 'forbes.com', 'zillow.com',
    'angi.co.uk', 'checkatrade.com', 'trustpilot.com', 'tripadvisor.com', 'opentable.com', 'doordash.com',
    'ubereats.com', 'grubhub.com', 'amazon.com', 'ebay.com', 'etsy.com', 'quora.com', 'medium.com',
]


def config(runner):
    value = runner.settings().get('discovery')
    return {**DEFAULTS, **(value if isinstance(value, dict) else {})}


def pending_batches(state):
    """Dashboard batches nobody has started yet, oldest first (not the hand-picked list)."""
    batches = [b for b in state.get('batches', []) if b.get('status') == 'queued' and b.get('industry') != HAND_PICKED]
    return sorted(batches, key=lambda batch: batch.get('created_at') or '')


def domain_of(url):
    return (urlsplit(url).hostname or '').lower().rstrip('.').removeprefix('www.')


def is_directory(host):
    return any(host == d or host.endswith('.' + d) for d in DIRECTORIES)


def search(query, key, settings):
    payload = {'query': query[:500], 'limit': int(settings['results']), 'sources': ['web'],
               'country': settings['country'], 'excludeDomains': DIRECTORIES[:25]}
    raw, _, _ = site_assets.fetch(SEARCH_API, limit=8 * 1024 * 1024, method='POST', body=json.dumps(payload).encode('utf-8'),
                                  headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, redirects=0)
    reply = json.loads(raw)
    if reply.get('success') is not True:
        raise ValueError('Firecrawl search did not succeed')
    data = reply.get('data')
    items = data.get('web', []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return [{'position': index + 1, 'url': item['url'], 'title': str(item.get('title') or '')[:200],
             'description': str(item.get('description') or '')[:400]}
            for index, item in enumerate(items) if isinstance(item, dict) and isinstance(item.get('url'), str)]


def homepage(url):
    parts = urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}/'


def screen(home, cache_dir, runner):
    """The homepage with a screenshot, cached like the manual workflow's screening."""
    site_assets.scrape(SimpleNamespace(url=[home], out=str(cache_dir), max_pages=max(1, int(runner.generator_settings()['scrape_pages'])),
                                       env_file=runner.firecrawl_env(), refresh=False, screen=True))
    pages = html_site.load_pages([cache_dir])
    page = next((p for p in pages if p['screenshot']), None)
    if page is None:
        raise ValueError('Firecrawl returned no screenshot')
    return page


def qualify(candidate, page, workdir, runner):
    """Claude Code judges the homepage from its screenshot and writes verdict.json."""
    workdir.mkdir(parents=True, exist_ok=True)
    for old in workdir.glob('verdict.json'):
        old.unlink()
    shutil.copyfile(page['screenshot'], workdir / ('screenshot' + page['screenshot'].suffix))
    markdown = page['data'].get('markdown') if isinstance(page['data'].get('markdown'), str) else ''
    (workdir / 'page.md').write_text(html_site.clean_markdown(markdown)[:15000], encoding='utf-8')
    (workdir / 'candidate.json').write_text(json.dumps(candidate, indent=2, ensure_ascii=False), encoding='utf-8')
    prompt = '\n'.join([QUALIFY_PROMPT.read_text(encoding='utf-8').strip(), '', '## This candidate', '',
                        f"- Industry: {candidate['industry']}", f"- Place searched: {candidate['place']}",
                        f"- Website: {candidate['url']}",
                        '- Your working directory holds the inputs. Write `verdict.json` there.',
                        '- This is a headless check started by the website generator. Ignore other instructions about batches or this repository.'])
    settings = {**runner.generator_settings(), 'max_turns': 12, 'timeout_minutes': 6}
    runner.run_claude(workdir, prompt + '\n', settings, tools='Read,Write')
    try:
        verdict = json.loads((workdir / 'verdict.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise ValueError('Claude Code wrote no readable verdict.json') from None
    return normalize(verdict)


def normalize(verdict):
    if not isinstance(verdict, dict) or not isinstance(verdict.get('qualifies'), bool):
        raise ValueError('The verdict needs "qualifies": true or false')
    text = lambda key, limit: ' '.join(str(verdict.get(key) or '').split())[:limit]
    result = {'qualifies': verdict['qualifies'], 'skip_reason': text('skip_reason', 300), 'business_name': text('business_name', 200),
              'reason': text('reason', 500), 'phone': text('phone', 60) or None, 'email': text('email', 200).lower() or None}
    findings = verdict.get('findings') if isinstance(verdict.get('findings'), list) else []
    result['findings'] = [' '.join(str(f).split())[:300] for f in findings if isinstance(f, str) and f.strip()][:4]
    if result['qualifies'] and (not result['business_name'] or len(result['findings']) < 2):
        result.update(qualifies=False, skip_reason='the verdict had no business name or fewer than two findings')
    if result['qualifies'] and not result['reason']:
        result['reason'] = result['findings'][0]
    return result


def aliases_for(verdict, country):
    """Phone and email identities, so the same business is never registered twice."""
    aliases = []
    phone = verdict.get('phone') or ''
    digits = re.sub(r'\D', '', phone)
    if phone.strip().startswith('+') and 8 <= len(digits) <= 15:
        aliases.append('phone:+' + digits)
    elif country == 'US' and len(digits) == 10 and digits[0] in '23456789':
        aliases.append('phone:+1' + digits)
    elif country == 'US' and len(digits) == 11 and digits.startswith('1'):
        aliases.append('phone:+' + digits)
    email = verdict.get('email') or ''
    if re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        aliases.append('email:' + email)
    return aliases


def register(ledger, batch, home, verdict, settings, runner):
    """Adds the target; returns its job ID, 'duplicate', or 'full' when the batch has no slot left."""
    generate = batch.get('mode') != 'targets'
    for aliases in (aliases_for(verdict, settings['country']), []):
        try:
            return ledger.add_target(verdict['business_name'], home, batch['id'], generate, 'the website generator',
                                     verdict['reason'], aliases)['id']
        except Exception as error:
            message = str(error)
            if 'UNIQUE' in message or 'already' in message:
                return 'duplicate'
            if 'cover the target' in message:
                return 'full'
            if aliases and re.search(r'identity|phone|email', message, re.I):
                continue  # an alias the ledger rejects: register by the website alone
            raise
    return 'duplicate'


def keep_evidence(cache_dir, job_dir, home, verdict, runner):
    """The screened homepage becomes the job's evidence, so building it doesn't scrape the homepage again."""
    evidence = job_dir / 'evidence'
    if not evidence.exists():
        shutil.copytree(cache_dir, evidence, ignore=shutil.ignore_patterns('.scrape.lock'))
    shots = sorted(str(p.relative_to(runner.ROOT).as_posix()) if p.resolve().is_relative_to(runner.ROOT) else str(p)
                   for p in (evidence / 'screenshots').glob('*'))
    packet = {'reason': verdict['reason'], 'qualification': {'findings': verdict['findings'], 'mobile_checked': False},
              'source_urls': [home], 'screenshots': shots}
    (job_dir / 'qualification.json').write_text(json.dumps(packet, indent=2, ensure_ascii=False), encoding='utf-8')


def discover_batch(ledger, batch, runner, deadline=None):
    """Finds and registers targets for one queued batch. Returns what happened, for the run summary."""
    settings = config(runner)
    name = f"{batch['industry']} · {batch['city']}"
    summary = {'batch': batch['id'], 'found': 0, 'screened': 0, 'skipped': 0, 'queries': 0}
    try:
        ledger.batch_status(batch['id'], 'running')  # this run has started it
    except Exception as error:
        summary['error'] = f'could not start the batch: {error}'
        return summary
    state = ledger.state()
    known = {job.get('domain') for job in state.get('jobs', [])}
    current = next((b for b in state.get('batches', []) if b.get('id') == batch['id']), batch)
    wanted = int(current.get('available_count', current.get('requested_count', 5)) or 0)
    key = site_assets.api_key(runner.firecrawl_env())
    scouting = runner.RUNS / 'scouting' / batch['id']
    seen, first = set(), int(settings['first_result'])
    ledger.note(f'{name}: finding {wanted} target website(s) (search results from position {first}).')
    for template in QUERIES[:int(settings['max_queries'])]:
        if summary['found'] >= wanted or (deadline and time.monotonic() > deadline) or summary['screened'] >= int(settings['max_candidates']):
            break
        query = template.format(industry=batch['industry'], place=batch['city'])
        try:
            results = search(query, key, settings)
        except (ValueError, OSError) as error:
            ledger.note(f'{name}: the search "{query}" failed ({error if isinstance(error, ValueError) else type(error).__name__}).')
            if '402' in str(error):
                break  # out of Firecrawl credits
            continue
        summary['queries'] += 1
        page_ten = [r for r in results if r['position'] >= first]
        businesses = []
        for result in page_ten:
            host = domain_of(result['url'])
            if not host or '.' not in host or host in seen or host in known or is_directory(host):
                continue
            seen.add(host)
            businesses.append(result)
        ledger.note(f'{name}: searched "{query}": {len(results)} results, {len(page_ten)} from position {first}, {len(businesses)} new business sites.')
        for result in businesses:
            if summary['found'] >= wanted or (deadline and time.monotonic() > deadline) or summary['screened'] >= int(settings['max_candidates']):
                break
            home = homepage(result['url'])
            host = domain_of(home)
            cache = scouting / 'cache' / re.sub(r'[^a-z0-9.-]', '_', host)
            try:
                page = screen(home, cache, runner)
            except (ValueError, OSError):
                summary['skipped'] += 1
                continue
            summary['screened'] += 1
            candidate = {'url': home, 'title': result['title'], 'description': result['description'], 'position': result['position'],
                         'query': query, 'industry': batch['industry'], 'place': batch['city']}
            try:
                verdict = qualify(candidate, page, scouting / 'verdicts' / re.sub(r'[^a-z0-9.-]', '_', host), runner)
            except runner.BuildError as error:
                if re.search(r'sign in|signed in|not signed|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN', str(error)):
                    raise  # every other candidate would fail the same way
                summary['skipped'] += 1
                continue
            except ValueError:
                summary['skipped'] += 1
                continue
            if not verdict['qualifies']:
                summary['skipped'] += 1
                continue
            outcome = register(ledger, batch, home, verdict, settings, runner)
            if outcome == 'full':
                wanted = summary['found']
                break
            if outcome == 'duplicate':
                summary['skipped'] += 1
                continue
            summary['found'] += 1
            keep_evidence(cache, runner.RUNS / outcome, home, verdict, runner)
    short = summary['found'] < wanted
    ledger.note(f"{name}: {summary['found']} target(s) found after checking {summary['screened']} website(s)"
                + (f"; the search ran out {wanted - summary['found']} short." if short else '.'))
    return summary
