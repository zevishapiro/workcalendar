// Run with: node google-sheet-backup.test.js
// Runs google-sheet-backup.gs against a small stand-in for Google Sheets.
var fs = require('fs'), vm = require('vm'), path = require('path');

function fakeSheet(name) {
  var rows = 1000, cols = 26, cells = {}, hidden = false;
  function key(r, c) { return r + ',' + c; }
  function check(r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > rows || c + nc - 1 > cols) throw new Error('Range out of bounds on ' + name);
  }
  function lastRow() { var m = 0; Object.keys(cells).forEach(function (k) { if (cells[k] !== '') m = Math.max(m, +k.split(',')[0]); }); return m; }
  function lastCol() { var m = 0; Object.keys(cells).forEach(function (k) { if (cells[k] !== '') m = Math.max(m, +k.split(',')[1]); }); return m; }
  function range(r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1; check(r, c, nr, nc);
    var api = {
      setValues: function (v) {
        if (v.length !== nr || v.some(function (row) { return row.length !== nc; })) throw new Error('setValues size mismatch on ' + name);
        v.forEach(function (row, i) { row.forEach(function (x, j) { cells[key(r + i, c + j)] = x; }); }); return api;
      },
      getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { var x = cells[key(r + i, c + j)]; row.push(x === undefined ? '' : x); } out.push(row); } return out; },
      getValue: function () { return api.getValues()[0][0]; },
      getDisplayValue: function () { return String(api.getValue()); },
      setNumberFormat: function () { return api; },
      clearContent: function () { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) delete cells[key(r + i, c + j)]; return api; }
    };
    return api;
  }
  function shift(from, by) { // move rows >= from down by `by` (negative deletes)
    var next = {};
    Object.keys(cells).forEach(function (k) {
      var p = k.split(','), r = +p[0], c = +p[1];
      if (r < from) next[k] = cells[k];
      else if (by > 0) next[key(r + by, c)] = cells[k];
      else if (r >= from - by) next[key(r + by, c)] = cells[k];
    });
    cells = next;
  }
  return {
    name: name, cells: function () { return cells; }, isHidden: function () { return hidden; },
    getRange: range, getLastRow: lastRow, getLastColumn: lastCol,
    getMaxRows: function () { return rows; }, getMaxColumns: function () { return cols; },
    insertRowsAfter: function (after, n) { rows += n; }, insertColumnsAfter: function (after, n) { cols += n; },
    insertRowBefore: function (r) { rows++; shift(r, 1); },
    deleteRows: function (r, n) { shift(r, -n); rows -= n; },
    clearContents: function () { cells = {}; }, setFrozenRows: function () {}, hideSheet: function () { hidden = true; }
  };
}

function load(password) {
  var sheets = {};
  var ss = {
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) { sheets[n] = fakeSheet(n); return sheets[n]; },
    sheets: sheets
  };
  var ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (t) { return { text: t, setMimeType: function () { return this; } }; } },
    Utilities: { sleep: function () {}, formatDate: function (d, z, f) { return f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString(); } },
    JSON: JSON, String: String, Object: Object, Date: Date, Math: Math
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'google-sheet-backup.gs'), 'utf8'), ctx);
  if (password !== undefined) ctx.PASSWORD = password;
  return {
    ss: ss,
    post: function (body) { return JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text); }
  };
}
module.exports = { load: load };

