/**
 * Google Sheets storage for the Website Generator ledger.
 *
 * Each table from tools/control.py's SQLite schema is one tab with a header row.
 * Every ledger cell uses the plain-text number format ('@'), so Sheets never turns
 * phone numbers into numbers or ISO timestamps into dates. Plain text does not stop a
 * leading '=' from becoming a formula (or a leading apostrophe from being swallowed),
 * so such values are stored behind an invisible marker and restored on read
 * (encodeCell_). Mutations hold the script lock and are written only after every
 * check has passed — the stand-in for SQLite's BEGIN IMMEDIATE transactions.
 */

const TABLES_ = {
  jobs: { sheet: 'Jobs', columns: ['id', 'batch_id', 'name', 'url', 'domain', 'stage', 'worker', 'detail', 'reason', 'preview_url', 'contact_status', 'data', 'updated_at'] },
  batches: { sheet: 'Batches', columns: ['id', 'industry', 'city', 'status', 'created_at', 'requested_count'] },
  events: { sheet: 'Events', columns: ['id', 'job_id', 'message', 'created_at'] },
  workers: { sheet: 'Workers', columns: ['id', 'job_id', 'status', 'updated_at'] },
  identities: { sheet: 'Identities', columns: ['identity', 'job_id'] },
  submissions: { sheet: 'Submissions', columns: ['job_id', 'message', 'message_hash', 'form_url', 'status', 'evidence', 'created_at'] },
  config: { sheet: 'Config', columns: ['key', 'value'] },
};
const NULLABLE_COLUMNS_ = { jobs: ['worker'], events: ['job_id'], workers: ['job_id'], submissions: ['evidence'] };
const INTEGER_COLUMNS_ = { batches: ['requested_count'], events: ['id'] };
const CELL_LIMIT_ = 50000;
const TEXT_FORMAT_ = '@';
const LOCK_WAIT_MS_ = 25000;
const PROP_SPREADSHEET_ = 'LEDGER_SPREADSHEET_ID';
const PROP_REVISION_ = 'LEDGER_REVISION';
// U+2060 WORD JOINER: invisible, and never the start of a formula.
const CELL_ESCAPE_ = '\u2060';

let ledgerSpreadsheetCache_ = null;

function ledgerSpreadsheet_() {
  if (ledgerSpreadsheetCache_) return ledgerSpreadsheetCache_;
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_);
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new LedgerError_('The ledger is not set up yet. Open the Apps Script editor and run setup().');
  ledgerSpreadsheetCache_ = spreadsheet;
  return spreadsheet;
}

function ledgerSheet_(name) {
  const title = TABLES_[name].sheet;
  const sheet = ledgerSpreadsheet_().getSheetByName(title);
  if (!sheet) throw new LedgerError_(`The "${title}" tab is missing. Run setup() to repair the ledger.`);
  return sheet;
}

/** Reads without the lock: fast, but may observe a write in progress. Used for dashboard polling. */
function readLedger_(fn) {
  return fn(new LedgerTx_(false));
}

