#!/usr/bin/env node
// A full mission playthrough: briefing -> check (unmet) -> a wrong try ->
// the fix -> resolved. Shows the loop a learner experiences, end to end.
const { startMission } = require('./net-mission');
const { chapters } = require('./net-chapters');

const m = chapters.find(c => c.id === 'find-the-gateway');
const s = startMission(m);

const line = () => console.log('-'.repeat(64));
line();
console.log(`CHAPTER: ${m.chapter}`);
console.log(`TICKET:  ${m.title}\n`);
console.log(m.story + '\n');
console.log('OBJECTIVE: ' + m.objective);
line();

const type = (dev, cmd) => { console.log(`${dev}:~$ ${cmd}`); const r = s.on(dev).run(cmd); if (r.out) console.log(r.out); };

type('h1', 'ping h2');                     // fails: no route
console.log('\nh1:~$ check');
console.log(s.status());                   // the teaching moment

console.log('\n(try the wrong fix first)');
type('h1', 'ip route add default via 10.0.9.9');   // bogus gateway
type('h1', 'ping h2');

console.log('\n(now the right gateway)');
type('h1', 'ip route del default');
type('h1', 'ip route add default via 10.0.1.1');
type('h1', 'ping h2');

console.log('\nh1:~$ check');
console.log(s.status());
line();
console.log(s.done() ? 'RESULT: ticket resolved ✓' : 'RESULT: still open');
