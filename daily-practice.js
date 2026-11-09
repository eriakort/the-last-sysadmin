/* Daily practice planner and evidence-based skill map.
 * Reads existing local simulator records only; it never creates completion evidence.
 */
(function(){
 'use strict';
 const KEYS={linux:'last-sysadmin-v1',network:'nettrainer',revision:'lsa-spaced-revision-v1',cross:'lsa-cross-track-web-availability-v1'};
 const read=(key)=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}};
 const esc=(value)=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names=(values,limit)=>values.slice(-limit).map(value=>'<li>'+esc(String(value).replace(/[-_]/g,' '))+'</li>').join('');
 function snapshot(){
  const linux=read(KEYS.linux),network=read(KEYS.network),revision=read(KEYS.revision),cross=read(KEYS.cross);
  const linuxDone=Array.isArray(linux.done)?linux.done.filter(x=>typeof x==='string'):[];
  const networkDone=network.done&&typeof network.done==='object'?Object.keys(network.done).filter(key=>network.done[key]):[];
  const commands=Array.isArray(linux.commandSkills)?linux.commandSkills.filter(x=>typeof x==='string'):[];
  const crossDone=Object.keys(cross).filter(key=>key!=='updatedAt'&&cross[key]===true);
  const items=revision.items&&typeof revision.items==='object'?Object.values(revision.items):[];
  const due=items.filter(item=>item&&Number.isFinite(Number(item.dueAt))&&Number(item.dueAt)<=Date.now()).length;
  return{linuxDone,networkDone,commands,crossDone,due};
 }
 let trigger=null,dialog=null;
 function close(){if(dialog){dialog.remove();dialog=null;}if(trigger&&trigger.isConnected)trigger.focus();}
 function card(title,count,detail,list,kind){
  return '<section class="daily-map-node '+kind+'"><div class="daily-map-node-head"><span class="daily-map-dot" aria-hidden="true"></span><div><h3>'+title+'</h3><strong>'+count+'</strong></div></div><p>'+detail+'</p>'+(list?'<ul>'+list+'</ul>':'<small>No evidence recorded yet</small>')+'</section>';
 }
 function open(){
  if(dialog)close();trigger=document.activeElement;
  const data=snapshot();dialog=document.createElement('div');dialog.id='dailyPracticeDialog';dialog.className='daily-practice-backdrop';
  const review=data.due?'<button class="daily-action primary" type="button" data-dp-review>Review '+data.due+' due concept'+(data.due===1?'':'s')+'</button>':'<p class="daily-muted">No recall reviews are due. New completed learning checkpoints will appear here automatically.</p>';
  dialog.innerHTML='<section class="daily-practice-dialog" role="dialog" aria-modal="true" aria-labelledby="dailyPracticeTitle">'
   +'<header class="daily-practice-head"><div><span class="daily-eyebrow">Your learning routine</span><h2 id="dailyPracticeTitle">Daily practice</h2></div><button type="button" class="daily-action" data-dp-close aria-label="Close daily practice">Close</button></header>'
   +'<p class="daily-intro">A short, repeatable session built from your saved learning progress. Start with recall, then practise in either track. Your progress stays in this browser profile.</p>'
   +'<section class="daily-session"><div><span class="daily-eyebrow">Suggested 10-minute session</span><h3>Recall · Practise · Reflect</h3></div><ol><li><strong>Recall (2 min)</strong><span>Revisit concepts scheduled for review.</span></li><li><strong>Practise (6 min)</strong><span>Complete one Linux or network learning task.</span></li><li><strong>Reflect (2 min)</strong><span>Check your evidence in the skill portfolio.</span></li></ol><div class="daily-actions">'+review+'<a class="daily-action" href="./">Continue Linux</a><a class="daily-action" href="network-trainer/">Open Network Sysadmin</a><button class="daily-action" type="button" data-dp-portfolio>View skill portfolio</button></div></section>'
   +'<div class="daily-map-title"><div><span class="daily-eyebrow">Evidence map</span><h3>Skill progression</h3></div><button class="daily-action" type="button" data-dp-refresh>Refresh</button></div>'
   +'<p class="daily-muted">Each node counts saved completions or demonstrated skills. These are learning records, not certifications or production credentials.</p>'
   +'<div class="daily-skill-map" aria-label="Skill progression evidence">'
   +card('Linux administration',data.linuxDone.length,'Completed simulated missions',names(data.linuxDone,3),'linux')
   +card('Network operations',data.networkDone.length,'Completed simulated network missions',names(data.networkDone,3),'network')
   +card('Command-line skills',data.commands.length,'Commands demonstrated in practice',names(data.commands,4),'commands')
   +card('Integrated operations',data.crossDone.length,'Cross-track objectives recorded',names(data.crossDone,4),'integrated')
   +'</div><p class="daily-foot">The map reads the existing Linux, Network, spaced-recall and cross-track records. It does not change campaign progress, expose journal text, or send data to a server.</p></section>';
  dialog.addEventListener('click',event=>{
   if(event.target===dialog||event.target.closest('[data-dp-close]')){close();return;}
   if(event.target.closest('[data-dp-review]')){close();const button=document.getElementById('btnRevisionReview');if(button)button.click();return;}
   if(event.target.closest('[data-dp-portfolio]')){close();const button=document.getElementById('btnSkillPortfolio');if(button)button.click();return;}
   if(event.target.closest('[data-dp-refresh]')){const active=dialog.querySelector('[data-dp-refresh]');if(active)active.focus();open();return;}
  });
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key==='Tab'){const controls=Array.from(dialog.querySelectorAll('a[href],button:not([disabled])'));if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.body.appendChild(dialog);dialog.querySelector('[data-dp-close]').focus();
 }
 function init(){
  const stats=document.querySelector('.stats');if(!stats||document.getElementById('btnDailyPractice'))return;
  const button=document.createElement('button');button.type='button';button.className='btn';button.id='btnDailyPractice';button.textContent='Daily practice';button.title='Open a short practice plan and visual map of saved learning evidence';button.addEventListener('click',open);stats.insertBefore(button,stats.firstChild);
  const style=document.createElement('style');style.textContent=`
  .daily-practice-backdrop{position:fixed;inset:0;z-index:100;background:rgba(5,9,15,.84);display:flex;align-items:center;justify-content:center;padding:16px}
  .daily-practice-dialog{width:min(860px,100%);max-height:90vh;max-height:90svh;overflow:auto;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.5)}
  .daily-practice-head,.daily-map-title,.daily-map-node-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .daily-practice-head h2{font:700 24px var(--f-display);margin:2px 0 0}
  .daily-eyebrow{font:600 11px var(--f-display);letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
  .daily-intro,.daily-muted,.daily-foot{font-size:13px;color:var(--muted)}
  .daily-session{margin:18px 0;padding:16px;background:var(--raise);border:1px solid var(--line);border-radius:10px}
  .daily-session h3,.daily-map-title h3{font:600 18px var(--f-display);margin:3px 0 10px}
  .daily-session ol{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding-left:22px}
  .daily-session li{padding-right:8px}.daily-session li strong,.daily-session li span{display:block}.daily-session li span{font-size:12px;color:var(--muted)}
  .daily-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .daily-action{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 11px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--ink);font:600 12px var(--f-body);text-decoration:none;cursor:pointer}
  .daily-action:hover,.daily-action:focus-visible{border-color:var(--amber);outline:2px solid transparent}
  .daily-action.primary{background:var(--amber);border-color:var(--amber);color:var(--on-amber)}
  .daily-skill-map{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
  .daily-map-node{position:relative;min-width:0;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--raise)}
  .daily-map-node:before{content:"";position:absolute;left:20px;top:-13px;height:13px;border-left:1px solid var(--muted);opacity:.5}
  .daily-map-node-head{justify-content:flex-start}.daily-map-dot{width:13px;height:13px;flex:none;border:2px solid var(--blue);border-radius:50%;box-shadow:0 0 0 4px color-mix(in srgb,var(--blue) 12%,transparent)}
  .daily-map-node.network .daily-map-dot{border-color:var(--green);box-shadow:0 0 0 4px color-mix(in srgb,var(--green) 12%,transparent)}
  .daily-map-node.commands .daily-map-dot{border-color:var(--amber);box-shadow:0 0 0 4px color-mix(in srgb,var(--amber) 12%,transparent)}
  .daily-map-node.integrated .daily-map-dot{border-color:var(--violet);box-shadow:0 0 0 4px color-mix(in srgb,var(--violet) 12%,transparent)}
  .daily-map-node h3{font:600 14px var(--f-display);margin:0}.daily-map-node strong{font:700 19px var(--f-display);color:var(--amber);margin-left:auto;font-variant-numeric:tabular-nums}
  .daily-map-node p{font-size:12px;color:var(--muted);margin:8px 0}
  .daily-map-node ul{display:flex;gap:5px;flex-wrap:wrap;list-style:none;padding:0;margin:8px 0 0}
  .daily-map-node li{font-size:11px;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:4px 7px;text-transform:capitalize}
  .daily-map-node small{font-size:11px;color:var(--muted)}
  .daily-foot{border-top:1px solid var(--line);padding-top:12px;margin-top:16px}
  @media(max-width:620px){.daily-practice-backdrop{padding:7px}.daily-practice-dialog{padding:14px;max-height:95vh}.daily-session ol{grid-template-columns:1fr;gap:8px}.daily-skill-map{grid-template-columns:1fr}.daily-actions{display:grid;grid-template-columns:1fr 1fr}.daily-action{width:100%;text-align:center}}
  @media(prefers-reduced-motion:reduce){.daily-practice-dialog *{scroll-behavior:auto!important}}
  `;document.head.appendChild(style);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