/** Runs fn under the script lock and commits its changes only if fn returns without throwing. */
function writeLedger_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS_)) throw new LedgerError_('The ledger is busy right now. Try again in a moment.', true);
  try {
    const tx = new LedgerTx_(true);
    const result = fn(tx);
    if (tx.changed()) {
      tx.commit();
      SpreadsheetApp.flush();
      bumpRevision_();
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

class LedgerTx_ {
  constructor(writable) {
    this.writable = writable;
    this.tables = {};
    this.log = new EventLog_(writable);
  }
  table(name) {
    if (!this.tables[name]) this.tables[name] = new LedgerTable_(name, this.writable);
    return this.tables[name];
  }
  event(jobId, message) {
    this.log.add(jobId, message);
  }
  changed() {
    return this.log.changed() || Object.keys(this.tables).some(name => this.tables[name].changed());
  }
  commit() {
    // Encode everything first: an oversized cell must abort the whole transaction before any write.
    const writes = Object.keys(this.tables).map(name => this.tables[name].plan()).concat([this.log.plan()]);
    writes.forEach(apply => apply());
  }
}

class LedgerTable_ {
  constructor(name, writable) {
    this.name = name;
    this.columns = TABLES_[name].columns;
    this.writable = writable;
    this.sheet = ledgerSheet_(name);
    this.rows = [];
    this.rowNumbers = [];
    this.dirty = new Set();
    this.added = [];
    this.cleared = false;
    const last = this.sheet.getLastRow();
    if (last < 1) throw new LedgerError_(`The "${TABLES_[name].sheet}" tab has no header row. Run setup() to repair the ledger.`);
    const values = this.sheet.getRange(1, 1, last, this.columns.length).getValues();
    assertHeader_(name, values[0]);
    for (let index = 1; index < values.length; index++) {
      if (isBlankRow_(values[index])) continue;
      this.rows.push(decodeRow_(name, values[index]));
      this.rowNumbers.push(index + 1);
    }
  }
  find(predicate) {
    return this.rows.find(predicate) || null;
  }
  filter(predicate) {
    return this.rows.filter(predicate);
  }
  insert(values) {
    this.assertWritable_();
    const row = {};
    this.columns.forEach(column => { row[column] = values[column] === undefined ? null : values[column]; });
    this.rows.push(row);
    this.rowNumbers.push(null);
    this.added.push(row);
    return row;
  }
  update(row, changes) {
    this.assertWritable_();
    const index = this.rows.indexOf(row);
    if (index < 0) throw new Error(`Row is not part of ${this.name}`);
    Object.assign(row, changes);
    if (this.rowNumbers[index] !== null) this.dirty.add(index);
  }
  clear() {
    this.assertWritable_();
    this.cleared = true;
    this.rows = [];
    this.rowNumbers = [];
    this.dirty.clear();
    this.added = [];
  }
  changed() {
    return this.cleared || this.dirty.size > 0 || this.added.length > 0;
  }
  /** Encodes pending writes (validating cell sizes) and returns a function that applies them. */
  plan() {
    const updates = Array.from(this.dirty).map(index => ({ row: this.rowNumbers[index], values: encodeRow_(this.name, this.rows[index]) }));
    const additions = this.added.map(row => encodeRow_(this.name, row));
    return () => {
      if (this.cleared) {
        const last = this.sheet.getLastRow();
        if (last > 1) this.sheet.getRange(2, 1, last - 1, this.columns.length).clearContent();
        writeBlock_(this.sheet, 2, additions);
        return;
      }
      updates.forEach(update => writeBlock_(this.sheet, update.row, [update.values]));
      writeBlock_(this.sheet, this.sheet.getLastRow() + 1, additions);
    };
  }
  assertWritable_() {
    if (!this.writable) throw new Error('Ledger writes must run inside writeLedger_()');
  }
}

/** Append-only access to the Events tab, so writes never need to read the whole history. */
class EventLog_ {
  constructor(writable) {
    this.writable = writable;
    this.pending = [];
    this.cleared = false;
  }
  add(jobId, message) {
    if (!this.writable) throw new Error('Ledger writes must run inside writeLedger_()');
    this.pending.push({ job_id: jobId || null, message: truncate_(String(message), 4000), created_at: nowIso_() });
  }
  clear() {
    this.cleared = true;
    this.pending = [];
  }
  changed() {
    return this.cleared || this.pending.length > 0;
  }
  plan() {
    const pending = this.pending.slice();
    pending.forEach(event => encodeRow_('events', Object.assign({ id: 0 }, event)));
    return () => {
      if (!this.cleared && !pending.length) return;
      const sheet = ledgerSheet_('events');
      let last = sheet.getLastRow();
      if (this.cleared && last > 1) {
        sheet.getRange(2, 1, last - 1, TABLES_.events.columns.length).clearContent();
        last = 1;
      }
      if (!pending.length) return;
      let nextId = 1;
      if (last > 1) {
        const previous = parseInt(String(sheet.getRange(last, 1, 1, 1).getValues()[0][0]), 10);
        nextId = (Number.isFinite(previous) ? previous : last - 1) + 1;
      }
      writeBlock_(sheet, last + 1, pending.map((event, index) => encodeRow_('events', Object.assign({ id: nextId + index }, event))));
    };
  }
}

function writeBlock_(sheet, startRow, values) {
  if (!values.length) return;
  const needed = startRow + values.length - 1;
  const maxRows = sheet.getMaxRows();
  if (needed > maxRows) sheet.insertRowsAfter(maxRows, needed - maxRows);
  sheet.getRange(startRow, 1, values.length, values[0].length).setNumberFormat(TEXT_FORMAT_).setValues(values);
}

/** Newest first, like `SELECT * FROM events ORDER BY id DESC LIMIT n`. */
function recentEvents_(limit) {
  const sheet = ledgerSheet_('events');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const count = Math.min(limit, last - 1);
  const values = sheet.getRange(last - count + 1, 1, count, TABLES_.events.columns.length).getValues();
  return values.filter(row => !isBlankRow_(row)).map(row => decodeRow_('events', row)).reverse();
}

function allEvents_() {
  const sheet = ledgerSheet_('events');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, TABLES_.events.columns.length).getValues()
    .filter(row => !isBlankRow_(row)).map(row => decodeRow_('events', row));
}

function assertHeader_(name, header) {
  const expected = TABLES_[name].columns;
  if (expected.some((column, index) => String(header[index] === undefined ? '' : header[index]).trim() !== column)) {
    throw new LedgerError_(`The "${TABLES_[name].sheet}" tab's header row should be: ${expected.join(', ')}. Restore it, then run setup().`);
  }
}

function isBlankRow_(values) {
  return values.every(value => value === '' || value === null || value === undefined);
}

/** Text Sheets would alter even in a plain-text cell gets the invisible marker in front. */
function encodeCell_(text) {
  const first = text.charAt(0);
  return first === '=' || first === "'" || first === CELL_ESCAPE_ ? CELL_ESCAPE_ + text : text;
}

function decodeCell_(text) {
  return text.charAt(0) === CELL_ESCAPE_ ? text.slice(1) : text;
}

function encodeRow_(name, row) {
  return TABLES_[name].columns.map(column => {
    const value = row[column];
    const text = encodeCell_(value === null || value === undefined ? '' : String(value));
    if (text.length > CELL_LIMIT_) {
      throw new LedgerError_(`${name}.${column} is too large for a Google Sheets cell (${CELL_LIMIT_} characters maximum).`);
    }
    return text;
  });
}

function decodeRow_(name, values) {
  const nullable = NULLABLE_COLUMNS_[name] || [];
  const integers = INTEGER_COLUMNS_[name] || [];
  const row = {};
  TABLES_[name].columns.forEach((column, index) => {
    let value = values[index];
    // Cells are plain text, but tolerate a cell someone reformatted by hand.
    if (value instanceof Date) value = value.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    value = decodeCell_(value === null || value === undefined ? '' : String(value));
    if (integers.indexOf(column) >= 0) row[column] = parseInt(value, 10) || 0;
    else if (nullable.indexOf(column) >= 0 && value === '') row[column] = null;
    else row[column] = value;
  });
  return row;
}

function truncate_(text, limit) {
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit).join('') : text;
}

