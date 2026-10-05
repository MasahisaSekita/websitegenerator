/**
 * Ledger rules for the Website Generator — a port of tools/control.py.
 *
 * Same stages, transitions, identity deduplication, worker capacity, evidence gates
 * and single-submission reservations; Store.gs provides the Google Sheets storage.
 * Every name here ends in "_" so google.script.run cannot call it directly: the
 * dashboard reaches the ledger only through the access-checked endpoints in Code.gs.
 */

const STAGES_ = ['queued', 'reviewing', 'extracting', 'building', 'checking', 'deploying', 'ready', 'contacting', 'complete', 'sent', 'uncertain', 'blocked', 'skipped', 'manual', 'delivered'];
const NEXT_STAGES_ = { queued: ['reviewing'], reviewing: ['extracting'], extracting: ['building'], building: ['checking'], checking: ['building', 'deploying', 'delivered'], deploying: ['checking', 'ready'], ready: ['contacting'], contacting: ['complete', 'sent', 'uncertain', 'blocked'] };
const TERMINAL_STAGES_ = ['complete', 'sent', 'uncertain', 'blocked', 'skipped', 'manual', 'delivered'];
const SUCCESS_STAGES_ = ['complete', 'sent', 'delivered'];
const CONTACT_STAGES_ = ['contacting', 'complete', 'sent', 'uncertain', 'manual'];
const UPDATE_FIELDS_ = ['reason', 'preview_url', 'qa_passed', 'preview_verified', 'source_urls', 'screenshots', 'browser_id', 'tab_id', 'workspace', 'booking_url', 'logo_decision', 'cost', 'failure', 'contact_url', 'qualification', 'seo_checked', 'outreach_mode', 'contact_email', 'contact_phone', 'site_file', 'jetai', 'generation'];
const BATCH_STATUSES_ = ['running', 'complete', 'blocked', 'exhausted'];
// 'build': the coordinator finds and builds websites. 'targets': it only lists qualified businesses and
// the operator presses Generate on the ones to build. The mode lives in Config as batch_mode:<id>.
const BATCH_MODES_ = ['build', 'targets'];
const HAND_PICKED_ = { industry: 'Hand-picked websites', city: 'Added from the dashboard' };
const PROP_GENERATOR_ = 'GENERATOR_STATUS';
const FINISH_STATUSES_ = ['submitted', 'sent', 'uncertain', 'blocked'];

class LedgerError_ extends Error {
  constructor(message, retryable) {
    super(message);
    this.name = 'LedgerError';
    this.retryable = Boolean(retryable);
  }
}

