/* Hours — combining this device's copy of the data with the Google Sheet's.
   Pure functions, no DOM. Works in the browser (window.HoursSync) and in node.

   Every item knows when it last changed: a day's updatedAt, an invoice's or
   expense's updatedAt, settingsAt for the settings, timerAt for the Start/End
   timer. Deleting a day, invoice or expense leaves a note of when
   (removedDays, removedIds), so the other device's older copy can't bring it
   back. Combining two copies keeps the newest version of each item. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoursSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LISTS = ['invoices', 'expenses'];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function obj(o) { return (o && typeof o === 'object') ? o : {}; }
  function list(a) { return Array.isArray(a) ? a : []; }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function keysOf() {
    var seen = {}, out = [];
    for (var i = 0; i < arguments.length; i++) Object.keys(obj(arguments[i])).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
    return out.sort();
  }
  function byId(arr) { var m = {}; list(arr).forEach(function (v) { if (v && v.id != null) m[v.id] = v; }); return m; }
  function dayTime(d) { return +(d && d.updatedAt) || 0; }
  function itemTime(v) { return +(v && (v.updatedAt || v.createdAt)) || 0; }
  // The newer of two versions. A tie goes to b, the Sheet's copy, so combining
  // a copy with itself changes nothing.
  function pick(a, b, time) { if (!a) return b; if (!b) return a; return time(a) > time(b) ? a : b; }

  // Text that is the same for equal data whatever order the keys are in.
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (x && typeof x === 'object') {
      return '{' + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
    }
    return JSON.stringify(x === undefined ? null : x);
  }
  function same(a, b) { return canon(a) === canon(b); }

  // Note what changed between the last saved copy (prev) and the one about to be
  // saved (next), so the change wins over older copies elsewhere. Changes next.
  function stamp(prev, next, now) {
    prev = obj(prev);
    var pd = obj(prev.days), nd = obj(next.days);
    var gone = next.removedDays = obj(next.removedDays), goneIds = next.removedIds = obj(next.removedIds);
    Object.keys(pd).forEach(function (k) { if (!has(nd, k)) gone[k] = now; });
    Object.keys(nd).forEach(function (k) {
      var d = nd[k], p = pd[k];
      if (p && dayTime(d) === dayTime(p) && !same(d, p)) d.updatedAt = now;
      if (has(gone, k)) { if (!(dayTime(d) > gone[k])) d.updatedAt = now; delete gone[k]; }
    });
    if (!same(prev.settings, next.settings)) next.settingsAt = now;
    if (!same(prev.timer || null, next.timer || null)) next.timerAt = now;
    LISTS.forEach(function (name) {
      var before = byId(prev[name]), after = byId(next[name]);
      Object.keys(before).forEach(function (id) { if (!has(after, id)) goneIds[id] = now; });
      list(next[name]).forEach(function (v) {
        var p = before[v.id];
        if (!p) { if (!v.updatedAt) v.updatedAt = v.createdAt || now; }
        else if (itemTime(v) === itemTime(p) && !same(v, p)) v.updatedAt = now;
        if (has(goneIds, v.id)) { if (!(itemTime(v) > goneIds[v.id])) v.updatedAt = now; delete goneIds[v.id]; }
      });
    });
    return next;
  }

  // Combine this device's copy (mine) with the Sheet's (theirs). Returns a new object.
  function merge(mine, theirs) {
    var a = obj(mine), b = obj(theirs), out = { version: 1 };
    out.epoch = b.epoch || a.epoch || '';
    var sa = +a.settingsAt || 0, sb = +b.settingsAt || 0;
    out.settings = clone(sa > sb ? a.settings : b.settings);
    out.settingsAt = Math.max(sa, sb);
    var ta = +a.timerAt || 0, tb = +b.timerAt || 0;
    out.timer = clone(ta > tb ? a.timer : b.timer) || null;
    out.timerAt = Math.max(ta, tb);

    var ad = obj(a.days), bd = obj(b.days), ar = obj(a.removedDays), br = obj(b.removedDays);
    out.days = {}; out.removedDays = {};
    keysOf(ad, bd, ar, br).forEach(function (k) {
      var day = pick(ad[k], bd[k], dayTime), gone = Math.max(+ar[k] || 0, +br[k] || 0);
      if (day && (!gone || dayTime(day) > gone)) out.days[k] = clone(day);
      else if (gone) out.removedDays[k] = gone;
    });

    var ai = obj(a.removedIds), bi = obj(b.removedIds), seen = {};
    out.removedIds = {};
    LISTS.forEach(function (name) {
      var am = byId(a[name]), bm = byId(b[name]), kept = [];
      keysOf(am, bm).forEach(function (id) {
        seen[id] = 1;
        var v = pick(am[id], bm[id], itemTime), gone = Math.max(+ai[id] || 0, +bi[id] || 0);
        if (!gone || itemTime(v) > gone) kept.push(clone(v));
        else out.removedIds[id] = gone;
      });
      kept.sort(function (x, y) { return (+x.createdAt || 0) - (+y.createdAt || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); });
      out[name] = kept;
    });
    keysOf(ai, bi).forEach(function (id) { if (!seen[id]) out.removedIds[id] = Math.max(+ai[id] || 0, +bi[id] || 0); });
    return out;
  }

  return { stamp: stamp, merge: merge, same: same, canon: canon, clone: clone };
});
