import contextlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('jetai', Path(__file__).parents[1] / 'tools/jetai.py')
jetai = importlib.util.module_from_spec(spec); spec.loader.exec_module(jetai)

KEY = 'sk_test_key_never_printed'


class FakeJetAI(http.server.BaseHTTPRequestHandler):
    """Prototypes endpoints as documented: Bearer auth, 409 on a taken name or slug, 404 for unknown ids."""
    def log_message(self, *args): pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def error(self, status, code, message):
        self.reply(status, {'success': False, 'error': {'code': code, 'message': message}})

    def handle_any(self, method):
        state = self.server.state
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length)) if length else None
        state['requests'].append({'method': method, 'path': self.path, 'auth': self.headers.get('Authorization'), 'body': body})
        if self.headers.get('Authorization') != 'Bearer ' + KEY:
            return self.error(401, 'INVALID_API_KEY', 'Invalid or missing API key')
        if state['fail']:
            return self.error(state['fail'].pop(0), 'SERVER', 'Temporary problem')
        prototypes = state['prototypes']
        if method == 'GET' and self.path.startswith('/api/v1/prototypes?'):
            return self.reply(200, {'success': True, 'data': {'items': [], 'pagination': {'total': len(prototypes)}}})
        if method == 'POST' and self.path == '/api/v1/prototypes':
            if any(p['name'] == body['name'] or p['slug'] == body.get('slug') for p in prototypes.values()):
                return self.error(409, 'CONFLICT', 'A prototype with this name already exists')
            pid = f'0000000{len(prototypes) + 1}-aaaa-bbbb-cccc-dddddddddddd'
            prototypes[pid] = {'id': pid, 'name': body['name'], 'slug': body.get('slug'), 'description': body.get('description'),
                               'language': body.get('language'), 'status': 'draft', 'html': body.get('html'),
                               'updatedAt': '2026-10-05T00:00:00Z', 'publishedAt': None, 'thumbnail': None, 'settings': {}}
            return self.reply(201, {'success': True, 'data': prototypes[pid]})
        match = re.fullmatch(r'/api/v1/prototypes/([\w-]+)(/publish)?', self.path)
        if match and match.group(1) not in prototypes:
            return self.error(404, 'NOT_FOUND', 'Prototype not found')
        if match and method == 'PATCH':
            prototypes[match.group(1)].update({k: v for k, v in body.items() if k in ('html', 'description')})
            return self.reply(200, {'success': True, 'data': prototypes[match.group(1)]})
        if match and match.group(2) and method == 'POST':
            prototypes[match.group(1)].update(status='published', publishedAt='2026-10-05T00:01:00Z')
            return self.reply(200, {'success': True, 'data': prototypes[match.group(1)]})
        if match and method == 'GET':
            return self.reply(200, {'success': True, 'data': prototypes[match.group(1)]})
        return self.error(404, 'NOT_FOUND', 'No route')

    def do_GET(self): self.handle_any('GET')
    def do_POST(self): self.handle_any('POST')
    def do_PATCH(self): self.handle_any('PATCH')


