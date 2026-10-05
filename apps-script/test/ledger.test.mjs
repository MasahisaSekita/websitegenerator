// Ledger behaviour of the Apps Script edition, run against the in-memory Apps Script services.
// The first block mirrors tests/test_control.py case for case; the rest covers what is specific
// to Google Sheets, the agent API and the dashboard endpoints.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { domainToASCII } from 'node:url';
import { createRuntime } from '../dev/gas.mjs';

const OWNER = 'owner@example.com';

function ledger(options) {
  const gas = createRuntime(options);
  gas.call('setup');
  return gas;
}

// Results cross the vm boundary; compare JSON copies, as google.script.run and doPost would deliver them.
const plain = value => JSON.parse(JSON.stringify(value));
const state = gas => gas.call('runCommand_', 'state', {});
const batch = (gas, industry = 'Plumbers', city = 'Boston', count) => gas.call('createBatch_', industry, city, count).id;
const add = (gas, bid, n = 0, aliases = []) => gas.call('addJob_', bid, `Business ${n}`, `https://business${n}.example`, aliases).id;
const update = (gas, jid, worker, stage, fields, detail = '') => gas.call('updateJob_', jid, worker, stage, detail, fields);
const edit = (gas, fn) => gas.call('writeLedger_', tx => fn(tx));

function ready(gas, bid) {
  const jid = add(gas, bid);
  gas.call('claimJob_', bid, 'worker');
  for (const stage of ['extracting', 'building', 'checking']) update(gas, jid, 'worker', stage);
  update(gas, jid, 'worker', 'deploying', {
    qa_passed: true,
    reason: 'The service menu overlaps the title on mobile',
    qualification: { findings: ['Overlapping menu', 'Unreadable small text'] },
    source_urls: ['https://business0.example'],
    screenshots: ['before.png'],
  });
  update(gas, jid, 'worker', 'ready', { preview_url: 'https://preview.example', preview_verified: true });
  return jid;
}

function setStage(gas, jid, stage) {
  edit(gas, tx => {
    const jobs = tx.table('jobs');
    jobs.update(jobs.find(job => job.id === jid), { stage });
  });
}

