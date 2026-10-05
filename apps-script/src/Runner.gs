/**
 * Runner.gs — hands the work to GitHub Actions, so no computer has to stay on (like Creator Lab's runner).
 *
 * The dashboard still records every request in the ledger. With GENERATOR_RUNNER = github this file
 * also asks GitHub to start .github/workflows/website-generator.yml right away. That job uses the agent
 * API (REVAMP_API_TOKEN) to find targets for queued batches, build the requested websites, upload them
 * to JetAI, store each finished page in Drive (save-site) and report progress. A 10-minute trigger
 * re-sends the start request when work is waiting and no job has reported for a while; the workflow's
 * hourly schedule is the last safety net.
 *
 * Script properties:
 *   GENERATOR_RUNNER  'github', set by useGitHubRunner(); otherwise a computer runs tools/site_runner.py watch
 *   GITHUB_REPO       owner/name, e.g. MasahisaSekita/websitegenerator
 *   GITHUB_TOKEN      fine-grained token for that one repository (Contents: read and write); it only starts the job
 */
const PROP_RUNNER_ = 'GENERATOR_RUNNER';
const PROP_DISPATCH_ = 'GENERATOR_DISPATCH';
const PROP_SITES_FOLDER_ = 'SITES_FOLDER_ID';
const DISPATCH_EVENT_ = 'website-generator';
const REDISPATCH_AFTER_MS_ = 10 * 60 * 1000;
const RUNNER_QUIET_MS_ = 5 * 60 * 1000;
const MAX_SITE_CHARS_ = 5000000;

function githubRunner_() {
  return (PropertiesService.getScriptProperties().getProperty(PROP_RUNNER_) || '') === 'github';
}

/** What the dashboard shows about the runner: the mode and the last start request. */
function runnerInfo_() {
  const props = PropertiesService.getScriptProperties();
  let dispatch = null;
  try {
    dispatch = JSON.parse(props.getProperty(PROP_DISPATCH_) || 'null');
  } catch (error) {
    dispatch = null;
  }
  return { mode: githubRunner_() ? 'github' : 'local', repo: props.getProperty('GITHUB_REPO') || '', dispatch };
}

/** Asks GitHub to start the website generator job. Never throws: the outcome is stored for the dashboard. */
function dispatchGitHub_(reason) {
  const props = PropertiesService.getScriptProperties();
  const repo = (props.getProperty('GITHUB_REPO') || '').trim();
  const token = (props.getProperty('GITHUB_TOKEN') || '').trim();
  const record = { at: nowIso_(), reason: String(reason || '').slice(0, 120), ok: false };
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    record.error = 'Set GITHUB_REPO (owner/name) and GITHUB_TOKEN in the script properties.';
  } else {
    try {
      const response = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        payload: JSON.stringify({ event_type: DISPATCH_EVENT_, client_payload: { reason: record.reason } }),
      });
      const code = response.getResponseCode();
      record.ok = code === 204 || code === 200;
      if (!record.ok) {
        record.error = `GitHub did not start the job (HTTP ${code})` + ([401, 403, 404].indexOf(code) >= 0 ? ': check GITHUB_TOKEN and GITHUB_REPO.' : '.');
      }
    } catch (error) {
      record.error = 'Could not reach GitHub: ' + (error && error.message ? error.message : String(error));
    }
  }
  props.setProperty(PROP_DISPATCH_, JSON.stringify(record));
  return record;
}

/** Starts the GitHub job when the runner is GitHub; returns the dispatch record, or null on the computer runner. */
function startRunner_(reason) {
  return githubRunner_() ? dispatchGitHub_(reason) : null;
}