function nowIso_() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function ident_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(byte => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function isPlainObject_(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** Python truthiness, so evidence checks match control.py ("not data.get('screenshots')"). */
function truthy_(value) {
  if (Array.isArray(value) || typeof value === 'string') return value.length > 0;
  if (isPlainObject_(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

function requireText_(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new LedgerError_(`${label} is required`);
  if (value.length > 4000) throw new LedgerError_(`${label} is too long`);
  return value;
}

function parseJobData_(job) {
  try {
    const data = JSON.parse(job.data || '{}');
    if (isPlainObject_(data)) return data;
  } catch (error) {
    // fall through to the error below
  }
  throw new LedgerError_(`Job ${job.id} has a damaged data cell (not a JSON object). Repair it in the Jobs tab before continuing.`);
}

function findingsCount_(data) {
  const qualification = isPlainObject_(data.qualification) ? data.qualification : {};
  const findings = Array.isArray(qualification.findings) ? qualification.findings : [];
  return findings.filter(finding => typeof finding === 'string' && finding.trim()).length;
}

// ---------------------------------------------------------------------------
// Identity normalization (control.py domain() and identity())

function domain_(url) {
  const parts = splitUrl_(url);
  if (!parts || ['http', 'https'].indexOf(parts.scheme) < 0 || !parts.host || parts.userinfo) {
    throw new LedgerError_('A public HTTP(S) business URL without credentials is required');
  }
  const host = parts.host.toLowerCase().replace(/\.+$/, '');
  if (isIpAddress_(host)) throw new LedgerError_('Use a public business domain');
  let value = toAsciiHost_(host);
  if (value.indexOf('www.') === 0) value = value.slice(4);
  if (value.indexOf('.') < 0 || value === 'localhost' || /\.(local|localhost)$/.test(value)) {
    throw new LedgerError_('Use a public business domain');
  }
  return value;
}

function splitUrl_(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\r\n]/g, '');
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)/.exec(text);
  if (!match) return null;
  const authority = match[2];
  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at) : '';
  const hostport = at >= 0 ? authority.slice(at + 1) : authority;
  let host = hostport;
  if (hostport.charAt(0) === '[') {
    const end = hostport.indexOf(']');
    host = end > 0 ? hostport.slice(1, end) : '';
  } else if (hostport.lastIndexOf(':') >= 0) {
    host = hostport.slice(0, hostport.lastIndexOf(':'));
  }
  return { scheme: match[1].toLowerCase(), userinfo, host };
}

function isIpAddress_(host) {
  return host.indexOf(':') >= 0 || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function toAsciiHost_(host) {
  const labels = host.split('.').map(label => {
    if (!label) throw new LedgerError_('Use a public business domain');
    const ascii = /^[\x00-\x7f]*$/.test(label) ? label : 'xn--' + punycode_(label.normalize('NFKC').toLowerCase());
    if (ascii.length > 63 || !/^[a-z0-9_-]+$/.test(ascii)) throw new LedgerError_('Use a public business domain');
    return ascii;
  });
  const value = labels.join('.');
  if (value.length > 253) throw new LedgerError_('Use a public business domain');
  return value;
}

/** RFC 3492 Punycode encoding for one internationalized domain label. */
function punycode_(input) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const codePoints = Array.from(input, character => character.codePointAt(0));
  const digit = value => String.fromCharCode(value + 22 + (value < 26 ? 75 : 0));
  const adapt = (delta, points, first) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / points);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  let output = codePoints.filter(point => point < 0x80).map(point => String.fromCharCode(point)).join('');
  const basic = output.length;
  let handled = basic, n = 128, delta = 0, bias = 72;
  if (basic) output += '-';
  while (handled < codePoints.length) {
    let next = Infinity;
    codePoints.forEach(point => { if (point >= n && point < next) next = point; });
    delta += (next - n) * (handled + 1);
    n = next;
    codePoints.forEach(point => {
      if (point < n) delta++;
      if (point !== n) return;
      let q = delta;
      for (let k = base; ; k += base) {
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (q < t) break;
        output += digit(t + ((q - t) % (base - t)));
        q = Math.floor((q - t) / (base - t));
      }
      output += digit(q);
      bias = adapt(delta, handled + 1, handled === basic);
      delta = 0;
      handled++;
    });
    delta++;
    n++;
  }
  return output;
}

function identity_(value) {
  if (typeof value !== 'string' || value.indexOf(':') < 0) throw new LedgerError_('Identity must use domain:, phone: or email:');
  const kind = value.slice(0, value.indexOf(':')).toLowerCase().trim();
  let raw = value.slice(value.indexOf(':') + 1).trim();
  if (kind === 'domain') return 'domain:' + domain_(raw.indexOf('://') >= 0 ? raw : 'https://' + raw);
  if (kind === 'email') {
    raw = raw.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) throw new LedgerError_('Invalid email identity');
    return 'email:' + raw;
  }
  if (kind === 'phone') {
    raw = raw.replace(/[ ()\-.]/g, '');
    if (!/^\+[1-9][0-9]{7,14}$/.test(raw)) throw new LedgerError_('Use an international phone number with +country code');
    return 'phone:' + raw;
  }
  throw new LedgerError_('Identity must use domain:, phone: or email:');
}

// ---------------------------------------------------------------------------
// Reads

function maxWorkers_(tx) {
  const row = tx.table('config').find(item => item.key === 'max_workers');
  const value = row ? parseInt(row.value, 10) : 3;
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function batchProgress_(batch, jobs) {
  const counts = {};
  jobs.forEach(job => { if (job.batch_id === batch.id) counts[job.stage] = (counts[job.stage] || 0) + 1; });
  const completed = SUCCESS_STAGES_.reduce((sum, stage) => sum + (counts[stage] || 0), 0);
  const active = Object.keys(counts).filter(stage => TERMINAL_STAGES_.indexOf(stage) < 0).reduce((sum, stage) => sum + counts[stage], 0);
  const remaining = Math.max(0, batch.requested_count - completed);
  return { completed_count: completed, active_count: active, remaining_count: remaining, manual_count: counts.manual || 0, available_count: Math.max(0, remaining - active) };
}

function batchMode_(tx, batchId) {
  const row = tx.table('config').find(item => item.key === 'batch_mode:' + batchId);
  return row && BATCH_MODES_.indexOf(row.value) >= 0 ? row.value : 'build';
}

/** The website generator's last heartbeat (tools/site_runner.py), or null. */
function generatorStatus_() {
  try {
    const value = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_GENERATOR_) || 'null');
    return isPlainObject_(value) ? value : null;
  } catch (error) {
    return null;
  }
}

