/* Hours — dates, rates, rounding, periods and aggregates. Pure functions, no DOM.
   Works in the browser (window.HoursStats) and in node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoursStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // Local date -> "YYYY-MM-DD". Never toISOString(): it shifts the day in the evening.
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateOf(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(key, n) { var d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); }
  function monthKey(key) { return key.slice(0, 7); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m is 1-12
  function monthStart(y, m) { return y + '-' + pad(m) + '-01'; }
  function monthEnd(y, m) { return y + '-' + pad(m) + '-' + pad(daysInMonth(y, m)); }
  function addMonths(y, m, n) { var d = new Date(y, m - 1 + n, 1); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function startOfWeek(key, weekStart) {
    var d = dateOf(key);
    var diff = (d.getDay() - (weekStart || 0) + 7) % 7;
    d.setDate(d.getDate() - diff);
    return keyOf(d);
  }

  function sortedRates(rates) {
    return (rates || []).filter(function (r) { return r && r.from; }).slice()
      .sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
  }
  // The rate in effect on a day: the latest row whose date is on or before it.
  // Days before the first row use the first row's rate.
  function rateFor(rates, key) {
    var rows = sortedRates(rates);
    if (!rows.length) return 0;
    var r = +rows[0].rate || 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].from <= key) r = +rows[i].rate || 0; else break;
    }
    return r;
  }
  function roundMinutes(min, step) { return step ? Math.round(min / step) * step : min; }
  function dayEarnings(minutes, key, settings) {
    return roundMinutes(minutes, settings.rounding) / 60 * rateFor(settings.rates, key);
  }

  // Everything the stats screen needs for a date range (inclusive; null = open).
  function aggregate(days, start, end, settings) {
    var minutes = 0, earnings = 0, daysWorked = 0, weeks = {}, months = {}, byDay = {}, byMonth = {}, keys = [];
    Object.keys(days || {}).forEach(function (k) {
      var d = days[k];
      if (!d || d.deleted) return;
      if (start && k < start) return;
      if (end && k > end) return;
      var m = roundMinutes(d.minutes || 0, settings.rounding);
      var e = m / 60 * rateFor(settings.rates, k);
      var mk = monthKey(k);
      minutes += m; earnings += e; byDay[k] = m; keys.push(k);
      byMonth[mk] = byMonth[mk] || { minutes: 0, earnings: 0, days: 0 };
      byMonth[mk].minutes += m; byMonth[mk].earnings += e;
      if (m > 0) {
        daysWorked++; months[mk] = 1; byMonth[mk].days++;
        weeks[startOfWeek(k, settings.weekStart)] = 1;
      }
    });
    var weeksWorked = Object.keys(weeks).length, monthsWorked = Object.keys(months).length;
    return {
      minutes: minutes, earnings: earnings, daysWorked: daysWorked,
      weeksWorked: weeksWorked, monthsWorked: monthsWorked,
      avgDay: daysWorked ? minutes / daysWorked : 0,
      avgWeek: weeksWorked ? minutes / weeksWorked : 0,
      avgMonth: monthsWorked ? minutes / monthsWorked : 0,
      byDay: byDay, byMonth: byMonth, keys: keys.sort()
    };
  }

  // kind: week | month | lastmonth | year | all. Returns the range plus the
  // comparison range: the same point in the previous period.
  function periodRange(kind, today, weekStart) {
    var y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
    var r = { kind: kind, start: null, end: null, prevStart: null, prevEnd: null, prevLabel: null, label: '' };
    if (kind === 'week') {
      r.start = startOfWeek(today, weekStart); r.end = addDays(r.start, 6);
      r.prevStart = addDays(r.start, -7); r.prevEnd = addDays(today, -7);
      r.label = 'This week'; r.prevLabel = 'last week';
    } else if (kind === 'month') {
      r.start = monthStart(y, m); r.end = monthEnd(y, m);
      var pm = addMonths(y, m, -1);
      r.prevStart = monthStart(pm.y, pm.m);
      r.prevEnd = pm.y + '-' + pad(pm.m) + '-' + pad(Math.min(d, daysInMonth(pm.y, pm.m)));
      r.label = 'This month'; r.prevLabel = 'last month';
    } else if (kind === 'lastmonth') {
      var lm = addMonths(y, m, -1), bm = addMonths(y, m, -2);
      r.start = monthStart(lm.y, lm.m); r.end = monthEnd(lm.y, lm.m);
      r.prevStart = monthStart(bm.y, bm.m); r.prevEnd = monthEnd(bm.y, bm.m);
      r.label = 'Last month'; r.prevLabel = 'the month before';
    } else if (kind === 'year') {
      r.start = y + '-01-01'; r.end = y + '-12-31';
      r.prevStart = (y - 1) + '-01-01';
      r.prevEnd = (y - 1) + '-' + pad(m) + '-' + pad(Math.min(d, daysInMonth(y - 1, m)));
      r.label = 'This year'; r.prevLabel = 'last year';
    } else {
      r.label = 'All time';
    }
    return r;
  }

  // One line per rate in effect over [start, end] (inclusive): the dates that
  // rate covers inside the range, hours, rate and amount. Consecutive rate rows
  // with the same rate count as one. Rows with no hours are left out.
  // Amounts are rounded to cents per row, so the total equals the sum of rows.
  function summarize(days, start, end, settings) {
    var rows = sortedRates(settings.rates), segs = [];
    function push(from, rate) {
      var last = segs[segs.length - 1];
      if (last && last.rate === rate) return;
      if (last) last.end = addDays(from, -1);
      segs.push({ start: from, end: end, rate: rate, minutes: 0, daysWorked: 0, amount: 0 });
    }
    push(start, rateFor(rows, start));
    rows.forEach(function (r) { if (r.from > start && r.from <= end) push(r.from, +r.rate || 0); });
    Object.keys(days || {}).sort().forEach(function (k) {
      var d = days[k];
      if (!d || d.deleted || k < start || k > end) return;
      var m = roundMinutes(d.minutes || 0, settings.rounding);
      if (!m) return;
      for (var i = segs.length - 1; i >= 0; i--) {
        if (segs[i].start <= k) { segs[i].minutes += m; segs[i].daysWorked++; break; }
      }
    });
    var out = { start: start, end: end, minutes: 0, amount: 0, daysWorked: 0, rows: [] };
    segs.forEach(function (sg) {
      if (!sg.minutes) return;
      sg.amount = Math.round(sg.minutes / 60 * sg.rate * 100) / 100;
      out.minutes += sg.minutes; out.daysWorked += sg.daysWorked; out.amount += sg.amount;
      out.rows.push(sg);
    });
    out.amount = Math.round(out.amount * 100) / 100;
    return out;
  }

  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // "Sep 6, 2026", "Sep 6 – 10, 2026", "Sep 28 – Oct 3, 2026", "Dec 29, 2025 – Jan 2, 2026"
  function rangeLabel(start, end) {
    var a = dateOf(start), b = dateOf(end);
    var ma = MON[a.getMonth()], mb = MON[b.getMonth()];
    if (start === end) return ma + ' ' + a.getDate() + ', ' + a.getFullYear();
    if (a.getFullYear() !== b.getFullYear()) return ma + ' ' + a.getDate() + ', ' + a.getFullYear() + ' – ' + mb + ' ' + b.getDate() + ', ' + b.getFullYear();
    if (a.getMonth() !== b.getMonth()) return ma + ' ' + a.getDate() + ' – ' + mb + ' ' + b.getDate() + ', ' + b.getFullYear();
    return ma + ' ' + a.getDate() + ' – ' + b.getDate() + ', ' + b.getFullYear();
  }

  function pctChange(cur, prev) {
    if (!prev) return null;
    return (cur - prev) / prev * 100;
  }

  function trim(n, dp) { return n.toFixed(dp).replace(/\.?0+$/, ''); }
  // 465 -> "7.75" (decimal) or "7:45" (hm)
  function formatHours(minutes, fmt) {
    minutes = Math.round(minutes || 0);
    if (fmt === 'hm') return Math.floor(minutes / 60) + ':' + pad(minutes % 60);
    return trim(minutes / 60, 2);
  }
  // 465 -> "7h 45m", 480 -> "8h", 45 -> "45m", 0 -> "0h"
  function formatDuration(minutes) {
    minutes = Math.round(minutes || 0);
    var h = Math.floor(minutes / 60), mm = minutes % 60;
    if (!h && mm) return mm + 'm';
    return h + 'h' + (mm ? ' ' + mm + 'm' : '');
  }

  return {
    keyOf: keyOf, dateOf: dateOf, addDays: addDays, monthKey: monthKey, daysInMonth: daysInMonth,
    monthStart: monthStart, monthEnd: monthEnd, addMonths: addMonths, startOfWeek: startOfWeek,
    sortedRates: sortedRates, rateFor: rateFor, roundMinutes: roundMinutes, dayEarnings: dayEarnings,
    aggregate: aggregate, periodRange: periodRange, pctChange: pctChange,
    summarize: summarize, rangeLabel: rangeLabel,
    formatHours: formatHours, formatDuration: formatDuration
  };
});