/** The 10-minute trigger: re-sends a start request when work waits and no job has reported recently. */
function checkGitHubRunner() {
  if (!githubRunner_()) return { skipped: 'the computer runner is in use' };
  const info = runnerInfo_();
  const lastStart = info.dispatch ? Date.parse(info.dispatch.at) || 0 : 0;
  if (Date.now() - lastStart < REDISPATCH_AFTER_MS_) return { skipped: 'started recently' };
  const heartbeat = generatorStatus_();
  if (heartbeat && Date.now() - (Date.parse(heartbeat.seen_at) || 0) < RUNNER_QUIET_MS_) return { skipped: 'a job is running' };
  const waiting = readLedger_(tx => ({
    requests: tx.table('jobs').rows.filter(job => {
      if (job.stage !== 'queued' || job.worker) return false;
      try { return Boolean(parseJobData_(job).generate_requested_at); } catch (error) { return false; }
    }).length,
    batches: tx.table('batches').rows.filter(batch => batch.status === 'queued' && batch.industry !== HAND_PICKED_.industry).length,
  }));
  if (!waiting.requests && !waiting.batches) return { skipped: 'nothing is waiting' };
  return dispatchGitHub_('Safety check: work is waiting');
}

/** Stores a finished website in the owner's Drive (one file per business, replaced when it's built again). */
function saveSiteFile_(jobId, worker, name, html) {
  if (typeof html !== 'string' || !html.trim()) throw new LedgerError_('The website file is empty');
  if (html.length > MAX_SITE_CHARS_) throw new LedgerError_('The website file is larger than 5,000,000 characters');
  writeLedger_(tx => { ownJob_(tx, jobId, worker); return null; }); // only the job's own worker may store its file
  const fileName = (String(name || jobId).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || jobId).replace(/\.html?$/i, '') + '.html';
  const folder = sitesFolder_();
  const existing = folder.getFilesByName(fileName);
  let file;
  if (existing.hasNext()) {
    file = existing.next();
    file.setContent(html); // the business was built again: replace its page
  } else {
    file = folder.createFile(fileName, html, MimeType.HTML);
  }
  return { file_id: file.getId(), name: fileName, url: file.getUrl() };
}

function sitesFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_SITES_FOLDER_);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (error) {
      // the folder was deleted: make a new one
    }
  }
  const folder = DriveApp.createFolder('Website Generator websites');
  props.setProperty(PROP_SITES_FOLDER_, folder.getId());
  return folder;
}

// ---------------------------------------------------------------------------
// Owner tools: run from the editor or the sheet's "Website Generator" menu.

/** Sends new work to GitHub Actions, so no computer has to stay on. Safe to run again. */
function useGitHubRunner() {
  requireOwner_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_RUNNER_, 'github');
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'checkGitHubRunner').forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('checkGitHubRunner').timeBased().everyMinutes(10).create();
  const missing = ['GITHUB_REPO', 'GITHUB_TOKEN'].filter(name => !(props.getProperty(name) || '').trim());
  if (missing.length) {
    tellOwner_('Runs on GitHub', `Almost there: add ${missing.join(' and ')} under Project Settings → Script properties, then choose this menu item again to test it.`);
    return { mode: 'github', missing };
  }
  const test = dispatchGitHub_('Switched to GitHub');
  tellOwner_('Runs on GitHub', test.ok
    ? 'New work now goes to GitHub Actions. A test run just started: it appears in the repository\'s Actions tab and finds nothing to do.'
    : 'New work goes to GitHub Actions, but the test start failed: ' + test.error);
  return { mode: 'github', test };
}

/** Back to a computer running tools/site_runner.py watch (or Start Generator.bat). */
function useComputerRunner() {
  requireOwner_();
  PropertiesService.getScriptProperties().deleteProperty(PROP_RUNNER_);
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'checkGitHubRunner').forEach(trigger => ScriptApp.deleteTrigger(trigger));
  tellOwner_('Runs on a computer', 'New work waits for a computer running Start Generator.bat (tools/site_runner.py watch).');
  return { mode: 'local' };
}

function tellOwner_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    console.log(`${title}: ${message}`); // run from the editor: the execution log shows it
  }
}
