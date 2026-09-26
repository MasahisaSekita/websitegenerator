import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from tools import scout_screen as screen


class ScreeningTests(unittest.TestCase):
    def evidence(self, html='', **data):
        return screen.page_evidence({'source_url': 'https://example.com/', 'data': {'html': html, **data}})

    def test_contact_form(self):
        page = self.evidence('''<form id="contact" action="/send" method="post">
          <label for="email">Your email</label><input id="email" name="email" type="email" required>
          <label>Message <textarea name="message" required></textarea></label>
          <input type="hidden" name="message_token"><button>Send message</button></form>
          <input form="contact" name="phone" type="tel"><a href="/contact">Contact</a>
          <a href="mailto:hi@example.com">Email</a><a href="tel:+123">Call</a>''')
        form = page['forms'][0]
        self.assertEqual(form['fields'][0]['labels'], ['Your email'])
        self.assertTrue(form['fields'][0]['required'])
        self.assertEqual(form['message_fields'], [1])
        self.assertEqual(len(form['fields']), 4)
        self.assertEqual(form['submit_controls'][0]['text'], 'Send message')
        self.assertEqual(page['contact_links'][0]['url'], 'https://example.com/contact')
        self.assertEqual(len(page['mailto_links']), 1)
        self.assertEqual(len(page['tel_links']), 1)

    def test_newsletter_not_message_form(self):
        page = self.evidence('<form><input type="email" name="email"><input type="hidden" name="message"><button>Subscribe</button></form>')
        self.assertFalse(page['forms'][0]['has_message_field_evidence'])
        self.assertTrue(page['review_needed'])

    def test_captcha_scripts_are_hints_only(self):
        page = self.evidence('<script src="https://www.google.com/recaptcha/api.js"></script><div class="grecaptcha-badge"></div>')
        self.assertEqual(len(page['captcha_integration_hints']), 2)
        self.assertEqual(page['visible_challenge_status'], 'unknown')
        self.assertNotIn('rejected', page)
        self.assertEqual(self.evidence()['visible_challenge_status'], 'unknown')

    def test_iframe_and_other_sources(self):
        page = self.evidence('<iframe src="/embed" title="Contact"></iframe>',
                             markdown='[Ask us](/contact-us) [Email](mailto:hey@example.com)',
                             links=['/request-quote'], rawHtml='<form><textarea name="details"><b>Unclosed')
        self.assertTrue(page['review_needed'])
        self.assertEqual(page['iframes'][0]['src'], 'https://example.com/embed')
        self.assertEqual(len(page['contact_links']), 2)
        self.assertTrue(page['forms'][0]['has_message_field_evidence'])
        self.assertTrue(any('Iframe' in r for r in page['review_reasons']))

    def fixture(self, root, **extra):
        (root / 'pages').mkdir(exist_ok=True)
        raw = json.dumps({'source_url': 'https://example.com/', 'data': {'html': '<form><textarea></textarea></form>'}, **extra}).encode()
        (root / 'pages/page.json').write_bytes(raw)
        manifest = {'version': 1, 'pages': [{'source_url': 'https://example.com/', 'file': 'pages/page.json', 'sha256': hashlib.sha256(raw).hexdigest()}]}
        path = root / 'scrape-manifest.json'
        path.write_text(json.dumps(manifest))
        return path, manifest

    def test_verified_report_deterministic_and_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            path, _ = self.fixture(Path(folder))
            first = screen.screen_manifest(path)
            self.assertEqual(first, screen.screen_manifest(path))
            self.assertEqual(screen.main(['--manifest', str(path)]), 0)
            self.assertEqual(first, json.loads(path.with_name('screening.json').read_text()))

    def test_manifest_traversal_and_hash_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path, manifest = self.fixture(Path(folder))
            for bad in ('../outside.json', '/tmp/outside.json', 'pages/../pages/page.json'):
                manifest['pages'][0]['file'] = bad
                path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, 'outside|traversal'):
                    screen.screen_manifest(path)
            manifest['pages'][0]['file'] = 'pages/page.json'
            manifest['pages'][0]['sha256'] = '0' * 64
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                screen.screen_manifest(path)
            self.assertFalse(path.with_name('screening.json').exists())

    def test_screenshot_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'screenshots').mkdir()
            shot = root / 'screenshots/page.png'
            shot.write_bytes(b'cached screenshot')
            path, _ = self.fixture(root, screenshot_file='screenshots/page.png', screenshot_sha256=hashlib.sha256(shot.read_bytes()).hexdigest())
            self.assertEqual(screen.screen_manifest(path)['pages'][0]['screenshot']['absolute_path'], str(shot.resolve()))
            shot.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'Screenshot hash mismatch'):
                screen.screen_manifest(path)
            path, _ = self.fixture(root, screenshot_file='../outside.png', screenshot_sha256='0' * 64)
            with self.assertRaisesRegex(ValueError, 'Screenshot outside'):
                screen.screen_manifest(path)

    def test_symlink_and_source_mismatch(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            root = Path(folder)
            path, manifest = self.fixture(root)
            cache = root / 'pages/page.json'
            dest = Path(outside) / 'page.json'
            dest.write_bytes(cache.read_bytes())
            cache.unlink()
            cache.symlink_to(dest)
            with self.assertRaisesRegex(ValueError, 'outside'):
                screen.screen_manifest(path)
            cache.unlink()
            path, manifest = self.fixture(root)
            manifest['pages'][0]['source_url'] = 'https://other.example/'
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'provenance'):
                screen.screen_manifest(path)


if __name__ == '__main__':
    unittest.main()
