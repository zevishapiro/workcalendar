// Run with: node sync.test.js
var Y = require('./sync.js');
var failed = 0, n = 0;
function eq(name, got, want) {
  n++;
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok ? '' : '  want ' + JSON.stringify(want) + '  got ' + JSON.stringify(got)));
}
function day(raw, at) { return { raw: raw, minutes: 0, note: '', updatedAt: at }; }
function base() {
  return { version: 1, epoch: 'e1', settings: { currency: 'USD', rates: [{ from: '2026-01-01', rate: 50 }] }, settingsAt: 0,
    timer: null, timerAt: 0, days: {}, removedDays: {}, invoices: [], expenses: [], removedIds: {} };
}
function copy(x) { return JSON.parse(JSON.stringify(x)); }

// --- stamp: notes what changed since the last save ---
var prev = base(); prev.days['2026-11-02'] = day('9-5', 100); prev.days['2026-11-03'] = day('8', 100);
var next = copy(prev); delete next.days['2026-11-03'];
Y.stamp(prev, next, 500);
eq('a cleared day leaves a note of when', next.removedDays, { '2026-11-03': 500 });

next = copy(prev); next.days['2026-11-02'].raw = '9-6';
Y.stamp(prev, next, 500);
eq('a day changed without a new time gets one', next.days['2026-11-02'].updatedAt, 500);

next = copy(prev); next.days['2026-11-02'] = day('9-6', 400);
Y.stamp(prev, next, 500);
eq('a day saved with its own time keeps it', next.days['2026-11-02'].updatedAt, 400);

prev = base(); prev.removedDays['2026-11-03'] = 300;
next = copy(prev); next.days['2026-11-03'] = day('8', 200); // e.g. merged in from an old file
Y.stamp(prev, next, 500);
eq('a day added back after a delete beats the delete', [next.days['2026-11-03'].updatedAt, next.removedDays], [500, {}]);

prev = base(); next = copy(prev); next.settings.currency = 'ILS';
Y.stamp(prev, next, 500);
eq('a settings change is timed', next.settingsAt, 500);
next = copy(prev); Y.stamp(prev, next, 500);
eq('no change, no new time', [next.settingsAt, next.timerAt], [0, 0]);

next = copy(prev); next.timer = { start: 450, day: '2026-11-24' };
Y.stamp(prev, next, 500);
eq('starting the timer is timed', next.timerAt, 500);

prev = base(); prev.expenses = [{ id: 'x1', amount: 5, note: 'parking', createdAt: 100, updatedAt: 100 }];
next = copy(prev); next.expenses = [];
Y.stamp(prev, next, 500);
eq('a removed expense leaves a note of when', next.removedIds, { x1: 500 });

next = copy(prev); next.expenses.push({ id: 'x2', amount: 9, note: '', createdAt: 450 });
Y.stamp(prev, next, 500);
eq('a new expense takes its created time', next.expenses[1].updatedAt, 450);

prev = base(); prev.invoices = [{ id: 'i1', to: '2026-10-31', sentOn: '2026-10-31', createdAt: 100, updatedAt: 100 }];
next = copy(prev); next.invoices[0].to = '2026-10-30';
Y.stamp(prev, next, 500);
eq('an invoice date corrected in place gets a new time', next.invoices[0].updatedAt, 500);

// --- merge: newest version of each item wins ---
var phone = base(), laptop = base();
laptop.days['2026-11-02'] = day('9-5', 100);
laptop.days['2026-11-03'] = day('9-1', 100);
phone.days['2026-11-03'] = day('9-1, 2-6', 200);
phone.days['2026-11-04'] = day('7.5', 200);
var m = Y.merge(phone, laptop);
eq('days from both devices are kept', Object.keys(m.days), ['2026-11-02', '2026-11-03', '2026-11-04']);
eq('the newer version of a day wins', m.days['2026-11-03'].raw, '9-1, 2-6');
eq('merging either way round gives the same days', Y.same(Y.merge(laptop, phone).days, m.days), true);