function snapshot_(tx) {
  const jobs = tx.table('jobs').rows;
  return {
    batches: tx.table('batches').rows.map(batch => Object.assign({}, batch, batchProgress_(batch, jobs), { mode: batchMode_(tx, batch.id) })),
    jobs: jobs.map(job => {
      try {
        return Object.assign({}, job, { data: parseJobData_(job) });
      } catch (error) {
        return Object.assign({}, job, { data: {}, data_error: error.message });
      }
    }),
    events: recentEvents_(200),
    workers: tx.table('workers').rows.map(worker => Object.assign({}, worker)),
    settings: { batch_size: 5, max_workers: maxWorkers_(tx) },
    generator: generatorStatus_(),
    server_time: nowIso_(),
  };
}

// ---------------------------------------------------------------------------
// Batches

function createBatch_(industry, city, requestedCount, mode) {
  if (requestedCount === undefined || requestedCount === null) requestedCount = 5;
  if (mode === undefined || mode === null || mode === '') mode = 'build';
  if (typeof industry !== 'string' || typeof city !== 'string' || !industry.trim() || !city.trim()) throw new LedgerError_('Industry and city are required');
  if (industry.length > 150 || city.length > 150) throw new LedgerError_('Use an industry and city under 150 characters');
  if (typeof requestedCount !== 'number' || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) {
    throw new LedgerError_('Website count must be a whole number from 1 to 100');
  }
  if (BATCH_MODES_.indexOf(mode) < 0) throw new LedgerError_('Batch mode must be build or targets');
  return writeLedger_(tx => {
    const id = ident_('batch');
    tx.table('batches').insert({ id, industry: industry.trim(), city: city.trim(), status: 'queued', created_at: nowIso_(), requested_count: requestedCount });
    if (mode === 'targets') {
      tx.table('config').insert({ key: 'batch_mode:' + id, value: mode });
      tx.event(null, `Batch queued: find ${requestedCount} target websites for ${industry.trim()} in ${city.trim()}. Waiting for the coordinator; press Generate on the targets you want built.`);
    } else {
      tx.event(null, `Batch queued: ${requestedCount} websites for ${industry.trim()} in ${city.trim()}. Waiting for the coordinator.`);
    }
    return { id, status: 'queued', requested_count: requestedCount, mode };
  });
}

function batchStatus_(batchId, status) {
  if (BATCH_STATUSES_.indexOf(status) < 0) throw new LedgerError_('Invalid batch status');
  return writeLedger_(tx => {
    const batches = tx.table('batches');
    const batch = batches.find(row => row.id === batchId);
    if (!batch) throw new LedgerError_('Unknown batch');
    const progress = batchProgress_(batch, tx.table('jobs').rows);
    if ((status === 'complete' || status === 'exhausted') && progress.active_count) throw new LedgerError_('Batch has unfinished jobs');
    if (status === 'complete' && progress.remaining_count) throw new LedgerError_(`Batch needs ${progress.remaining_count} more completed outreach jobs`);
    batches.update(batch, { status });
    return Object.assign({ status }, progress);
  });
}

/** Stops an unsubmitted batch while retaining its audit and dedupe records. */
function cancelBatch_(batchId, reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw new LedgerError_('Provide a cancellation reason');
  return writeLedger_(tx => {
    const batches = tx.table('batches');
    const batch = batches.find(row => row.id === batchId);
    if (!batch) throw new LedgerError_('Unknown batch');
    const jobs = tx.table('jobs'), workers = tx.table('workers'), submissions = tx.table('submissions');
    const active = jobs.filter(job => job.batch_id === batchId && TERMINAL_STAGES_.indexOf(job.stage) < 0);
    active.forEach(job => {
      // A submission attempt must never be silently cancelled or made retryable.
      const attempted = Boolean(submissions.find(row => row.job_id === job.id));
      const detail = attempted ? `${reason} Submission history retained as uncertain; do not retry.` : `${reason} No outreach submission was made.`;
      const now = nowIso_();
      jobs.update(job, { stage: attempted ? 'uncertain' : 'skipped', detail, worker: null, updated_at: now, contact_status: attempted ? 'uncertain' : 'not_sent' });
      workers.filter(row => row.job_id === job.id).forEach(row => workers.update(row, { status: 'idle', updated_at: now }));
      tx.event(job.id, `Batch cancelled: ${detail}`);
    });
    batches.update(batch, { status: 'cancelled' });
    tx.event(null, `Batch ${batchId} cancelled: ${reason}`);
    return { id: batchId, status: 'cancelled', stopped_jobs: active.length };
  });
}

