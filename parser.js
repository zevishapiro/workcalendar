/* Hours — entry parser.
   One pure function: parseEntry(text) -> { minutes, note } or null.
   Works in the browser (window.HoursParser) and in node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoursParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIME = /^(\d{1,4})(?:[:.](\d{2}))?\s*(am|pm|a|p)?$/;

  // "9", "9:30", "9.30", "930", "0900", "9am", "5 pm" -> minutes since midnight.
  function parseTime(s) {
    var m = TIME.exec(s.trim());
    if (!m) return null;
    var digits = m[1], h, min;
    if (m[2] != null) {
      if (digits.length > 2) return null;
      h = +digits; min = +m[2];
    } else if (digits.length <= 2) {
      h = +digits; min = 0;
    } else {
      h = +digits.slice(0, -2); min = +digits.slice(-2);
    }
    if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
    var mer = m[3] ? m[3].charAt(0) : null; // 'a' | 'p' | null
    if (mer) {
      if (h === 0 || h > 12) return null;
      if (mer === 'a' && h === 12) h = 0;
      if (mer === 'p' && h < 12) h += 12;
    }
    return { mins: h * 60 + min, h: h, mer: mer };
  }

  // "9-5", "9:30-17:15", "21-2" -> minutes worked, or null.
  function parseRange(seg) {
    var m = /^(.+?)\s*-\s*(.+)$/.exec(seg);
    if (!m) return null;
    var a = parseTime(m[1]), b = parseTime(m[2]);
    if (!a || !b) return null;
    var start = a.mins, end = b.mins;
    // "1-5pm": the end is explicitly pm, the start has no am/pm and would still
    // sit before the end after +12h, so the start is pm too.
    if (!a.mer && b.mer === 'p' && a.h < 12 && start + 720 < end) start += 720;
    if (end <= start) {
      // No am/pm on the end and it's not after the start: assume pm.
      var bumped = (!b.mer && b.h < 12) ? end + 720 : null;
      if (bumped !== null && bumped > start) end = bumped;
      else end += 1440; // still not after the start: it ends the next day
    }
    return end - start;
  }

  var HOURS = '(?:h|hr|hrs|hour|hours)';
  var MINS = '(?:m|min|mins|minute|minutes)';
  var RE_HM = /^(\d{1,2}):(\d{2})$/;
  var RE_H = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*' + HOURS + '(?:\\s*(\\d{1,2})\\s*' + MINS + '?)?$');
  var RE_M = new RegExp('^(\\d+)\\s*' + MINS + '$');
  var RE_DEC = /^(\d+(?:[.,]\d+)?)$/;

  function decimal(s) { return parseFloat(s.replace(',', '.')); }

  // "8", "7.5", "7:30", "7h30", "45m" -> minutes, or null.
  function parseDuration(body) {
    var m;
    if ((m = RE_HM.exec(body))) {
      if (+m[2] > 59) return null;
      return +m[1] * 60 + +m[2];
    }
    if ((m = RE_H.exec(body))) {
      if (m[2] != null && +m[2] > 59) return null;
      return Math.round(decimal(m[1]) * 60) + (m[2] != null ? +m[2] : 0);
    }
    if ((m = RE_M.exec(body))) return +m[1];
    if ((m = RE_DEC.exec(body))) return Math.round(decimal(m[1]) * 60);
    return null;
  }

  function parseEntry(text) {
    if (typeof text !== 'string') return null;
    var note = '';
    var hash = text.indexOf('#');
    if (hash >= 0) { note = text.slice(hash + 1).trim(); text = text.slice(0, hash); }
    var body = text.trim().toLowerCase()
      .replace(/[–—−]/g, '-')   // en dash, em dash, minus sign
      .replace(/to/g, '-');                    // "9 to 5"
    if (!body) return null;

    var minutes;
    if (body.indexOf('-') >= 0) {
      var segs = body.split(/[,;+\n]/), total = 0, any = false;
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i].trim();
        if (!seg) continue;
        var mins = parseRange(seg);
        if (mins === null) return null;
        total += mins; any = true;
      }
      if (!any) return null;
      minutes = total;
    } else {
      minutes = parseDuration(body);
      if (minutes === null) return null;
    }
    if (minutes < 0 || minutes > 1440 || isNaN(minutes)) return null;
    return { minutes: minutes, note: note };
  }

  return { parseEntry: parseEntry, parseTime: parseTime };
});
