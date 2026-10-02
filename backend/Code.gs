/**
 * SecureVault – Google Apps Script backend
 * ------------------------------------------------------------------
 * Bind this script to your Google Sheet (Extensions → Apps Script).
 *
 * What it stores
 *   • Sheet "Vault"  : one row per card → id | encrypted payload | createdAt | updatedAt
 *   • Script Properties : SALT, TOKEN_HASH, VERIFIER (+ failed-attempt counters)
 *
 * Security model
 *   • The browser encrypts every card (AES-256-GCM) BEFORE sending it.
 *     This script and your Google Sheet only ever see ciphertext.
 *   • The browser derives a secret "token" from your master password.
 *     Only SHA-256(token) is stored here. Every read/write must present the token.
 *   • 5 wrong tokens in a row → API is locked for 10 minutes.
 */

const SHEET_NAME   = 'Vault';
const HEADERS      = ['id', 'payload (encrypted)', 'createdAt', 'updatedAt'];
const MAX_FAILS    = 5;     // wrong-password attempts before lockout
const LOCK_MINUTES = 10;    // lockout duration
const MAX_PAYLOAD  = 45000; // Google Sheets cell limit is 50,000 characters

/* ============================ HTTP entry points ============================ */

/** Public, non-secret info: is the vault set up, and what is the salt? */
function doGet() {
  const p = props_();
  return out_({
    ok: true,
    initialized: !!p.getProperty('TOKEN_HASH'),
    salt: p.getProperty('SALT') || null,
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return out_(route_(req));
  } catch (err) {
    if (err && err.code) {
      return out_(Object.assign({ ok: false, error: err.code }, err.extra || {}));
    }
    console.error(err && err.stack ? err.stack : err);
    return out_({ ok: false, error: 'server_error' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function route_(req) {
  switch (req.action) {
    case 'setup':  return setup_(req);
    case 'list':   auth_(req); return list_();
    case 'create': auth_(req); return create_(req);
    case 'update': auth_(req); return update_(req);
    case 'delete': auth_(req); return delete_(req);
    case 'rekey':  auth_(req); return rekey_(req);
    default:       fail_('bad_action');
  }
}

/* ================================ Actions ================================= */

function setup_(req) {
  const p = props_();
  if (p.getProperty('TOKEN_HASH')) fail_('already_initialized');
  if (!isStr_(req.salt, 16, 64) || !/^[a-f0-9]{64}$/.test(req.token || '') || !isStr_(req.verifier, 10, 500)) {
    fail_('bad_request');
  }
  p.setProperties({
    SALT: req.salt,
    TOKEN_HASH: sha256Hex_(req.token),
    VERIFIER: req.verifier,
    FAILS: '0',
    LOCK_UNTIL: '0',
  });
  sheet_(); // make sure the "Vault" sheet exists
  return { ok: true };
}

function list_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const items = [];
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 4).getValues().forEach(function (r) {
      if (r[0]) items.push({ id: String(r[0]), payload: String(r[1]), createdAt: String(r[2]), updatedAt: String(r[3]) });
    });
  }
  return { ok: true, verifier: props_().getProperty('VERIFIER'), items: items };
}

function create_(req) {
  checkPayload_(req.payload);
  const sh = sheet_();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  sh.appendRow([id, req.payload, now, now]);
  return { ok: true, item: { id: id, payload: req.payload, createdAt: now, updatedAt: now } };
}

function update_(req) {
  checkPayload_(req.payload);
  const sh = sheet_();
  const row = findRow_(sh, req.id);
  if (!row) fail_('not_found');
  const now = new Date().toISOString();
  sh.getRange(row, 2).setValue(req.payload);
  sh.getRange(row, 4).setValue(now);
  return { ok: true, updatedAt: now };
}

function delete_(req) {
  const sh = sheet_();
  const row = findRow_(sh, req.id);
  if (!row) fail_('not_found');
  sh.deleteRow(row);
  return { ok: true };
}

/** Change master password: client re-encrypts everything with the new key. */
function rekey_(req) {
  if (!isStr_(req.newSalt, 16, 64) || !/^[a-f0-9]{64}$/.test(req.newToken || '') ||
      !isStr_(req.newVerifier, 10, 500) || !Array.isArray(req.items)) {
    fail_('bad_request');
  }
  const sh = sheet_();
  const last = sh.getLastRow();
  const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];

  // Safety: the client must send EVERY row, otherwise some data would become unreadable.
  const incoming = {};
  req.items.forEach(function (it) { checkPayload_(it.payload); incoming[String(it.id)] = it.payload; });
  if (ids.length !== Object.keys(incoming).length || ids.some(function (id) { return !(id in incoming); })) {
    fail_('stale_data');
  }

  if (ids.length) {
    const now = new Date().toISOString();
    sh.getRange(2, 2, ids.length, 1).setValues(ids.map(function (id) { return [incoming[id]]; }));
    sh.getRange(2, 4, ids.length, 1).setValues(ids.map(function () { return [now]; }));
  }
  props_().setProperties({
    SALT: req.newSalt,
    TOKEN_HASH: sha256Hex_(req.newToken),
    VERIFIER: req.newVerifier,
  });
  return { ok: true };
}

/* ============================== Authentication ============================ */

function auth_(req) {
  const p = props_();
  const hash = p.getProperty('TOKEN_HASH');
  if (!hash) fail_('not_initialized');

  const lockUntil = Number(p.getProperty('LOCK_UNTIL') || 0);
  if (Date.now() < lockUntil) {
    fail_('locked', { minutes: Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000)) });
  }

  if (typeof req.token === 'string' && sha256Hex_(req.token) === hash) {
    if (p.getProperty('FAILS') !== '0') p.setProperty('FAILS', '0');
    return;
  }

  const fails = Number(p.getProperty('FAILS') || 0) + 1;
  if (fails >= MAX_FAILS) {
    p.setProperties({ FAILS: '0', LOCK_UNTIL: String(Date.now() + LOCK_MINUTES * 60000) });
    fail_('locked', { minutes: LOCK_MINUTES });
  }
  p.setProperty('FAILS', String(fails));
  fail_('unauthorized', { attemptsLeft: MAX_FAILS - fails });
}

/* ================================= Helpers ================================ */

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange('A:D').setNumberFormat('@'); // keep everything as plain text
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 290);
    sh.setColumnWidth(2, 520);
  }
  return sh;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function checkPayload_(payload) {
  if (!isStr_(payload, 10, MAX_PAYLOAD)) fail_('bad_payload');
}

function isStr_(v, min, max) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function props_() { return PropertiesService.getScriptProperties(); }
function fail_(code, extra) { throw { code: code, extra: extra || {} }; }

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ Owner-only utilities ======================== */
/* Run these manually from the Apps Script editor (select function → Run).    */

/** Removes the lockout (e.g. you typed the wrong password too many times). */
function clearLockout() {
  props_().setProperties({ FAILS: '0', LOCK_UNTIL: '0' });
}

/**
 * ⚠ DESTRUCTIVE – wipes the master-password setup AND every stored card.
 * Use only if you forgot the master password and want to start over.
 */
function DANGER_resetVault() {
  props_().deleteAllProperties();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
}
