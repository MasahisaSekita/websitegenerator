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
        self.assertEqual(saved['country'],'')  # no country: discovery.country applies
    def test_batch_country(self):
        made=control.batch('Bengkel sepeda','Jakarta',5,'targets',' id ')
        self.assertEqual(made['country'],'ID')
        saved=next(batch for batch in control.snapshot()['batches'] if batch['id']==made['id'])
        self.assertEqual((saved['country'],saved['mode']),('ID','targets'))
        self.assertIn('Bengkel sepeda in Jakarta (ID)',control.snapshot()['events'][0]['message'])
        for bad in ('Indonesia','I','12'):
            with self.assertRaises(ValueError): control.batch('Plumbers','Jakarta',5,'build',bad)
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
    def test_delivered_file_counts_as_a_finished_website(self):
        self.bid=control.batch('Plumbers','Files',1)['id']
        jid=self.add(); control.claim(self.bid,'worker')
        with self.assertRaises(ValueError): control.update(jid,'worker','delivered',fields={'qa_passed':True,'site_file':'x.html'})
        for stage in ['extracting','building','checking']: control.update(jid,'worker',stage)
        with self.assertRaisesRegex(ValueError,'site file'): control.update(jid,'worker','delivered',fields={'qa_passed':True})
        with self.assertRaisesRegex(ValueError,'site file'): control.update(jid,'worker','delivered',fields={'site_file':'runs/quick/a/a.html'})
        control.update(jid,'worker','delivered',fields={'qa_passed':True,'site_file':'runs/quick/business-0/business-0.html'},detail='Website file delivered')
        state=control.snapshot()
        saved=next(b for b in state['batches'] if b['id']==self.bid)
        self.assertEqual((saved['completed_count'],saved['active_count'],saved['remaining_count']),(1,0,0))
        self.assertEqual(state['workers'][0]['status'],'idle')
        self.assertEqual(state['jobs'][0]['data']['site_file'],'runs/quick/business-0/business-0.html')
        control.batch_status(self.bid,'complete')
        with self.assertRaises(ValueError): control.update(jid,'worker','skipped')
        with self.assertRaises(ValueError): self.add(1)
        control.cancel_batch(self.bid,'Stop')
        self.assertEqual(control.snapshot()['jobs'][0]['stage'],'delivered')
    def test_generate_request_is_answered_by_claiming_that_job(self):
        first=self.add(0); second=self.add(1)
        self.assertIn('requested_at',control.request(second,'owner@example.com'))
        self.assertTrue(control.request(second,'someone else')['already_requested'])
        pending=control.pending_requests({'host':'office-pc','ready':True,'note':'Ready','running':[],'secret':'dropped'})
        self.assertEqual([item['id'] for item in pending['requests']],[second])
        self.assertEqual(control.claim(None,'generator-1',second)['job']['id'],second)
        state=control.snapshot()
        job=next(j for j in state['jobs'] if j['id']==second)
        self.assertEqual(job['stage'],'reviewing'); self.assertNotIn('generate_requested_at',job['data'])
        self.assertEqual(next(j for j in state['jobs'] if j['id']==first)['stage'],'queued')
        self.assertEqual(control.pending_requests()['requests'],[])
        self.assertEqual(state['generator']['host'],'office-pc'); self.assertNotIn('secret',state['generator']); self.assertIn('seen_at',state['generator'])
        with self.assertRaisesRegex(ValueError,'waiting in the queue'): control.request(second)
        with self.assertRaisesRegex(ValueError,'queued, unassigned'): control.claim(None,'generator-2',second)
        with self.assertRaisesRegex(ValueError,'another batch'): control.claim('batch-other','generator-2',first)
        with self.assertRaisesRegex(ValueError,'batch or a job'): control.claim(None,'generator-2')
    def test_failed_generation_returns_to_the_queue_without_retrying(self):
        jid=self.add(); control.request(jid)
        control.claim(None,'generator-1',jid)
        control.recover(jid,'Website generation stopped: Claude Code is not signed in')
        state=control.snapshot(); job=state['jobs'][0]
        self.assertEqual((job['stage'],job['worker'],job['detail']),('queued',None,'Website generation stopped: Claude Code is not signed in'))
        self.assertEqual(control.pending_requests()['requests'],[])
        self.assertTrue(state['events'][0]['message'].startswith('Returned to the queue: Website generation stopped'))
    def test_targets_go_to_the_hand_picked_list_and_can_be_generated_at_once(self):
        result=control.add_target('  Bright   Spark Electric ','brightspark.example',generate=True,by='owner@example.com')
        state=control.snapshot()
        listed=next(b for b in state['batches'] if b['id']==result['batch_id'])
        self.assertEqual((listed['industry'],listed['mode'],listed['status'],listed['requested_count']),('Hand-picked websites','targets','running',100))
        job=next(j for j in state['jobs'] if j['id']==result['id'])
        self.assertEqual((job['name'],job['url'],job['data']['generate_requested_by']),('Bright Spark Electric','https://brightspark.example','owner@example.com'))
        self.assertEqual(control.add_target('Another','https://another.example')['batch_id'],result['batch_id'])
        with self.assertRaises(sqlite3.IntegrityError): control.add_target('Copy','https://www.brightspark.example/contact')
        with self.assertRaisesRegex(ValueError,'Business name'): control.add_target(' ','https://x.example')
    def test_targets_only_batch_keeps_its_mode(self):
        created=control.batch('Roofers','Denver, CO',3,'targets')
        self.assertEqual(created['mode'],'targets')
        modes={b['id']:b['mode'] for b in control.snapshot()['batches']}
        self.assertEqual((modes[created['id']],modes[self.bid]),('targets','build'))
        with self.assertRaisesRegex(ValueError,'build or targets'): control.batch('Roofers','Denver',3,'bogus')
        added=control.add_target('Peak Roofing','https://peak.example',created['id'],True,'the coordinator')
        self.assertEqual(added['batch_id'],created['id'])
    def test_jetai_and_generation_results_are_kept_on_delivery(self):
        jid=self.add(); control.claim(self.bid,'worker')
        for stage in ['extracting','building','checking']: control.update(jid,'worker',stage)
        control.update(jid,'worker','delivered',fields={'qa_passed':True,'site_file':'runs/x/x.html','jetai':{'prototype_id':'abc','status':'draft'},'generation':{'seconds':90}})
        self.assertEqual(control.snapshot()['jobs'][0]['data']['jetai']['prototype_id'],'abc')

if __name__=='__main__': unittest.main()