/** Clears dashboard work records while retaining operational configuration. */
function clearAll_(reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw new LedgerError_('Provide a reset reason');
  return writeLedger_(tx => {
    const cleared = {};
    ['batches', 'jobs', 'identities', 'workers', 'submissions'].forEach(name => {
      cleared[name] = tx.table(name).rows.length;
      tx.table(name).clear();
    });
    const sheet = ledgerSheet_('events');
    cleared.events = Math.max(0, sheet.getLastRow() - 1);
    tx.log.clear();
    return { cleared, reason };
  });
}

function setCapacity_(count) {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 5) throw new LedgerError_('Capacity must be a whole number from 1 to 5');
  return writeLedger_(tx => {
    const config = tx.table('config');
    const row = config.find(item => item.key === 'max_workers');
    if (row) config.update(row, { value: String(count) });
    else config.insert({ key: 'max_workers', value: String(count) });
    return { max_workers: count };
  });
}

// ---------------------------------------------------------------------------
// Jobs

function addJob_(batchId, name, url, aliases) {
  const domain = domain_(url);
  requireText_(name, 'Business name');
  const list = Array.isArray(aliases) ? aliases : aliases ? [aliases] : [];
  const keys = Array.from(new Set(['domain:' + domain].concat(list.map(identity_))));
  return writeLedger_(tx => ({ id: insertJob_(tx, batchId, name, url, domain, keys) }));
}

/** Registers one business inside a write transaction; shared by addJob_ and addTarget_. */
function insertJob_(tx, batchId, name, url, domain, keys) {
  const batch = tx.table('batches').find(row => row.id === batchId);
  if (!batch) throw new LedgerError_('Unknown batch');
  const jobs = tx.table('jobs'), identities = tx.table('identities');
  if (!batchProgress_(batch, jobs.rows).available_count) {
    throw new LedgerError_('Completed and in-progress jobs cover the target; wait for an outcome before adding replacements');
  }
  const sameDomain = jobs.find(job => job.domain === domain);
  if (sameDomain) throw new LedgerError_(`UNIQUE constraint failed: domain:${domain} is already registered to job ${sameDomain.id}`);
  keys.forEach(key => {
    const owner = identities.find(row => row.identity === key);
    if (owner) throw new LedgerError_(`UNIQUE constraint failed: ${key} is already registered to job ${owner.job_id}`);
  });
  const id = ident_('site');
  jobs.insert({ id, batch_id: batchId, name: name.trim(), url, domain, stage: 'queued', worker: null, detail: '', reason: '', preview_url: '', contact_status: 'not_sent', data: '{}', updated_at: nowIso_() });
  keys.forEach(key => identities.insert({ identity: key, job_id: id }));
  tx.event(id, 'Prospect registered; exclusive identity reserved.');
  return id;
}

/** Adds a business to a target list (the hand-picked list by default) and optionally requests its website. */
function addTarget_(input, actor) {
  const values = isPlainObject_(input) ? input : {};
  const name = typeof values.name === 'string' ? values.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new LedgerError_('Business name is required');
  if (name.length > 200) throw new LedgerError_('Use a business name under 200 characters');
  let url = typeof values.url === 'string' ? values.url.trim() : '';
  if (!url) throw new LedgerError_('Website address is required');
  if (url.indexOf('://') < 0) url = 'https://' + url;
  const domain = domain_(url);
  const aliases = Array.isArray(values.aliases) ? values.aliases : values.aliases ? [values.aliases] : [];
  const keys = Array.from(new Set(['domain:' + domain].concat(aliases.map(identity_))));
  const reason = typeof values.reason === 'string' ? truncate_(values.reason.trim(), 1000) : '';
  const batchId = typeof values.batch_id === 'string' && values.batch_id ? values.batch_id : typeof values.batch === 'string' && values.batch ? values.batch : '';
  return writeLedger_(tx => {
    let target = batchId;
    if (!target) {
      const jobs = tx.table('jobs').rows;
      const open = tx.table('batches').rows.filter(batch => batch.industry === HAND_PICKED_.industry && batch.city === HAND_PICKED_.city && ['cancelled', 'complete', 'exhausted'].indexOf(batch.status) < 0)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .find(batch => batchProgress_(batch, jobs).available_count > 0);
      if (open) target = open.id;
      else {
        target = ident_('batch');
        tx.table('batches').insert({ id: target, industry: HAND_PICKED_.industry, city: HAND_PICKED_.city, status: 'running', created_at: nowIso_(), requested_count: 100 });
        tx.table('config').insert({ key: 'batch_mode:' + target, value: 'targets' });
        tx.event(null, 'Started the hand-picked websites list for businesses added from the dashboard.');
      }
    }
    const id = insertJob_(tx, target, name, url, domain, keys);
    if (reason) tx.table('jobs').update(tx.table('jobs').find(row => row.id === id), { reason });
    if (values.generate) markRequested_(tx, tx.table('jobs').find(row => row.id === id), actor);
    return { id, batch_id: target, requested: Boolean(values.generate) };
  });
}