if (require.main === module) {
  var failed = 0, n = 0;
  var eq = function (name, got, want) {
    n++;
    var ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok ? '' : '  want ' + JSON.stringify(want) + '  got ' + JSON.stringify(got)));
  };
  var st = function (days, extra) { return Object.assign({ version: 1, settings: {}, days: days }, extra || {}); };
  var d95 = { raw: '9-5', minutes: 480, note: '', updatedAt: 1764000000000 };

  var gs = load('');
  eq('no password in the script: refuses', gs.post({ v: 2, password: 'x', rev: 0 }), { ok: false, error: 'setup', v: 2 });

  gs = load('secret');
  eq('wrong password: refused', gs.post({ v: 2, password: 'nope', rev: 0 }).error, 'password');
  eq('old app (no v): told to update', gs.post(st({ '2026-11-02': d95 })).error, 'update the Hours app');
  eq('empty Sheet: nothing to send', gs.post({ v: 2, password: 'secret', rev: 0 }), { ok: true, rev: 0, state: null, v: 2 });

  var r = gs.post({ v: 2, password: 'secret', rev: 0, state: st({ '2026-11-02': d95 }) });
  eq('first save becomes version 1', r, { ok: true, rev: 1, v: 2 });
  eq('Sync tab is hidden', gs.ss.sheets.Sync.isHidden(), true);
  eq('Days tab has the day', gs.ss.sheets.Days.getRange(2, 1, 1, 4).getValues()[0], ['2026-11-02', 'Mon', '9-5', 8]);
  eq('Restore tab has the backup text', JSON.parse(gs.ss.sheets.Restore.getRange(2, 4).getValue()).days['2026-11-02'].raw, '9-5');

  eq('up to date: same', gs.post({ v: 2, password: 'secret', rev: 1 }), { ok: true, rev: 1, same: true, v: 2 });
  r = gs.post({ v: 2, password: 'secret', rev: 0 });
  eq('behind: gets the shared copy', [r.rev, r.state.days['2026-11-02'].raw], [1, '9-5']);

  r = gs.post({ v: 2, password: 'secret', rev: 0, state: st({ '2026-11-03': d95 }) });
  eq('saving over a newer version is refused with the newer copy', [r.ok, r.conflict, r.rev, Object.keys(r.state.days)], [true, true, 1, ['2026-11-02']]);
  r = gs.post({ v: 2, password: 'secret', rev: 1, state: st({ '2026-11-02': d95, '2026-11-03': d95 }) });
  eq('saving on top of the latest works', r.rev, 2);
  r = gs.post({ v: 2, password: 'secret', rev: 0, force: true, state: st({ '2026-11-04': d95 }) });
  eq('force (Import Replace) saves anyway', r.rev, 3);
  eq('force with no days is refused', gs.post({ v: 2, password: 'secret', rev: 0, force: true, state: st({}) }).error, 'no days');
  eq('a normal save with no days is fine', gs.post({ v: 2, password: 'secret', rev: 3, state: st({}, { removedDays: { '2026-11-04': 5 } }) }).rev, 4);

  // Big data spans several cells and still comes back whole, even when a
  // piece would start with "=" or look like a number.
  var days = {}, k, note = new Array(300).join('=1+2 ');
  for (var i = 0; i < 400; i++) { k = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10); days[k] = { raw: '9-5 # ' + note, minutes: 480, note: note, updatedAt: i }; }
  r = gs.post({ v: 2, password: 'secret', rev: 4, state: st(days) });
  eq('big copy saved', r.rev, 5);
  eq('...in several cells', gs.ss.sheets.Sync.getLastRow() > 4, true);
  r = gs.post({ v: 2, password: 'secret', rev: 0 });
  eq('...and read back whole', Object.keys(r.state.days).length === 400 && r.state.days[k].note === note, true);
  eq('Restore row grew extra columns when needed', gs.ss.sheets.Restore.getLastColumn() > 4, true);

  // A Sheet that only has backups from the old script: the first device to sync gets them.
  gs = load('secret');
  var old = fakeSheet('Restore'); gs.ss.sheets.Restore = old;
  old.getRange(1, 1, 1, 4).setValues([['Backup date', 'Days', 'Saved at', 'Backup text']]);
  old.getRange(2, 1, 1, 4).setValues([['2026-11-20', '1', '2026-11-20 18:00', JSON.stringify(st({ '2026-11-02': d95 }, { settings: { currency: 'ILS' } }))]]);
  r = gs.post({ v: 2, password: 'secret', rev: 0 });
  eq('old backups count as version 1', [r.rev, r.state.settings.currency], [1, 'ILS']);
  r = gs.post({ v: 2, password: 'secret', rev: 0, state: st({ '2026-11-03': d95 }) });
  eq('a new device must combine with them first', [r.conflict, r.rev], [true, 1]);
  eq('then saves as version 2', gs.post({ v: 2, password: 'secret', rev: 1, state: st({ '2026-11-02': d95, '2026-11-03': d95 }) }).rev, 2);
  eq('Restore keeps one row per date', gs.ss.sheets.Restore.getLastRow() >= 2, true);

  console.log('\n' + (n - failed) + '/' + n + ' passed');
  if (failed) process.exit(1);
}
