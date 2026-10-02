/**
 * Kanay Supply Chain — Generic Intermodal Framework (Sim Core, Layer 1)
 *
 * A topology-agnostic engine. The world-model (nodes + edges + shipments) is
 * loaded from a JSON file in topologies/<name>.json — see
 * topologies/h2-truck-donor-program.json for the first example.
 *
 * Supports any number of intermodal modes (road / rail / sea / air / pipeline /
 * conveyor / courier) declared by the topology. Each edge declares:
 *   - from, to       node ids
 *   - mode           "road" | "rail" | "sea" | "air" | "pipeline" | …
 *   - km, days_mu, days_sd, cost_usd_per_unit, capacity_per_day
 *
 * Each shipment is a unit moving along a pipeline of stages; the engine
 * advances progress, charges edge cost on transition, and emits KPIs.
 *
 * Mirrors refinery `balance-sim.js` and payment-system `sim-core.js`:
 * - pure functions over state object S
 * - no DOM, no Three.js
 * - deterministic via seeded RNG
 * - exposed as window.SupplyChainCore
 */

const SUPPLY_CHAIN_MODES = {
  road:      { color: 0xFBBF24, dash: 'dashed',  default_speed_kmh: 60,  arc_height: 0.04 },
  rail:      { color: 0xA78BFA, dash: 'solid',   default_speed_kmh: 80,  arc_height: 0.10 },
  sea:       { color: 0x06B6D4, dash: 'animated',default_speed_kmh: 35,  arc_height: 0.35 },
  air:       { color: 0xFF4500, dash: 'solid',   default_speed_kmh: 850, arc_height: 0.55 },
  pipeline:  { color: 0x7C5CFF, dash: 'solid',   default_speed_kmh: 12,  arc_height: 0.05 },
  courier:   { color: 0x00D4AA, dash: 'dashed',  default_speed_kmh: 90,  arc_height: 0.10 },
};

