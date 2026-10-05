import contextlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sheets_ledger', Path(__file__).parents[1] / 'tools/sheets_ledger.py')
sheets = importlib.util.module_from_spec(spec); spec.loader.exec_module(sheets)
spec = importlib.util.spec_from_file_location('control', Path(__file__).parents[1] / 'tools/control.py')
control = importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

TOKEN = 'wg_test_token_never_printed'


class FakeAppsScript(http.server.BaseHTTPRequestHandler):
    """Answers like a deployed web app: POST /exec -> 302 -> GET returns the JSON (or a page)."""
    def log_message(self, *args): pass

    def do_POST(self):
        state = self.server.state
        state['requests'].append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        if state['drop']:
            state['drop'] -= 1
            self.close_connection = True
            return  # no response at all, like a dropped connection
        self.send_response(302)
        self.send_header('Location', '/echo?user_content_key=abc')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        replies = self.server.state['replies']
        reply = replies.pop(0) if replies else {'ok': True, 'result': {'echo': True}}
        body = reply.encode() if isinstance(reply, str) else json.dumps(reply).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html' if isinstance(reply, str) else 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class SheetsLedgerTests(unittest.TestCase):
    def setUp(self):
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), FakeAppsScript)
        self.server.state = {'requests': [], 'replies': [], 'drop': 0}
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'REVAMP_SHEETS_URL': f'http://127.0.0.1:{self.server.server_port}/exec', 'REVAMP_SHEETS_TOKEN': TOKEN})
        self.env.start()
        self.no_env_file = patch.object(sheets, 'ENV_FILE', Path(self.tmp.name) / 'missing.env')
        self.no_env_file.start()
        self.no_sleep = patch.object(sheets.time, 'sleep')
        self.no_sleep.start()

    def tearDown(self):
        for patcher in (self.no_sleep, self.no_env_file, self.env):
            patcher.stop()
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = sheets.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    @property
    def requests(self):
        return self.server.state['requests']

    def test_commands_use_control_py_arguments(self):
        self.server.state['replies'] = [{'ok': True, 'result': {'job': {'id': 'site-1'}}}]
        code, out, _ = self.cli('claim', '--batch', 'batch-1', '--worker', 'builder-1')
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {'job': {'id': 'site-1'}})
        self.assertEqual(self.requests[-1], {'token': TOKEN, 'command': 'claim', 'args': {'batch': 'batch-1', 'worker': 'builder-1'}})
        self.cli('add', '--batch', 'batch-1', '--name', 'Bright Spark', '--url', 'https://brightspark.example', '--alias', 'phone:+16175550123', '--alias', 'email:hi@brightspark.example')
        self.assertEqual(self.requests[-1]['args']['alias'], ['phone:+16175550123', 'email:hi@brightspark.example'])
        self.cli('batch', '--industry', 'Electricians', '--city', 'Delaware, USA', '--count', '20')
        self.assertEqual(self.requests[-1]['args'], {'industry': 'Electricians', 'city': 'Delaware, USA', 'count': 20})
        self.cli('batch', '--industry', 'Bengkel sepeda', '--city', 'Jakarta', '--country', 'ID')
        self.assertEqual(self.requests[-1]['args'], {'industry': 'Bengkel sepeda', 'city': 'Jakarta', 'count': 5, 'country': 'ID'})
        self.cli('update', '--job', 'site-1', '--worker', 'w', '--stage', 'delivered')
        self.assertEqual(self.requests[-1]['args']['stage'], 'delivered')
        self.cli('capacity', '4')
        self.assertEqual(self.requests[-1], {'token': TOKEN, 'command': 'capacity', 'args': {'count': 4}})

    def test_files_are_read_like_control_py_and_survive_windows_encodings(self):
        fields = Path(self.tmp.name) / 'fields.json'
        fields.write_bytes('﻿{"reason": "Tiny menu", "qualification": {"findings": ["a", "b"]}}'.encode('utf-8'))
        message = Path(self.tmp.name) / 'outreach.txt'
        message.write_text('Hey!\nCafé preview: https://x.vercel.app\n', encoding='utf-16')
        self.cli('update', '--job', 'site-1', '--worker', 'w', '--stage', 'extracting', '--fields', str(fields), '--detail', 'Qualified')
        self.assertEqual(self.requests[-1]['args'], {'job': 'site-1', 'worker': 'w', 'stage': 'extracting', 'detail': 'Qualified', 'fields': {'reason': 'Tiny menu', 'qualification': {'findings': ['a', 'b']}}})
        self.cli('contact-begin', '--job', 'site-1', '--worker', 'w', '--message-file', str(message), '--form-url', 'https://x.example/contact')
        self.assertEqual(self.requests[-1]['args']['message'], 'Hey!\nCafé preview: https://x.vercel.app\n')
        self.cli('manual-outreach', '--job', 'site-1', '--worker', 'w', '--reason', 'No form', '--message-file', str(message), '--phone', '+16175550123')
        self.assertEqual(self.requests[-1]['args']['email'], '')
        self.assertEqual(self.requests[-1]['args']['phone'], '+16175550123')

    def test_ledger_errors_exit_nonzero_without_leaking_the_token(self):
        self.server.state['replies'] = [{'ok': False, 'error': 'Worker capacity reached', 'retryable': False}]
        code, out, err = self.cli('claim', '--batch', 'b', '--worker', 'w')
        self.assertEqual(code, 1)
        self.assertEqual(out, '')
        self.assertEqual(json.loads(err), {'error': 'Worker capacity reached'})
        self.assertEqual(len(self.requests), 1)
        self.assertNotIn(TOKEN, out + err)

    def test_busy_ledger_is_retried_for_any_command(self):
        self.server.state['replies'] = [{'ok': False, 'error': 'The ledger is busy', 'retryable': True}, {'ok': True, 'result': {'id': 'batch-1'}}]
        code, out, _ = self.cli('batch', '--industry', 'Roofers', '--city', 'Denver')
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {'id': 'batch-1'})
        self.assertEqual(len(self.requests), 2)

    def test_dropped_connections_retry_reads_but_never_writes(self):
        self.server.state['drop'] = 1
        code, out, _ = self.cli('state')
        self.assertEqual((code, len(self.requests)), (0, 2))
        self.server.state['drop'] = 1
        code, _, err = self.cli('contact-begin', '--job', 'j', '--worker', 'w', '--message-file', __file__, '--form-url', 'https://x.example')
        self.assertEqual(code, 1)
        self.assertEqual(len(self.requests), 3)
        self.assertIn('may or may not have been applied', json.loads(err)['error'])

    def test_sign_in_page_explains_the_deployment_setting(self):
        self.server.state['replies'] = ['<!doctype html><title>Sign in - Google Accounts</title>']
        code, _, err = self.cli('ping')
        self.assertEqual(code, 1)
        self.assertIn('Who has access: Anyone', json.loads(err)['error'])

    def test_configuration_comes_from_the_env_file_and_requires_https(self):
        with patch.dict(os.environ, {'REVAMP_SHEETS_URL': '', 'REVAMP_SHEETS_TOKEN': ''}):
            code, _, err = self.cli('ping')
            self.assertEqual(code, 1)
            self.assertIn('REVAMP_SHEETS_URL', json.loads(err)['error'])
            env_file = Path(self.tmp.name) / '.env'
            env_file.write_text(f'# comment\nFIRECRAWL_API_KEY=x\nREVAMP_SHEETS_URL="http://127.0.0.1:{self.server.server_port}/exec"\nREVAMP_SHEETS_TOKEN=\'{TOKEN}\'\n', encoding='utf-8')
            with patch.object(sheets, 'ENV_FILE', env_file):
                self.assertEqual(self.cli('ping')[0], 0)
                self.assertEqual(self.requests[-1]['token'], TOKEN)
        with patch.dict(os.environ, {'REVAMP_SHEETS_URL': 'http://script.google.com/macros/s/x/exec'}):
            code, _, err = self.cli('ping')
            self.assertEqual(code, 1)
            self.assertIn('https://', json.loads(err)['error'])

    def test_migrate_sends_every_local_table(self):
        db = Path(self.tmp.name) / 'local.sqlite3'
        with patch.object(control, 'DB', db):
            bid = control.batch('Electricians', 'Boston', 2)['id']
            jid = control.add(bid, 'Bright Spark', 'https://brightspark.example', ['phone:+16175550123'])['id']
            control.claim(bid, 'builder-1')
        self.server.state['replies'] = [{'ok': True, 'result': {'imported': {'jobs': 1}}}]
        code, out, _ = self.cli('migrate', '--db', str(db))
        self.assertEqual(code, 0)
        sent = self.requests[-1]
        self.assertEqual(sent['command'], 'import')
        tables = sent['args']['tables']
        self.assertEqual(sorted(tables), sorted(sheets.TABLES))
        self.assertEqual(tables['batches'][0]['requested_count'], 2)
        self.assertEqual(tables['jobs'][0]['id'], jid)
        self.assertEqual(sorted(row['identity'] for row in tables['identities']), ['domain:brightspark.example', 'phone:+16175550123'])
        self.assertEqual([event['message'] for event in tables['events']][-1], 'builder-1 claimed this business.')
        self.assertEqual(tables['config'], [{'key': 'max_workers', 'value': '3'}])
        code, _, err = self.cli('migrate', '--db', str(Path(self.tmp.name) / 'nope.sqlite3'))
        self.assertEqual(code, 1)
        self.assertIn('No local ledger', json.loads(err)['error'])


if __name__ == '__main__':
    unittest.main()