laptop = base(); laptop.days['2026-11-02'] = day('9-5', 100);
phone = base(); phone.removedDays['2026-11-02'] = 300;
m = Y.merge(laptop, phone);
eq('a later delete removes the day', [m.days, m.removedDays], [{}, { '2026-11-02': 300 }]);
laptop.days['2026-11-02'] = day('9-6', 400);
m = Y.merge(laptop, phone);
eq('a later edit beats an older delete', [m.days['2026-11-02'].raw, m.removedDays], ['9-6', {}]);
laptop = base(); laptop.days['2026-11-02'] = day('9-5', 0);
m = Y.merge(laptop, phone);
eq('a day from before sync (no time) loses to a delete', m.days, {});

laptop = base(); laptop.timer = { start: 1000, day: '2026-11-24' }; laptop.timerAt = 1000;
phone = base();
m = Y.merge(phone, laptop);
eq('a timer started on the laptop shows on the phone', m.timer, { start: 1000, day: '2026-11-24' });
phone.timer = null; phone.timerAt = 5000; // ended on the phone
m = Y.merge(laptop, phone);
eq('ending it on the phone stops it on the laptop', [m.timer, m.timerAt], [null, 5000]);

laptop = base(); laptop.settings.rates = [{ from: '2026-01-01', rate: 80 }]; laptop.settingsAt = 700;
phone = base(); phone.settingsAt = 0;
eq('changed settings beat untouched ones', Y.merge(phone, laptop).settings.rates[0].rate, 80);
eq('...whichever side they are on', Y.merge(laptop, phone).settings.rates[0].rate, 80);
phone.settingsAt = 700; phone.settings.currency = 'ILS';
eq('a tie goes to the Sheet', Y.merge(laptop, phone).settings.currency, 'ILS');

laptop = base(); laptop.expenses = [{ id: 'x1', amount: 5, note: 'parking', createdAt: 100, updatedAt: 100 }];
phone = base(); phone.expenses = [{ id: 'x2', amount: 9, note: 'cab', createdAt: 200, updatedAt: 200 }];
m = Y.merge(laptop, phone);
eq('expenses from both devices are kept, oldest first', m.expenses.map(function (v) { return v.id; }), ['x1', 'x2']);
phone.removedIds.x1 = 300;
m = Y.merge(laptop, phone);
eq('a removed expense stays removed', [m.expenses.map(function (v) { return v.id; }), m.removedIds], [['x2'], { x1: 300 }]);

laptop = base(); laptop.invoices = [{ id: 'last-invoiced', to: '2026-10-31', createdAt: 0 }];
phone = base(); phone.removedIds['last-invoiced'] = 300;
eq('an invoice with no times loses to a delete', Y.merge(laptop, phone).invoices, []);

// Combining is stable: no endless back and forth between two devices.
laptop = base(); laptop.days['2026-11-02'] = day('9-5', 100); laptop.settingsAt = 50; laptop.removedDays['2026-10-01'] = 90;
phone = base(); phone.days['2026-11-03'] = day('8', 200); phone.expenses = [{ id: 'x2', amount: 9, note: '', createdAt: 200, updatedAt: 200 }];
var once = Y.merge(laptop, phone), twice = Y.merge(once, phone), back = Y.merge(phone, once);
eq('merging again changes nothing', Y.same(Y.merge(once, once), once), true);
eq('merging the result back into either side agrees', [Y.same(twice, once), Y.same(back, once)], [true, true]);
eq('epoch comes from the Sheet', Y.merge({ epoch: 'a' }, { epoch: 'b' }).epoch, 'b');

eq('canon ignores key order', Y.canon({ b: 1, a: [2, { d: 1, c: 2 }] }), Y.canon({ a: [2, { c: 2, d: 1 }], b: 1 }));

console.log('\n' + (n - failed) + '/' + n + ' passed');
if (failed) process.exit(1);