// =============================================================
// RNG
// =============================================================
function bindRng(S) {
  S.rngState = S.rngState || 0x4eed;
  S.rng = function () {
    let a = (S.rngState + 0x6D2B79F5) | 0;
    S.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  S.gauss = function (mu = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = S.rng();
    while (v === 0) v = S.rng();
    return mu + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  return S;
}

// =============================================================
// State init from topology
// =============================================================
function initStateFromTopology(topology, scenario = 'balanced') {
  const S = {
    t: 0,
    scenario,
    speed: 1,
    topology_id: topology.id,
    topology_name: topology.name,
    topology_meta: topology.meta || {},

    // World model
    nodes: (topology.nodes || []).map(n => ({ ...n })),
    edges: (topology.edges || []).map(e => ({ ...e, congestion: 0, flow_today: 0 })),

    // Pipeline definition: an ordered list of stages a shipment moves through
    pipeline: topology.pipeline || ['sourced', 'in_transit', 'arrived', 'delivered'],
    stage_to_edge: topology.stage_to_edge || {},

    // Initial shipments
    shipments: (topology.initial_shipments || []).map(s => ({ ...s })),

    // Mode-specific color/style override table (topology may add modes)
    modes: { ...SUPPLY_CHAIN_MODES, ...(topology.modes || {}) },

    // Scenario state
    scenario_mods: {},
  };

  // Scenario modifiers (topology-defined or built-ins)
  if (topology.scenarios && topology.scenarios[scenario]) {
    S.scenario_mods = topology.scenarios[scenario];
  }

  // Apply built-in scenarios for the H2 truck topology
  if (topology.id === 'h2-truck-donor-program') {
    if (scenario === 'vessel-delay') {
      S.edges.filter(e => e.mode === 'sea').forEach(e => { e.days_mu *= 1.4; });
    } else if (scenario === 'fx-shock') {
      S.fx_usd_ghs = 14.8;
    } else if (scenario === 'demand-surge') {
      S.workshop_capacity_per_week = 9;
    }
  }

  // Apply built-in scenarios for the world-rail topology
  if (topology.id === 'world-rail') {
    if (scenario === 'belt-road-surge') {
      // Speed up China→EU edges (-25% transit)
      S.edges.filter(e => ['CN','KZ','IR','TR'].includes(S.nodes.find(n => n.id === e.from)?.country)
                            || ['CN','KZ','IR','TR'].includes(S.nodes.find(n => n.id === e.to)?.country)
                            || e.from === 'URUMQI' || e.to === 'URUMQI' || e.from === 'ISTANBUL' || e.to === 'ISTANBUL' || e.from === 'MUNICH' || e.to === 'MUNICH')
        .forEach(e => { e.days_mu *= 0.75; });
    } else if (scenario === 'strike-action') {
      // US Class I railroads +60% transit
      S.edges.filter(e => ['US'].includes(S.nodes.find(n => n.id === e.from)?.country)
                            || ['US'].includes(S.nodes.find(n => n.id === e.to)?.country))
        .forEach(e => { e.days_mu *= 1.6; });
    } else if (scenario === 'winter-delay') {
      // Russia + Northern Europe +50% transit
      S.edges.filter(e => ['RU','DE','NL','BE','PL'].includes(S.nodes.find(n => n.id === e.from)?.country)
                            || ['RU','DE','NL','BE','PL'].includes(S.nodes.find(n => n.id === e.to)?.country))
        .forEach(e => { e.days_mu *= 1.5; });
    }
  }

  bindRng(S);
  S.total_cost_usd = 0;
  S.cumulative_delivered = 0;
  if (topology.id === 'h2-truck-donor-program') {
    S.fx_usd_ghs = S.fx_usd_ghs || 12.4;
    S.workshop_capacity_per_week = S.workshop_capacity_per_week || 6;
  }

  return S;
}

// Backward-compat default — keeps the H2 truck chain alive for first load
function initState(scenario = 'balanced') {
  return initStateFromTopology(window.SUPPLY_CHAIN_TOPOLOGY, scenario);
}

// =============================================================
// Geospatial projection (matches refinery / payment-system)
// =============================================================
function geoToWorld(lat, lon) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return {
    x: Math.cos(phi) * Math.cos(theta),
    y: Math.cos(phi) * Math.sin(theta),
    z: Math.sin(phi),
  };
}

// =============================================================
// Tick — advance one simulated day
// =============================================================
function tick(S) {
  S.t += 1;

  // Reset daily flow
  for (const e of S.edges) e.flow_today = 0;

  // Advance each shipment along its pipeline
  for (const v of S.shipments) {
    const curIdx = S.pipeline.indexOf(v.status);
    if (curIdx < 0 || curIdx >= S.pipeline.length - 1) continue;

    // Stage-specific progress rate (per-shipment — uses current leg if known)
    const ratePerDay = stageRate(v.status, S, v);

    // Add a small jitter
    let jitter = (S.rng() - 0.5) * 0.02;

    v.progress = Math.min(1.0, v.progress + ratePerDay + jitter);

    // On completion, transition and charge edge cost
    if (v.progress >= 1.0) {
      const from = v.status;
      const to = S.pipeline[curIdx + 1];

      // Charge cost using the leg the shipment was on (preferred), or stage_to_edge lookup
      let edge = null;
      if (from === 'in_transit' && v.current_leg) {
        edge = findEdgeByKey(S, v.current_leg);
      } else {
        const edgeKey = S.stage_to_edge[from];
        if (edgeKey && edgeKey !== 'AUTO') edge = findEdge(S, edgeKey);
      }
      if (edge) {
        S.total_cost_usd += edge.cost_usd_per_unit || 0;
        edge.flow_today += 1;
      }

      v.status = to;
      v.progress = to === 'delivered' ? 1.0 : 0;
      if (to === 'delivered') S.cumulative_delivered += 1;
    }
  }

  // Update FX for H2 truck topology
  if (S.topology_id === 'h2-truck-donor-program') {
    const daily_vol = 0.18 / Math.sqrt(252);
    S.fx_usd_ghs = Math.max(8, S.fx_usd_ghs + S.gauss(0, daily_vol) * S.fx_usd_ghs);
  }

  // Apply scenario modifiers (e.g., demand surge could be reflected via stage rate)
  if (S.scenario_mods && S.scenario_mods.tick) S.scenario_mods.tick(S);
}

function stageRate(stage, S, v) {
  // Default rates per stage — overridable by topology
  const defaults = {
    sourced:     0.12,
    aggregating: 0.10,
    in_transit:  0.06, // fallback when no leg known
    rail:        0.14,
    port:        0.15,
    sailing:     0.04,
    arrived:     0.40,
    converting:  0.20,
    delivered:   0,
  };

  // For 'in_transit' we use the actual current leg's mode + km to derive a per-day rate
  if (stage === 'in_transit' && v && v.current_leg) {
    const edge = findEdgeByKey(S, v.current_leg);
    if (edge) {
      // Real-world transit time is governed by days_mu (mean days for this leg)
      // → daily progress = 1 / days_mu (so a 28-day ocean leg takes 28 ticks)
      const rate = 1 / Math.max(1, edge.days_mu);
      return Math.min(0.30, Math.max(0.01, rate));
    }
  }
  return defaults[stage] ?? 0.10;
}

function findEdge(S, key) {
  // key = "from|to|mode" or "from|to"
  return findEdgeByKey(S, key);
}

function findEdgeByKey(S, key) {
  const parts = key.split('|');
  if (parts.length === 3) {
    return S.edges.find(e => e.from === parts[0] && e.to === parts[1] && e.mode === parts[2]);
  }
  return S.edges.find(e => e.from === parts[0] && e.to === parts[1]);
}

// =============================================================
// KPI
// =============================================================
function kpi(S) {
  const byStatus = {};
  for (const v of S.shipments) byStatus[v.status] = (byStatus[v.status] || 0) + 1;

  const inFlight = S.shipments.filter(v => v.status !== 'delivered');
  const avgProgress = inFlight.length
    ? inFlight.reduce((a, v) => a + v.progress, 0) / inFlight.length
    : 0;

  const costPerDelivered = S.cumulative_delivered > 0
    ? S.total_cost_usd / S.cumulative_delivered
    : null;

  // Top congested edges
  const topEdges = [...S.edges].sort((a, b) => b.flow_today - a.flow_today).slice(0, 5);

  const k = {
    topology_id: S.topology_id,
    topology_name: S.topology_name,
    shipment_count: S.shipments.length,
    delivered: S.cumulative_delivered,
    in_flight: inFlight.length,
    avg_progress: avgProgress,
    by_status: byStatus,
    total_cost_usd: Math.round(S.total_cost_usd),
    cost_per_delivered_usd: costPerDelivered !== null ? Math.round(costPerDelivered) : null,
    sim_days: S.t,
    top_edges: topEdges.map(e => ({ from: e.from, to: e.to, mode: e.mode, flow: e.flow_today })),
  };

  if (S.fx_usd_ghs !== undefined) {
    k.fx_usd_ghs = S.fx_usd_ghs;
  }
  if (S.workshop_capacity_per_week !== undefined) {
    k.workshop_capacity_per_week = S.workshop_capacity_per_week;
  }

  return k;
}

// =============================================================
// Reset
// =============================================================
function reset(S, scenario) {
  return initStateFromTopology(
    window.SUPPLY_CHAIN_TOPOLOGY,
    scenario || S.scenario || 'balanced'
  );
}

// =============================================================
// Public API
// =============================================================
window.SupplyChainCore = {
  initStateFromTopology,
  initState,
  tick,
  kpi,
  reset,
  geoToWorld,
  findEdge,
  MODES: SUPPLY_CHAIN_MODES,
};
// Backwards alias — older code may have used SimCore
window.SimCore = window.SupplyChainCore;
