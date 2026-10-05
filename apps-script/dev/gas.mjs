// In-memory stand-ins for the Apps Script services the ledger uses, so src/*.gs can run under
// Node for tests and the local dashboard preview. The fake Sheets is deliberately strict: range
// sizes are checked like Google's, and cells that are not plain text convert numbers, booleans,
// dates and formulas the way real Sheets does, so a missing '@' format shows up as a test failure.
// Like real Sheets, plain text ('@') stops number, date and boolean parsing but not formulas:
// setValues() still evaluates a leading '=' and swallows a leading apostrophe.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

class GasError extends Error {}

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    if (![row, column, numRows, numColumns].every(Number.isInteger)) throw new GasError('Range coordinates must be whole numbers.');
    if (numRows < 1) throw new GasError('The number of rows in the range must be at least 1.');
    if (numColumns < 1) throw new GasError('The number of columns in the range must be at least 1.');
    if (row < 1 || column < 1 || row + numRows - 1 > sheet.maxRows || column + numColumns - 1 > sheet.maxColumns) {
      throw new GasError('The coordinates of the range are outside the dimensions of the sheet.');
    }
    Object.assign(this, { sheet, row, column, numRows, numColumns });
  }
  each(fn) {
    for (let r = 0; r < this.numRows; r++) for (let c = 0; c < this.numColumns; c++) fn(this.row + r, this.column + c, r, c);
  }
  getValues() {
    this.sheet.spreadsheet.reads++;
    return Array.from({ length: this.numRows }, (_, r) => Array.from({ length: this.numColumns }, (_, c) => this.sheet.value(this.row + r, this.column + c)));
  }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.numRows) {
      throw new GasError(`The number of rows in the data does not match the number of rows in the range. The data has ${values && values.length} but the range has ${this.numRows}.`);
    }
    values.forEach(row => {
      if (!Array.isArray(row) || row.length !== this.numColumns) {
        throw new GasError(`The number of columns in the data does not match the number of columns in the range. The data has ${row && row.length} but the range has ${this.numColumns}.`);
      }
    });
    this.each((r, c, i, j) => this.sheet.write(r, c, values[i][j]));
    this.sheet.spreadsheet.writes++;
    return this;
  }
  setNumberFormat(format) {
    this.each((r, c) => this.sheet.formats.set(`${r}:${c}`, format));
    return this;
  }
  clearContent() {
    this.each((r, c) => this.sheet.cells.delete(`${r}:${c}`));
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class FakeSheet {
  constructor(spreadsheet, name) {
    Object.assign(this, { spreadsheet, name, maxRows: 1000, maxColumns: 26, frozenRows: 0, protections: [] });
    this.cells = new Map();
    this.formats = new Map();
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  getLastRow() {
    let last = 0;
    for (const key of this.cells.keys()) last = Math.max(last, Number(key.split(':')[0]));
    return last;
  }
  getRange(row, column, numRows = 1, numColumns = 1) {
    if (typeof row === 'string') throw new GasError('A1 notation is not supported by the fake sheet.');
    return new FakeRange(this, row, column, numRows, numColumns);
  }
  insertRowsAfter(after, count) {
    const shift = map => {
      const shifted = new Map();
      for (const [key, value] of map) {
        const [r, c] = key.split(':').map(Number);
        shifted.set(`${r > after ? r + count : r}:${c}`, value);
      }
      return shifted;
    };
    this.cells = shift(this.cells);
    this.formats = shift(this.formats);
    this.maxRows += count;
    return this;
  }
  insertColumnsAfter(after, count) {
    this.maxColumns += count;
    return this;
  }
  setFrozenRows(count) { this.frozenRows = count; return this; }
  getProtections() { return this.protections.slice(); }
  protect() {
    const protection = { description: '', warningOnly: false, setDescription(text) { this.description = text; return this; }, setWarningOnly(flag) { this.warningOnly = flag; return this; } };
    this.protections.push(protection);
    return protection;
  }
  value(row, column) {
    const key = `${row}:${column}`;
    return this.cells.has(key) ? this.cells.get(key) : '';
  }
  write(row, column, value) {
    const key = `${row}:${column}`;
    let stored;
    if (this.formats.get(key) !== '@' || this.spreadsheet.ignoresPlainText) stored = this.spreadsheet.parse(value);
    else if (typeof value === 'string' && (value.startsWith('=') || value.startsWith("'"))) stored = this.spreadsheet.parse(value);
    else stored = value === null || value === undefined ? '' : value;
    if (stored === '') this.cells.delete(key);
    else this.cells.set(key, stored);
  }
  /** Test helper: the table as row objects keyed by the header row. */
  records() {
    const last = this.getLastRow();
    if (last < 2) return [];
    const width = this.getRange(1, 1, 1, this.maxColumns).getValues()[0].filter(value => value !== '').length;
    const [header, ...rows] = this.getRange(1, 1, last, width).getValues();
    return rows.map(values => Object.fromEntries(header.map((name, index) => [name, values[index]])));
  }
}

class FakeSpreadsheet {
  constructor(name, makeDate) {
    this.id = 'sheet-' + crypto.randomUUID().slice(0, 8);
    this.name = name;
    this.makeDate = makeDate;
    this.sheets = [new FakeSheet(this, 'Sheet1')];
    this.reads = 0;
    this.writes = 0;
    this.ignoresPlainText = false; // tests: simulate a Sheet that converts values despite the '@' format
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  insertSheet(name, index = this.sheets.length) {
    if (this.getSheetByName(name)) throw new GasError(`A sheet with the name "${name}" already exists. Please enter another name.`);
    const sheet = new FakeSheet(this, name);
    this.sheets.splice(Math.min(index, this.sheets.length), 0, sheet);
    return sheet;
  }
  deleteSheet(sheet) {
    if (this.sheets.length === 1) throw new GasError("You can't remove all the sheets in a document.");
    this.sheets = this.sheets.filter(item => item !== sheet);
  }
  /** Google Sheets' parsing of typed input, applied to cells that are not plain text. */
  parse(value) {
    if (typeof value !== 'string') return value === null || value === undefined ? '' : value;
    if (value.startsWith('=')) return '#ERROR!';
    if (value.startsWith("'")) return value.slice(1);
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value.trim())) return Number(value);
    if (/^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+)?([+-]\d{2}:\d{2}|Z)?$/.test(value.trim())) return this.makeDate(value.trim());
    return value;
  }
}