function markRequested_(tx, job, actor) {
  const data = parseJobData_(job);
  if (data.generate_requested_at) return data.generate_requested_at;
  const now = nowIso_();
  data.generate_requested_at = now;
  data.generate_requested_by = actor;
  tx.table('jobs').update(job, { data: JSON.stringify(data), detail: 'Website requested; waiting for the website generator.', updated_at: now });
  tx.event(job.id, `Website requested by ${actor}; waiting for the website generator.`);
  return now;
}

/** Marks a queued business for the website generator (tools/site_runner.py watch). */
function requestWebsite_(jobId, actor) {
  actor = String(actor || 'the dashboard').replace(/\s+/g, ' ').trim().slice(0, 120) || 'the dashboard';
  return writeLedger_(tx => {
    const job = tx.table('jobs').find(row => row.id === jobId);
    if (!job) throw new LedgerError_('Unknown job');
    if (job.stage !== 'queued' || job.worker) throw new LedgerError_('Only a business waiting in the queue can be generated');
    const already = parseJobData_(job).generate_requested_at;
    const requestedAt = markRequested_(tx, job, actor);
    return already ? { id: jobId, requested_at: requestedAt, already_requested: true } : { id: jobId, requested_at: requestedAt };
  });
}

/** A worker's quiet "still working" signal during a long step: no activity line, just a fresh timestamp. */
function touchWorker_(jobId, worker) {
  return writeLedger_(tx => {
    ownJob_(tx, jobId, worker);
    const workers = tx.table('workers');
    workers.update(workers.find(row => row.id === worker), { updated_at: nowIso_() });
    return { id: jobId, touched: true };
  });
}

/** One activity line for a job, or for the whole ledger (progress while finding targets). */
function addNote_(message, jobId) {
  requireText_(message, 'Message');
  return writeLedger_(tx => {
    if (jobId && !tx.table('jobs').find(row => row.id === jobId)) throw new LedgerError_('Unknown job');
    tx.event(jobId || null, message.trim());
    return { ok: true };
  });
}

/** Queued businesses waiting for the generator, oldest first; also stores the generator's heartbeat. Reads without the lock. */
function pendingRequests_(heartbeat) {
  if (heartbeat !== undefined && heartbeat !== null) {
    if (!isPlainObject_(heartbeat)) throw new LedgerError_('Heartbeat must be a JSON object');
    const value = {};
    ['host', 'note', 'ready', 'running', 'max_parallel'].forEach(key => { if (key in heartbeat) value[key] = heartbeat[key]; });
    value.seen_at = nowIso_();
    PropertiesService.getScriptProperties().setProperty(PROP_GENERATOR_, truncate_(JSON.stringify(value), 4000));
  }
  return readLedger_(tx => {
    const requests = [];
    tx.table('jobs').rows.forEach(job => {
      if (job.stage !== 'queued' || job.worker) return;
      let data = {};
      try { data = parseJobData_(job); } catch (error) { return; }
      if (data.generate_requested_at) requests.push({ id: job.id, batch_id: job.batch_id, name: job.name, url: job.url, requested_at: data.generate_requested_at });
    });
    requests.sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)));
    return { requests, server_time: nowIso_() };
  });
}

function ownJob_(tx, jobId, worker) {
  const job = tx.table('jobs').find(row => row.id === jobId);
  if (!job) throw new LedgerError_('Unknown job');
  if (!worker || job.worker !== worker) throw new LedgerError_('Worker does not own this job');
  if (!tx.table('workers').find(row => row.id === worker && row.job_id === jobId && row.status === 'running')) {
    throw new LedgerError_('Worker assignment is no longer active');
  }
  return job;
}

function idleWorker_(tx, worker, now) {
  const workers = tx.table('workers');
  const row = workers.find(item => item.id === worker);
  if (row) workers.update(row, { status: 'idle', updated_at: now });
}

