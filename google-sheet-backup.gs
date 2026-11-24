/**
 * Hours → Google Sheet sync and backup.
 *
 * Set it up, or update it, in the Sheet:
 *   1. Extensions → Apps Script. Replace what's there with this file.
 *   2. Put a password between the quotes on the PASSWORD line below. Save.
 *   3. First time: Deploy → New deployment → type Web app, "Execute as: Me",
 *      "Who has access: Anyone". Approve the permission prompt.
 *      Updating: Deploy → Manage deployments → pencil icon → Version: New version
 *      → Deploy. That keeps the same address.
 *   4. In Hours → Settings on every device, paste the web app address (it ends
 *      in /exec) and the same password.
 *
 * Every device sends its changes here and picks up the others'. Nothing is read
 * or written without the password. This script can only touch this one Sheet.
 *
 *   Sync     (hidden) the shared copy every device syncs with. Don't edit it.
 *   Days     one row per day, rewritten on every change.
 *   Restore  one row per calendar date holding the whole Hours data as text,
 *            newest first, last 90 dates. To restore, copy the text of the newest
 *            row into a file ending .json and use Import JSON.
 *
 * @OnlyCurrentDoc
 */
var PASSWORD = '';   // ← your password goes between the quotes

var ZONE = 'Asia/Jerusalem';
var CELL = 40000;      // a cell holds 50,000 characters at most
var KEEP = 90;         // dates kept in Restore
var MAX_BODY = 2000000;

function doGet() {
  return ContentService.createTextOutput('Hours sync is on. This address only talks to the Hours app.');
}

/* The app posts { v: 2, password, rev, state, force }. rev is the version of the
   shared copy the device last saw.
   - Without state, the device is checking for news: it gets the shared copy, or
     { same: true } when it already has the latest.
   - With state, the copy is saved only if rev is still the latest version (or
     force is set, which Import → Replace uses). If another device saved in
     between, the device gets the shared copy back with conflict: true. It
     combines the two and sends again. */