describe('ledger rules (parity with tests/test_control.py)', () => {
  test('domain and alias dedup across batches', () => {
    const gas = ledger();
    const bid = batch(gas);
    gas.call('addJob_', bid, 'A', 'https://www.EXAMPLE.com/contact', ['phone:+16175550123']);
    const other = batch(gas, 'Plumbers', 'Cambridge');
    assert.throws(() => gas.call('addJob_', other, 'A duplicate', 'http://example.com', []), /UNIQUE constraint failed/);
    assert.throws(() => gas.call('addJob_', other, 'Alternate name', 'https://other.example', ['phone:+16175550123']), /UNIQUE constraint failed/);
    assert.equal(state(gas).jobs.length, 1);
  });

  test('alias normalization', () => {
    const gas = ledger();
    const bid = batch(gas);
    gas.call('addJob_', bid, 'Original', 'https://example.com', []);
    assert.throws(() => gas.call('addJob_', bid, 'Alias', 'https://other.example', ['domain:WWW.EXAMPLE.COM']), /UNIQUE constraint failed/);
    assert.equal(gas.call('identity_', 'phone:+1 (617) 555-0123'), 'phone:+16175550123');
    assert.equal(gas.call('identity_', 'email:OFFICE@EXAMPLE.COM'), 'email:office@example.com');
  });

  test('old worker cannot affect a new assignment', () => {
    const gas = ledger();
    const bid = batch(gas);
    const first = add(gas, bid, 0), second = add(gas, bid, 1);
    gas.call('claimJob_', bid, 'worker');
    update(gas, first, 'worker', 'blocked');
    gas.call('claimJob_', bid, 'worker');
    assert.throws(() => update(gas, first, 'worker', null, null, 'Late update'), /does not own|no longer active/);
    const [worker] = state(gas).workers;
    assert.equal(worker.job_id, second);
    assert.equal(worker.status, 'running');
  });

  test('contact requires qualification', () => {
    const gas = ledger();
    const jid = ready(gas, batch(gas));
    update(gas, jid, 'worker', null, { qualification: {} });
    assert.throws(() => gas.call('contactBegin_', jid, 'worker', 'Hello', 'https://business0.example/contact'), /Two qualification findings/);
  });

  test('claims are unique and respect capacity', () => {
    const gas = ledger();
    const bid = batch(gas);
    const ids = new Set([0, 1, 2, 3, 4].map(n => add(gas, bid, n)));
    const claimed = [0, 1, 2, 3, 4].map(n => {
      try {
        return gas.call('claimJob_', bid, 'w' + n).job.id;
      } catch (error) {
        assert.match(error.message, /Worker capacity reached/);
        return null;
      }
    }).filter(Boolean);
    assert.equal(claimed.length, 3);
    assert.equal(new Set(claimed).size, 3);
    assert.ok(claimed.every(id => ids.has(id)));
  });

  test('ownership and QA gates', () => {
    const gas = ledger();
    const bid = batch(gas);
    const jid = add(gas, bid);
    gas.call('claimJob_', bid, 'worker');
    assert.throws(() => update(gas, jid, 'other', 'extracting'), /does not own/);
    assert.throws(() => update(gas, jid, 'worker', 'ready'), /Invalid stage transition/);
    for (const stage of ['extracting', 'building', 'checking']) update(gas, jid, 'worker', stage);
    assert.throws(() => update(gas, jid, 'worker', 'deploying'), /Passing QA evidence required/);
  });

  test('single contact attempt and uncertainty', () => {
    const gas = ledger();
    const jid = ready(gas, batch(gas));
    assert.throws(() => gas.call('contactBegin_', jid, 'worker', 'Hello', 'https://unrelated.example/contact'), /original or verified alias domain/);
    gas.call('contactBegin_', jid, 'worker', 'Hello', 'https://business0.example/contact');
    assert.throws(() => gas.call('contactBegin_', jid, 'worker', 'Hello again', 'https://business0.example/contact'));
    gas.call('contactFinish_', jid, 'worker', 'uncertain', 'Browser timed out after submit');
    assert.throws(() => update(gas, jid, 'worker', 'ready'));
    assert.throws(() => gas.call('contactBegin_', jid, 'worker', 'Retry', 'https://business0.example/contact'));
    assert.equal(state(gas).workers[0].status, 'idle');
  });

  test('batch limit and skipped replacement', () => {
    const gas = ledger();
    const bid = batch(gas);
    for (let n = 0; n < 5; n++) add(gas, bid, n);
    assert.throws(() => add(gas, bid, 6), /cover the target/);
    const job = gas.call('claimJob_', bid, 'worker').job.id;
    update(gas, job, 'worker', 'skipped', null, 'Modern site');
    add(gas, bid, 6);
    assert.equal(state(gas).jobs.length, 6);
  });

  test('custom batch count', () => {
    const gas = ledger();
    const custom = gas.call('createBatch_', 'Roofers', 'Denver', 12);
    assert.equal(custom.requested_count, 12);
    for (let n = 0; n < 12; n++) gas.call('addJob_', custom.id, `Roofer ${n}`, `https://roofer${n}.example`, []);
    assert.throws(() => gas.call('addJob_', custom.id, 'Too many', 'https://too-many.example', []), /cover the target/);
    const saved = state(gas).batches.find(item => item.id === custom.id);
    assert.equal(saved.requested_count, 12);
  });

  test('batch count validation', () => {
    const gas = ledger();
    for (const count of [0, 101, 2.5, true, '12']) {
      assert.throws(() => gas.call('createBatch_', 'Roofers', 'Denver', count), /whole number from 1 to 100/);
    }
  });

  test('manual outreach requires a verified site and preserves the unsent status', () => {
    const gas = ledger();
    const bid = batch(gas, 'Plumbers', 'Manual', 1);
    const jid = ready(gas, bid);
    assert.throws(() => update(gas, jid, 'worker', 'manual'), /manual-outreach/);
    assert.throws(() => gas.call('manualOutreach_', jid, 'other', 'No form', 'https://preview.example', '', ''), /does not own/);
    gas.call('manualOutreach_', jid, 'worker', 'No contact form', 'Proposal: https://preview.example', 'office@example.com', '+16175550123');
    const snapshot = state(gas);
    const [job] = snapshot.jobs;
    assert.equal(job.stage, 'manual');
    assert.equal(job.contact_status, 'manual_required');
    assert.equal(job.data.manual_outreach.email, 'office@example.com');
    assert.equal(snapshot.workers[0].status, 'idle');
    const saved = snapshot.batches.find(item => item.id === bid);
    assert.deepEqual([saved.manual_count, saved.completed_count, saved.active_count, saved.available_count], [1, 0, 0, 1]);
    assert.throws(() => gas.call('batchStatus_', bid, 'complete'));
    add(gas, bid, 1);
    assert.throws(() => gas.call('contactBegin_', jid, 'worker', 'Retry', 'https://business0.example'));
    gas.call('cancelBatch_', bid, 'Stop');
    assert.equal(state(gas).jobs.find(item => item.id === jid).stage, 'manual');
  });

  test('manual outreach rejects unbuilt or reserved jobs', () => {
    const gas = ledger();
    let bid = batch(gas);
    let jid = add(gas, bid);
    gas.call('claimJob_', bid, 'worker');
    assert.throws(() => gas.call('manualOutreach_', jid, 'worker', 'No form', 'Hello', '', ''), /ready, QA-passed/);
    update(gas, jid, 'worker', 'blocked');
    bid = batch(gas, 'Plumbers', 'Other', 1);
    edit(gas, tx => ['identities', 'jobs', 'workers'].forEach(name => tx.table(name).clear()));
    jid = ready(gas, bid);
    assert.throws(() => gas.call('manualOutreach_', jid, 'worker', 'No form', 'Missing preview URL', '', ''), /preview URL in the message/);
    gas.call('contactBegin_', jid, 'worker', 'https://preview.example', 'https://business0.example/contact');
    assert.throws(() => gas.call('manualOutreach_', jid, 'worker', 'CAPTCHA', 'https://preview.example', '', ''));
  });

  test('failed outcomes allow replacements without counting completion', () => {
    const gas = ledger();
    for (const outcome of ['skipped', 'blocked', 'uncertain']) {
      const bid = batch(gas, 'Plumbers', outcome, 1);
      const jid = gas.call('addJob_', bid, outcome, `https://${outcome}.example`, []).id;
      setStage(gas, jid, outcome);
      const saved = state(gas).batches.find(item => item.id === bid);
      assert.equal(saved.completed_count, 0, outcome);
      assert.equal(saved.remaining_count, 1, outcome);
      assert.equal(saved.available_count, 1, outcome);
      assert.throws(() => gas.call('batchStatus_', bid, 'complete'));
      gas.call('batchStatus_', bid, 'exhausted');
      gas.call('addJob_', bid, 'Replacement', `https://replacement-${outcome}.example`, []);
      const other = batch(gas, 'Plumbers', 'Other', 1);
      assert.throws(() => gas.call('addJob_', other, 'Duplicate', `https://${outcome}.example`, []), /UNIQUE constraint failed/);
    }
  });

  test('only finished outreach satisfies the target', () => {
    const gas = ledger();
    const bid = batch(gas, 'Plumbers', 'One', 1);
    const jid = ready(gas, bid);
    assert.throws(() => gas.call('batchStatus_', bid, 'complete'));
    assert.throws(() => add(gas, bid, 1), /cover the target/);
    gas.call('contactBegin_', jid, 'worker', 'Hello', 'https://business0.example/contact');
    gas.call('contactFinish_', jid, 'worker', 'submitted', 'Clicked submit once');
    const result = gas.call('batchStatus_', bid, 'complete');
    assert.equal(result.completed_count, 1);
    assert.equal(result.remaining_count, 0);
    assert.throws(() => add(gas, bid, 1), /cover the target/);
  });

  test('a mixed 50-site target counts only successes', () => {
    const gas = ledger();
    const bid = batch(gas, 'Electricians', 'Washington', 50);
    const stages = [].concat(Array(10).fill('complete'), Array(5).fill('sent'), Array(20).fill('skipped'), Array(10).fill('blocked'), Array(5).fill('uncertain'), Array(2).fill('ready'));
    edit(gas, tx => stages.forEach((stage, n) => tx.table('jobs').insert({
      id: `mixed${n}`, batch_id: bid, name: `Business ${n}`, url: `https://mixed${n}.example`, domain: `mixed${n}.example`, stage,
      detail: '', reason: '', preview_url: '', contact_status: 'not_sent', data: '{}', updated_at: gas.call('nowIso_'),
    })));
    const saved = state(gas).batches.find(item => item.id === bid);
    assert.deepEqual([saved.completed_count, saved.remaining_count, saved.active_count, saved.available_count], [15, 35, 2, 33]);
    assert.throws(() => gas.call('batchStatus_', bid, 'complete'));
    gas.call('addJob_', bid, 'Fresh', 'https://fresh.example', []);
  });

  test('a delivered website file counts as a finished website', () => {
    const gas = ledger();
    const bid = batch(gas, 'Plumbers', 'Files', 1);
    const jid = add(gas, bid);
    gas.call('claimJob_', bid, 'worker');
    assert.throws(() => update(gas, jid, 'worker', 'delivered', { qa_passed: true, site_file: 'x.html' }), /Invalid stage transition/);
    for (const stage of ['extracting', 'building', 'checking']) update(gas, jid, 'worker', stage);
    assert.throws(() => update(gas, jid, 'worker', 'delivered', { qa_passed: true }), /site file/);
    assert.throws(() => update(gas, jid, 'worker', 'delivered', { site_file: 'runs/quick/a/a.html' }), /site file/);
    update(gas, jid, 'worker', 'delivered', { qa_passed: true, site_file: 'runs/quick/business-0/business-0.html' }, 'Website file delivered');
    const snapshot = state(gas);
    const saved = snapshot.batches.find(item => item.id === bid);
    assert.deepEqual([saved.completed_count, saved.active_count, saved.remaining_count], [1, 0, 0]);
    assert.equal(snapshot.workers[0].status, 'idle');
    assert.equal(snapshot.jobs[0].data.site_file, 'runs/quick/business-0/business-0.html');
    gas.call('batchStatus_', bid, 'complete');
    assert.throws(() => update(gas, jid, 'worker', 'skipped'), /no longer active/);
    assert.throws(() => gas.call('recoverJob_', jid, 'Try again'), /cannot be automatically recovered/);
    gas.call('cancelBatch_', bid, 'Stop');
    assert.equal(state(gas).jobs[0].stage, 'delivered');
  });
});