/** Reserves the oldest queued job of a batch, or the given queued job, for one worker. */
function claimJob_(batchId, worker, jobId) {
  requireText_(worker, 'Worker ID');
  if (!batchId && !jobId) throw new LedgerError_('Give a batch or a job to claim');
  return writeLedger_(tx => {
    const workers = tx.table('workers');
    if (workers.find(row => row.id === worker && row.status === 'running')) throw new LedgerError_('Worker already owns a running job');
    if (workers.filter(row => row.status === 'running').length >= maxWorkers_(tx)) throw new LedgerError_('Worker capacity reached');
    const jobs = tx.table('jobs');
    let job;
    if (jobId) {
      job = jobs.find(row => row.id === jobId);
      if (!job) throw new LedgerError_('Unknown job');
      if (batchId && job.batch_id !== batchId) throw new LedgerError_('That job belongs to another batch');
      if (job.stage !== 'queued' || job.worker) throw new LedgerError_('Only a queued, unassigned job can be claimed');
    } else {
      job = jobs.find(row => row.batch_id === batchId && row.stage === 'queued' && !row.worker);
      if (!job) return { job: null };
    }
    const now = nowIso_();
    // A claim answers any pending Generate request, so a failed run is never retried automatically.
    const data = parseJobData_(job);
    delete data.generate_requested_at;
    delete data.generate_requested_by;
    jobs.update(job, { worker, stage: 'reviewing', data: JSON.stringify(data), updated_at: now });
    const existing = workers.find(row => row.id === worker);
    if (existing) workers.update(existing, { job_id: job.id, status: 'running', updated_at: now });
    else workers.insert({ id: worker, job_id: job.id, status: 'running', updated_at: now });
    const batches = tx.table('batches');
    const batch = batches.find(row => row.id === job.batch_id);
    if (batch) batches.update(batch, { status: 'running' });
    tx.event(job.id, `${worker} claimed this business.`);
    return { job: Object.assign({}, job) };
  });
}

function updateJob_(jobId, worker, stage, detail, fields) {
  fields = fields === undefined || fields === null ? {} : fields;
  if (!isPlainObject_(fields)) throw new LedgerError_('Fields must be a JSON object');
  const unknown = Object.keys(fields).filter(key => UPDATE_FIELDS_.indexOf(key) < 0);
  if (unknown.length) throw new LedgerError_('Unknown fields: ' + unknown.join(', '));
  ['reason', 'preview_url', 'site_file'].forEach(key => {
    if (key in fields && fields[key] !== null && typeof fields[key] !== 'string') throw new LedgerError_(`${key} must be text`);
  });
  detail = detail === undefined || detail === null ? '' : String(detail);
  return writeLedger_(tx => {
    const jobs = tx.table('jobs');
    const job = ownJob_(tx, jobId, worker);
    const next = stage || job.stage;
    if (STAGES_.indexOf(next) < 0) throw new LedgerError_('Unknown stage');
    if (CONTACT_STAGES_.indexOf(next) >= 0 && next !== job.stage) throw new LedgerError_('Use contact-begin, contact-finish or manual-outreach');
    const exits = TERMINAL_STAGES_.concat(['contacting']).indexOf(job.stage) >= 0 ? [] : ['blocked', 'skipped'];
    if (next !== job.stage && (NEXT_STAGES_[job.stage] || []).concat(exits).indexOf(next) < 0) throw new LedgerError_('Invalid stage transition');
    const data = Object.assign(parseJobData_(job), fields);
    if (next !== job.stage && (next === 'building' || next === 'checking')) {
      data.qa_passed = false;
      data.preview_verified = false;
    }
    if (next === 'deploying' && data.qa_passed !== true) throw new LedgerError_('Passing QA evidence required');
    const preview = 'preview_url' in data ? data.preview_url : job.preview_url;
    if (next === 'ready' && (data.preview_verified !== true || typeof preview !== 'string' || preview.indexOf('https://') !== 0)) {
      throw new LedgerError_('Verified HTTPS preview required');
    }
    if (next === 'delivered' && (data.qa_passed !== true || typeof data.site_file !== 'string' || !data.site_file.trim())) {
      throw new LedgerError_('Passing QA and the delivered site file are required');
    }
    const now = nowIso_();
    jobs.update(job, {
      stage: next,
      detail: detail || job.detail,
      reason: 'reason' in fields ? fields.reason || '' : job.reason,
      preview_url: 'preview_url' in fields ? fields.preview_url || '' : job.preview_url,
      data: JSON.stringify(data),
      updated_at: now,
    });
    const workers = tx.table('workers');
    const row = workers.find(item => item.id === worker);
    if (row) workers.update(row, ['blocked', 'skipped', 'delivered'].indexOf(next) >= 0 ? { status: 'idle', updated_at: now } : { updated_at: now });
    tx.event(jobId, detail || `Stage: ${next}`);
    return { id: jobId, stage: next };
  });
}

function addAlias_(jobId, worker, value) {
  const key = identity_(value);
  return writeLedger_(tx => {
    ownJob_(tx, jobId, worker);
    const identities = tx.table('identities');
    const owner = identities.find(row => row.identity === key);
    if (owner) throw new LedgerError_(`UNIQUE constraint failed: ${key} is already registered to job ${owner.job_id}`);
    identities.insert({ identity: key, job_id: jobId });
    tx.event(jobId, 'Verified identity added: ' + key);
    return { ok: true };
  });
}

