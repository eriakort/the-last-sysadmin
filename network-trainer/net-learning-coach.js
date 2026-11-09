// Network Learning Coach content. Kept separate from UI so explanations are
// deterministic, testable and easy to extend without changing simulator state.
const GUIDES = {
  'ip addr': {
    purpose: 'Inspect the addresses, prefixes and link state configured on this endpoint.',
    runOn: 'The affected host or server.',
    lookFor: 'The expected interface, IPv4 address and prefix length, plus an UP link state.',
    interpret: 'An address can be syntactically valid but belong to the wrong subnet. A DOWN interface cannot carry traffic even when its address is correct.',
    pitfall: 'Do not assume that an UP interface proves the cable, switch path, gateway or remote service is healthy.',
    next: 'Compare the address and prefix with the subnet plan, then inspect ip route and test the local gateway.',
    challenge: 'A host has 10.0.1.10/25 but the server is 10.0.1.200. What does the prefix tell you?',
    answer: 'A /25 divides 10.0.1.0/24 into two subnets. .10 is in 10.0.1.0/25 and .200 is in 10.0.1.128/25, so they are not local neighbours.'
  },
  'ip route': {
    purpose: 'Show how the endpoint forwards traffic to local and remote networks.',
    runOn: 'The source endpoint that cannot reach the destination.',
    lookFor: 'A connected route for the local subnet and an appropriate specific or default route for the destination.',
    interpret: 'The most specific matching route wins. A default route is used only when no more-specific route matches.',
    pitfall: 'A route entry does not prove its next hop is reachable or that a return route exists.',
    next: 'Check the next-hop address, test it with ping, then trace the destination path.',
    challenge: 'The route table has default via 10.0.1.99, but the router is 10.0.1.1. Why can local traffic work while remote traffic fails?',
    answer: 'Local-subnet traffic uses its connected route. Remote traffic is sent to the incorrect default next hop, so it cannot reach the real router.'
  },
  'ping 192.0.2.1': {
    purpose: 'Test basic IP reachability to a destination using ICMP echo.',
    runOn: 'The source host or network device involved in the incident.',
    lookFor: 'Replies, packet loss and response time; compare tests to the gateway and then the destination.',
    interpret: 'A reply proves this ICMP exchange succeeded at that moment. A failure can indicate filtering, routing, addressing or endpoint availability.',
    pitfall: 'Ping success does not prove DNS, TCP ports or the application are working; ping failure does not always mean the host is down.',
    next: 'Test the gateway, run traceroute, and use a service-specific check such as nmap or the relevant application port.',
    challenge: 'Ping to a server IP succeeds, but users cannot open its website. What should you test next?',
    answer: 'Check name resolution and the web service port (usually TCP/80 or TCP/443). ICMP reachability alone does not establish that the application is listening or permitted.'
  },
  'traceroute 192.0.2.1': {
    purpose: 'Reveal the sequence of routed hops toward a destination.',
    runOn: 'The source endpoint or router closest to the reported failure.',
    lookFor: 'The last responding hop, unexpected next hops and where responses stop.',
    interpret: 'Each visible hop is a router that returned a TTL-expired response. Asterisks may mean filtered or unanswered probes, not necessarily a broken hop.',
    pitfall: 'Some devices suppress traceroute responses while still forwarding user traffic.',
    next: 'Compare the last visible hop with the expected topology and inspect routes and ACLs on that segment.',
    challenge: 'Traceroute shows asterisks after the first router, but the destination application still works. Is that conclusive evidence of an outage?',
    answer: 'No. Intermediate devices may filter or rate-limit traceroute responses while forwarding application traffic normally.'
  },
  'show vlan brief': {
    purpose: 'Review VLANs configured on a switch and the access ports assigned to each.',
    runOn: 'The switch connected to the affected endpoint.',
    lookFor: 'The expected VLAN ID and the endpoint-facing port listed under that VLAN.',
    interpret: 'A port in the wrong VLAN places the endpoint in the wrong Layer 2 broadcast domain.',
    pitfall: 'This summary does not prove an inter-switch trunk carries the VLAN or that the endpoint IP plan matches it.',
    next: 'Inspect show interfaces trunk on both ends of the uplink, then verify the host address and gateway.',
    challenge: 'Two hosts have addresses in the same subnet but cannot resolve each other. What switch setting is worth checking?',
    answer: 'Check whether their access ports belong to the same intended VLAN. Same-subnet addressing cannot overcome Layer 2 separation.'
  },
  'show interfaces status': {
    purpose: 'Summarise physical switch-port state and operational characteristics.',
    runOn: 'The access switch serving the affected endpoint.',
    lookFor: 'Connected/not-connected state, speed, duplex and assigned VLAN.',
    interpret: 'A disconnected or disabled port points to a link or administrative issue; an unexpected VLAN points to a configuration issue.',
    pitfall: 'A connected port does not prove correct VLAN, spanning-tree forwarding or end-to-end reachability.',
    next: 'Inspect the specific interface configuration and counters, then check VLAN and spanning-tree state.',
    challenge: 'A port is connected but the endpoint is still isolated. Name two further checks.',
    answer: 'Verify the access VLAN and spanning-tree state; also inspect port security and interface counters for errors or violations.'
  },
  'show interfaces trunk': {
    purpose: 'Check operational trunk links and which VLANs they carry.',
    runOn: 'Both switches at either end of the inter-switch link.',
    lookFor: 'Trunk status, native VLAN and allowed/active VLAN lists.',
    interpret: 'A VLAN absent from the allowed list cannot cross that trunk even when both endpoint access ports are correct.',
    pitfall: 'A trunk on one switch does not guarantee the peer is configured consistently.',
    next: 'Compare both ends, correct the allowed VLAN list and verify the VLAN remains active.',
    challenge: 'VLAN 10 exists on both switches, but the trunk allows only VLAN 20. What is the likely fault?',
    answer: 'VLAN 10 is excluded from the trunk allow-list. Permit VLAN 10 on both ends and verify forwarding.'
  },
  'show spanning-tree': {
    purpose: 'Inspect the spanning-tree root bridge and each switch port role/state.',
    runOn: 'The switches in the affected Layer 2 topology.',
    lookFor: 'The expected root bridge, root/designated/alternate roles and forwarding/blocking states.',
    interpret: 'A redundant path may intentionally be blocking to prevent a Layer 2 loop. Unexpected root election or blocked access ports deserve investigation.',
    pitfall: 'A blocking redundant port is not automatically a fault; do not disable STP to force it to forward.',
    next: 'Compare the root ID and port roles across switches, then inspect VLAN-specific STP state.',
    challenge: 'A triangle topology has one blocking inter-switch port. Should you immediately enable it?',
    answer: 'No. STP blocks a redundant path to prevent loops. Verify the elected root and intended path before changing priorities or links.'
  },
  'show mac address-table': {
    purpose: 'Find which switch port has learned a device MAC address and in which VLAN.',
    runOn: 'The switch expected to learn the endpoint MAC.',
    lookFor: 'The endpoint MAC, VLAN ID and learned interface; distinguish dynamic from static entries.',
    interpret: 'An entry on an unexpected port can indicate a cabling/topology mismatch or MAC movement. No entry may mean no recent source traffic or a VLAN/path issue.',
    pitfall: 'A MAC table is a learning snapshot, not proof of IP reachability or a complete path.',
    next: 'Generate endpoint traffic, check the access VLAN and follow the learned port toward the destination.',
    challenge: 'The endpoint MAC is learned in VLAN 20, but the design says VLAN 10. What does that suggest?',
    answer: 'The endpoint-facing port or upstream path is placing the frame in the wrong VLAN. Verify access-port assignment and trunk tagging.'
  },
  'show ip interface brief': {
    purpose: 'Quickly compare router interface addresses and operational states.',
    runOn: 'The router that connects the affected subnet or path.',
    lookFor: 'Correct IP address and both administrative and operational state (up/up where expected).',
    interpret: 'Administratively down indicates shutdown; down/down often points to link or peer issues. An incorrect address can break adjacency and routing.',
    pitfall: 'Up/up does not prove a route exists, an ACL permits traffic or the remote side has a return path.',
    next: 'Inspect show ip route and the relevant protocol neighbour or interface details.',
    challenge: 'An interface is administratively up but operationally down. What layer should you investigate first?',
    answer: 'Investigate the physical/link path and peer interface before changing routing or ACL configuration.'
  },
  'show ip route': {
    purpose: 'Inspect the router forwarding table and the source of each route.',
    runOn: 'The router expected to forward traffic toward the destination network.',
    lookFor: 'A matching destination prefix, route source, next hop and outgoing interface.',
    interpret: 'Connected, static and dynamically learned routes provide different evidence. The longest-prefix match determines the selected route.',
    pitfall: 'A route on the forward path does not guarantee the destination has a return route.',
    next: 'Check next-hop reachability, the peer router route table and ACLs along the path.',
    challenge: 'The router has a route to the branch subnet but traffic still fails. What evidence is missing?',
    answer: 'Check the next-hop/link state, policy filtering and the return route from the branch. A forward route alone is not end-to-end proof.'
  },
  'show ip ospf neighbor': {
    purpose: 'Verify OSPF neighbour relationships and adjacency state.',
    runOn: 'Each router expected to form an OSPF adjacency.',
    lookFor: 'The expected peer router, neighbour address and a fully established state.',
    interpret: 'No neighbour means adjacency has not formed. A neighbour that is not fully established may indicate a network type or database exchange issue.',
    pitfall: 'A neighbour relationship does not by itself prove the desired remote prefix is being advertised or installed.',
    next: 'Compare area, timers, authentication and network statements; then inspect the routing table for the learned prefix.',
    challenge: 'The OSPF neighbour is FULL, but the branch prefix is absent from the route table. What should you inspect?',
    answer: 'Check whether the branch LAN interface is enabled in OSPF and advertised, and whether route filters or passive-interface settings affect it.'
  },
  'show access-lists': {
    purpose: 'Review access-control rules, their order and any available match counters.',
    runOn: 'The router or firewall applying policy to the affected traffic direction.',
    lookFor: 'First-match order, source/destination, protocol, port and the interface/direction where the list is applied.',
    interpret: 'A broad earlier deny can shadow a later permit. A correct rule on the wrong interface or direction will not protect the intended path.',
    pitfall: 'Seeing a permit in the list does not prove that traffic reaches it or that the ACL is bound correctly.',
    next: 'Inspect the interface binding and test both the allowed and denied flows.',
    challenge: 'Sequence 10 denies all IP traffic and sequence 20 permits SSH. Why does SSH fail?',
    answer: 'The first-match deny is evaluated first, so the later SSH permit is never reached. Reorder the narrow permit ahead of the catch-all deny.'
  },
  'show running-config': {
    purpose: 'Inspect the active configuration currently used by the simulated device.',
    runOn: 'The device whose configuration may have caused the incident.',
    lookFor: 'Relevant interface, VLAN, route, protocol and security-policy sections; compare them with the intended design.',
    interpret: 'This is the running state, not necessarily the saved startup configuration. Focus on the specific section tied to the symptom.',
    pitfall: 'A correct running configuration may not be saved; a saved configuration may differ from the active one.',
    next: 'After verifying a controlled change, compare show startup-config and save only when the result is correct.',
    challenge: 'The running configuration contains the repair, but it disappears after a simulated restart. What should you check?',
    answer: 'The active configuration may not have been saved. Verify startup-config and use the supported save command after validating the change.'
  }
};

function getGuide(command) {
  const guide = GUIDES[String(command || '').trim()];
  return guide ? { command: String(command).trim(), ...guide } : null;
}

function validateGuides(commands) {
  const missing = (commands || []).filter(item => !getGuide(item.cmd)).map(item => item.cmd);
  return { ok: missing.length === 0, missing, count: Object.keys(GUIDES).length };
}

module.exports = { getGuide, validateGuides, GUIDES };
