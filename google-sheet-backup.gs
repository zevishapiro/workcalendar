/**
 * Hours → Google Sheet backup.
 *
 * Paste this into the Sheet's Apps Script editor (Extensions → Apps Script),
 * then Deploy → New deployment → Web app, "Execute as: Me", "Who has access:
 * Anyone". Paste the web app URL into Hours → Settings → Google Sheet backup.
 *
 * Every time Hours saves, it posts its data here. This script can only touch
 * the Sheet it lives in, and it only writes: nobody can read your hours
 * through the URL.
 *
 *   Days     one row per day, rewritten on every backup.
 *   Restore  one row per calendar date holding the whole Hours backup as text,
 *            newest first, last 90 dates. To restore, copy the text of the
 *            newest row into a file ending .json and use Import JSON.
 *
 * @OnlyCurrentDoc
 */
var ZONE = 'Asia/Jerusalem';
var CELL = 40000;      // a cell holds 50,000 characters at most
var KEEP = 90;         // dates kept in Restore
var MAX_BODY = 2000000;

function doGet() {
  return ContentService.createTextOutput('Hours backup is on. This address only receives backups.');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = e && e.postData && e.postData.contents || '';
    if (!body || body.length > MAX_BODY) return reply({ ok: false, error: 'empty or too large' });
    var data = JSON.parse(body);
    var days = data && typeof data.days === 'object' && data.days || {};
    var keys = Object.keys(days).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }).sort();
    // An empty Hours never overwrites a backup.
    if (!keys.length) return reply({ ok: false, error: 'no days' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    writeDays(ss, days, keys);
    writeRestore(ss, body, keys.length);
    return reply({ ok: true, days: keys.length });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(ss, name, index) {
  return ss.getSheetByName(name) || ss.insertSheet(name, index);
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
  sh.getRange(2, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  var extra = sh.getLastRow() - (KEEP + 1);
  if (extra > 0) sh.deleteRows(KEEP + 2, extra);
}
