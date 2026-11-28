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
 ['Network access denied',()=>F.classifyCommandFailure({discipline:'network',output:'% Access denied'}),'permission'],
 ['Network missing route',()=>F.classifyCommandFailure({discipline:'network',output:'Route does not exist'}),'target-state'],
 ['Unknown failure is cautious',()=>F.classifyCommandFailure({discipline:'network',output:'unexpected failure'}),'unknown'],
 ['Shell parse error',()=>F.classifyCommandFailure({discipline:'linux',output:'bash: syntax error near unexpected token'}),'syntax'],
 ['Full filesystem',()=>F.classifyCommandFailure({discipline:'linux',output:'No space left on device'}),'capacity'],
 ['Read-only mount',()=>F.classifyCommandFailure({discipline:'linux',output:'Read-only file system'}),'permission'],
 ['Busy resource',()=>F.classifyCommandFailure({discipline:'linux',output:'Device or resource busy'}),'target-state'],
 ['Sudo policy denial',()=>F.classifyCommandFailure({discipline:'linux',output:'user is not in the sudoers file'}),'permission'],
 ['Cannot stat missing path',()=>F.classifyCommandFailure({discipline:'linux',output:'cannot stat file: No such file or directory'}),'target-state'],
 ['Valid but incorrect configuration',()=>F.classifyOutcome({commandAccepted:true,configurationValid:true,objectiveMet:false}),'valid-but-incorrect'],
 ['Unmet objective',()=>F.classifyOutcome({objectiveMet:false}),'objective-unmet'],
 ['Unintended side effect takes priority',()=>F.classifyOutcome({objectiveMet:true,sideEffects:['service stopped']}),'side-effect'],
 ['Verified objective',()=>F.classifyOutcome({objectiveMet:true}),'success']
];
for(const [name,run,expected] of tests){const r=run();assert.equal(r.category,expected,name);assert.ok(r.title&&r.reason&&r.next,name+' actionable');assert.ok(['high','low'].includes(r.confidence),name+' confidence');console.log('  ✓ '+name);}
assert.equal(F.calculateMissionReward(0),100,'no hints keeps the full reward');
assert.equal(F.calculateMissionReward(1),100,'the first hint is free');
assert.equal(F.calculateMissionReward(2),75,'the second hint reduces the reward by 25 XP');
assert.equal(F.calculateMissionReward(3),50,'each additional hint reduces the reward by 25 XP');
assert.equal(F.calculateMissionReward(10),25,'hint penalties never reduce the reward below 25 XP');
assert.equal(F.isNetworkConfigurationCommand('ip addr add 10.0.1.10/24 dev eth0'),true,'Linux-style address changes are recognised as configuration');
assert.equal(F.isNetworkConfigurationCommand('ip route replace 10.0.2.0/24 via 10.0.1.1'),true,'route changes are recognised as configuration');
assert.equal(F.isNetworkConfigurationCommand('iptables -A INPUT -p tcp --dport 23 -j DROP'),true,'firewall policy changes are recognised as configuration');
assert.equal(F.isNetworkConfigurationCommand('switchport access vlan 20'),true,'switchport changes are recognised as configuration');
assert.equal(F.isNetworkConfigurationCommand('show ip route'),false,'read-only show commands are not configuration');
assert.equal(F.isNetworkConfigurationCommand('ping 10.0.1.1'),false,'connectivity probes are not configuration');
assert.equal(F.isNetworkConfigurationCommand('configure terminal'),false,'entering configuration mode alone is not a configuration change');
assert.ok(Object.isFrozen(F));console.log('SHARED FEEDBACK MODEL OK ('+tests.length+' cases + 5 reward checks).');