/** Drive as the runner uses it: one folder of website files, replaced in place when rebuilt. */
class FakeDrive {
  constructor() { this.folders = new Map(); }
  createFolder(name) {
    const folder = new FakeFolder('folder-' + crypto.randomUUID().slice(0, 8), name);
    this.folders.set(folder.id, folder);
    return folder;
  }
  getFolderById(id) {
    if (!this.folders.has(id)) throw new GasError('No item with the given ID could be found. Possibly because you have not edited this item or you do not have permission to access it.');
    return this.folders.get(id);
  }
}

class FakeFolder {
  constructor(id, name) { Object.assign(this, { id, name, files: [] }); }
  getId() { return this.id; }
  createFile(name, content, mimeType) {
    const file = new FakeFile('file-' + crypto.randomUUID().slice(0, 8), name, content, mimeType);
    this.files.push(file);
    return file;
  }
  getFilesByName(name) {
    const matches = this.files.filter(file => file.name === name);
    let index = 0;
    return { hasNext: () => index < matches.length, next: () => matches[index++] };
  }
}

class FakeFile {
  constructor(id, name, content, mimeType) { Object.assign(this, { id, name, content, mimeType }); }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://drive.google.com/file/d/${this.id}/view?usp=drivesdk`; }
  getSize() { return Buffer.byteLength(this.content, 'utf8'); }
  setContent(content) { this.content = content; return this; }
}

function signedBytes(buffer) {
  return Array.from(buffer, byte => (byte > 127 ? byte - 256 : byte));
}

/**
 * Loads src/*.gs into a fresh sandbox. Options:
 *   owner      the account the script runs as (Session.getEffectiveUser)
 *   viewer     the visitor's email (Session.getActiveUser); '' for an anonymous visitor
 *   bound      true: the ledger spreadsheet exists (script created from the sheet); false: standalone
 *   quiet      silence console output from the scripts
 */