function doPost(e) {
  var body = e && e.postData && e.postData.contents || '';
  if (!body || body.length > MAX_BODY) return reply({ ok: false, error: 'empty or too large' });
  var req;
  try { req = JSON.parse(body); } catch (err) { return reply({ ok: false, error: 'not json' }); }
  if (!req || req.v !== 2) return reply({ ok: false, error: 'update the Hours app' });
  if (!PASSWORD) return reply({ ok: false, error: 'setup' });
  if (String(req.password) !== PASSWORD) { Utilities.sleep(1000); return reply({ ok: false, error: 'password' }); }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cur = readCurrent(ss);
    var state = req.state;
    if (!state) {
      if (cur.rev > 0 && +req.rev === cur.rev) return reply({ ok: true, rev: cur.rev, same: true });
      return reply({ ok: true, rev: cur.rev, state: readShared(cur) });
    }
    if (!req.force && +req.rev !== cur.rev) return reply({ ok: true, rev: cur.rev, conflict: true, state: readShared(cur) });

    var days = state && typeof state.days === 'object' && state.days;
    if (!days) return reply({ ok: false, error: 'no days' });
    var keys = Object.keys(days).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }).sort();
    // Replacing everything with nothing is never what anyone meant.
    if (req.force && !keys.length) return reply({ ok: false, error: 'no days' });

    var text = JSON.stringify(state), rev = cur.rev + 1;
    writeShared(ss, rev, text);
    writeDays(ss, days, keys);
    writeRestore(ss, text, keys.length);
    return reply({ ok: true, rev: rev });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(o) {
  o.v = 2;
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(ss, name, index) {
  return ss.getSheetByName(name) || ss.insertSheet(name, index);
}

// The shared copy's version. Before the first sync there's no Sync tab: the
// newest backup in Restore, if any, counts as version 1, so the first device
// to sync combines with it instead of starting over.
function readCurrent(ss) {
  var sh = ss.getSheetByName('Sync');
  if (sh) return { rev: +sh.getRange(1, 2).getValue() || 0, sheet: sh };
  var seed = restoreText(ss);
  return { rev: seed ? 1 : 0, seed: seed };
}

function readShared(cur) {
  var text = cur.seed || '';
  if (cur.sheet && cur.sheet.getLastRow() >= 3) {
    text = cur.sheet.getRange(3, 2, cur.sheet.getLastRow() - 2, 1).getValues()
      .map(function (r) { return String(r[0]).replace(/^~/, ''); }).join('');
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch (err) { return null; }
}

// Each part starts with "~" so the Sheet never reads one as a number, date or formula.
function writeShared(ss, rev, text) {
  var sh = ss.getSheetByName('Sync');
  if (!sh) { sh = ss.insertSheet('Sync'); sh.hideSheet(); }
  var parts = [];
  for (var i = 0; i < text.length; i += CELL) parts.push(['~' + text.slice(i, i + CELL)]);
  sh.clearContents();
  if (sh.getMaxRows() < parts.length + 2) sh.insertRowsAfter(sh.getMaxRows(), parts.length + 2 - sh.getMaxRows());
  sh.getRange(1, 1, 3, 1).setValues([['Version'], ['Saved at'], ['Data (used by Hours, do not edit)']]);
  sh.getRange(1, 2, 2, 1).setNumberFormat('@').setValues([[String(rev)], [Utilities.formatDate(new Date(), ZONE, 'yyyy-MM-dd HH:mm:ss')]]);
  sh.getRange(3, 2, parts.length, 1).setNumberFormat('@').setValues(parts);
}

function restoreText(ss) {
  var sh = ss.getSheetByName('Restore');
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 4) return '';
  var text = sh.getRange(2, 4, 1, sh.getLastColumn() - 3).getValues()[0].map(String).join('');
  try { var d = JSON.parse(text); return d && d.days && typeof d.days === 'object' ? text : ''; } catch (err) { return ''; }
}

function writeDays(ss, days, keys) {
  var sh = sheet(ss, 'Days', 0);
  var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var rows = [['Date', 'Day', 'Times', 'Hours', 'Note', 'Last changed']];
  keys.forEach(function (k) {
    var d = days[k] || {}, p = k.split('-');
    var dow = names[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()];
    var changed = +d.updatedAt ? Utilities.formatDate(new Date(+d.updatedAt), ZONE, 'yyyy-MM-dd HH:mm') : '';
    rows.push([k, dow, String(d.raw || ''), Math.round((+d.minutes || 0) / 60 * 100) / 100, String(d.note || ''), changed]);
  });
  sh.clearContents();
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  var range = sh.getRange(1, 1, rows.length, 6);
  // Plain text, or Sheets reads "9-5" as the 5th of September.
  range.setNumberFormat('@');
  sh.getRange(1, 4, rows.length, 1).setNumberFormat('0.00');
  range.setValues(rows);
  sh.setFrozenRows(1);
}

function writeRestore(ss, body, count) {
  var sh = sheet(ss, 'Restore', 1);
  var parts = [];
  for (var i = 0; i < body.length; i += CELL) parts.push(body.slice(i, i + CELL));
  var now = new Date();
  var today = Utilities.formatDate(now, ZONE, 'yyyy-MM-dd');
  var head = ['Backup date', 'Days', 'Saved at', 'Backup text (copy into a .json file; join the cells if more than one)'];
  sh.getRange(1, 1, 1, head.length).setNumberFormat('@').setValues([head]);
  sh.setFrozenRows(1);
  // Newest date on row 2. Today's row is replaced; a new date pushes the rest down.
  var first = sh.getLastRow() >= 2 ? String(sh.getRange(2, 1).getDisplayValue()) : '';
  if (first !== today) sh.insertRowBefore(2);
  else sh.getRange(2, 1, 1, Math.max(sh.getLastColumn(), 4)).clearContent();
  var row = [today, String(count), Utilities.formatDate(now, ZONE, 'yyyy-MM-dd HH:mm')].concat(parts);
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  sh.getRange(2, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  var extra = sh.getLastRow() - (KEEP + 1);
  if (extra > 0) sh.deleteRows(KEEP + 2, extra);
}
