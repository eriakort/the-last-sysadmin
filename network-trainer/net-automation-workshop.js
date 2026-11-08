// Guided network automation playbooks backed by the real simulator CLI and model.
// Every exercise runs in an isolated lab; no commands reach external devices.
const M=require('./net-model');
const {makeCLI}=require('./net-cli');
const ip=s=>M.ip(s);
const router=(id,ifaces)=>({id,kind:'router',hostname:id,ifaces,routes:[],acls:[]});
const iface=(address,prefix)=>({up:true,ip:ip(address),mask:prefix});
const PLAYBOOKS=[
{id:'baseline',title:'Device baseline automation',level:'Foundation',summary:'Standardise management identity, time and central logging on an edge router, then save and verify the running configuration.',deviceIds:['edge'],initialDevice:'edge',objectives:['Set the approved hostname','Configure the central NTP peer','Forward logs to the central collector','Set informational logging and save the configuration'],steps:[
{device:'edge',commands:['enable','configure terminal','hostname edge-01','ntp server 10.0.1.10','logging host 10.0.1.20','logging trap informational','end','write memory']}]},
{id:'switch-access',title:'Repeatable switch-port provisioning',level:'Intermediate',summary:'Provision a staff access VLAN and apply a consistent edge-port security baseline. Re-run the playbook to see why declarative changes should be safe to repeat.',deviceIds:['sw1'],initialDevice:'sw1',objectives:['Create VLAN 20 named STAFF','Set p1 to access mode in VLAN 20','Enable sticky port security with a maximum of two MAC addresses','Use restrict violation handling and save the configuration'],steps:[
{device:'sw1',commands:['enable','configure terminal','vlan 20','name STAFF','exit','interface p1','switchport mode access','switchport access vlan 20','switchport port-security','switchport port-security maximum 2','switchport port-security violation restrict','switchport port-security mac-address sticky','exit','end','write memory']}]},
{id:'ospf-standard',title:'Multi-device routing standard',level:'Advanced',summary:'Apply a repeatable OSPF template to two routers, keep user-facing LAN interfaces passive and verify adjacency plus a learned remote route.',deviceIds:['r1','r2'],initialDevice:'r1',objectives:['Set unique router IDs and OSPF process 10','Advertise the transit and local LAN networks in area 0','Keep each user LAN interface passive','Establish an OSPF neighbour and learn the remote LAN','Save both router configurations'],steps:[
{device:'r1',commands:['enable','configure terminal','router ospf 10','router-id 1.1.1.1','network 10.0.12.0 0.0.0.255 area 0','network 10.0.1.0 0.0.0.255 area 0','passive-interface eth1','end','write memory']},
{device:'r2',commands:['enable','configure terminal','router ospf 10','router-id 2.2.2.2','network 10.0.12.0 0.0.0.255 area 0','network 10.0.2.0 0.0.0.255 area 0','passive-interface eth1','end','write memory']}]}
];
function clone(x){return JSON.parse(JSON.stringify(x));}
function getPlaybook(id){return PLAYBOOKS.find(x=>x.id===id)||PLAYBOOKS[0];}
function createTopology(id){
 if(id==='switch-access')return{devices:{sw1:{id:'sw1',kind:'switch',hostname:'access-sw1',ifaces:{p1:{up:true},p2:{up:true},p3:{up:true},p4:{up:true}},vlans:[1]}},links:[]};
 if(id==='ospf-standard')return{devices:{r1:router('r1',{eth0:iface('10.0.12.1',24),eth1:iface('10.0.1.1',24)}),r2:router('r2',{eth0:iface('10.0.12.2',24),eth1:iface('10.0.2.1',24)})},links:[{a:['r1','eth0'],b:['r2','eth0'],up:true}]};
 return{devices:{edge:router('edge',{eth0:iface('10.0.1.1',24),eth1:iface('198.51.100.2',30)})},links:[]};
}
function createLab(id){const net=createTopology(id),playbook=getPlaybook(id);return{net,cli:makeCLI(net,playbook.initialDevice),device:playbook.initialDevice,output:[]};}
function evaluate(id,net){
 const checks=[];
 const add=(label,ok,detail)=>checks.push({label,ok:!!ok,detail});
 if(id==='baseline'){
  const d=net.devices.edge||{},ntp=d.ntp||{},sys=d.syslog||{},saved=d.startupConfig||'';
  add('Approved hostname',d.hostname==='edge-01','Expected hostname edge-01');
  add('Central NTP peer', (ntp.servers||[]).includes(ip('10.0.1.10')),'Expected NTP server 10.0.1.10');
  add('Central syslog destination',(sys.hosts||[]).includes(ip('10.0.1.20')),'Expected syslog host 10.0.1.20');
  add('Informational severity and saved configuration',sys.severity===6&&saved.includes('hostname edge-01')&&saved.includes('ntp server 10.0.1.10'),'Set severity 6 and save the running configuration');
 }else if(id==='switch-access'){
  const d=net.devices.sw1||{},p=d.ifaces&&d.ifaces.p1||{},ps=p.portSecurity||{},saved=d.startupConfig||'';
  add('VLAN 20 exists and is named STAFF',(d.vlans||[]).includes(20)&&(d.vlanNames||{})[20]==='STAFF','Create VLAN 20 and name it STAFF');
  add('p1 is an access port in VLAN 20',p.mode==='access'&&Number(p.accessVlan??p.vlan)===20,'Configure p1 as an access port in VLAN 20');
  add('Port security is consistently enforced',ps.enabled===true&&ps.maximum===2&&ps.violation==='restrict'&&ps.sticky===true,'Enable sticky learning, maximum 2 and restrict violation mode');
  add('Configuration is saved',saved.includes('vlan 20')&&saved.includes('switchport access vlan 20')&&saved.includes('switchport port-security'),'Save the running configuration');
 }else{
  const a=net.devices.r1||{},b=net.devices.r2||{},na=M.ospfNeighbors(net,'r1'),routes=M.ospfLearned(net,'r1');
  const config=d=>d.ospf&&d.ospf.processId===10&&d.ospf.routerId!=null&&(d.ospf.networks||[]).length>=2&&(d.ospf.passiveInterfaces||[]).includes('eth1')&&(d.startupConfig||'').includes('router ospf 10');
  add('Both routers have unique OSPF identities',config(a)&&config(b)&&a.ospf.routerId!==b.ospf.routerId,'Configure process 10 and unique router IDs on both routers');
  add('Both transit interfaces form an adjacency',na.some(n=>n.id==='r2'&&n.state==='FULL'),'Enable OSPF on the shared transit subnet; do not make eth0 passive');
  add('The user LAN is passive on both routers',(a.ospf.passiveInterfaces||[]).includes('eth1')&&(b.ospf.passiveInterfaces||[]).includes('eth1'),'Keep eth1 passive to advertise the LAN without forming a neighbour there');
  add('Remote LAN route is learned',routes.some(r=>M.ipStr(r.dest)==='10.0.2.0'&&r.mask===24),'R1 should learn 10.0.2.0/24 through OSPF');
  add('Both configurations are saved',(a.startupConfig||'').includes('router ospf 10')&&(b.startupConfig||'').includes('router ospf 10'),'Save the running configuration on both routers');
 }
 const score=checks.filter(x=>x.ok).length;
 return{playbookId:id,score,total:checks.length,percent:Math.round(score/checks.length*100),passed:score===checks.length,checks};
}
module.exports={PLAYBOOKS,getPlaybook,createTopology,createLab,evaluate,clone};