export function createRuntime({ owner = 'owner@example.com', viewer = 'owner@example.com', bound = true, quiet = true } = {}) {
  const logs = [];
  const sandboxConsole = {
    log: (...args) => { logs.push(args.join(' ')); if (!quiet) console.log(...args); },
    error: (...args) => { logs.push(args.join(' ')); if (!quiet) console.error(...args); },
    warn: (...args) => { logs.push(args.join(' ')); if (!quiet) console.warn(...args); },
  };
  const state = { owner, viewer, lockAvailable: true, ui: null };
  const props = new Map();
  const cache = new Map();
  const created = [];
  // UrlFetchApp records each request; tests set state.fetchReply to answer like GitHub would.
  const fetches = [];
  state.fetchReply = () => ({ code: 204, body: '' });
  const drive = new FakeDrive();
  const triggers = [];
  const context = vm.createContext({ console: sandboxConsole });
  // The sandbox's own Date, so `value instanceof Date` holds inside the .gs code.
  const makeDate = value => new (vm.runInContext('Date', context))(value);
  const container = bound ? new FakeSpreadsheet('Website Generator Ledger', makeDate) : null;
  const allSpreadsheets = () => [container, ...created].filter(Boolean);

  Object.assign(context, {
    SpreadsheetApp: {
      ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      getActiveSpreadsheet: () => container,
      openById: id => {
        const found = allSpreadsheets().find(item => item.id === id);
        if (!found) throw new GasError(`Unexpected error while getting the method or property openById on object SpreadsheetApp.`);
        return found;
      },
      create: name => {
        const spreadsheet = new FakeSpreadsheet(name, makeDate);
        created.push(spreadsheet);
        return spreadsheet;
      },
      flush: () => {},
      getUi: () => {
        if (!state.ui) throw new GasError('Cannot call SpreadsheetApp.getUi() from this context.');
        return state.ui;
      },
    },
    LockService: {
      getScriptLock: () => ({
        held: false,
        tryLock() { this.held = state.lockAvailable; return this.held; },
        waitLock() { if (!state.lockAvailable) throw new GasError('Lock timeout'); this.held = true; },
        releaseLock() { this.held = false; },
        hasLock() { return this.held; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => (props.has(key) ? props.get(key) : null),
        setProperty(key, value) { props.set(key, String(value)); return this; },
        deleteProperty(key) { props.delete(key); return this; },
        getProperties: () => Object.fromEntries(props),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: key => (cache.has(key) ? cache.get(key) : null),
        put: (key, value) => { if (String(value).length > 100 * 1024) throw new GasError('Argument too large: value'); cache.set(key, String(value)); },
        remove: key => { cache.delete(key); },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1', MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (algorithm, value, charset = 'utf8') => signedBytes(crypto.createHash(algorithm).update(typeof value === 'string' ? Buffer.from(value, charset) : Buffer.from(value)).digest()),
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (content = '') => ({
        content, mimeType: 'text/plain',
        setMimeType(type) { this.mimeType = type; return this; },
        getContent() { return this.content; },
        getMimeType() { return this.mimeType; },
      }),
    },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: (html = '') => htmlOutput(html),
      createHtmlOutputFromFile: name => htmlOutput(readSource(`${name}.html`)),
      createTemplateFromFile: name => ({ evaluate: () => htmlOutput(evaluateTemplate(readSource(`${name}.html`), context)) }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.viewer }),
      getEffectiveUser: () => ({ getEmail: () => state.owner }),
    },
    Logger: { log: (...args) => sandboxConsole.log(...args) },
    UrlFetchApp: {
      fetch: (url, params = {}) => {
        fetches.push({ url, params: JSON.parse(JSON.stringify(params)) });
        const reply = state.fetchReply(url, params) || { code: 200, body: '' };
        if (reply.throws) throw new GasError(reply.throws);
        return { getResponseCode: () => reply.code, getContentText: () => reply.body || '' };
      },
    },
    MimeType: { HTML: 'text/html', PLAIN_TEXT: 'text/plain', JSON: 'application/json' },
    DriveApp: drive,
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: trigger => { const index = triggers.indexOf(trigger); if (index >= 0) triggers.splice(index, 1); },
      newTrigger: handler => ({
        timeBased: () => ({
          everyMinutes: minutes => ({
            create: () => {
              const trigger = { handler, minutes, getHandlerFunction: () => handler };
              triggers.push(trigger);
              return trigger;
            },
          }),
        }),
      }),
    },
  });

  for (const file of fs.readdirSync(SRC_DIR).filter(name => name.endsWith('.gs')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'), context, { filename: file });
  }

  return {
    context,
    state,
    props,
    cache,
    logs,
    fetches,
    drive,
    triggers,
    /** The ledger spreadsheet (the bound container, or the one setup() created). */
    get spreadsheet() {
      const id = props.get('LEDGER_SPREADSHEET_ID');
      return (id && allSpreadsheets().find(item => item.id === id)) || container;
    },
    /** Calls a global function as the given visitor ('' = anonymous). */
    as(viewerEmail, name, ...args) {
      const previous = state.viewer;
      state.viewer = viewerEmail;
      try {
        return this.call(name, ...args);
      } finally {
        state.viewer = previous;
      }
    },
    call(name, ...args) {
      const fn = context[name];
      if (typeof fn !== 'function') throw new Error(`No global function ${name}`);
      return fn(...args);
    },
    evaluate(code) {
      return vm.runInContext(code, context);
    },
    /** Names google.script.run could call: global functions not ending in "_". */
    publicFunctions() {
      return Object.getOwnPropertyNames(context).filter(name => typeof context[name] === 'function' && !name.endsWith('_') && !['console'].includes(name) && !/^[A-Z]/.test(name));
    },
  };
}

function htmlOutput(content) {
  return {
    content, title: '', meta: {}, xframe: null,
    getContent() { return this.content; },
    setTitle(title) { this.title = title; return this; },
    addMetaTag(name, value) { this.meta[name] = value; return this; },
    setXFrameOptionsMode(mode) { this.xframe = mode; return this; },
    setWidth() { return this; },
    setHeight() { return this; },
  };
}

function readSource(file) {
  return fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Supports the scriptlets Index.html uses: <?!= raw ?> and <?= escaped ?>. */
export function evaluateTemplate(source, context) {
  if (/<\?(?![=!])/.test(source)) throw new Error('Only <?= ?> and <?!= ?> scriptlets are supported by the emulator.');
  return source.replace(/<\?(!?)=([\s\S]*?)\?>/g, (_, raw, expression) => {
    const value = String(vm.runInContext(expression.trim().replace(/;$/, ''), context));
    return raw ? value : value.replace(/[&<>"']/g, character => ESCAPES[character]);
  });
}