describe('Google Sheets storage', () => {
  test('values that Sheets would convert are stored and read back literally', () => {
    const gas = ledger();
    const bid = batch(gas, '=HYPERLINK("x")', '007');
    const jid = gas.call('addJob_', bid, 'TRUE', 'https://literal.example', ['phone:+16175550123']).id;
    gas.call('claimJob_', bid, 'worker');
    update(gas, jid, 'worker', 'extracting', { reason: '+1 555 0100', contact_phone: '+16175550123' }, '2026-10-02');
    const snapshot = state(gas);
    const saved = snapshot.batches.find(item => item.id === bid);
    assert.equal(saved.industry, '=HYPERLINK("x")');
    assert.equal(saved.city, '007');
    const job = snapshot.jobs[0];
    assert.equal(job.name, 'TRUE');
    assert.equal(job.detail, '2026-10-02');
    assert.equal(job.reason, '+1 555 0100');
    assert.equal(job.data.contact_phone, '+16175550123');
    assert.match(job.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
    const identities = gas.spreadsheet.getSheetByName('Identities').records();
    assert.ok(identities.some(row => row.identity === 'phone:+16175550123'));
    assert.equal(typeof snapshot.batches[0].requested_count, 'number');
  });

  test('a leading "=", apostrophe or marker survives real Sheets formula handling', () => {
    const gas = ledger();
    const bid = batch(gas);
    const jid = gas.call('addJob_', bid, "'Tis the Season Electric", 'https://season.example', []).id;
    gas.call('claimJob_', bid, 'worker');
    update(gas, jid, 'worker', 'extracting', { reason: '=SUM(A1:A9)', failure: '\u2060already marked' }, '=1+1 sounds like a formula');
    const job = state(gas).jobs[0];
    assert.equal(job.name, "'Tis the Season Electric");
    assert.equal(job.reason, '=SUM(A1:A9)');
    assert.equal(job.detail, '=1+1 sounds like a formula');
    assert.equal(job.data.failure, '\u2060already marked');
    const [raw] = gas.spreadsheet.getSheetByName('Jobs').records();
    assert.equal(raw.reason, '\u2060=SUM(A1:A9)'); // stored as text behind the invisible marker, not as a formula
    assert.equal(state(gas).events[0].message, '=1+1 sounds like a formula');
  });

  test('setup stops before storing data when Sheets converts plain-text cells', () => {
    const gas = createRuntime();
    gas.spreadsheet.ignoresPlainText = true;
    assert.throws(() => gas.call('setup'), /altered plain-text test values \(\+16175550123, 2026-10-02T12:00:00\+00:00, TRUE, 007, 1e5\)/);
    assert.deepEqual(gas.spreadsheet.getSheets().map(sheet => sheet.getName()), ['Sheet1']);
    assert.ok(!gas.props.get('REVAMP_API_TOKEN'), 'no secrets are created when setup stops');
  });

  test('a failed check writes nothing', () => {
    const gas = ledger();
    const bid = batch(gas);
    const jid = add(gas, bid);
    gas.call('claimJob_', bid, 'worker');
    const before = JSON.stringify(gas.spreadsheet.getSheetByName('Jobs').records());
    const revision = gas.call('ledgerRevision_');
    assert.throws(() => update(gas, jid, 'worker', 'extracting', { failure: 'x'.repeat(60000) }), /too large for a Google Sheets cell/);
    assert.equal(JSON.stringify(gas.spreadsheet.getSheetByName('Jobs').records()), before);
    assert.equal(gas.call('ledgerRevision_'), revision);
    assert.equal(state(gas).jobs[0].stage, 'reviewing');
  });

  test('the revision changes only when something is written', () => {
    const gas = ledger();
    const start = gas.call('ledgerRevision_');
    state(gas);
    gas.call('claimJob_', 'batch-missing', 'worker'); // no queued job: nothing to write
    assert.equal(gas.call('ledgerRevision_'), start);
    batch(gas);
    assert.notEqual(gas.call('ledgerRevision_'), start);
  });

  test('the sheet grows past its initial rows and events stay in order', () => {
    const gas = ledger();
    edit(gas, tx => { for (let n = 0; n < 1100; n++) tx.event(null, 'Event ' + n); });
    edit(gas, tx => tx.event(null, 'x'.repeat(5000)));
    const sheet = gas.spreadsheet.getSheetByName('Events');
    assert.ok(sheet.getMaxRows() >= 1102);
    const events = state(gas).events;
    assert.equal(events.length, 200);
    assert.equal(events[0].id, 1101);
    assert.equal(Array.from(events[0].message).length, 4000);
    assert.equal(events[1].message, 'Event 1099');
    assert.equal(events[1].id, 1100);
    assert.equal(events[0].job_id, null);
  });

  test('clear-all keeps configuration', () => {
    const gas = ledger();
    gas.call('setCapacity_', 4);
    const jid = ready(gas, batch(gas));
    gas.call('contactBegin_', jid, 'worker', 'Hello', 'https://business0.example/contact');
    const result = gas.call('clearAll_', 'Fresh start');
    assert.equal(result.cleared.jobs, 1);
    assert.equal(result.cleared.submissions, 1);
    const snapshot = state(gas);
    assert.deepEqual([snapshot.batches.length, snapshot.jobs.length, snapshot.events.length, snapshot.workers.length], [0, 0, 0, 0]);
    assert.equal(snapshot.settings.max_workers, 4);
    add(gas, batch(gas), 0); // the identity is free again after a deliberate reset
  });

  test('domains normalize like control.py and reject non-public hosts', () => {
    const gas = ledger();
    assert.equal(gas.call('domain_', 'HTTPS://WWW.Example.COM./path?q=1'), 'example.com');
    assert.equal(gas.call('domain_', 'https://shop.example.co.uk:8443/'), 'shop.example.co.uk');
    assert.equal(gas.call('domain_', 'https://münchen-elektro.example/'), domainToASCII('münchen-elektro.example'));
    assert.equal(gas.call('domain_', 'https://bücher.example/'), domainToASCII('bücher.example'));
    for (const url of ['ftp://example.com', 'https://user:pass@example.com', 'https://localhost', 'https://printer.local', 'https://127.0.0.1', 'https://[::1]/', 'https://intranet', 'example.com', 'https://bad..example', 'https://exa mple.com']) {
      assert.throws(() => gas.call('domain_', url), /public/, url);
    }
  });
});

describe('agent API (doPost)', () => {
  const post = (gas, body) => JSON.parse(gas.call('doPost', { postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'application/json' } }).getContent());

  test('requires the API token', () => {
    const gas = ledger();
    const token = gas.props.get('REVAMP_API_TOKEN');
    assert.match(token, /^wg_[0-9a-f]{64}$/);
    assert.deepEqual(post(gas, { command: 'ping' }), { ok: false, error: 'Invalid agent API token', retryable: false });
    assert.equal(post(gas, { token: token.slice(0, -1) + 'x', command: 'ping' }).ok, false);
    const response = post(gas, { token, command: 'ping' });
    assert.equal(response.ok, true);
    assert.equal(response.result.pong, true);
  });

  test('runs ledger commands with control.py argument names', () => {
    const gas = ledger();
    const token = gas.props.get('REVAMP_API_TOKEN');
    const run = (command, args) => post(gas, { token, command, args });
    const created = run('batch', { industry: 'Electricians', city: 'Boston', count: 2 }).result;
    assert.equal(created.requested_count, 2);
    const job = run('add', { batch: created.id, name: 'Bright Spark', url: 'https://brightspark.example', alias: ['email:hi@brightspark.example'] }).result;
    const claim = run('claim', { batch: created.id, worker: 'builder-1' }).result;
    assert.equal(claim.job.id, job.id);
    assert.equal(claim.job.data, '{}');
    assert.deepEqual(run('update', { job: job.id, worker: 'builder-1', stage: 'extracting', detail: 'Qualified' }).result, { id: job.id, stage: 'extracting' });
    assert.equal(run('update', { job: job.id, worker: 'builder-1', stage: 'deploying' }).error, 'Invalid stage transition');
    assert.deepEqual(run('capacity', { count: 4 }).result, { max_workers: 4 });
    const snapshot = run('state', {}).result;
    assert.deepEqual(Object.keys(snapshot).sort(), ['batches', 'events', 'generator', 'jobs', 'revision', 'server_time', 'settings', 'workers']);
    assert.equal(snapshot.settings.max_workers, 4);
    assert.equal(snapshot.batches[0].active_count, 1);
    assert.match(run('nope', {}).error, /Unknown command/);
  });

  test('reports malformed requests and a busy lock as errors', () => {
    const gas = ledger();
    const token = gas.props.get('REVAMP_API_TOKEN');
    assert.match(post(gas, '{not json').error, /not valid JSON/);
    assert.match(JSON.parse(gas.call('doPost', {}).getContent()).error, /JSON body/);
    gas.state.lockAvailable = false;
    assert.deepEqual(post(gas, { token, command: 'batch', args: { industry: 'A', city: 'B' } }), { ok: false, error: 'The ledger is busy right now. Try again in a moment.', retryable: true });
  });
});