/**
 * The revision changes on every committed write. Dashboards send the revision they
 * last rendered and skip re-reading the sheets when nothing changed.
 */
function bumpRevision_() {
  const revision = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  PropertiesService.getScriptProperties().setProperty(PROP_REVISION_, revision);
  CacheService.getScriptCache().put(PROP_REVISION_, revision, 21600);
  return revision;
}

function ledgerRevision_() {
  const cache = CacheService.getScriptCache();
  let revision = cache.get(PROP_REVISION_);
  if (!revision) {
    revision = PropertiesService.getScriptProperties().getProperty(PROP_REVISION_) || '0';
    cache.put(PROP_REVISION_, revision, 21600);
  }
  return revision;
}

/** Creates or repairs the ledger tabs. Existing rows are never modified. */
function ensureLedgerSheets_(spreadsheet) {
  Object.keys(TABLES_).forEach((name, position) => {
    const title = TABLES_[name].sheet;
    const columns = TABLES_[name].columns;
    let sheet = spreadsheet.getSheetByName(title);
    if (!sheet) sheet = spreadsheet.insertSheet(title, position);
    if (sheet.getMaxColumns() < columns.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns.length - sheet.getMaxColumns());
    const header = sheet.getRange(1, 1, 1, columns.length);
    const current = header.getValues()[0];
    if (isBlankRow_(current)) header.setNumberFormat(TEXT_FORMAT_).setValues([columns]);
    else assertHeader_(name, current);
    header.setFontWeight('bold').setBackground('#eef1ea');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), columns.length).setNumberFormat(TEXT_FORMAT_);
    if (!sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      sheet.protect()
        .setDescription('Website Generator ledger: edits here bypass the ledger safety checks.')
        .setWarningOnly(true);
    }
  });
  const config = new LedgerTable_('config', true);
  if (!config.find(row => row.key === 'max_workers')) {
    config.insert({ key: 'max_workers', value: '3' });
    config.plan()();
  }
  const placeholder = spreadsheet.getSheetByName('Sheet1');
  if (placeholder && placeholder.getLastRow() === 0 && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(placeholder);
}

/** Confirms values survive this account's Sheets exactly, the way the ledger writes them, before any real data is stored. */
function verifyPlainTextCells_(spreadsheet) {
  const probe = ['+16175550123', '2026-10-02T12:00:00+00:00', '=1+1', "'quoted", 'TRUE', '007', '1e5', '{"a":1}'];
  const sheet = spreadsheet.insertSheet('_ledger_check');
  try {
    const range = sheet.getRange(1, 1, 1, probe.length);
    range.setNumberFormat(TEXT_FORMAT_).setValues([probe.map(encodeCell_)]);
    SpreadsheetApp.flush();
    const stored = range.getValues()[0].map(value => (typeof value === 'string' ? decodeCell_(value) : value));
    const changed = probe.filter((value, index) => stored[index] !== value);
    if (changed.length) {
      throw new LedgerError_('Google Sheets altered plain-text test values (' + changed.join(', ') + '). The ledger needs literal text cells, so setup stopped before storing data.');
    }
  } finally {
    spreadsheet.deleteSheet(sheet);
  }
}
