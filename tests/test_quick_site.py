import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('quick_site',Path(__file__).parents[1]/'tools/quick_site.py')
quick=importlib.util.module_from_spec(spec);spec.loader.exec_module(quick)

class QuickSiteTests(unittest.TestCase):
    def test_isolation_escaping_and_no_build_per_business(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(quick.subprocess, 'run', side_effect=AssertionError('Unexpected build')):
            a=quick.create({'name':'O\'Brien & Sons </script><script>alert(1)</script>', 'phone':'+44 20 7946 0958'},folder)
            b=quick.create({'name':'Second Electrical','email':'contact@example.com'},folder)
            self.assertNotEqual(a['site'],b['site'])
            self.assertIn('&lt;/script&gt;', (Path(a['site'])/'index.html').read_text())
            payload=(Path(a['site'])/'business.js').read_text().removeprefix('window.WEBSITE_BUSINESS = ').removesuffix(';\n')
            self.assertEqual(json.loads(payload)['name'],a['business']['name'])
            self.assertNotIn('Second Electrical',(Path(a['site'])/'business.js').read_text())
            self.assertNotIn("O'Brien",(Path(b['site'])/'business.js').read_text())
            self.assertFalse((Path(a['site'])/'node_modules').exists())
            self.assertIn('noindex', (Path(a['site'])/'vercel.json').read_text())
    def test_invalid_input(self):
        for data in ({'name':'Business'}, {'name':'Business','phone':'javascript:alert(1)'}, {'name':'Business','email':'invalid'}, {'name':'Business','phone':'12345','template':'../outside'}):
            with self.assertRaises(ValueError): quick.validate(data)
    def test_theme_color_is_validated_and_saved(self):
        for color in ('red', '#fff', '#123456;bad', None):
            with self.assertRaisesRegex(ValueError, 'Theme color'):
                quick.validate({'name':'Test','phone':'123456789','theme_color':color})
        with tempfile.TemporaryDirectory() as folder:
            result=quick.create({'name':'Test','phone':'123456789','theme_color':'#7C3AED'},folder)
            self.assertEqual(result['business']['theme_color'],'#7c3aed')
            self.assertIn('#7c3aed',(Path(result['site'])/'business.js').read_text())

    def test_stale_template_requires_preparation(self):
        with patch.object(quick,'fingerprint',return_value='changed'):
            with self.assertRaisesRegex(ValueError,'preparation'):quick.create({'name':'Business','phone':'123456789'})

    def test_single_file_embeds_everything_and_keeps_details_inside_scripts(self):
        with tempfile.TemporaryDirectory() as folder:
            result=quick.create({'name':'O\'Brien & Sons </script><!-- x','phone':'+44 20 7946 0958','theme_color':'#0f766e'},folder)
            file=Path(result['file'])
            self.assertEqual(file.name,'o-brien-sons-script-x.html')
            self.assertEqual(file.parent.name,result['id'])
            page=file.read_text(encoding='utf-8')
            self.assertEqual(re.findall(r'(?:src|href)="/[^"]*"',page),[])
            self.assertIn('window.WEBSITE_SINGLE_FILE = true',page)
            self.assertIn('"/images/hero.jpg": "data:image/jpeg;base64,',page)
            self.assertNotIn('<link rel="stylesheet"',page)
            self.assertIn('<style>',page)
            self.assertEqual(len(re.findall(r'</script>',page)),2)
            self.assertNotIn('Sons </script>',page)
            self.assertIn('Sons <\\/script>\\x3C!-- x',page)
            self.assertIn('#0f766e',page)

    def test_bundle_refuses_a_build_that_cannot_run_from_one_file(self):
        with tempfile.TemporaryDirectory() as folder:
            site=Path(quick.create({'name':'Old Build','phone':'123456789'},folder)['site'])
            for script in (site/'assets').glob('*.js'): script.write_text('console.log(1)\n')
            with self.assertRaisesRegex(ValueError,'older template build'): quick.bundle(site,Path(folder)/'old.html')

if __name__=='__main__':unittest.main()
