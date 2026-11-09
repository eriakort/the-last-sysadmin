'use strict';
const assert = require('node:assert/strict');
const F = require('./src/feedback');
const tests = [
 ['Linux syntax',()=>F.classifyCommandFailure({discipline:'linux',output:'bash: xyz: command not found'}),'syntax'],
 ['Linux permission',()=>F.classifyCommandFailure({discipline:'linux',output:'Permission denied'}),'permission'],
 ['Linux missing target',()=>F.classifyCommandFailure({discipline:'linux',output:'No such file or directory'}),'target-state'],
 ['Linux wrong target type',()=>F.classifyCommandFailure({discipline:'linux',output:'Is a directory'}),'target-state'],
 ['Linux invalid option',()=>F.classifyCommandFailure({discipline:'linux',output:'invalid option -- z'}),'syntax'],
 ['Network incomplete command',()=>F.classifyCommandFailure({discipline:'network',output:'% Incomplete command.'}),'syntax'],
 ['Network ambiguous command',()=>F.classifyCommandFailure({discipline:'network',output:'% Ambiguous command'}),'syntax'],
 ['Network command context',()=>F.classifyCommandFailure({discipline:'network',output:'% Invalid input detected'}),'context'],
 ['Network privilege',()=>F.classifyCommandFailure({discipline:'network',output:'Insufficient privilege'}),'permission'],
 ['Network missing interface',()=>F.classifyCommandFailure({discipline:'network',output:'Interface does not exist'}),'target-state'],
 ['Unknown failure is cautious',()=>F.classifyCommandFailure({discipline:'network',output:'unexpected failure'}),'unknown'],
 ['Valid but incorrect configuration',()=>F.classifyOutcome({commandAccepted:true,configurationValid:true,objectiveMet:false}),'valid-but-incorrect'],
 ['Unmet objective',()=>F.classifyOutcome({objectiveMet:false}),'objective-unmet'],
 ['Unintended side effect takes priority',()=>F.classifyOutcome({objectiveMet:true,sideEffects:['service stopped']}),'side-effect'],
 ['Verified objective',()=>F.classifyOutcome({objectiveMet:true}),'success']
];
for(const [name,run,expected] of tests){const r=run();assert.equal(r.category,expected,name);assert.ok(r.title&&r.reason&&r.next,name+' actionable');assert.ok(['high','low'].includes(r.confidence),name+' confidence');console.log('  ✓ '+name);}
assert.ok(Object.isFrozen(F));console.log('SHARED FEEDBACK MODEL OK ('+tests.length+' cases).');
