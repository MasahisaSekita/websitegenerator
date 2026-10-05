import http.server
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import textwrap
import threading
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
                        patch.object(site_runner.html_site.site_assets, 'fetch', side_effect=fixtures.fake_fetch)]
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
            with patch.dict(os.environ, {'CLAUDE_CLI': '', 'APPDATA': appdata}), patch.object(site_runner.shutil, 'which', return_value=None), \
                    patch.object(site_runner.Path, 'home', return_value=Path(appdata) / 'home'):
                self.assertIn('2.1.286', site_runner.find_claude())


if __name__ == '__main__':
    unittest.main()