class JetAITests(unittest.TestCase):
    def setUp(self):
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), FakeJetAI)
        self.server.state = {'requests': [], 'prototypes': {}, 'fail': []}
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.env = patch.dict(os.environ, {'JETAI_API_BASE': f'http://127.0.0.1:{self.server.server_port}/api/v1', 'JETAI_API_KEY': KEY})
        self.env.start()
        self.no_sleep = patch.object(jetai.time, 'sleep')
        self.no_sleep.start()
        self.client = jetai.Client()

    def tearDown(self):
        self.no_sleep.stop()
        self.env.stop()
        self.server.shutdown()
        self.server.server_close()

    def test_upload_creates_a_draft_and_keeps_only_metadata(self):
        result = self.client.upload('<!doctype html><title>x</title>', 'Bright Spark Electric · website preview', 'bright-spark-abc123', 'Preview')
        self.assertEqual(result['status'], 'draft')
        self.assertEqual(result['slug'], 'bright-spark-abc123')
        self.assertNotIn('html', result)
        sent = self.server.state['requests'][-1]
        self.assertEqual((sent['method'], sent['auth']), ('POST', 'Bearer ' + KEY))
        self.assertEqual(sent['body']['language'], 'html')
        self.assertNotIn('siteId', sent['body'])

    def test_taken_names_get_a_numbered_variant(self):
        first = self.client.upload('<p>1</p>', 'Same Name', 'same-name')
        second = self.client.upload('<p>2</p>', 'Same Name', 'same-name')
        self.assertNotEqual(first['prototype_id'], second['prototype_id'])
        self.assertEqual((second['name'], second['slug']), ('Same Name (2)', 'same-name-2'))

    def test_existing_prototype_is_updated_in_place_and_a_deleted_one_is_recreated(self):
        first = self.client.upload('<p>v1</p>', 'Roxbury Electric', 'roxbury')
        again = self.client.upload('<p>v2</p>', 'Roxbury Electric', 'roxbury', prototype_id=first['prototype_id'])
        self.assertEqual(again['prototype_id'], first['prototype_id'])
        self.assertEqual(self.server.state['prototypes'][first['prototype_id']]['html'], '<p>v2</p>')
        self.assertEqual(self.server.state['requests'][-1]['method'], 'PATCH')
        recreated = self.client.upload('<p>v3</p>', 'Other Business', 'other', prototype_id='99999999-aaaa-bbbb-cccc-dddddddddddd')
        self.assertNotEqual(recreated['prototype_id'], '99999999-aaaa-bbbb-cccc-dddddddddddd')

    def test_publishing_happens_only_when_asked(self):
        draft = self.client.upload('<p>x</p>', 'Draft', 'draft')
        self.assertFalse(any(r['path'].endswith('/publish') for r in self.server.state['requests']))
        published = self.client.upload('<p>y</p>', 'Live', 'live', publish=True)
        self.assertEqual((draft['status'], published['status']), ('draft', 'published'))

    def test_errors_explain_the_problem_without_the_key(self):
        with self.assertRaises(jetai.JetAIError) as caught:
            jetai.Client(key='sk_wrong_key_value').list_prototypes()
        self.assertEqual(caught.exception.status, 401)
        self.assertIn('INVALID_API_KEY', str(caught.exception))
        self.assertNotIn('sk_wrong_key_value', str(caught.exception))
        self.server.state['fail'] = [429, 429]
        self.assertEqual(self.client.list_prototypes()['pagination']['total'], 0)  # rate limits are waited out
        with self.assertRaisesRegex(jetai.JetAIError, 'at most 5,000,000'):
            self.client.upload('x' * (jetai.MAX_HTML + 1), 'Too big')
        with self.assertRaisesRegex(jetai.JetAIError, 'Invalid prototype id'):
            self.client.get('../sites')

    def test_key_comes_from_the_env_file_and_insecure_addresses_are_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            env_file = Path(folder) / '.env'
            env_file.write_text('FIRECRAWL_API_KEY=x\nJETAI_API_KEY="' + KEY + '"\n', encoding='utf-8')
            with patch.dict(os.environ, {'JETAI_API_KEY': ''}), patch.object(jetai, 'settings', return_value={'env_file': str(env_file)}):
                self.assertEqual(jetai.Client().key, KEY)
            with patch.dict(os.environ, {'JETAI_API_KEY': ''}), patch.object(jetai, 'settings', return_value={'env_file': str(Path(folder) / 'none')}):
                with self.assertRaisesRegex(jetai.JetAIError, 'Set JETAI_API_KEY'):
                    jetai.Client()
        with self.assertRaisesRegex(jetai.JetAIError, 'https'):
            jetai.Client(base='http://jetai.example/api/v1')

    def test_cli_prints_results_but_never_the_key(self):
        with tempfile.TemporaryDirectory() as folder:
            page = Path(folder) / 'site.html'
            page.write_text('<!doctype html><title>Ünïcode café</title>', encoding='utf-8')
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(jetai.main(['ping']), 0)
                self.assertEqual(jetai.main(['upload', '--file', str(page), '--name', 'Café Ünïcode']), 0)
                self.assertEqual(jetai.main(['get', '--id', 'not/an/id']), 1)
        self.assertNotIn(KEY, out.getvalue() + err.getvalue())
        self.assertIn('"slug": "cafe-unicode"', out.getvalue())
        self.assertIn('Invalid prototype id', err.getvalue())


if __name__ == '__main__':
    unittest.main()
