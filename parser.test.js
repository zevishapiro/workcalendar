// Run with: node parser.test.js
var parseEntry = require('./parser.js').parseEntry;

var cases = [
  // durations
  ['8', 480], ['7.5', 450], ['7,5', 450], ['7:30', 450], ['7h30', 450], ['7h 30m', 450],
  ['7h', 420], ['45m', 45], ['1h15', 75], ['1h15m', 75], ['0.75', 45], ['8hrs', 480],
  ['8 hours', 480], ['7.5h', 450], ['0', 0], ['24', 1440],
  // ranges
  ['9-5', 480], ['9 - 5', 480], ['9 to 5', 480], ['9–5', 480], ['9:30-17:15', 465],
  ['9am-5pm', 480], ['9a-5p', 480], ['9 am - 5 pm', 480], ['9.30-5', 450], ['930-515', 465],
  ['0900-1700', 480], ['12-1', 60], ['12-5', 300], ['8-4', 480], ['21-2', 300], ['9pm-5', 480],
  ['9pm-2am', 300], ['11pm-7am', 480], ['22-6', 480], ['1-5pm', 240], ['9-5pm', 480],
  ['6-6pm', 720], ['11-1pm', 120], ['12am-8am', 480], ['12pm-5pm', 300],
  // several ranges
  ['9-1, 2-6', 480], ['9-1; 2-6', 480], ['9-1 + 2-6', 480], ['9-1\n2-6', 480], ['9-12, 1-3, 4-5', 360],
  // a list can mix durations and ranges (the timer appends ranges to whatever is there)
  ['4, 13:15-17:32', 497], ['9-12:30, 2h', 330], ['0, 9:05-17:32', 507], ['9:05-17:32', 507], ['22:10-1:30', 200],
  ['4 # x', 240, 'x'], ['4, 9:05-17:32 # x', 747, 'x'], ['9-5, abc', null],
  // notes
  ['9-5 # client call', 480, 'client call'], ['8 #', 480, ''], ['7.5 # two calls, one site visit', 450, 'two calls, one site visit'],
  ['0 # sick', 0, 'sick'],
  // invalid
  ['abc', null], ['9-', null], ['-3', null], ['25-5', null], ['7:75', null], ['9:5-5', null],
  ['', null], ['   ', null], ['# note only', null], ['9-5-6', null], ['13pm-5', null], ['25', null],
  ['9-5 -30m', null], ['9:60', null], ['0am-5', null],
];

var failed = 0;
cases.forEach(function (c) {
  var input = c[0], want = c[1], wantNote = c[2];
  var got = parseEntry(input);
  var ok = want === null ? got === null
    : got !== null && got.minutes === want && (wantNote === undefined || got.note === wantNote);
  if (!ok) {
    failed++;
    console.log('FAIL  ' + JSON.stringify(input) + '  want ' + JSON.stringify(want === null ? null : { minutes: want, note: wantNote }) + '  got ' + JSON.stringify(got));
  } else {
    console.log('ok    ' + JSON.stringify(input).padEnd(36) + ' = ' + (got === null ? 'null' : got.minutes + (got.note ? '  note ' + JSON.stringify(got.note) : '')));
  }
});
console.log('\n' + (cases.length - failed) + '/' + cases.length + ' passed');
process.exit(failed ? 1 : 0);
