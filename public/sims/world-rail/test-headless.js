const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'sim-core.js'), 'utf8');
const topo = JSON.parse(fs.readFileSync(path.join(__dirname, 'topologies/world-rail.json'), 'utf8'));

global.window = { SUPPLY_CHAIN_TOPOLOGY: topo };
const SC = new Function('window', code + '\nreturn window.SupplyChainCore;')(global.window);

let S = SC.initStateFromTopology(topo, 'balanced');
console.log('INITIAL  ', JSON.stringify(SC.kpi(S)));
for (let h of [7, 30, 90]) {
  S = SC.initStateFromTopology(topo, 'balanced');
  for (let i = 0; i < h; i++) SC.tick(S);
  const k = SC.kpi(S);
  console.log(`AFTER ${h}d`, JSON.stringify({ delivered: k.delivered, in_flight: k.in_flight, total_cost: k.total_cost_usd }));
}

// Try all scenarios
console.log('\n=== SCENARIOS @ different horizons ===');
for (const h of [7, 15, 30]) {
  console.log(`\n--- ${h} days ---`);
  for (const sc of Object.keys(topo.scenarios)) {
    let S2 = SC.initStateFromTopology(topo, sc);
    for (let i = 0; i < h; i++) SC.tick(S2);
    const k = SC.kpi(S2);
    console.log(`  ${sc.padEnd(20)} delivered=${k.delivered} in_flight=${k.in_flight} cost=$${k.total_cost_usd}`);
  }
}