function contactBegin_(jobId, worker, message, formUrl) {
  if (typeof message !== 'string' || !message.trim()) throw new LedgerError_('Message is empty');
  const formDomain = domain_(formUrl);
  return writeLedger_(tx => {
    const job = ownJob_(tx, jobId, worker);
    const data = parseJobData_(job);
    if (data.outreach_mode === 'manual') throw new LedgerError_('This job is routed to manual outreach; do not submit automatically');
    if (job.stage !== 'ready' || data.qa_passed !== true || data.preview_verified !== true || !job.reason) {
      throw new LedgerError_('Ready stage, specific reason, verified preview and passing QA required');
    }
    if (findingsCount_(data) < 2 || !truthy_(data.source_urls) || !truthy_(data.screenshots)) {
      throw new LedgerError_('Two qualification findings, source URLs and screenshot evidence required');
    }
    if (!tx.table('identities').find(row => row.identity === 'domain:' + formDomain && row.job_id === jobId)) {
      throw new LedgerError_('Contact form must be on the original or verified alias domain');
    }
    const submissions = tx.table('submissions');
    if (submissions.find(row => row.job_id === jobId)) throw new LedgerError_('UNIQUE constraint failed: a submission is already reserved for this job; never retry outreach');
    const now = nowIso_();
    submissions.insert({ job_id: jobId, message, message_hash: sha256Hex_(message), form_url: formUrl, status: 'attempting', evidence: null, created_at: now });
    tx.table('jobs').update(job, { stage: 'contacting', contact_status: 'attempting', updated_at: now });
    tx.event(jobId, 'Submission reserved. One submit attempt permitted; never auto-retry an uncertain result.');
    return { id: jobId, status: 'attempting' };
  });
}

function contactFinish_(jobId, worker, status, evidence) {
  if (FINISH_STATUSES_.indexOf(status) < 0 || typeof evidence !== 'string' || !evidence.trim()) throw new LedgerError_('Provide result and observed evidence');
  return writeLedger_(tx => {
    const job = ownJob_(tx, jobId, worker);
    if (job.stage !== 'contacting') throw new LedgerError_('No submission in progress');
    const now = nowIso_();
    const submissions = tx.table('submissions');
    const submission = submissions.find(row => row.job_id === jobId);
    if (submission) submissions.update(submission, { status, evidence });
    tx.table('jobs').update(job, { stage: status === 'submitted' ? 'complete' : status, contact_status: status, detail: evidence, updated_at: now });
    idleWorker_(tx, worker, now);
    tx.event(jobId, `Contact ${status}: ${evidence}`);
    return { id: jobId, status };
  });
}

function manualOutreach_(jobId, worker, reason, message, email, phone) {
  if (typeof reason !== 'string' || typeof message !== 'string' || !reason.trim() || !message.trim()) {
    throw new LedgerError_('Manual outreach needs a reason and prepared message');
  }
  email = email ? identity_('email:' + email).slice('email:'.length) : '';
  phone = phone ? identity_('phone:' + phone).slice('phone:'.length) : '';
  return writeLedger_(tx => {
    const job = ownJob_(tx, jobId, worker);
    const data = parseJobData_(job);
    if (job.stage !== 'ready' || data.qa_passed !== true || data.preview_verified !== true || job.preview_url.indexOf('https://') !== 0) {
      throw new LedgerError_('Manual outreach requires a ready, QA-passed, verified public website');
    }
    if (tx.table('submissions').find(row => row.job_id === jobId)) {
      throw new LedgerError_('A reserved/attempted submission cannot become manual outreach automatically');
    }
    if (!truthy_(data.source_urls) || message.indexOf(job.preview_url) < 0) {
      throw new LedgerError_('Contact sources and the verified preview URL in the message are required');
    }
    if (!job.reason || !truthy_(data.screenshots) || findingsCount_(data) < 2) {
      throw new LedgerError_('Manual outreach requires visual qualification and screenshot evidence');
    }
    data.manual_outreach = { reason: reason.trim(), message, email, phone, source_urls: data.source_urls };
    data.outreach_mode = 'manual';
    const now = nowIso_();
    tx.table('jobs').update(job, { stage: 'manual', contact_status: 'manual_required', detail: reason.trim(), data: JSON.stringify(data), updated_at: now });
    idleWorker_(tx, worker, now);
    tx.event(jobId, 'Manual outreach required: ' + reason.trim());
    return { id: jobId, stage: 'manual', contact_status: 'manual_required' };
  });
}

