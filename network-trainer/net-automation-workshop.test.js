const assert=require('assert');
const W=require('./net-automation-workshop');
function runAll(lab,device,commands){lab.cli.on(device);for(const command of commands){const r=lab.cli.run(command);assert.strictEqual(r.code,0,device+' :: '+command+' :: '+r.out);}}
for(const p of W.PLAYBOOKS){const lab=W.createLab(p.id);assert.strictEqual(W.evaluate(p.id,lab.net).passed,false);for(const step of p.steps)runAll(lab,step.device,step.commands);const result=W.evaluate(p.id,lab.net);assert.strictEqual(result.passed,true,p.id+' should pass: '+JSON.stringify(result));for(const step of p.steps)runAll(lab,step.device,step.commands);const repeated=W.evaluate(p.id,lab.net);assert.strictEqual(repeated.passed,true,p.id+' should remain valid when commands are repeated');if(p.id==='switch-access'){assert.strictEqual(lab.net.devices.sw1.vlans.filter(v=>v===20).length,1);assert.strictEqual(lab.net.devices.sw1.ospf,undefined);}if(p.id==='baseline'){assert.strictEqual(lab.net.devices.edge.ntp.servers.length,1);assert.strictEqual(lab.net.devices.edge.syslog.hosts.length,1);}}
console.log('Network automation workshop unit tests passed.');

{
 const lab=W.createLab('baseline');
 const baseline=W.captureSnapshot(lab.net,'approved baseline');
 assert.strictEqual(W.evaluateCompliance('baseline',lab.net).passed,false);
 runAll(lab,'edge',W.getPlaybook('baseline').steps[0].commands);
 const candidate=W.captureSnapshot(lab.net,'candidate');
 const diff=W.diffSnapshots(baseline,candidate);
 assert.strictEqual(diff.valid,true);
 assert(diff.count>0,'candidate must contain configuration changes');
 assert(diff.changes.some(x=>x.device==='edge'&&x.path.includes('hostname')),'diff must identify hostname change');
 assert.strictEqual(W.evaluateCompliance('baseline',lab.net).passed,true,'saved baseline must pass compliance');
 assert.strictEqual(W.restoreSnapshot(lab.net,baseline),true);
 assert.strictEqual(W.evaluate('baseline',lab.net).passed,false,'rollback must restore the original unconfigured state');
 assert.strictEqual(W.diffSnapshots(baseline,W.captureSnapshot(lab.net)).count,0,'restored state must match the baseline');
 assert.strictEqual(W.restoreSnapshot(lab.net,null),false,'invalid snapshots must be rejected');
}
console.log('Configuration snapshot, diff, compliance and rollback tests passed.');
