import concurrent.futures
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('control',Path(__file__).parents[1]/'tools/control.py')
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.old=control.DB; control.DB=Path(self.tmp.name)/'test.db'
        self.bid=control.batch('Plumbers','Boston')['id']
    def tearDown(self):
        control.DB=self.old; self.tmp.cleanup()
    def add(self,n=0): return control.add(self.bid,f'Business {n}',f'https://business{n}.example')['id']
    def ready(self):
        jid=self.add(); control.claim(self.bid,'worker')
        for stage in ['extracting','building','checking']:
            control.update(jid,'worker',stage)
        control.update(jid,'worker','deploying',fields={'qa_passed':True,'reason':'The service menu overlaps the title on mobile','qualification':{'findings':['Overlapping menu','Unreadable small text']},'source_urls':['https://business0.example'],'screenshots':['before.png']})
        control.update(jid,'worker','ready',fields={'preview_url':'https://preview.example','preview_verified':True})
        return jid
    def test_domain_and_alias_dedup_across_batches(self):
        control.add(self.bid,'A','https://www.EXAMPLE.com/contact', ['phone:+16175550123'])
        other=control.batch('Plumbers','Cambridge')['id']
        with self.assertRaises(sqlite3.IntegrityError): control.add(other,'A duplicate','http://example.com')
        with self.assertRaises(sqlite3.IntegrityError): control.add(other,'Alternate name','https://other.example',['phone:+16175550123'])
        self.assertEqual(len(control.snapshot()['jobs']),1)
    def test_alias_normalization(self):
        control.add(self.bid,'Original','https://example.com')
        with self.assertRaises(sqlite3.IntegrityError): control.add(self.bid,'Alias','https://other.example',['domain:WWW.EXAMPLE.COM'])
        self.assertEqual(control.identity('phone:+1 (617) 555-0123'), 'phone:+16175550123')
        self.assertEqual(control.identity('email:OFFICE@EXAMPLE.COM'), 'email:office@example.com')
    def test_old_worker_cannot_affect_new_assignment(self):
        first=self.add(0); second=self.add(1)
        control.claim(self.bid,'worker'); control.update(first,'worker','blocked')
        control.claim(self.bid,'worker')
        with self.assertRaises(ValueError): control.update(first,'worker',detail='Late update')
        worker=control.snapshot()['workers'][0]
        self.assertEqual(worker['job_id'],second); self.assertEqual(worker['status'],'running')
    def test_contact_requires_qualification(self):
        jid=self.ready()
        control.update(jid,'worker',fields={'qualification':{}})
        with self.assertRaises(ValueError): control.contact_begin(jid,'worker','Hello','https://business0.example/contact')
    def test_parallel_claims_unique_and_capacity(self):
        ids={self.add(n) for n in range(5)}
        def claim(i):
            try: return control.claim(self.bid,'w'+str(i))['job']['id']
            except ValueError: return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: claimed=list(pool.map(claim,range(5)))
        nonempty=[c for c in claimed if c]
        self.assertEqual(len(nonempty),3); self.assertEqual(len(set(nonempty)),3); self.assertTrue(set(nonempty)<=ids)
    def test_ownership_and_qa(self):
        jid=self.add(); control.claim(self.bid,'worker')
        with self.assertRaises(ValueError): control.update(jid,'other','extracting')
        with self.assertRaises(ValueError): control.update(jid,'worker','ready')
        for s in ['extracting','building','checking']: control.update(jid,'worker',s)
        with self.assertRaises(ValueError): control.update(jid,'worker','deploying')
    def test_single_contact_attempt_and_uncertainty(self):
        jid=self.ready()
        with self.assertRaises(ValueError): control.contact_begin(jid,'worker','Hello','https://unrelated.example/contact')
        control.contact_begin(jid,'worker','Hello','https://business0.example/contact')
        with self.assertRaises(ValueError): control.contact_begin(jid,'worker','Hello again','https://business0.example/contact')
        control.contact_finish(jid,'worker','uncertain','Browser timed out after submit')
        with self.assertRaises(ValueError): control.update(jid,'worker','ready')
        with self.assertRaises(ValueError): control.contact_begin(jid,'worker','Retry','https://business0.example/contact')
        self.assertEqual(control.snapshot()['workers'][0]['status'],'idle')
    def test_batch_limit_and_skipped_replacement(self):
        for n in range(5): self.add(n)
        with self.assertRaises(ValueError): self.add(6)
        j=control.claim(self.bid,'worker')['job']['id']; control.update(j,'worker','skipped',detail='Modern site')
        self.add(6)
        self.assertEqual(len(control.snapshot()['jobs']),6)
    def test_custom_batch_count(self):
        custom=control.batch('Roofers','Denver',12)
        self.assertEqual(custom['requested_count'],12)
        for n in range(12): control.add(custom['id'],f'Roofer {n}',f'https://roofer{n}.example')
        with self.assertRaises(ValueError): control.add(custom['id'],'Too many','https://too-many.example')
        saved=next(batch for batch in control.snapshot()['batches'] if batch['id']==custom['id'])
        self.assertEqual(saved['requested_count'],12)
    def test_batch_count_validation(self):
        for count in (0,101,2.5,True,'12'):
            with self.assertRaises(ValueError): control.batch('Roofers','Denver',count)
    def test_manual_requires_verified_site_and_preserves_unsent_status(self):
        self.bid=control.batch('Plumbers','Manual',1)['id']
        jid=self.ready()
        with self.assertRaises(ValueError): control.update(jid,'worker','manual')
        with self.assertRaises(ValueError): control.manual_outreach(jid,'other','No form','https://preview.example')
        control.manual_outreach(jid,'worker','No contact form','Proposal: https://preview.example','office@example.com','+16175550123')
        state=control.snapshot(); job=state['jobs'][0]
        self.assertEqual(job['stage'],'manual')
        self.assertEqual(job['contact_status'],'manual_required')
        self.assertEqual(job['data']['manual_outreach']['email'],'office@example.com')
        self.assertEqual(state['workers'][0]['status'],'idle')
        batch=next(b for b in state['batches'] if b['id']==self.bid)
        self.assertEqual((batch['manual_count'],batch['completed_count'],batch['active_count'],batch['available_count']),(1,0,0,1))
        with self.assertRaises(ValueError): control.batch_status(self.bid,'complete')
        self.add(1)
        with self.assertRaises(ValueError): control.contact_begin(jid,'worker','Retry','https://business0.example')
        control.cancel_batch(self.bid,'Stop')
        self.assertEqual(next(j for j in control.snapshot()['jobs'] if j['id']==jid)['stage'],'manual')
    def test_manual_rejects_unbuilt_or_reserved_jobs(self):
        jid=self.add(); control.claim(self.bid,'worker')
        with self.assertRaises(ValueError): control.manual_outreach(jid,'worker','No form','Hello')
        control.update(jid,'worker','blocked')
        self.bid=control.batch('Plumbers','Other',1)['id']
        # Use a new identity for the complete production fixture.
        with control.connect() as c:
            c.execute('DELETE FROM identities'); c.execute('DELETE FROM jobs'); c.execute('DELETE FROM workers')
        jid=self.ready()
        with self.assertRaises(ValueError): control.manual_outreach(jid,'worker','No form','Missing preview URL')
        control.contact_begin(jid,'worker','https://preview.example','https://business0.example/contact')
        with self.assertRaises(ValueError): control.manual_outreach(jid,'worker','CAPTCHA','https://preview.example')
    def test_failed_outcomes_allow_replacements_without_counting_completion(self):
        for outcome in ('skipped', 'blocked', 'uncertain'):
            with self.subTest(outcome=outcome):
                self.bid=control.batch('Plumbers',outcome,1)['id']
                jid=control.add(self.bid,outcome,f'https://{outcome}.example')['id']
                with control.connect() as c:
                    c.execute('UPDATE jobs SET stage=? WHERE id=?',(outcome,jid))
                saved=next(b for b in control.snapshot()['batches'] if b['id']==self.bid)
                self.assertEqual(saved['completed_count'],0)
                self.assertEqual(saved['remaining_count'],1)
                self.assertEqual(saved['available_count'],1)
                with self.assertRaises(ValueError): control.batch_status(self.bid,'complete')
                control.batch_status(self.bid,'exhausted')
                control.add(self.bid,'Replacement',f'https://replacement-{outcome}.example')
                with self.assertRaises(sqlite3.IntegrityError):
                    other=control.batch('Plumbers','Other',1)['id']
                    control.add(other,'Duplicate',f'https://{outcome}.example')
    def test_only_finished_outreach_satisfies_target(self):
        self.bid=control.batch('Plumbers','One',1)['id']
        jid=self.ready()
        with self.assertRaises(ValueError): control.batch_status(self.bid,'complete')
        with self.assertRaises(ValueError): self.add(1)
        control.contact_begin(jid,'worker','Hello','https://business0.example/contact')
        control.contact_finish(jid,'worker','submitted','Clicked submit once')
        result=control.batch_status(self.bid,'complete')
        self.assertEqual(result['completed_count'],1)
        self.assertEqual(result['remaining_count'],0)
        with self.assertRaises(ValueError): self.add(1)
    def test_mixed_fifty_target_counts_only_successes(self):
        self.bid=control.batch('Electricians','Washington',50)['id']
        with control.connect() as c:
            for n,stage in enumerate(['complete']*10+['sent']*5+['skipped']*20+['blocked']*10+['uncertain']*5+['ready']*2):
                c.execute('INSERT INTO jobs(id,batch_id,name,url,domain,stage,updated_at) VALUES(?,?,?,?,?,?,?)',
                          (f'mixed{n}',self.bid,f'Business {n}',f'https://mixed{n}.example',f'mixed{n}.example',stage,control.now()))
        saved=next(b for b in control.snapshot()['batches'] if b['id']==self.bid)
        self.assertEqual((saved['completed_count'],saved['remaining_count'],saved['active_count'],saved['available_count']),(15,35,2,33))
        with self.assertRaises(ValueError): control.batch_status(self.bid,'complete')
        control.add(self.bid,'Fresh','https://fresh.example')

if __name__=='__main__': unittest.main()