function recoverJob_(jobId, reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw new LedgerError_('Provide a recovery reason');
  return writeLedger_(tx => {
    const jobs = tx.table('jobs');
    const job = jobs.find(row => row.id === jobId);
    if (!job) throw new LedgerError_('Unknown job');
    // Never recycle an outreach attempt, even after a crash.
    const submissions = tx.table('submissions');
    const attempt = submissions.find(row => row.job_id === jobId);
    if (['complete', 'sent', 'manual', 'delivered'].indexOf(job.stage) >= 0) throw new LedgerError_('Sent, delivered or manual outreach jobs cannot be automatically recovered');
    const target = attempt ? 'uncertain' : 'queued';
    const now = nowIso_();
    jobs.update(job, { stage: target, worker: null, detail: truncate_(reason.trim(), 4000), updated_at: now, contact_status: attempt ? 'uncertain' : job.contact_status });
    const workers = tx.table('workers');
    workers.filter(row => row.job_id === jobId).forEach(row => workers.update(row, { status: 'idle', updated_at: now }));
    if (attempt) submissions.update(attempt, { status: 'uncertain', evidence: reason });
    tx.event(jobId, (attempt ? 'Marked uncertain after the worker stopped: ' : 'Returned to the queue: ') + reason.trim());
    return { stage: target };
  });
}

// ---------------------------------------------------------------------------
// Dashboard-only additions

/** Records that a person sent a manual-outreach message. Bookkeeping only; nothing is sent. */
function setManualSent_(jobId, sent, actor) {
  return writeLedger_(tx => {
    const jobs = tx.table('jobs');
    const job = jobs.find(row => row.id === jobId);
    if (!job) throw new LedgerError_('Unknown job');
    if (job.stage !== 'manual') throw new LedgerError_('Only manual-outreach jobs can be marked as sent');
    const data = parseJobData_(job);
    const manual = isPlainObject_(data.manual_outreach) ? data.manual_outreach : {};
    if (sent) {
      manual.sent_at = nowIso_();
      manual.sent_by = actor;
    } else {
      delete manual.sent_at;
      delete manual.sent_by;
    }
    data.manual_outreach = manual;
    jobs.update(job, { data: JSON.stringify(data) });
    tx.event(jobId, sent ? `Manual outreach marked as sent by ${actor}.` : `Manual outreach sent mark removed by ${actor}.`);
    return { id: jobId, sent_at: manual.sent_at || null };
  });
}

function jobActivity_(jobId) {
  return allEvents_().filter(event => event.job_id === jobId).reverse().slice(0, 500);
}

/** Copies a local SQLite ledger (sent by tools/sheets_ledger.py migrate) into an empty Sheets ledger. */
function importLedger_(tables, source) {
  if (!isPlainObject_(tables)) throw new LedgerError_('Import needs a tables object');
  const order = ['batches', 'jobs', 'identities', 'events', 'workers', 'submissions', 'config'];
  const unknown = Object.keys(tables).filter(name => order.indexOf(name) < 0);
  if (unknown.length) throw new LedgerError_('Unknown tables: ' + unknown.join(', '));
  order.forEach(name => {
    if (tables[name] !== undefined && !Array.isArray(tables[name])) throw new LedgerError_(`${name} must be a list of rows`);
    (tables[name] || []).forEach(row => {
      if (!isPlainObject_(row)) throw new LedgerError_(`${name} rows must be objects`);
      const extra = Object.keys(row).filter(column => TABLES_[name].columns.indexOf(column) < 0);
      if (extra.length) throw new LedgerError_(`${name} has unknown columns: ${extra.join(', ')}`);
    });
  });
  return writeLedger_(tx => {
    const existing = ['batches', 'jobs', 'identities', 'workers', 'submissions'].filter(name => tx.table(name).rows.length);
    if (existing.length || recentEvents_(1).length) throw new LedgerError_('Import only works into an empty ledger (found existing ' + (existing.join(', ') || 'events') + ').');
    const counts = {};
    order.filter(name => name !== 'events' && name !== 'config').forEach(name => {
      const rows = tables[name] || [];
      rows.forEach(row => tx.table(name).insert(row));
      counts[name] = rows.length;
    });
    (tables.config || []).forEach(row => {
      const config = tx.table('config');
      const current = config.find(item => item.key === row.key);
      if (current) config.update(current, { value: String(row.value) });
      else config.insert(row);
    });
    counts.config = (tables.config || []).length;
    const events = (tables.events || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    events.forEach(event => tx.log.pending.push({ job_id: event.job_id || null, message: truncate_(String(event.message || ''), 4000), created_at: String(event.created_at || nowIso_()) }));
    counts.events = events.length;
    tx.event(null, `Imported the local ledger${source ? ' from ' + source : ''}: ${counts.batches} batches, ${counts.jobs} jobs, ${counts.identities} identities.`);
    return { imported: counts };
  });
}
