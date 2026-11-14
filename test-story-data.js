'use strict';
const assert = require('node:assert/strict');
const { create } = require('./src/story-data');
const pad = value => String(value).padStart(2, '0');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const splitLines = value => { if (!value) return []; const text = value.endsWith('\n') ? value.slice(0, -1) : value; return text.split('\n'); };
const deps = { pad, MON, mulberry32, HOST: 'halcyon-web01', splitLines };
const first = create(deps), second = create(deps);
for (const key of Object.keys(first)) assert.deepEqual(first[key], second[key], key + ' should be deterministic');
assert.match(first.APPLOG, /halcyon v2\.3\.1 starting/);
assert.match(first.ACCESS, /GET \//);
assert.match(first.AUTHLOG, /sshd/);
assert.ok(first.BASH_COUNT > 0);
assert.match(first.PASSWD, /rookie/);
assert.match(first.SUDOERS, /root    ALL=/);
assert.throws(() => create({}), /requires pad, MON, mulberry32, HOST and splitLines/);
console.log('Story data tests passed.');
