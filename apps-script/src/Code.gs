/**
 * Website Generator — Google Apps Script edition.
 *
 *   doGet   serves the dashboard (Index.html + Styles.html + App.html).
 *   doPost  is the JSON API the coordinator (Claude Code) calls through tools/sheets_ledger.py.
 *           It takes the same commands as tools/control.py and needs REVAMP_API_TOKEN.
 *   getState, queueBatch, cancelBatchFromDashboard, setManualSent, getJobActivity,
 *   requestWebsite and addTarget
 *           are the dashboard's functions for google.script.run. Each one checks the viewer
 *           first (Google account allowlist or dashboard key). Other public functions are owner
 *           tools that refuse anyone else, or the runner trigger, which is safe to call.
 *           Generate presses and new batches are recorded in the ledger. With the GitHub runner
 *           (Runner.gs) they also start a GitHub Actions job; otherwise a computer running
 *           tools/site_runner.py watch picks them up.
 *
 * Deploy as a web app that executes as you, with access "Anyone", so the agents can
 * call the API without a Google sign-in. The token and the dashboard checks keep the
 * ledger private. See apps-script/README.md.
 */

const PROP_API_TOKEN_ = 'REVAMP_API_TOKEN';
const PROP_DASHBOARD_KEY_ = 'REVAMP_DASHBOARD_KEY';
const PROP_DASHBOARD_USERS_ = 'REVAMP_DASHBOARD_USERS';
const MAX_POST_BYTES_ = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Web app

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Website Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function doPost(e) {
  let response;
  try {
    const body = parseRequest_(e);
    authorizeAgent_(body.token);
    response = { ok: true, result: runCommand_(body.command, isPlainObject_(body.args) ? body.args : {}) };
  } catch (error) {
    response = errorResponse_(error);
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function parseRequest_(e) {
  const contents = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!contents) throw new LedgerError_('Send a JSON body: {"token": "...", "command": "...", "args": {...}}');
  if (contents.length > MAX_POST_BYTES_) throw new LedgerError_('Request body is too large');
  let body;
  try {
    body = JSON.parse(contents);
  } catch (error) {
    throw new LedgerError_('Request body is not valid JSON');
  }
  if (!isPlainObject_(body) || typeof body.command !== 'string') throw new LedgerError_('Request needs a command');
  return body;
}

function errorResponse_(error) {
  if (error instanceof LedgerError_) return { ok: false, error: error.message, retryable: error.retryable };
  console.error(error && error.stack ? error.stack : error);
  return { ok: false, error: 'Apps Script error: ' + (error && error.message ? error.message : String(error)) };
}

function runCommand_(command, args) {
  switch (command) {
    case 'ping': return { pong: true, server_time: nowIso_(), revision: ledgerRevision_() };
    case 'state': return writeLedger_(tx => Object.assign(snapshot_(tx), { revision: ledgerRevision_(), runner: runnerInfo_() }));
    case 'batch': return createBatch_(args.industry, args.city, args.count, args.mode, args.country);
    case 'add': return addJob_(args.batch, args.name, args.url, args.alias || []);
    case 'add-target': return addTarget_({ name: args.name, url: args.url, batch_id: args.batch, generate: Boolean(args.generate), aliases: args.alias || [], reason: args.reason || '' }, args.by || 'the coordinator');
    case 'claim': return claimJob_(args.batch || null, args.worker, args.job || null);
    case 'request': return requestWebsite_(args.job, args.by || 'the coordinator');
    case 'requests': return pendingRequests_(args.heartbeat);
    case 'touch': return touchWorker_(args.job, args.worker);
    case 'note': return addNote_(args.message, args.job || null);
    case 'save-site': return saveSiteFile_(args.job, args.worker, args.name, args.html);
    case 'update': return updateJob_(args.job, args.worker, args.stage || null, args.detail || '', args.fields);
    case 'alias': return addAlias_(args.job, args.worker, args.identity);
    case 'capacity': return setCapacity_(args.count);
    case 'contact-begin': return contactBegin_(args.job, args.worker, args.message, args.form_url);
    case 'contact-finish': return contactFinish_(args.job, args.worker, args.status, args.evidence);
    case 'manual-outreach': return manualOutreach_(args.job, args.worker, args.reason, args.message, args.email || '', args.phone || '');
    case 'recover': return recoverJob_(args.job, args.reason);
    case 'batch-status': return batchStatus_(args.batch, args.status);
    case 'cancel-batch': return cancelBatch_(args.batch, args.reason);
    case 'clear-all': return clearAll_(args.reason);
    case 'import': return importLedger_(args.tables, args.source);
    default: throw new LedgerError_('Unknown command: ' + command);
  }
}

// ---------------------------------------------------------------------------
// Dashboard endpoints (google.script.run)

function getState(knownRevision, key) {
  const viewer = authorizeViewer_(key);
  const revision = ledgerRevision_(); // read before the snapshot so a concurrent write triggers a refetch
  // The generator heartbeat changes without a ledger write, so it travels with "unchanged" replies too.
  if (knownRevision && String(knownRevision) === revision) {
    return { unchanged: true, revision, generator: generatorStatus_(), runner: runnerInfo_(), server_time: nowIso_() };
  }
  return readLedger_(tx => Object.assign(snapshot_(tx), {
    revision,
    runner: runnerInfo_(),
    viewer: { email: viewer.email, method: viewer.method },
    sheet_url: ledgerSpreadsheet_().getUrl(),
  }));
}

/** Queues a batch; with the GitHub runner, GitHub starts finding its targets right away. */
function queueBatch(input, key) {
  authorizeViewer_(key);
  const values = isPlainObject_(input) ? input : {};
  const result = createBatch_(values.industry, values.city, values.requested_count, values.mode, values.country);
  return Object.assign(result, { runner: startRunner_('New batch') });
}

/** The Generate button: asks the website generator to build one queued business. */
function requestWebsite(jobId, key) {
  const viewer = authorizeViewer_(key);
  const result = requestWebsite_(jobId, viewerLabel_(viewer));
  return Object.assign(result, { runner: startRunner_('Generate pressed') });
}

/** Adds a business by its website address, to a batch or the hand-picked list, optionally generating it right away. */
function addTarget(input, key) {
  const viewer = authorizeViewer_(key);
  const result = addTarget_(input, viewerLabel_(viewer));
  return Object.assign(result, { runner: result.requested ? startRunner_('Website added') : null });
}

function cancelBatchFromDashboard(batchId, reason, key) {
  const viewer = authorizeViewer_(key);
  if (typeof reason !== 'string' || !reason.trim()) throw new LedgerError_('Say why you are cancelling this batch.');
  return cancelBatch_(batchId, `Cancelled from the dashboard by ${viewerLabel_(viewer)}: ${reason.trim()}.`);
}

function setManualSent(jobId, sent, key) {
  const viewer = authorizeViewer_(key);
  return setManualSent_(jobId, Boolean(sent), viewerLabel_(viewer));
}

function getJobActivity(jobId, key) {
  authorizeViewer_(key);
  return jobActivity_(jobId);
}

// ---------------------------------------------------------------------------
// Access control

function activeEmail_() {
  try {
    return (Session.getActiveUser().getEmail() || '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function ownerEmail_() {
  try {
    return (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (error) {
    return '';
  }
}

/**
 * A viewer is allowed when Google identifies them as the owner or a listed user
 * (REVAMP_DASHBOARD_USERS, comma separated; "@example.com" allows a whole Workspace
 * domain), or when they present the dashboard key.
 */
function authorizeViewer_(key) {
  const props = PropertiesService.getScriptProperties();
  const email = activeEmail_();
  if (email) {
    const allowed = (props.getProperty(PROP_DASHBOARD_USERS_) || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (email === ownerEmail_() || allowed.indexOf(email) >= 0 || allowed.indexOf('@' + email.split('@')[1]) >= 0) {
      return { email, method: 'google' };
    }
  }
  const expected = props.getProperty(PROP_DASHBOARD_KEY_);
  const given = typeof key === 'string' ? key.replace(/\s+/g, '').toUpperCase() : '';
  if (expected && given && secretsMatch_(given, expected)) return { email, method: 'key' };
  throw new Error('ACCESS_DENIED: ' + (given ? 'That dashboard key is not valid.' : 'This dashboard is private.'));
}

function viewerLabel_(viewer) {
  return viewer.email || 'a dashboard key holder';
}

function authorizeAgent_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(PROP_API_TOKEN_);
  if (!expected) throw new LedgerError_('The agent API token is not configured. Run setup() in the Apps Script editor.');
  if (typeof token !== 'string' || !secretsMatch_(token, expected)) throw new LedgerError_('Invalid agent API token');
}

function secretsMatch_(given, expected) {
  let difference = given.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) {
    difference |= (given.charCodeAt(index % Math.max(1, given.length)) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

// ---------------------------------------------------------------------------
// Owner tools: run from the Apps Script editor or the sheet's "Website Generator" menu.

/** Setup and secrets are only for someone running the script as themselves, never for web-app visitors. */
function requireOwner_() {
  const active = activeEmail_();
  if (!active || active !== ownerEmail_()) throw new Error('Run this from the Apps Script editor or the ledger sheet menu.');
}

function setup() {
  requireOwner_();
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS_)) throw new Error('The ledger is busy. Try setup() again in a moment.');
  let spreadsheet;
  try {
    const id = props.getProperty(PROP_SPREADSHEET_);
    spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Website Generator Ledger');
    props.setProperty(PROP_SPREADSHEET_, spreadsheet.getId());
    ledgerSpreadsheetCache_ = spreadsheet;
    verifyPlainTextCells_(spreadsheet);
    ensureLedgerSheets_(spreadsheet);
    if (!props.getProperty(PROP_API_TOKEN_)) props.setProperty(PROP_API_TOKEN_, newApiToken_());
    if (!props.getProperty(PROP_DASHBOARD_KEY_)) props.setProperty(PROP_DASHBOARD_KEY_, newDashboardKey_());
    SpreadsheetApp.flush();
    bumpRevision_();
  } finally {
    lock.releaseLock();
  }
  console.log('Ledger ready: ' + spreadsheet.getUrl());
  console.log('Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Then use the sheet menu "Website Generator" (or showApiToken / showDashboardKey) for the secrets.');
  return spreadsheet.getUrl();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Website Generator')
    .addItem('Show agent API token', 'showApiToken')
    .addItem('Show dashboard key', 'showDashboardKey')
    .addSeparator()
    .addItem('Set up or repair the ledger', 'setup')
    .addItem('Run on GitHub (no computer needed)…', 'useGitHubRunner')
    .addItem('Run on a computer instead', 'useComputerRunner')
    .addItem('Replace agent API token…', 'rotateApiToken')
    .addItem('Replace dashboard key…', 'rotateDashboardKey')
    .addToUi();
}

/** Manual edits in the sheet bump the revision so open dashboards refresh. */
function onEdit() {
  try {
    bumpRevision_();
  } catch (error) {
    // Simple triggers have limited permissions; dashboards also refresh every minute.
  }
}

function showApiToken() {
  requireOwner_();
  showSecret_('Agent API token', 'Add this to the .env file next to REVAMP_SHEETS_URL:', 'REVAMP_SHEETS_TOKEN=' + requireSecret_(PROP_API_TOKEN_));
}

function showDashboardKey() {
  requireOwner_();
  showSecret_('Dashboard key', 'Enter this key when the dashboard asks for it:', requireSecret_(PROP_DASHBOARD_KEY_));
}

function rotateApiToken() {
  requireOwner_();
  if (!confirmOwner_('Replace the agent API token?', 'Agents using the current token stop working until .env has the new one.')) return;
  PropertiesService.getScriptProperties().setProperty(PROP_API_TOKEN_, newApiToken_());
  showApiToken();
}

function rotateDashboardKey() {
  requireOwner_();
  if (!confirmOwner_('Replace the dashboard key?', 'Anyone using the current key will be asked for the new one.')) return;
  PropertiesService.getScriptProperties().setProperty(PROP_DASHBOARD_KEY_, newDashboardKey_());
  showDashboardKey();
}

function requireSecret_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Run setup() first.');
  return value;
}

function confirmOwner_(title, message) {
  try {
    const ui = SpreadsheetApp.getUi();
    return ui.alert(title, message, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
  } catch (error) {
    return true; // run from the editor: invoking the function is the confirmation
  }
}

function showSecret_(title, hint, value) {
  const escape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  try {
    const html = HtmlService.createHtmlOutput(
      '<div style="font:14px/1.5 system-ui,sans-serif;color:#1b1f1c">' +
      `<p style="margin:0 0 10px">${escape(hint)}</p>` +
      `<input readonly value="${escape(value)}" onclick="this.select()" style="width:100%;box-sizing:border-box;padding:9px 10px;font:13px ui-monospace,Consolas,monospace;border:1px solid #c9cec6;border-radius:8px">` +
      '<p style="margin:10px 0 0;color:#5d625e;font-size:12px">Keep it private: anyone with it can use the ledger.</p></div>'
    ).setWidth(480).setHeight(170);
    SpreadsheetApp.getUi().showModalDialog(html, title);
  } catch (error) {
    // Standalone script (no sheet UI): the execution log is visible only to this project's editors.
    console.log(`${title} — ${hint} ${value}`);
  }
}

function newApiToken_() {
  return 'wg_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function newDashboardKey_() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8);
  let key = '';
  for (let index = 0; index < 20; index++) key += alphabet.charAt((bytes[index] & 0xff) % alphabet.length);
  return key.match(/.{5}/g).join('-');
}
