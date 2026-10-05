'use strict';
const $ = (selector) => document.querySelector(selector);
const state = { batches: [], jobs: [], events: [], workers: [], settings: { batch_size: 5, max_workers: 3 } };
let batchFilter = 'all', stageFilter = 'all', selectedJob = null, previousSignature = '', connected = false;
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const label = (value) => String(value || 'queued').replace(/[_-]/g, ' ').replace(/^./, x => x.toUpperCase());
const time = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
function safeURL(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function isManual(job) { return job.stage === 'manual' || job.contact_status === 'manual_required' || job.data?.outreach_mode === 'manual'; }
const requestedAt = (job) => job.data?.generate_requested_at || '';
// ISO 3166-1 codes for the batch country list; the browser supplies the names.
const COUNTRY_CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ '
  + 'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ '
  + 'LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW '
  + 'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (code) => { try { return (code && regionNames && regionNames.of(code)) || code || ''; } catch { return code || ''; } };
const placeName = (batch) => { const name = batch.country ? countryName(batch.country) : ''; return name && !String(batch.city).toLowerCase().includes(name.toLowerCase()) ? `${batch.city}, ${name}` : batch.city; };
function stageLabel(job) {
  if (job.stage === 'queued' && !isManual(job)) return requestedAt(job) ? 'Requested' : 'Target';
  return isManual(job) ? (job.stage === 'manual' ? 'Manual outreach' : job.stage === 'queued' ? 'Manual · build queued' : `Manual · ${label(job.stage)}`) : label(job.stage);
}
function generatorStatus() {
  const status = state.generator;
  const seen = status ? Date.parse(status.seen_at) : NaN;
  if (!status || !Number.isFinite(seen) || Date.now() - seen > 90000) return { kind: 'off', text: '<b>Website generator: not running.</b> Start the dashboard without --no-generator, or run python tools/site_runner.py watch.' };
  if (!status.ready) return { kind: 'setup', text: `<b>Website generator: needs setup.</b> ${escapeHTML(status.note || '')}` };
  const running = Array.isArray(status.running) ? status.running.length : 0;
  return { kind: 'ready', text: `<b>Website generator: ${running ? `building ${running}` : 'ready'}.</b> Press Generate on a target to build its website.` };
}
function contactLink(value, kind) {
  if (typeof value !== 'string' || !value.trim()) return 'Unavailable';
  const text = value.trim();
  const valid = kind === 'email' ? /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(text) : /^\+?[0-9 () .-]+$/.test(text) && /[0-9]/.test(text);
  if (!valid) return escapeHTML(text);
  const href = kind === 'email' ? `mailto:${encodeURIComponent(text)}` : `tel:${text.replace(/[^+0-9]/g, '')}`;
  return `<a href="${escapeHTML(href)}">${escapeHTML(text)}</a>`;
}
function manualOutreach(job) {
  if (!isManual(job)) return '';
  const data = job.data?.manual_outreach || {};
  if (job.stage !== 'manual') return `<section class="manual-outreach"><h3>Manual outreach · website pending</h3><p>This business is queued for website preparation. The verified preview and message will appear here when ready.</p><p>${escapeHTML(data.reason || job.detail || '')}</p></section>`;
  const sources = (Array.isArray(data.source_urls) ? data.source_urls : []).map(safeURL).filter(Boolean);
  return `<section class="manual-outreach" aria-labelledby="manual-heading"><h3 id="manual-heading">Manual outreach required</h3><p>The hosted preview is verified. Contact this business manually using the details and message below.</p><div class="meta-label">Why manual contact is needed</div><p>${escapeHTML(data.reason || job.reason || 'Automated outreach could not be completed.')}</p><dl class="manual-contacts"><dt>Verified email</dt><dd>${contactLink(data.email, 'email')}</dd><dt>Verified phone</dt><dd>${contactLink(data.phone, 'phone')}</dd></dl>${sources.length ? `<div class="manual-sources">Contact sources: ${sources.map((url, index) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Source ${index + 1} ↗</a>`).join(' · ')}</div>` : ''}<label class="meta-label" for="manual-message">Full outreach message</label><textarea id="manual-message" readonly rows="10" spellcheck="false">${escapeHTML(data.message || '')}</textarea><div class="copy-actions"><button id="copy-message" type="button"${data.message ? '' : ' disabled'}>Copy message</button><span id="copy-status" role="status" aria-live="polite">${data.message ? '' : 'Message unavailable.'}</span></div></section>`;
}
function category(job) {
  if (isManual(job)) return 'manual';
  if (job.stage === 'queued') return 'target';
  if (['failed', 'blocked', 'uncertain', 'needs_attention', 'error', 'rejected', 'skipped'].includes(job.stage)) return 'attention';
  if (['submitted', 'sent', 'contacted'].includes(job.contact_status) || ['contacted', 'complete', 'completed', 'sent', 'delivered'].includes(job.stage)) return 'contacted';
  if (job.preview_url || ['published', 'deployed', 'ready'].includes(job.stage)) return 'ready';
  return 'working';
}
function render() {
  const batches = state.batches;
  if (batchFilter !== 'all' && !batches.some(batch => String(batch.id) === batchFilter)) batchFilter = 'all';
  const select = $('#batch-filter');
  select.innerHTML = '<option value="all">All batches</option>' + batches.map(batch => `<option value="${escapeHTML(batch.id)}">${escapeHTML(batch.industry)} · ${escapeHTML(placeName(batch))} · ${escapeHTML(batch.completed_count || 0)}/${escapeHTML(batch.requested_count || 5)} completed</option>`).join('');
  select.value = batchFilter;
  const allJobs = state.jobs.filter(job => batchFilter === 'all' || String(job.batch_id) === batchFilter);
  const jobs = allJobs.filter(job => stageFilter === 'all' || category(job) === stageFilter);
  $('#edition-count').textContent = String(state.jobs.filter(job => ['complete', 'sent', 'delivered'].includes(job.stage)).length).padStart(2, '0');
  $('#sheet-count').textContent = jobs.length;
  $('#manual-count').textContent = allJobs.filter(isManual).length;
  const maxWorkers = Math.max(1, Number(state.settings.max_workers) || 3);
  const selectedBatch = batches.find(batch => String(batch.id) === batchFilter);
  // The hand-picked list has 100 nominal slots; it is not a target to reach.
  const counted = batches.filter(batch => batch.industry !== 'Hand-picked websites');
  const target = selectedBatch ? (selectedBatch.industry === 'Hand-picked websites' ? 0 : Number(selectedBatch.requested_count) || 5) : counted.reduce((sum, batch) => sum + (Number(batch.requested_count) || 5), 0);
  const completed = allJobs.filter(job => ['complete', 'sent', 'delivered'].includes(job.stage)).length;
  $('#capacity-note').textContent = `${target ? `${completed}/${target}` : completed} completed · ${maxWorkers} parallel`;
  const activeWorkers = state.workers.filter(worker => worker.job_id && !['idle', 'complete', 'completed', 'stopped'].includes(worker.status));
  const assigned = new Set();
  $('#workers').innerHTML = Array.from({ length: maxWorkers }, (_, index) => {
    const worker = activeWorkers[index];
    const activeJob = worker && state.jobs.find(job => String(job.id) === String(worker.job_id));
    if (activeJob) assigned.add(activeJob.id);
    const queued = !worker && allJobs.filter(job => ['queued', 'pending', 'discovered'].includes(job.stage) && !assigned.has(job.id))[0];
    if (queued) assigned.add(queued.id);
    const busy = Boolean(worker), title = activeJob?.name || (worker ? 'Worker running' : queued?.name || 'Idle');
    const detail = activeJob ? `${stageLabel(activeJob)} · ${worker.id}` : worker ? label(worker.status) : queued ? 'Queued' : index >= maxWorkers ? 'Standby' : 'Available';
    return `<div class="worker ${busy ? 'busy' : ''}"${busy ? ` data-updated-at="${escapeHTML(worker.updated_at || '')}"` : ''}><div class="worker-number">SLOT ${String(index + 1).padStart(2, '0')} <span class="worker-dot" aria-hidden="true"></span></div><div class="worker-title">${escapeHTML(title)}</div><div class="worker-detail">${escapeHTML(detail)}</div>${busy ? '<div class="worker-age" role="status" aria-live="polite" hidden></div>' : ''}</div>`;
  }).join('');
  refreshWorkerAges();
  const generator = generatorStatus();
  const requested = allJobs.filter(requestedAt).length;
  $('#generator-status').className = `generator-status ${generator.kind}`;
  $('#generator-status').innerHTML = generator.text + (requested ? ` ${requested} requested.` : '');
  const queuedBatches = batches.filter(batch => (batchFilter === 'all' || String(batch.id) === batchFilter) && ['queued', 'pending'].includes(batch.status));
  $('#queue-status').hidden = !queuedBatches.length;
  $('#queue-status').textContent = `${queuedBatches.length} batch${queuedBatches.length === 1 ? '' : 'es'} queued. Run them in Claude Code.`;
  if (!jobs.length) {
    const filtered = state.jobs.length > 0 && (batchFilter !== 'all' || stageFilter !== 'all');
    $('#jobs').innerHTML = `<div class="empty"><div><div class="empty-mark" aria-hidden="true">✳</div><h3>${filtered ? 'No matches' : 'No businesses yet'}</h3><p>${filtered ? 'Try another filter.' : 'Queue your first batch above.'}</p></div></div>`;
  } else {
    $('#jobs').innerHTML = jobs.map((job, index) => {
      const initials = String(job.name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      const caption = isManual(job) ? 'Manual contact needed' : job.preview_url ? 'Live ↗' : job.data?.jetai?.prototype_id ? 'In JetAI' : category(job) === 'target' && !requestedAt(job) ? 'Open to generate' : '';
      return `<button class="job-card${isManual(job) ? ' manual-card' : ''}" data-job="${escapeHTML(job.id)}" aria-label="Open ${escapeHTML(job.name || 'prospect')} details"><div class="job-cover"><span class="job-number">${String(index + 1).padStart(2, '0')}</span><span class="cover-monogram" aria-hidden="true">${escapeHTML(initials)}</span><span class="cover-caption">${caption}</span></div><div class="job-info"><h3>${escapeHTML(job.name || 'Unnamed prospect')}</h3><div class="job-domain">${escapeHTML(job.domain || job.url || 'Website pending')}</div><p class="job-detail">${escapeHTML(job.detail || (job.reason ? `Qualified: ${job.reason}` : '') || 'Not built yet')}</p><div class="job-bottom"><span class="stage ${category(job)}">${escapeHTML(stageLabel(job))}</span><span class="job-arrow" aria-hidden="true">↗</span></div></div></button>`;
    }).join('');
  }
  if (selectedJob && $('#job-dialog').open) renderDialog();
}
// Update only the worker warnings as time passes; preserve form inputs, filters,
// focus, and the existing job sheet when the server state itself is unchanged.
function refreshWorkerAges() {
  const now = Date.now();
  document.querySelectorAll('.worker[data-updated-at]').forEach(element => {
    const updatedAt = Date.parse(element.dataset.updatedAt);
    const age = now - updatedAt;
    const stale = Number.isFinite(updatedAt) && age > 120000;
    const warning = element.querySelector('.worker-age');
    element.classList.toggle('stale', stale);
    warning.hidden = !stale;
    const message = stale ? `No update for ${Math.floor(age / 60000)}m · may be stalled` : '';
    if (warning.textContent !== message) warning.textContent = message;
  });
}
function renderDialog() {
  const job = state.jobs.find(item => String(item.id) === String(selectedJob));
  if (!job) return;
  const original = safeURL(job.url), preview = safeURL(job.preview_url);
  const events = state.events.filter(event => String(event.job_id) === String(job.id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const jetai = job.data?.jetai || {};
  const target = job.stage === 'queued' && !job.worker;
  const jetaiLink = safeURL(jetai.url || jetai.app_url);
  const actions = target ? (requestedAt(job) ? `<p class="queue-status">Waiting for the website generator. ${generatorStatus().kind === 'ready' ? 'It will start shortly.' : 'It is not ready yet; see the status under Workers.'}</p>` : '<div class="dialog-actions"><button class="primary" id="generate-job" type="button">Generate website <span aria-hidden="true">✦</span></button></div>') : '';
  const jetaiLine = jetai.prototype_id ? `<div class="meta-label">JetAI prototype</div><p>${escapeHTML(jetai.name || 'Website preview')} · ${escapeHTML(jetai.status || 'draft')} · <span class="file-line">${escapeHTML(jetai.prototype_id)}</span>${jetaiLink ? ` · <a href="${escapeHTML(jetaiLink)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}</p>` : jetai.error ? `<div class="meta-label">JetAI upload</div><p>${escapeHTML(jetai.error)}</p>` : '';
  const delivered = job.data?.site_file ? `<section class="dialog-section"><div class="meta-label">Website file</div><p class="file-line">${escapeHTML(job.data.site_file)}</p>${jetaiLine}</section>` : '';
  $('#dialog-content').innerHTML = `<h2 id="dialog-title">${escapeHTML(job.name)}</h2><span class="stage ${category(job)}">${escapeHTML(stageLabel(job))}</span>${actions}<div class="dialog-links">${original ? `<a href="${escapeHTML(original)}" target="_blank" rel="noopener noreferrer">Original ↗</a>` : ''}${preview ? `<a class="preview" href="${escapeHTML(preview)}" target="_blank" rel="noopener noreferrer">Preview ↗</a>` : ''}</div>${manualOutreach(job)}${delivered}<section class="dialog-section"><div class="meta-label">Progress</div><p>${escapeHTML(job.detail || 'Waiting for an update from the coordinator.')}</p><div class="meta-label">Worker · updated</div><p>${escapeHTML(job.worker || 'Unassigned')} / ${escapeHTML(time(job.updated_at))}</p></section>${job.reason ? `<section class="dialog-section"><div class="meta-label">Reason</div><p>${escapeHTML(job.reason)}</p></section>` : ''}<section class="dialog-section"><div class="meta-label">Outreach</div><p>${escapeHTML(label(job.contact_status || 'not submitted'))}</p></section><section class="dialog-section"><div class="meta-label">Activity</div>${events.length ? `<ol class="timeline">${events.map(event => `<li>${escapeHTML(event.message)}<time class="timeline-time">${escapeHTML(time(event.created_at))}</time></li>`).join('')}</ol>` : '<p>No recorded activity yet.</p>'}</section>`;
}
async function poll() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const data = await response.json();
    for (const key of ['batches', 'jobs', 'events', 'workers']) state[key] = Array.isArray(data[key]) ? data[key] : [];
    state.settings = data.settings || state.settings;
    state.generator = data.generator || null;
    const signature = JSON.stringify(state);
    connected = true;
    $('#connection').className = 'connection online';
    $('#connection span').textContent = 'Live';
    $('#clock').textContent = `LAST SYNC / ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
    if (signature !== previousSignature) { previousSignature = signature; render(); }
  } catch {
    connected = false;
    $('#connection').className = 'connection offline';
    $('#connection span').textContent = previousSignature ? 'Reconnecting' : 'Offline';
  } finally { setTimeout(poll, document.hidden ? 8000 : 2000); }
}
(function fillCountries() {
  const select = $('#batch-form').elements.country;
  select.innerHTML = COUNTRY_CODES.map(code => [code, countryName(code)]).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => `<option value="${escapeHTML(code)}">${escapeHTML(name)}</option>`).join('');
  let saved = null;
  try { saved = localStorage.getItem('wg.country'); } catch { /* private mode */ }
  select.value = COUNTRY_CODES.includes(saved) ? saved : 'US';
})();
$('#batch-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  const industry = form.elements.industry.value.trim(), city = form.elements.city.value.trim(), requestedCount = Number(form.elements.requested_count.value), mode = form.elements.targets_only.checked ? 'targets' : 'build', country = form.elements.country.value || 'US';
  if (!industry || !city || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) { $('#form-message').textContent = 'Enter an industry, a city or region, and a website count from 1 to 100.'; return; }
  button.disabled = true;
  $('#form-message').textContent = 'Adding your batch…';
  try {
    const response = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ industry, city, requested_count: requestedCount, mode, country }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The batch could not be queued.');
    const place = placeName({ city, country });
    $('#form-message').textContent = mode === 'targets' ? `Find ${requestedCount} ${industry} targets in ${place}: queued. Run it in Claude Code, then press Generate on the ones you want.` : `${requestedCount} websites for ${industry} in ${place} queued. Run it in Claude Code.`;
    try { localStorage.setItem('wg.country', country); } catch { /* private mode */ }
    form.reset();
    form.elements.country.value = country;
    form.elements.requested_count.value = '5';
    previousSignature = '';
  } catch (error) { $('#form-message').textContent = `Couldn't queue this batch: ${error.message}`; }
  finally { button.disabled = false; }
});
$('#target-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  const name = form.elements.name.value.trim(), url = form.elements.url.value.trim(), generate = form.elements.generate.checked;
  if (!name || !url) { $('#target-message').textContent = 'Enter the business name and its current website.'; return; }
  button.disabled = true;
  $('#target-message').textContent = 'Adding…';
  try {
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url, generate }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The website could not be added.');
    $('#target-message').textContent = generate ? `${name} added. The website generator is building it.` : `${name} added to the hand-picked list.`;
    form.reset(); form.elements.generate.checked = true;
    previousSignature = '';
  } catch (error) { $('#target-message').textContent = `Couldn't add this website: ${error.message}`; }
  finally { button.disabled = false; }
});
$('#batch-filter').addEventListener('change', event => { batchFilter = event.target.value; render(); });
$('#stage-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  stageFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  render();
});
$('#jobs').addEventListener('click', event => {
  const card = event.target.closest('[data-job]');
  if (!card) return;
  selectedJob = card.dataset.job; renderDialog(); $('#job-dialog').showModal();
});
$('#dialog-content').addEventListener('click', async event => {
  const generate = event.target.closest('#generate-job');
  if (generate) {
    generate.disabled = true;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(selectedJob)}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The website could not be requested.');
      previousSignature = '';
    } catch (error) { generate.disabled = false; generate.textContent = `Couldn't request it: ${error.message}`; }
    return;
  }
  const button = event.target.closest('#copy-message');
  if (!button) return;
  const message = $('#manual-message'), status = $('#copy-status');
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(message.value);
    status.textContent = 'Message copied.';
  } catch {
    message.focus();
    message.select();
    status.textContent = 'Could not copy automatically. The message is selected; use your device’s copy command.';
  } finally { button.disabled = false; }
});
$('#close-dialog').addEventListener('click', () => $('#job-dialog').close());
$('#job-dialog').addEventListener('close', () => { selectedJob = null; });
$('#job-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close(); } });
render(); poll();
setInterval(refreshWorkerAges, 10000);


