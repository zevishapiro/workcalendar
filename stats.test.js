// Run with: node stats.test.js
var S = require('./stats.js');
var failed = 0, n = 0;
function eq(name, got, want) {
  n++;
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok ? '' : '  want ' + JSON.stringify(want) + '  got ' + JSON.stringify(got)));
}
function near(name, got, want) { eq(name, Math.round(got * 100) / 100, want); }

// Rate history: the raise case from the spec.
var rates = [{ from: '2026-01-01', rate: 50 }, { from: '2026-09-21', rate: 60 }];
eq('rate on Sept 20', S.rateFor(rates, '2026-09-20'), 50);
eq('rate on Sept 21', S.rateFor(rates, '2026-09-21'), 60);
eq('rate on Dec 31', S.rateFor(rates, '2026-12-31'), 60);
eq('rate before first row uses first row', S.rateFor(rates, '2025-06-01'), 50);
eq('rate rows given out of order', S.rateFor([rates[1], rates[0]], '2026-09-20'), 50);
eq('no rates', S.rateFor([], '2026-09-20'), 0);

// September earnings use both rates.
var settings = { rates: rates, rounding: 0, weekStart: 1 };
var days = { '2026-09-18': { raw: '8', minutes: 480 }, '2026-09-21': { raw: '8', minutes: 480 }, '2026-09-22': { raw: '4', minutes: 240 } };
var sep = S.aggregate(days, '2026-09-01', '2026-09-30', settings);
eq('september minutes', sep.minutes, 1200);
near('september earnings (8x50 + 8x60 + 4x60)', sep.earnings, 400 + 480 + 240);
eq('days worked', sep.daysWorked, 3);
eq('weeks worked (Sep 18 is one week, 21-22 another)', sep.weeksWorked, 2);
eq('avg per worked day', sep.avgDay, 400);
eq('avg per week', sep.avgWeek, 600);

// A day off (0) is not a worked day but is in the count of entries.
var withOff = { '2026-09-18': { minutes: 480 }, '2026-09-19': { minutes: 0 } };
eq('day off not counted as worked', S.aggregate(withOff, null, null, settings).daysWorked, 1);

// Rounding.
eq('no rounding', S.roundMinutes(467, 0), 467);
eq('nearest 15: 467 -> 465', S.roundMinutes(467, 15), 465);
eq('nearest 15: 473 -> 480', S.roundMinutes(473, 15), 480);
eq('nearest 30: 467 -> 480', S.roundMinutes(467, 30), 480);
near('earnings use rounded minutes', S.dayEarnings(467, '2026-09-25', { rates: rates, rounding: 15 }), 465 / 60 * 60);

// Dates.
eq('keyOf local date', S.keyOf(new Date(2026, 8, 14)), '2026-09-14');
eq('addDays across month end', S.addDays('2026-09-30', 1), '2026-10-01');
eq('addDays across year start', S.addDays('2026-01-01', -1), '2025-12-31');
eq('week start Monday', S.startOfWeek('2026-09-14', 1), '2026-09-14'); // Sept 14 2026 is a Monday
eq('week start Monday from a Sunday', S.startOfWeek('2026-09-20', 1), '2026-09-14');
eq('week start Sunday', S.startOfWeek('2026-09-14', 0), '2026-09-13');
eq('days in Feb 2028 (leap)', S.daysInMonth(2028, 2), 29);

// Periods, with today = Tuesday Sept 15 2026.
var t = '2026-09-15';
var w = S.periodRange('week', t, 1);
eq('this week range', [w.start, w.end, w.prevStart, w.prevEnd], ['2026-09-14', '2026-09-20', '2026-09-07', '2026-09-08']);
var mo = S.periodRange('month', t, 1);
eq('this month range', [mo.start, mo.end, mo.prevStart, mo.prevEnd], ['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-15']);
var lm = S.periodRange('lastmonth', t, 1);
eq('last month range', [lm.start, lm.end, lm.prevStart, lm.prevEnd], ['2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31']);
var yr = S.periodRange('year', t, 1);
eq('this year range', [yr.start, yr.end, yr.prevStart, yr.prevEnd], ['2026-01-01', '2026-12-31', '2025-01-01', '2025-09-15']);
var jan = S.periodRange('month', '2026-01-31', 1);
eq('month comparison clamps to shorter month', [jan.prevStart, jan.prevEnd], ['2025-12-01', '2025-12-31']);
var mar = S.periodRange('month', '2026-03-31', 1);
eq('march vs feb clamps to feb 28', [mar.prevStart, mar.prevEnd], ['2026-02-01', '2026-02-28']);
eq('all time is open', [S.periodRange('all', t, 1).start, S.periodRange('all', t, 1).end], [null, null]);

// Formatting.
eq('format decimal', S.formatHours(465, 'decimal'), '7.75');
eq('format decimal whole', S.formatHours(480, 'decimal'), '8');
eq('format decimal thirds', S.formatHours(440, 'decimal'), '7.33');
eq('format h:mm', S.formatHours(465, 'hm'), '7:45');
eq('format h:mm zero pad', S.formatHours(485, 'hm'), '8:05');
eq('duration', S.formatDuration(465), '7h 45m');
eq('duration whole', S.formatDuration(480), '8h');
eq('duration minutes only', S.formatDuration(45), '45m');
eq('duration zero', S.formatDuration(0), '0h');
eq('pct change', S.pctChange(120, 100), 20);
eq('pct change from zero', S.pctChange(120, 0), null);

console.log('\n' + (n - failed) + '/' + n + ' passed');
process.exit(failed ? 1 : 0);
