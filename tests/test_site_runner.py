import contextlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from unittest.mock import patch

TESTS = Path(__file__).parent
TOOLS = TESTS.parent / 'tools'
sys.path.insert(0, str(TOOLS))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


control = load('control', TOOLS / 'control.py')
site_runner = load('site_runner', TOOLS / 'site_runner.py')
discover = load('discover', TOOLS / 'discover.py')
fixtures = load('html_site_fixtures', TESTS / 'test_html_site.py')
fake_jetai = load('jetai_fixtures', TESTS / 'test_jetai.py')

# Stands in for the Claude Code CLI: records each call, answers `auth status`, and writes the page.
FAKE_CLAUDE = textwrap.dedent('''
    import json, os, sys
    from pathlib import Path
    args = sys.argv[1:]
    log = Path(os.environ['FAKE_CLAUDE_LOG'])
    if args[:2] == ['auth', 'status']:
        print(json.dumps({'loggedIn': os.environ.get('FAKE_CLAUDE_LOGGED_IN') == '1'}))
        sys.exit(0)
    prompt = sys.stdin.read()
    calls = json.loads(log.read_text()) if log.exists() else []
    calls.append({'args': args, 'prompt': prompt, 'cwd': os.getcwd()})
    log.write_text(json.dumps(calls))
    if Path('candidate.json').exists():  # judging a search result for the target finder
        candidate = json.loads(Path('candidate.json').read_text(encoding='utf-8'))
        good = 'brightspark' in candidate['url']
        Path('verdict.json').write_text(json.dumps({
            'qualifies': good, 'skip_reason': None if good else 'the site already looks modern',
            'business_name': 'Bright Spark Electric', 'reason': 'The phone number is tiny and the layout is cramped',
            'findings': ['The phone number is tiny', 'The layout is cramped'], 'phone': '(617) 555-0142', 'email': 'office@brightspark.example'}))
        print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': 'Judged.', 'num_turns': 2}))
        sys.exit(0)
    mode = os.environ.get('FAKE_CLAUDE_MODE', 'good')
    if mode == 'fail':
        print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': True, 'result': 'Overloaded, try later'}))
        sys.exit(1)
    page = Path(os.environ['FAKE_CLAUDE_PAGE']).read_text(encoding='utf-8')
    if mode == 'fix' and len(calls) == 1:
        page = page.replace('<h1>Bright Spark Electric</h1>', '<h2>Bright Spark Electric</h2>')
    Path('site').mkdir(exist_ok=True)
    Path('site/index.html').write_text(page, encoding='utf-8')
    print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': 'Blue from the logo; six sections.', 'num_turns': 7, 'total_cost_usd': 0.42}))
''')


class SiteRunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [patch.object(control, 'DB', self.root / 'ledger.db'), patch.object(site_runner, 'RUNS', self.root / 'runs'),
                        patch.object(site_runner, 'log', lambda message: None),
                        patch.object(site_runner.html_site.site_assets, 'fetch', side_effect=fixtures.fake_fetch),
                        patch.object(site_runner.site_assets, 'public_target', side_effect=ValueError('no network in tests'))]
        self.jetai = http.server.ThreadingHTTPServer(('127.0.0.1', 0), fake_jetai.FakeJetAI)
        self.jetai.state = {'requests': [], 'prototypes': {}, 'fail': []}
        threading.Thread(target=self.jetai.serve_forever, daemon=True).start()
        script = self.root / 'fake_claude.py'
        script.write_text(FAKE_CLAUDE, encoding='utf-8')
        if os.name == 'nt':
            cli = self.root / 'claude.cmd'
            cli.write_text(f'@echo off\r\n"{sys.executable}" "{script}" %*\r\n', encoding='utf-8')
        else:
            cli = self.root / 'claude'
            cli.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n', encoding='utf-8')
            cli.chmod(0o755)
        page = self.root / 'page.html'
        page.write_text(fixtures.GOOD_PAGE, encoding='utf-8')
        self.log = self.root / 'calls.json'
        self.patches.append(patch.dict(os.environ, {
            'CLAUDE_CLI': str(cli), 'FAKE_CLAUDE_LOG': str(self.log), 'FAKE_CLAUDE_PAGE': str(page), 'FAKE_CLAUDE_LOGGED_IN': '1',
            'FAKE_CLAUDE_MODE': 'good', 'FIRECRAWL_API_KEY': 'fc-test', 'JETAI_API_KEY': fake_jetai.KEY,
            'JETAI_API_BASE': f'http://127.0.0.1:{self.jetai.server_port}/api/v1', 'ANTHROPIC_API_KEY': '', 'CLAUDE_CODE_OAUTH_TOKEN': ''}))
        for item in self.patches:
            item.start()
        self.ledger = site_runner.LocalLedger(control)

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.jetai.shutdown()
        self.jetai.server_close()
        self.tmp.cleanup()

    def target(self, generate=True):
        job = control.add_target('Bright Spark Electric', 'https://brightspark.example/', generate=generate, by='owner@example.com')['id']
        fixtures.make_evidence(self.root / 'runs' / job)  # a cached scrape, so no Firecrawl request is made
        return job

    def job(self, job_id):
        return next(j for j in control.snapshot()['jobs'] if j['id'] == job_id)

    def calls(self):
        return json.loads(self.log.read_text()) if self.log.exists() else []

    def test_a_generate_request_becomes_a_delivered_and_uploaded_website(self):
        job_id = self.target()
        outcome = site_runner.watch(self.ledger, once=True)
        self.assertEqual(outcome['problems'], [])
        self.assertTrue(outcome['results'][job_id]['ok'])
        job = self.job(job_id)
        self.assertEqual(job['stage'], 'delivered')
        self.assertTrue(job['data']['qa_passed'])
        self.assertNotIn('generate_requested_at', job['data'])
        site_file = Path(job['data']['site_file'])
        self.assertTrue(site_file.is_file())
        self.assertIn('data:image/png;base64,', site_file.read_text(encoding='utf-8'))
        prototype = next(iter(self.jetai.state['prototypes'].values()))
        self.assertEqual(job['data']['jetai']['prototype_id'], prototype['id'])
        self.assertEqual((prototype['status'], prototype['language']), ('draft', 'html'))
        self.assertTrue(prototype['slug'].startswith('bright-spark-electric-'))
        self.assertIn('data:image/jpeg;base64,', prototype['html'])
        self.assertIn('uploaded to JetAI', job['detail'])
        [call] = self.calls()
        for flag in ('--restricted', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'):
            self.assertIn(flag, call['args'])
        self.assertEqual(call['args'][call['args'].index('--tools') + 1], 'Read,Write,Edit,Glob,Grep')
        self.assertEqual(call['args'][call['args'].index('--permission-prompts') + 1], 'none')
        self.assertEqual(Path(call['cwd']).resolve(), (self.root / 'runs' / job_id).resolve())
        self.assertIn('# Website prompt', call['prompt'])
        self.assertIn('Business name: Bright Spark Electric', call['prompt'])
        self.assertIn('Main phone (confirmed on the site): (617) 555-0142', call['prompt'])
        status = control.snapshot()['generator']
        self.assertEqual((status['ready'], status['note']), (True, 'Ready'))

    def test_checker_problems_are_sent_back_for_one_more_pass(self):
        os.environ['FAKE_CLAUDE_MODE'] = 'fix'
        job_id = self.target()
        result = site_runner.run_job(self.ledger, job_id)
        self.assertTrue(result['ok'])
        first, second = self.calls()
        self.assertNotIn('## Fix these problems', first['prompt'])
        self.assertIn('## Fix these problems', second['prompt'])
        self.assertIn('Use exactly one <h1> (found 0)', second['prompt'])
        messages = [e['message'] for e in control.snapshot()['events'] if e['job_id'] == job_id]
        self.assertTrue(any(m.startswith('Fixing 1 problem(s) found by the checker') for m in messages))
        self.assertEqual(self.job(job_id)['stage'], 'delivered')

    def test_a_failed_build_returns_the_business_to_the_queue(self):
        os.environ['FAKE_CLAUDE_MODE'] = 'fail'
        job_id = self.target()
        with self.assertRaisesRegex(site_runner.BuildError, 'Overloaded'):
            site_runner.run_job(self.ledger, job_id)
        job = self.job(job_id)
        self.assertEqual((job['stage'], job['worker']), ('queued', None))
        self.assertIn('Website generation stopped: Claude Code reported a problem: Overloaded', job['detail'])
        self.assertEqual(control.pending_requests()['requests'], [])  # never retried by itself
        self.assertEqual(self.jetai.state['prototypes'], {})

    def test_requests_wait_while_claude_code_is_signed_out(self):
        os.environ['FAKE_CLAUDE_LOGGED_IN'] = '0'
        job_id = self.target()
        outcome = site_runner.watch(self.ledger, once=True)
        self.assertIn('auth login', outcome['problems'][0])
        self.assertEqual(self.job(job_id)['stage'], 'queued')
        self.assertEqual([r['id'] for r in control.pending_requests()['requests']], [job_id])
        status = control.snapshot()['generator']
        self.assertFalse(status['ready'])
        self.assertIn('not signed in', status['note'])
        self.assertEqual(self.calls(), [])

    def test_coordinator_subagents_use_prepare_and_finish(self):
        job_id = self.target(generate=False)
        control.claim(None, 'builder-1', job_id)
        prepared = site_runner.prepare(self.ledger, self.job(job_id), 'builder-1')
        self.assertEqual((prepared['pages'], prepared['photos']), (1, 2))
        self.assertEqual(self.job(job_id)['stage'], 'building')
        # A hand-picked .example website names no country, so the brief uses discovery.country.
        brief = (self.root / 'runs' / job_id / 'brief.md').read_text(encoding='utf-8')
        self.assertIn('- Country (ISO code): US; its phone numbers start with +1', brief)
        page = self.root / 'runs' / job_id / 'site' / 'index.html'
        page.write_text(fixtures.GOOD_PAGE.replace('tel:+16175550142', 'tel:+16175550000'), encoding='utf-8')
        result = site_runner.finish(self.ledger, self.job(job_id), 'builder-1', upload=False)
        self.assertFalse(result['ok'])
        self.assertEqual(self.job(job_id)['stage'], 'building')
        page.write_text(fixtures.GOOD_PAGE, encoding='utf-8')
        result = site_runner.finish(self.ledger, self.job(job_id), 'builder-1', upload=False)
        self.assertTrue(result['ok'])
        job = self.job(job_id)
        self.assertEqual(job['stage'], 'delivered')
        self.assertNotIn('jetai', job['data'])
        self.assertEqual(job['data']['source_urls'], ['https://brightspark.example/'])

    def test_claude_is_found_in_the_desktop_app_folder(self):
        with tempfile.TemporaryDirectory() as appdata:
            for version in ('2.1.9', '2.1.286'):
                folder = Path(appdata) / 'Claude' / 'claude-code' / version / 'abc123'
                folder.mkdir(parents=True)
                (folder / 'claude.exe').write_bytes(b'')
            with patch.dict(os.environ, {'CLAUDE_CLI': '', 'APPDATA': appdata, 'LOCALAPPDATA': appdata}), \
                    patch.object(site_runner.shutil, 'which', return_value=None), \
                    patch.object(site_runner.Path, 'home', return_value=Path(appdata) / 'home'):
                self.assertIn('2.1.286', site_runner.find_claude())

    def test_claude_is_found_in_the_packaged_desktop_app(self):
        # The Store/MSIX desktop app keeps "Roaming" inside its package folder, invisible at %APPDATA%.
        with tempfile.TemporaryDirectory() as local:
            folder = Path(local) / 'Packages' / 'Claude_pzs8sxrjxfjjc' / 'LocalCache' / 'Roaming' / 'Claude' / 'claude-code' / '2.1.286' / 'abc123'
            folder.mkdir(parents=True)
            (folder / 'claude.exe').write_bytes(b'')
            with patch.dict(os.environ, {'CLAUDE_CLI': '', 'APPDATA': str(Path(local) / 'Roaming'), 'LOCALAPPDATA': local}), \
                    patch.object(site_runner.shutil, 'which', return_value=None), \
                    patch.object(site_runner.Path, 'home', return_value=Path(local) / 'home'):
                self.assertEqual(site_runner.find_claude(), str(folder / 'claude.exe'))


    # -- Finding targets and the GitHub run ---------------------------------------------------

    def search_results(self, query, key, settings, country=None):
        """100 results like Firecrawl's: only positions 91-100 may be used."""
        self.searches.append(query)
        self.search_countries.append(country)
        results = [{'position': n, 'url': f'https://early{n}.example/', 'title': '', 'description': ''} for n in range(1, 91)]
        results += [{'position': 91, 'url': 'https://www.yelp.com/biz/some-electrician', 'title': 'Yelp', 'description': ''},
                    {'position': 92, 'url': 'https://known.example/', 'title': 'Known', 'description': ''},
                    {'position': 93, 'url': 'https://brightspark.example/services', 'title': 'Bright Spark', 'description': ''},
                    {'position': 94, 'url': 'https://modern-electric.example/', 'title': 'Modern', 'description': ''},
                    {'position': 95, 'url': 'https://unreachable.example/', 'title': 'Down', 'description': ''}]
        return results

    def fake_screen(self, home, cache_dir, runner):
        self.screened.append(home)
        if 'unreachable' in home:
            raise ValueError('HTTP status 404')
        if not cache_dir.exists():
            shutil.copytree(self.fixture_evidence, cache_dir)
        return site_runner.html_site.load_pages([cache_dir])[0]

    def discovery(self):
        self.searches, self.search_countries, self.screened = [], [], []
        self.fixture_evidence = fixtures.make_evidence(self.root / 'fixture')
        return [patch.object(discover, 'search', side_effect=self.search_results), patch.object(discover, 'screen', side_effect=self.fake_screen)]

    def test_targets_come_from_page_ten_and_qualified_ones_are_built(self):
        batch = control.batch('Electricians', 'Boston, MA', 1)
        control.add_target('Known Electric', 'https://known.example/')  # already in the ledger, on another list
        with contextlib.ExitStack() as stack:
            for item in self.discovery():
                stack.enter_context(item)
            outcome = site_runner.cloud(self.ledger, budget_minutes=5, finder=discover)
        self.assertTrue(outcome['ok'], outcome)
        self.assertEqual(self.screened, ['https://brightspark.example/'])  # page 1-9 results, Yelp and known sites were never opened
        [found] = outcome['batches']
        self.assertEqual((found['found'], found['screened']), (1, 1))
        jobs = {j['domain']: j for j in control.snapshot()['jobs']}
        built = jobs['brightspark.example']
        self.assertEqual((built['name'], built['stage']), ('Bright Spark Electric', 'delivered'))
        self.assertEqual(built['reason'], 'The phone number is tiny and the layout is cramped')
        self.assertEqual(built['data']['qualification']['findings'], ['The phone number is tiny', 'The layout is cramped'])
        self.assertTrue(built['data']['jetai']['prototype_id'])
        with control.connect() as c:
            identities = {row[0] for row in c.execute('SELECT identity FROM identities WHERE job_id=?', (built['id'],))}
        self.assertIn('phone:+16175550142', identities)
        state = control.snapshot()
        self.assertEqual(next(b for b in state['batches'] if b['id'] == batch['id'])['status'], 'running')
        messages = [e['message'] for e in state['events']]
        self.assertTrue(any('searched "Electricians Boston, MA": 95 results, 5 from position 91, 3 new business sites.' in m for m in messages), messages)
        self.assertTrue(any(m.startswith('Electricians · Boston, MA: 1 target(s) found after checking 1 website(s).') for m in messages))
        judge = [c for c in self.calls() if '# Qualify prompt' in c['prompt']]
        self.assertEqual(len(judge), 1)
        self.assertEqual(judge[0]['args'][judge[0]['args'].index('--tools') + 1], 'Read,Write')
        self.assertEqual(self.searches, ['Electricians Boston, MA'])
        self.assertEqual(self.search_countries, ['US'])  # a batch without a country uses discovery.country

    def test_a_batch_searches_in_its_own_country_and_language(self):
        batch = control.batch('Bengkel sepeda', 'Jakarta', 1, 'targets', 'id')
        self.assertEqual(next(b for b in control.snapshot()['batches'] if b['id'] == batch['id'])['country'], 'ID')
        with contextlib.ExitStack() as stack:
            for item in self.discovery():
                stack.enter_context(item)
            site_runner.cloud(self.ledger, budget_minutes=5, finder=discover)
        self.assertEqual((self.searches, self.search_countries), (['Bengkel sepeda Jakarta'], ['ID']))
        judged = [c for c in self.calls() if '# Qualify prompt' in c['prompt']]
        self.assertTrue(judged and all('- Country (ISO code): ID' in c['prompt'] for c in judged))
        settings = dict(discover.DEFAULTS)
        self.assertEqual([discover.query_text(q, 'Bengkel sepeda', 'Jakarta') for q in discover.queries_for('ID', settings)[:3]],
                         ['Bengkel sepeda Jakarta', 'Bengkel sepeda di Jakarta', 'Bengkel sepeda terdekat Jakarta'])
        # Languages without built-in phrases search the words as typed, unless settings add phrases.
        self.assertEqual([discover.query_text(q, 'ช่างไฟ', 'Bangkok, Thailand') for q in discover.queries_for('TH', settings)],
                         ['ช่างไฟ Bangkok, Thailand', 'ช่างไฟ Bangkok'])
        settings['queries'] = {'th': ['{industry} ใกล้ {city}']}
        self.assertEqual(discover.queries_for('TH', settings), ['{industry} ใกล้ {city}'])
        with self.assertRaises(ValueError):
            control.batch('Plumbers', 'Bangkok', 1, 'build', 'Thailand')

    def test_a_targets_only_batch_is_listed_but_not_built(self):
        batch = control.batch('Electricians', 'Boston, MA', 2, 'targets')
        with contextlib.ExitStack() as stack:
            for item in self.discovery():
                stack.enter_context(item)
            outcome = site_runner.cloud(self.ledger, budget_minutes=5, finder=discover)
        [job] = [j for j in control.snapshot()['jobs'] if j['batch_id'] == batch['id']]
        self.assertEqual(job['stage'], 'queued')
        self.assertNotIn('generate_requested_at', job['data'])
        self.assertEqual(outcome['builds'], {})
        self.assertEqual(len(self.searches), 6)  # still one target short: every query variant was tried
        self.assertTrue((self.root / 'runs' / job['id'] / 'evidence' / 'scrape-manifest.json').exists())

    def test_nothing_runs_when_claude_cannot_sign_in(self):
        os.environ['FAKE_CLAUDE_LOGGED_IN'] = '0'
        control.batch('Electricians', 'Boston, MA', 1)
        with contextlib.ExitStack() as stack:
            for item in self.discovery():
                stack.enter_context(item)
            outcome = site_runner.cloud(self.ledger, budget_minutes=5, finder=discover)
        self.assertFalse(outcome['ok'])
        self.assertIn('auth login', outcome['problems'][0])
        self.assertEqual(self.searches, [])
        self.assertFalse(control.snapshot()['generator']['ready'])

    def test_verdicts_and_aliases_are_checked(self):
        self.assertFalse(discover.normalize({'qualifies': True, 'business_name': 'X', 'findings': ['only one']})['qualifies'])
        self.assertFalse(discover.normalize({'qualifies': True, 'business_name': '', 'findings': ['a', 'b']})['qualifies'])
        with self.assertRaises(ValueError):
            discover.normalize({'qualifies': 'yes'})
        verdict = discover.normalize({'qualifies': True, 'business_name': ' Bright  Spark ', 'findings': ['a', 'b'], 'phone': '617.555.0142', 'email': 'Office@BrightSpark.example'})
        self.assertEqual((verdict['business_name'], verdict['reason']), ('Bright Spark', 'a'))
        self.assertEqual(discover.aliases_for(verdict, 'US'), ['phone:+16175550142', 'email:office@brightspark.example'])
        self.assertEqual(discover.aliases_for({'phone': '+62 811 199 919', 'email': None}, 'US'), ['phone:+62811199919'])
        self.assertEqual(discover.aliases_for({'phone': '555-0142', 'email': 'not an email'}, 'US'), [])
        self.assertEqual(discover.aliases_for({'phone': '0812-3456-7890', 'email': None}, 'ID'), ['phone:+6281234567890'])
        self.assertTrue(discover.is_directory('www.yelp.com'.removeprefix('www.')) and discover.is_directory('m.facebook.com'))
        self.assertFalse(discover.is_directory('xfacebook.com'))
        # The same directories and marketplaces under other country endings.
        self.assertTrue(all(discover.is_directory(h) for h in ('shopee.co.id', 'yelp.co.uk', 'tripadvisor.co.id', 'tokopedia.com')))
        self.assertFalse(discover.is_directory('bengkelsepeda.co.id'))
        state = {'batches': [{'id': 'b2', 'status': 'queued', 'industry': 'Roofers', 'created_at': '2026-10-05T02:00:00+00:00'},
                             {'id': 'b1', 'status': 'queued', 'industry': 'Electricians', 'created_at': '2026-10-05T01:00:00+00:00'},
                             {'id': 'b3', 'status': 'running', 'industry': 'Plumbers', 'created_at': '2026-10-05T00:00:00+00:00'},
                             {'id': 'b4', 'status': 'queued', 'industry': 'Hand-picked websites', 'created_at': '2026-10-05T00:00:00+00:00'}]}
        self.assertEqual([b['id'] for b in discover.pending_batches(state)], ['b1', 'b2'])

    def test_a_long_build_keeps_its_worker_fresh_and_logs_stay_anonymous_on_github(self):
        touched = []
        ledger = self.ledger
        with patch.object(ledger, 'touch', side_effect=lambda job, worker: touched.append(job)):
            keepalive = site_runner.KeepAlive(ledger, 'site-abc', 'generator-1', every=0.05)
            with keepalive:
                time.sleep(0.3)
        self.assertGreaterEqual(len(touched), 2)
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true'}):
            self.assertEqual(site_runner.label({'id': 'site-abc', 'name': 'Bright Spark Electric'}), 'site-abc')
            ready, message = site_runner.claude_ready('claude')
            self.assertFalse(ready)
            self.assertIn('secret to the GitHub repository', message)


if __name__ == '__main__':
    unittest.main()