describe('dashboard endpoints', () => {
  test('anonymous visitors need the dashboard key', () => {
    const gas = ledger();
    const key = gas.props.get('REVAMP_DASHBOARD_KEY');
    assert.match(key, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    assert.throws(() => gas.as('', 'getState', null, ''), /ACCESS_DENIED: This dashboard is private/);
    assert.throws(() => gas.as('', 'getState', null, 'WRONG-KEY'), /ACCESS_DENIED: That dashboard key is not valid/);
    assert.throws(() => gas.as('', 'queueBatch', { industry: 'A', city: 'B', requested_count: 1 }, ''), /ACCESS_DENIED/);
    const snapshot = gas.as('', 'getState', null, ` ${key.toLowerCase()} `);
    assert.equal(snapshot.viewer.method, 'key');
    assert.match(snapshot.sheet_url, /^https:\/\/docs\.google\.com\/spreadsheets\//);
  });

  test('the owner and listed Google accounts are recognised without a key', () => {
    const gas = ledger();
    assert.equal(gas.as(OWNER, 'getState', null, '').viewer.method, 'google');
    assert.throws(() => gas.as('teammate@team.example', 'getState', null, ''), /ACCESS_DENIED/);
    gas.props.set('REVAMP_DASHBOARD_USERS', 'teammate@team.example, @partner.example');
    assert.equal(gas.as('teammate@team.example', 'getState', null, '').viewer.email, 'teammate@team.example');
    assert.equal(gas.as('anyone@partner.example', 'getState', null, '').viewer.method, 'google');
    assert.throws(() => gas.as('someone@else.example', 'getState', null, ''), /ACCESS_DENIED/);
  });

  test('polling with the current revision skips the sheets', () => {
    const gas = ledger();
    const first = gas.as(OWNER, 'getState', null, '');
    const [readsBefore, writesBefore] = [gas.spreadsheet.reads, gas.spreadsheet.writes];
    const quiet = plain(gas.as(OWNER, 'getState', first.revision, ''));
    assert.deepEqual([quiet.unchanged, quiet.revision, quiet.generator], [true, first.revision, null]);
    assert.deepEqual([gas.spreadsheet.reads, gas.spreadsheet.writes], [readsBefore, writesBefore]);
    gas.as(OWNER, 'queueBatch', { industry: 'Electricians', city: 'Boston, MA', requested_count: 5 }, '');
    const next = gas.as(OWNER, 'getState', first.revision, '');
    assert.notEqual(next.revision, first.revision);
    assert.equal(next.batches[0].city, 'Boston, MA');
  });

  test('cancelling from the dashboard needs a reason and records who did it', () => {
    const gas = ledger();
    const bid = batch(gas);
    add(gas, bid, 0);
    assert.throws(() => gas.as(OWNER, 'cancelBatchFromDashboard', bid, '  ', ''), /Say why/);
    const result = gas.as(OWNER, 'cancelBatchFromDashboard', bid, 'Wrong city', '');
    assert.deepEqual(plain(result), { id: bid, status: 'cancelled', stopped_jobs: 1 });
    const snapshot = state(gas);
    assert.equal(snapshot.jobs[0].stage, 'skipped');
    assert.match(snapshot.jobs[0].detail, /owner@example\.com: Wrong city\. No outreach submission was made\./);
  });

  test('manual outreach can be marked as sent and unmarked', () => {
    const gas = ledger();
    const bid = batch(gas, 'Plumbers', 'Manual', 1);
    const jid = ready(gas, bid);
    assert.throws(() => gas.as(OWNER, 'setManualSent', jid, true, ''), /Only manual-outreach jobs/);
    gas.call('manualOutreach_', jid, 'worker', 'No contact form', 'Proposal: https://preview.example', '', '');
    const marked = gas.as(OWNER, 'setManualSent', jid, true, '');
    assert.ok(marked.sent_at);
    let job = state(gas).jobs[0];
    assert.equal(job.data.manual_outreach.sent_by, OWNER);
    assert.equal(job.stage, 'manual');
    assert.equal(job.contact_status, 'manual_required');
    assert.equal(state(gas).batches[0].completed_count, 0);
    gas.as(OWNER, 'setManualSent', jid, false, '');
    job = state(gas).jobs[0];
    assert.equal(job.data.manual_outreach.sent_at, undefined);
    assert.equal(job.data.manual_outreach.message, 'Proposal: https://preview.example');
  });

  test('job activity includes history beyond the recent-events window', () => {
    const gas = ledger();
    const bid = batch(gas);
    const jid = add(gas, bid);
    edit(gas, tx => { for (let n = 0; n < 250; n++) tx.event(null, 'noise ' + n); });
    const activity = gas.as(OWNER, 'getJobActivity', jid, '');
    assert.equal(activity.length, 1);
    assert.equal(activity[0].message, 'Prospect registered; exclusive identity reserved.');
    assert.ok(!state(gas).events.some(event => event.job_id === jid));
  });
});

describe('security and setup', () => {
  test('google.script.run can reach only the intended functions', () => {
    const gas = ledger();
    assert.deepEqual(gas.publicFunctions().sort(), [
      'addTarget', 'cancelBatchFromDashboard', 'doGet', 'doPost', 'getJobActivity', 'getState', 'onEdit', 'onOpen',
      'queueBatch', 'requestWebsite', 'rotateApiToken', 'rotateDashboardKey', 'setManualSent', 'setup', 'showApiToken', 'showDashboardKey',
    ]);
  });

  test('owner tools refuse web-app visitors', () => {
    const gas = ledger();
    for (const name of ['setup', 'showApiToken', 'showDashboardKey', 'rotateApiToken', 'rotateDashboardKey']) {
      assert.throws(() => gas.as('', name), /Apps Script editor/, name);
      assert.throws(() => gas.as('teammate@team.example', name), /Apps Script editor/, name);
    }
    assert.ok(!gas.logs.some(line => line.includes(gas.props.get('REVAMP_API_TOKEN'))));
  });

  test('standalone setup creates a tidy ledger and is idempotent', () => {
    const gas = createRuntime({ bound: false });
    assert.throws(() => gas.as(OWNER, 'getState', null, ''), /not set up yet/);
    gas.call('setup');
    const spreadsheet = gas.spreadsheet;
    assert.equal(gas.props.get('LEDGER_SPREADSHEET_ID'), spreadsheet.getId());
    assert.deepEqual(spreadsheet.getSheets().map(sheet => sheet.getName()), ['Jobs', 'Batches', 'Events', 'Workers', 'Identities', 'Submissions', 'Config']);
    const jobs = spreadsheet.getSheetByName('Jobs');
    assert.equal(jobs.frozenRows, 1);
    assert.equal(jobs.protections[0].warningOnly, true);
    assert.deepEqual(spreadsheet.getSheetByName('Config').records(), [{ key: 'max_workers', value: '3' }]);
    const secrets = [gas.props.get('REVAMP_API_TOKEN'), gas.props.get('REVAMP_DASHBOARD_KEY')];
    batch(gas);
    gas.call('setup');
    assert.deepEqual([gas.props.get('REVAMP_API_TOKEN'), gas.props.get('REVAMP_DASHBOARD_KEY')], secrets);
    assert.equal(state(gas).batches.length, 1);
    assert.equal(spreadsheet.getSheetByName('Config').records().length, 1);
    assert.equal(jobs.protections.length, 1);
  });

  test('setup refuses a tab whose header was changed', () => {
    const gas = ledger();
    gas.spreadsheet.getSheetByName('Jobs').getRange(1, 2, 1, 1).setValues([['batch']]);
    assert.throws(() => gas.call('setup'), /header row should be/);
    assert.throws(() => state(gas), /header row should be/);
  });

  test('doGet serves the dashboard with its styles and script inlined', () => {
    const gas = ledger();
    const page = gas.call('doGet');
    assert.equal(page.title, 'Website Generator');
    assert.equal(page.meta.viewport, 'width=device-width, initial-scale=1');
    assert.doesNotMatch(page.getContent(), /<\?/);
    assert.match(page.getContent(), /<style>[\s\S]+<\/style>/);
    assert.match(page.getContent(), /google\.script\.run/);
  });
});

describe('import from the local SQLite ledger', () => {
  const tables = () => ({
    batches: [{ id: 'batch-1', industry: 'Electricians', city: 'Boston', status: 'running', created_at: '2026-09-30T10:00:00+00:00', requested_count: 5 }],
    jobs: [{ id: 'site-1', batch_id: 'batch-1', name: 'Bright Spark', url: 'https://brightspark.example', domain: 'brightspark.example', stage: 'complete', worker: null, detail: 'Submitted', reason: 'Tiny text', preview_url: 'https://brightspark.vercel.app', contact_status: 'submitted', data: '{"qa_passed": true}', updated_at: '2026-09-30T11:00:00+00:00' }],
    identities: [{ identity: 'domain:brightspark.example', job_id: 'site-1' }, { identity: 'phone:+16175550123', job_id: 'site-1' }],
    events: [{ id: 7, job_id: 'site-1', message: 'Second', created_at: '2026-09-30T10:05:00+00:00' }, { id: 3, job_id: null, message: 'First', created_at: '2026-09-30T10:00:00+00:00' }],
    workers: [{ id: 'builder-site-1', job_id: 'site-1', status: 'idle', updated_at: '2026-09-30T11:00:00+00:00' }],
    submissions: [{ job_id: 'site-1', message: 'Hey!', message_hash: 'abc', form_url: 'https://brightspark.example/contact', status: 'submitted', evidence: 'Clicked once', created_at: '2026-09-30T10:59:00+00:00' }],
    config: [{ key: 'max_workers', value: '4' }],
  });

  test('copies every table and keeps dedupe history', () => {
    const gas = ledger();
    const result = gas.call('importLedger_', tables(), 'data/revamp.sqlite3');
    assert.deepEqual(plain(result.imported), { batches: 1, jobs: 1, identities: 2, workers: 1, submissions: 1, config: 1, events: 2 });
    const snapshot = state(gas);
    assert.equal(snapshot.batches[0].completed_count, 1);
    assert.equal(snapshot.jobs[0].data.qa_passed, true);
    assert.equal(snapshot.settings.max_workers, 4);
    assert.deepEqual(snapshot.events.map(event => event.message), ['Imported the local ledger from data/revamp.sqlite3: 1 batches, 1 jobs, 2 identities.', 'Second', 'First']);
    const other = batch(gas);
    assert.throws(() => gas.call('addJob_', other, 'Same phone', 'https://new.example', ['phone:+16175550123']), /UNIQUE constraint failed/);
  });

  test('refuses to merge into a ledger that already has data', () => {
    const gas = ledger();
    batch(gas);
    assert.throws(() => gas.call('importLedger_', tables(), ''), /empty ledger/);
    assert.throws(() => ledger().call('importLedger_', { jobs: [{ bogus: 1 }] }, ''), /unknown columns/);
  });
});

describe('Generate buttons, target lists and the website generator', () => {
  test('a Generate request is answered by claiming that exact job', () => {
    const gas = ledger();
    const bid = batch(gas, 'Electricians', 'Boston', 5);
    const first = add(gas, bid, 0);
    const second = add(gas, bid, 1);
    assert.ok(gas.as(OWNER, 'requestWebsite', second, '').requested_at);
    assert.equal(plain(gas.as(OWNER, 'requestWebsite', second, '')).already_requested, true);
    const pending = gas.call('runCommand_', 'requests', { heartbeat: { host: 'office-pc', ready: true, note: 'Ready', running: [], secret: 'dropped' } });
    assert.deepEqual(plain(pending.requests.map(item => item.id)), [second]);
    assert.equal(gas.call('runCommand_', 'claim', { job: second, worker: 'generator-1' }).job.id, second);
    const snapshot = state(gas);
    const job = snapshot.jobs.find(item => item.id === second);
    assert.equal(job.stage, 'reviewing');
    assert.equal(job.data.generate_requested_at, undefined);
    assert.equal(snapshot.jobs.find(item => item.id === first).stage, 'queued');
    assert.equal(gas.call('runCommand_', 'requests', {}).requests.length, 0);
    assert.equal(snapshot.generator.host, 'office-pc');
    assert.equal(snapshot.generator.secret, undefined);
    assert.ok(snapshot.generator.seen_at);
    assert.throws(() => gas.as(OWNER, 'requestWebsite', second, ''), /waiting in the queue/);
    assert.throws(() => gas.call('runCommand_', 'claim', { job: second, worker: 'generator-2' }), /queued, unassigned/);
    assert.throws(() => gas.call('runCommand_', 'claim', { job: first, batch: 'batch-other', worker: 'generator-2' }), /another batch/);
    assert.throws(() => gas.call('runCommand_', 'claim', { worker: 'generator-2' }), /batch or a job/);
  });

  test('a failed generation returns the job to the queue without retrying it', () => {
    const gas = ledger();
    const jid = add(gas, batch(gas));
    gas.call('requestWebsite_', jid, OWNER);
    gas.call('claimJob_', null, 'generator-1', jid);
    gas.call('recoverJob_', jid, 'Website generation stopped: Claude Code is not signed in');
    const job = state(gas).jobs[0];
    assert.equal(job.stage, 'queued');
    assert.equal(job.detail, 'Website generation stopped: Claude Code is not signed in');
    assert.equal(gas.call('pendingRequests_', null).requests.length, 0);
    assert.match(state(gas).events[0].message, /^Returned to the queue: Website generation stopped/);
  });

  test('targets added from the dashboard go to the hand-picked list and can be generated at once', () => {
    const gas = ledger();
    const result = gas.as(OWNER, 'addTarget', { name: '  Bright   Spark Electric ', url: 'brightspark.example', generate: true }, '');
    const snapshot = state(gas);
    const list = snapshot.batches.find(item => item.id === result.batch_id);
    assert.deepEqual([list.industry, list.mode, list.status, list.requested_count], ['Hand-picked websites', 'targets', 'running', 100]);
    const job = snapshot.jobs[0];
    assert.deepEqual([job.name, job.url, job.data.generate_requested_by], ['Bright Spark Electric', 'https://brightspark.example', OWNER]);
    assert.equal(gas.as(OWNER, 'addTarget', { name: 'Another', url: 'https://another.example' }, '').batch_id, result.batch_id);
    assert.throws(() => gas.as(OWNER, 'addTarget', { name: 'Copy', url: 'https://www.brightspark.example/contact' }, ''), /UNIQUE constraint failed/);
    assert.throws(() => gas.as(OWNER, 'addTarget', { name: ' ', url: 'https://x.example' }, ''), /Business name is required/);
    assert.throws(() => gas.as('', 'addTarget', { name: 'Anon', url: 'https://anon.example' }, ''), /ACCESS_DENIED/);
    assert.throws(() => gas.as('', 'requestWebsite', job.id, ''), /ACCESS_DENIED/);
  });

  test('a targets-only batch keeps its mode and the agent API accepts the new commands', () => {
    const gas = ledger();
    const created = gas.as(OWNER, 'queueBatch', { industry: 'Roofers', city: 'Denver, CO', requested_count: 3, mode: 'targets' }, '');
    assert.equal(created.mode, 'targets');
    assert.equal(state(gas).batches[0].mode, 'targets');
    assert.equal(batch(gas, 'Roofers', 'Boulder'), state(gas).batches[1].id);
    assert.equal(state(gas).batches[1].mode, 'build');
    assert.throws(() => gas.call('createBatch_', 'Roofers', 'Denver', 3, 'bogus'), /build or targets/);
    const added = gas.call('runCommand_', 'add-target', { name: 'Peak Roofing', url: 'https://peak.example', batch: created.id, generate: true, by: 'the coordinator' });
    assert.equal(added.batch_id, created.id);
    assert.equal(state(gas).jobs[0].data.generate_requested_by, 'the coordinator');
    assert.equal(plain(gas.call('runCommand_', 'request', { job: added.id })).already_requested, true);
  });

  test('JetAI and generation results are accepted on delivery', () => {
    const gas = ledger();
    const bid = batch(gas);
    const jid = add(gas, bid);
    gas.call('claimJob_', bid, 'worker');
    for (const stage of ['extracting', 'building', 'checking']) update(gas, jid, 'worker', stage);
    update(gas, jid, 'worker', 'delivered', { qa_passed: true, site_file: 'runs/x/x.html', jetai: { prototype_id: 'abc', status: 'draft' }, generation: { seconds: 90 } });
    assert.equal(state(gas).jobs[0].data.jetai.prototype_id, 'abc');
    assert.equal(state(gas).batches[0].completed_count, 1);
  });

  test('unchanged dashboard polls still carry the generator heartbeat', () => {
    const gas = ledger();
    const first = gas.as(OWNER, 'getState', null, '');
    assert.equal(first.generator, null);
    gas.call('pendingRequests_', { host: 'laptop', ready: false, note: 'Claude Code is not signed in' });
    const again = gas.as(OWNER, 'getState', first.revision, '');
    assert.equal(again.unchanged, true);
    assert.equal(again.generator.note, 'Claude Code is not signed in');
  });
});
