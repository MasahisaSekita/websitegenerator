import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('site_assets', Path(__file__).resolve().parents[1] / 'tools/site_assets.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


class AssetTests(unittest.TestCase):
    def test_screening_saves_screenshot_and_reuses_paid_result(self):
        with tempfile.TemporaryDirectory() as folder:
            args = argparse.Namespace(url=['https://example.com/'], out=folder, max_pages=2, refresh=False, env_file=None, screen=True)
            result = {'success': True, 'data': {'html': '<form></form>', 'rawHtml': '<form></form>', 'screenshot': 'https://shots.example.com/test.png'}}
            png = b'\x89PNG\r\n\x1a\nscreenshot'
            with patch.object(a, 'public_target'), patch.object(a, 'api_key', return_value='test'), patch.object(a, 'fetch', side_effect=[(json.dumps(result).encode(), '', a.API), (png, 'image/png', result['data']['screenshot'])]) as http:
                manifest = a.scrape(args)
                a.scrape(args)
                self.assertEqual(http.call_count, 2)
                payload = json.loads(http.call_args_list[0].kwargs['body'])
                self.assertIn('rawHtml', payload['formats'])
                self.assertFalse(payload['skipTlsVerification'])
                self.assertNotIn('actions', payload)
                entry = json.loads(Path(manifest).read_text())['pages'][0]
                saved = json.loads((Path(folder) / entry['file']).read_text())
                self.assertEqual((Path(folder) / saved['screenshot_file']).read_bytes(), png)
                self.assertEqual(a.hashlib.sha256((Path(folder) / entry['file']).read_bytes()).hexdigest(), entry['sha256'])

    def test_screening_download_failure_does_not_repeat_paid_scrape(self):
        with tempfile.TemporaryDirectory() as folder:
            args = argparse.Namespace(url=['https://example.com/'], out=folder, max_pages=2, refresh=False, env_file=None, screen=True)
            result = {'success': True, 'data': {'screenshot': 'https://shots.example.com/test.png'}}
            with patch.object(a, 'public_target'), patch.object(a, 'api_key', return_value='test'), patch.object(a, 'fetch', side_effect=[(json.dumps(result).encode(), '', a.API), ValueError('HTTP status 503')]):
                with self.assertRaises(ValueError): a.scrape(args)
            with patch.object(a, 'fetch', return_value=(b'\x89PNG\r\n\x1a\nshot', '', 'https://shots.example.com/test.png')) as http:
                a.scrape(args)
                self.assertEqual(http.call_count, 1)
                self.assertNotIn('method', http.call_args.kwargs)

    def test_global_mcp_json_credentials(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'config.json'
            config.write_text(json.dumps({'mcpServers': {'firecrawl': {'env': {'FIRECRAWL_API_KEY': 'fake-test-credential'}}}}))
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(a.api_key(config), 'fake-test-credential')

    def test_credentials_removed_and_local_blocked(self):
        self.assertEqual(a.clean_url('https://u:p@example.com/a#b'), 'https://example.com/a')
        for address in ('127.0.0.1', '10.0.0.1', '::1', '169.254.169.254'):
            with patch.object(a.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', (address, 80))]):
                with self.assertRaises(ValueError):
                    a.public_target('http://example.com')

    def test_redirect_to_private_blocked(self):
        response = MagicMock(status=302)
        response.getheader.return_value = 'http://127.0.0.1/secret'
        connection = MagicMock()
        connection.getresponse.return_value = response
        def resolve(host, *args, **kwargs):
            return [(2, 1, 6, '', ('127.0.0.1' if host == '127.0.0.1' else '93.184.216.34', 80))]
        with patch.object(a.socket, 'getaddrinfo', side_effect=resolve), patch.object(a, 'PinnedHTTP', return_value=connection) as factory:
            with self.assertRaises(ValueError):
                a.fetch('http://example.com', limit=200)
            factory.assert_called_once_with('example.com', 80, '93.184.216.34')

    def test_response_limit_and_svg_rejection(self):
        response = MagicMock(status=200)
        response.getheader.return_value = '9999'
        connection = MagicMock()
        connection.getresponse.return_value = response
        with patch.object(a, 'public_target', return_value=('http://example.com/', '93.184.216.34', 80)), patch.object(a, 'PinnedHTTP', return_value=connection):
            with self.assertRaises(ValueError):
                a.fetch('http://example.com', limit=10)
        with self.assertRaises(ValueError):
            a.raster_extension(b'<svg><script>alert(1)</script></svg>')

    def test_cache_bounds_download_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            args = argparse.Namespace(url=['https://example.com/'], out=folder, max_pages=5, refresh=False, env_file=None)
            result = {'success': True, 'data': {'images': ['https://example.com/a.png'], 'markdown': 'Text'}}
            with patch.object(a, 'public_target'), patch.object(a, 'api_key', return_value='test-secret'), patch.object(a, 'fetch', return_value=(json.dumps(result).encode(), 'application/json', a.API)) as http:
                manifest = a.scrape(args)
                a.scrape(args)
                self.assertEqual(http.call_count, 1)
                payload = json.loads(http.call_args.kwargs['body'])
                self.assertFalse(payload['onlyMainContent'])
                self.assertEqual(payload['formats'], ['markdown', 'html', 'images', 'links'])
            data = b'\x89PNG\r\n\x1a\nexample'
            with patch.object(a, 'fetch', return_value=(data, 'image/png', 'https://example.com/a.png')):
                assets = a.download(argparse.Namespace(manifest=manifest, out=folder + '/assets', max_images=30, max_mb=8))
            entry = json.loads(Path(assets).read_text())['assets'][0]
            self.assertEqual(entry['sha256'], a.hashlib.sha256(data).hexdigest())
            self.assertEqual(entry['source_pages'], ['https://example.com/'])
            args.url = [f'https://example.com/{i}' for i in range(6)]
            with self.assertRaises(ValueError):
                a.scrape(args)

    def test_incremental_scrape_preserves_pages_and_caps_total(self):
        with tempfile.TemporaryDirectory() as folder:
            args = argparse.Namespace(url=['https://example.com/'], out=folder, max_pages=2, refresh=False, env_file=None)
            result = {'success': True, 'data': {'images': [], 'markdown': 'Text'}}
            with patch.object(a, 'public_target'), patch.object(a, 'api_key', return_value='test'), patch.object(a, 'fetch', return_value=(json.dumps(result).encode(), '', a.API)) as http:
                manifest = a.scrape(args)
                args.url = ['https://example.com/service']
                a.scrape(args)
                self.assertEqual(len(json.loads(Path(manifest).read_text())['pages']), 2)
                a.scrape(args)
                self.assertEqual(http.call_count, 2)
                args.url = ['https://example.com/third']
                with self.assertRaises(ValueError):
                    a.scrape(args)
                self.assertEqual(http.call_count, 2)
                args.url = ['https://example.com/']
                args.refresh = True
                a.scrape(args)
                self.assertEqual(http.call_count, 3)
                self.assertEqual(len(json.loads(Path(manifest).read_text())['pages']), 2)

    def test_download_reuses_url_cache_and_keeps_manifest_outside_public(self):
        with tempfile.TemporaryDirectory() as folder:
            evidence = Path(folder) / 'evidence'
            args = argparse.Namespace(url=['https://example.com/'], out=str(evidence), max_pages=5, refresh=False, env_file=None)
            result = {'success': True, 'data': {'images': ['https://example.com/a.png']}}
            with patch.object(a, 'public_target'), patch.object(a, 'api_key', return_value='test'), patch.object(a, 'fetch', return_value=(json.dumps(result).encode(), '', a.API)):
                manifest = a.scrape(args)
            public = Path(folder) / 'site/public/business'
            downloads = argparse.Namespace(manifest=manifest, out=str(public), max_images=30, max_mb=8, refresh=False, asset_manifest=None)
            with patch.object(a, 'fetch', return_value=(b'\x89PNG\r\n\x1a\nexample', 'image/png', 'https://example.com/a.png')) as http:
                asset_manifest = a.download(downloads)
                a.download(downloads)
                self.assertEqual(http.call_count, 1)
                self.assertEqual(Path(asset_manifest).parent, evidence.resolve())
                self.assertFalse((public / 'assets-manifest.json').exists())
                self.assertTrue(json.loads(Path(asset_manifest).read_text())['assets'][0]['reused'])
                downloads.refresh = True
                a.download(downloads)
                self.assertEqual(http.call_count, 2)
                downloads.asset_manifest = str(Path(folder) / 'private/custom.json')
                self.assertEqual(a.download(downloads), str(Path(downloads.asset_manifest).resolve()))

    def test_download_curated_keeps_industry_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            curated = folder / 'industry-images.json'
            curated.write_text(json.dumps({
                'query': 'commercial plumbing service',
                'assets': [{
                    'url': 'https://images.example.com/plumber.jpg',
                    'license': 'Unsplash License',
                    'attribution_url': 'https://unsplash.com/photos/example'
                }]
            }))
            args = argparse.Namespace(manifest=str(curated), out=str(folder / 'public/images/business'),
                                      max_images=12, max_mb=8, refresh=False, asset_manifest=None)
            with patch.object(a, 'fetch', return_value=(b'\x89PNG\r\n\x1a\nexample', 'image/png', 'https://images.example.com/plumber.jpg')):
                output = a.download_curated(args)
            entry = json.loads(Path(output).read_text())['assets'][0]
            self.assertEqual(entry['provenance']['query'], 'commercial plumbing service')
            self.assertEqual(entry['provenance']['license'], 'Unsplash License')
            self.assertTrue((folder / 'public/images/business' / entry['file']).is_file())

    def test_clone_preserves_source_and_rewrites(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'template'
            source.mkdir()
            (source / '.env').write_text('SECRET=do-not-copy')
            (source / 'linked').symlink_to(source / '.env')
            (source / 'scripts').mkdir()
            script = "const PORT = 4173\nawait new Promise((r) => server.listen(PORT, r))\nconst url = `http://localhost:${PORT}`"
            (source / 'scripts/prerender.mjs').write_text(script)
            rewrites = [{'source': '/x', 'destination': '/y'}]
            (source / 'vercel.json').write_text(json.dumps({'rewrites': rewrites}))
            dest = Path(folder) / 'copy'
            args = argparse.Namespace(template=str(source), out=str(dest))
            a.clone(args)
            self.assertFalse((dest / '.env').exists())
            self.assertFalse((dest / 'linked').exists())
            self.assertEqual((source / 'scripts/prerender.mjs').read_text(), script)
            self.assertIn('server.address().port', (dest / 'scripts/prerender.mjs').read_text())
            config = json.loads((dest / 'vercel.json').read_text())
            self.assertEqual(config['rewrites'], rewrites)
            self.assertIn('noindex', config['headers'][0]['headers'][0]['value'])
            with self.assertRaises(ValueError):
                a.clone(args)


if __name__ == '__main__':
    unittest.main()
