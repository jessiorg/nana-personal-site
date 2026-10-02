/**
 * Eurostar Simulation Core — Dependency-free
 * Cross-channel high-speed rail financial simulator
 * Run in browser or headless in Node.js. No DOM, no Three.js, no side effects.
 *
 * === USAGE ===
 * const S = newEurostarGame('T1');
 * setInterval(() => tickWeek(S), 1000); // advance 1 sim week per second
 * console.log(S.cash, S.weeklyRevenue, S.weeklyCost);
 */

// ============================================================
// ROUTE DEFINITIONS
// ============================================================
const ROUTES = {
  'london-paris': {
    name: 'London–Paris',
    distance_km: 493,
    tunnel_km: 50.45,
    base_price: 115,
    premium_mult: 1.91,    // Business Premier ~1.91x standard
    seats: 894,            // e320
    trains_per_week: 120,
    segments: [
      { country: 'UK',    distance: 108, track_per_km: 10.50 },
      { country: 'TUNNEL', distance: 50,  track_per_km: 0 },
      { country: 'FR',   distance: 335, track_per_km: 7.20  },
    ],
  },
  'london-brussels': {
    name: 'London–Brussels',
    distance_km: 599,
    tunnel_km: 50.45,
    base_price: 99,
    premium_mult: 1.85,
    seats: 894,
    trains_per_week: 40,
    segments: [
      { country: 'UK',    distance: 108, track_per_km: 10.50 },
      { country: 'TUNNEL', distance: 50,  track_per_km: 0 },
      { country: 'FR',   distance: 280, track_per_km: 7.20  },
      { country: 'BE',   distance: 71,  track_per_km: 5.80  },
    ],
  },
  'london-amsterdam': {
    name: 'London–Amsterdam',
    distance_km: 907,
    tunnel_km: 50.45,
    base_price: 149,
    premium_mult: 1.88,
    seats: 894,
    trains_per_week: 20,
    segments: [
      { country: 'UK',    distance: 108, track_per_km: 10.50 },
      { country: 'TUNNEL', distance: 50,  track_per_km: 0 },
      { country: 'FR',   distance: 280, track_per_km: 7.20  },
      { country: 'BE',   distance: 71,  track_per_km: 5.80  },
      { country: 'NL',   distance: 211, track_per_km: 8.40  },
    ],
  },
};

// ============================================================
// CONSTANTS — from CONSTANTS.md
// ============================================================
const EUROSTAR_CONSTANTS = {
  // Fleet
  ACTIVE_SETS: 29,
  FLEET_AVAILABILITY: 0.88,
  E320_SEATS: 894,
  E300_SEATS: 766,
  CREW_PER_TRAIN: 6,

  // Energy
  ENERGY_KWH_PER_TRAIN_KM: 4.30,   // e320 at 300 km/h
  TUNNEL_RESISTANCE_MULT: 1.15,
  REGEN_EFFICIENCY: 0.85,
  ENERGY_OFFPEAK_PER_KWH: 0.08,
  ENERGY_PEAK_PER_KWH: 0.14,
  ENERGY_MIX_OFFPEAK_PCT: 0.50,

  // Track access
  TRACK_HS1_PER_KM: 10.50,
  TRACK_LGV_PER_KM: 7.20,
  TRACK_BELGIAN_PER_KM: 5.80,
  TRACK_DUTCH_PER_KM: 8.40,

  // Tunnel
  TUNNEL_SLOT_FEE: 2800,          // per crossing per direction

  // Crew
  CREW_COST_PER_TRAIN_KM: 5.20,   // 2 drivers + 4 conductors

  // Maintenance (per train-km, age-adjusted)
  MAINT_NEW_PER_KM: 1.40,        // 0-5 years
  MAINT_MID_PER_KM: 2.10,        // 5-15 years
  MAINT_OLD_PER_KM: 3.80,        // 15+ years

  // Fixed costs
  STATION_COST_PER_STOP: 1800,    // per train stop
  OVERHEAD_WEEKLY: 850000,        // EUR/week (admin, marketing, HQ)
  E320_LEASE_PER_WEEK: 95000,    // per set
  E300_LEASE_PER_WEEK: 45000,

  // Revenue
  YIELD_PER_PKM: 0.185,         // blended EUR per passenger-km
  ANCILLARY_PER_PAX: 18,         // seat selection, food, baggage

  // Failure
  BREAKDOWN_RATE_E320: 0.008,   // per 100,000 train-km
  BREAKDOWN_RATE_E300: 0.021,
  REPAIR_COST_MINOR: 15000,
  REPAIR_COST_MAJOR: 85000,
  REPAIR_COST_CRITICAL: 350000,

  // Delay distribution
  DELAY_MINOR_PCT: 0.70,         // <15 min
  DELAY_MINOR_RANGE: [5, 15],
  DELAY_MAJOR_PCT: 0.25,        // 15-60 min
  DELAY_MAJOR_RANGE: [20, 60],
  DELAY_CRITICAL_PCT: 0.05,      // >60 min or cancelled
  DELAY_CRITICAL_RANGE: [90, 300],

  // Catastrophic
  TUNNEL_CLOSURE_PROB_PER_YEAR: 0.02,
  TUNNEL_CLOSURE_DAYS: 7,
  TUNNEL_CLOSURE_COST_PER_DAY: 8500000,

  // Strikes
  STRIKE_PROB_UK: 0.08,
  STRIKE_PROB_FRANCE: 0.12,
  STRIKE_PROB_BELGIUM: 0.06,
  STRIKE_DAYS_PER_EVENT: 2,
  STRIKE_REVENUE_LOSS_PER_DAY: 4200000,

  // Seasonal demand multipliers
  SEASONAL: {
    'christmas': 1.25,    // Dec-Jan
    'january':  0.68,    // Jan (low)
    'easter':   1.15,    // Easter week
    'summer':   1.35,    // Jul-Aug (peak)
    'half-term': 1.20,   // Feb, Oct half-terms
    'default':  1.00,
  },
};

// ============================================================
// SEEDED RNG (mulberry32)
// ============================================================
function bindRng(S) {
  S.rng = function () {
    let a = S.rngState >>> 0;
    a = (a + 0x6D2B79F5) >>> 0;
    S.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return S;
}

// ============================================================
// STATE FACTORY
// ============================================================
function newEurostarGame(scenario = 'T1') {
  const S = {
    // Identity
    rngState: (Math.random() * 0xFFFFFFFF) >>> 0,
    scenario,

    // Time
    week: 0,
    ticks: 0,

    // Routes
    routes: {},        // per-route state (filled in recalc)

    // Fleet
    fleet_available: EUROSTAR_CONSTANTS.ACTIVE_SETS,
    fleet_condition: [], // array of condition scores per set

    // Cash
    cash: 25000000,     // €25M start
    min_cash: 25000000,

    // Weekly financials
    weekly_revenue: 0,
    weekly_cost: 0,
    weekly_profit: 0,
    weekly_delay_events: 0,
    weekly_breakdowns: 0,
    weekly_cancellations: 0,

    // Accumulated
    total_revenue: 0,
    total_cost: 0,
    total_profit: 0,
    total_breakdowns: 0,
    total_explosions: 0,
    total_cancellations: 0,
    total_delay_events: 0,

    // Event log
    event_log: [],
    incidents: [],

    // History
    cash_history: [],
    revenue_history: [],
    profit_history: [],

    // Outcomes
    fired: false,
    fired_reason: '',

    // Status
    tunnel_open: true,
    strike_days_remaining: 0,
    delay_minutes_this_week: 0,

    // Scenario params
    demand_mult: 1.0,
    load_factor: 0.82,
    maint_quality: 1.0,      // multiplier 0-1
    severity: 'normal',
    new_routes: [],
    extra_sets: 0,
    debt_per_week: 0,
  };

  bindRng(S);

  // Initialize fleet condition (after rng is bound)
  for (let i = 0; i < EUROSTAR_CONSTANTS.ACTIVE_SETS; i++) {
    S.fleet_condition.push(90 + S.rng() * 10); // 90-100
  }

  loadScenario(S, scenario);
  recalc(S);
  return S;
}

// ============================================================
// SCENARIO LOADER
// ============================================================
function loadScenario(S, scenario) {
  const C = EUROSTAR_CONSTANTS;

  switch (scenario) {
    case 'T1': // Baseline
      S.demand_mult = 1.0; S.load_factor = 0.82; S.maint_quality = 1.0;
      S.severity = 'normal'; S.debt_per_week = 0;
      break;

    case 'T2': // Peak summer
      S.demand_mult = 1.35; S.load_factor = 0.95; S.maint_quality = 1.0;
      S.severity = 'stress'; S.debt_per_week = 0;
      break;

    case 'T3': // Winter crisis
      S.demand_mult = 0.70; S.load_factor = 0.60; S.maint_quality = 0.80;
      S.severity = 'crisis'; S.debt_per_week = 0;
      break;

    case 'T4': // Tunnel closure
      S.demand_mult = 0.15; S.load_factor = 0.50; S.maint_quality = 1.0;
      S.severity = 'crisis'; S.debt_per_week = 0;
      break;

    case 'T5': // Competitor price war
      S.demand_mult = 0.88; S.load_factor = 0.72; S.maint_quality = 1.0;
      S.severity = 'stress'; S.debt_per_week = 0;
      break;

    case 'T6': // Turnarounds (planned outages)
      S.demand_mult = 1.0; S.load_factor = 0.82; S.maint_quality = 1.0;
      S.severity = 'normal'; S.debt_per_week = 0;
      break;

    case 'T7': // Delivery shock
      S.demand_mult = 0.80; S.load_factor = 0.70; S.maint_quality = 1.0;
      S.severity = 'normal'; S.debt_per_week = 0;
      break;

    case 'T8': // Fleet expansion
      S.demand_mult = 1.20; S.load_factor = 0.85; S.maint_quality = 1.0;
      S.severity = 'stress'; S.debt_per_week = 0; S.extra_sets = 3;
      break;

    case 'T9': // Free-builder (fcc2 + cdu2, feed up)
      S.demand_mult = 1.15; S.load_factor = 0.88; S.maint_quality = 1.0;
      S.severity = 'normal'; S.debt_per_week = 0;
      break;

    case 'T10': // Contract (jet obligation wk 5-10)
      S.demand_mult = 1.05; S.load_factor = 0.84; S.maint_quality = 1.0;
      S.severity = 'normal'; S.debt_per_week = 0;
      break;

    case 'T11': // PE acquisition (leverage)
      S.demand_mult = 1.0; S.load_factor = 0.82; S.maint_quality = 0.75;
      S.severity = 'normal'; S.debt_per_week = 1200000;
      break;

    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }
}

// ============================================================
// CORE TICK — advances simulation by 1 week
// ============================================================
function tickWeek(S) {
  const C = EUROSTAR_CONSTANTS;
  const out = { events: [], week: S.week };

  if (S.fired) return out;

  S.ticks++;
  S.week++;
  S.weekly_revenue = 0;
  S.weekly_cost = 0;
  S.weekly_delay_events = 0;
  S.weekly_breakdowns = 0;
  S.weekly_cancellations = 0;
  S.delay_minutes_this_week = 0;

  // --- Stochastic events ---

  // Tunnel closure
  if (S.rng() < C.TUNNEL_CLOSURE_PROB_PER_YEAR / 52) {
    S.tunnel_open = false;
    out.events.push(`TUNNEL CLOSURE — ${C.TUNNEL_CLOSURE_DAYS} days`);
    logIncident(S, 'tunnel_closure', `Tunnel closed ${C.TUNNEL_CLOSURE_DAYS} days`);
  }
  if (!S.tunnel_open) {
    S.tunnel_open = true; // Reopens next week for simplicity
  }

  // Strikes (France most common)
  if (S.rng() < C.STRIKE_PROB_FRANCE / 52) {
    S.strike_days_remaining = C.STRIKE_DAYS_PER_EVENT;
    const pax_loss = C.STRIKE_REVENUE_LOSS_PER_DAY * S.strike_days_remaining;
    S.weekly_revenue -= pax_loss;
    out.events.push(`FRENCH STRIKE — ${S.strike_days_remaining} days, €${(pax_loss/1e6).toFixed(1)}M lost`);
    logIncident(S, 'strike', `French strike ${S.strike_days_remaining} days`);
  }

  // Weather disruptions (prob ~20%/week)
  if (S.rng() < 0.20) {
    const weather_delay = Math.floor(S.rng() * 30) + 10; // 10-40 min
    S.delay_minutes_this_week += weather_delay;
    if (weather_delay > 60) S.weekly_cancellations += 1;
  }

  // --- Per-route calculations ---
  let weekly_total_trains = 0;
  let weekly_total_pax = 0;
  let weekly_total_delay_min = 0;
  let weekly_total_breakdowns = 0;

  const routeKeys = Object.keys(ROUTES);

  for (const routeKey of routeKeys) {
    const route = ROUTES[routeKey];
    const trains = Math.min(route.trains_per_week, Math.floor(S.fleet_available));

    for (let t = 0; t < trains; t++) {
      // --- Demand ---
      const seasonal_mult = getSeasonalMultiplier(S.week);
      const demand_noise = 1 + (S.rng() - 0.5) * 0.12; // ±6%
      const effective_demand = S.demand_mult * seasonal_mult * demand_noise;
      const effective_load = Math.min(0.99, S.load_factor * effective_demand);
      const passengers = Math.floor(route.seats * effective_load);

      // --- Revenue ---
      const class_blend = 0.15 * route.base_price * route.premium_mult  // business
                        + 0.25 * route.base_price * 1.5                   // standard prem
                        + 0.45 * route.base_price                         // standard
                        + 0.15 * route.base_price * 0.5;                 // discount
      const route_revenue = passengers * class_blend
                         + passengers * C.ANCILLARY_PER_PAX;

      // --- Costs ---
      let route_cost = 0;

      // Track access
      for (const seg of route.segments) {
        route_cost += seg.distance * (seg.country === 'TUNNEL' ? 0 : seg.track_per_km);
      }

      // Tunnel slot
      route_cost += C.TUNNEL_SLOT_FEE;

      // Energy
      const total_km = route.segments.reduce((s, seg) => s + seg.distance, 0);
      const tunnel_pct = route.tunnel_km / total_km;
      const energy_per_km = C.ENERGY_KWH_PER_TRAIN_KM * (1 + tunnel_pct * (C.TUNNEL_RESISTANCE_MULT - 1));
      const energy_cost = total_km * energy_per_km * (C.ENERGY_OFFPEAK_PER_KWH * C.ENERGY_MIX_OFFPEAK_PCT
                                                          + C.ENERGY_PEAK_PER_KWH * (1 - C.ENERGY_MIX_OFFPEAK_PCT));

      // Crew
      const crew_cost = total_km * C.CREW_COST_PER_TRAIN_KM;

      // Maintenance (age-adjusted)
      const avg_age = 10; // mid-life fleet
      const maint_rate = avg_age < 5 ? C.MAINT_NEW_PER_KM
                        : avg_age < 15 ? C.MAINT_MID_PER_KM
                        : C.MAINT_OLD_PER_KM;
      const maint_cost = total_km * maint_rate * S.maint_quality;

      route_cost += energy_cost + crew_cost + maint_cost + C.STATION_COST_PER_STOP;

      // --- Breakdowns ---
      const breakdown_prob = (C.BREAKDOWN_RATE_E320 * total_km / 100000)
                           * (S.severity === 'crisis' ? 1.5 : S.severity === 'stress' ? 1.2 : 1.0)
                           * (1 / S.maint_quality);

      if (S.rng() < breakdown_prob) {
        S.weekly_breakdowns++;
        weekly_total_breakdowns++;

        const severity_r = S.rng();
        let repair_cost, delay_min;
        if (severity_r < 0.70) {
          repair_cost = C.REPAIR_COST_MINOR;
          delay_min = 15 + Math.floor(S.rng() * 30);
        } else if (severity_r < 0.95) {
          repair_cost = C.REPAIR_COST_MAJOR;
          delay_min = 60 + Math.floor(S.rng() * 90);
        } else {
          repair_cost = C.REPAIR_COST_CRITICAL;
          delay_min = 180 + Math.floor(S.rng() * 180);
          S.weekly_cancellations++;
        }

        route_cost += repair_cost;
        weekly_total_delay_min += delay_min;
        S.weekly_delay_events++;

        // Fleet condition degrades
        const cond_idx = Math.floor(S.rng() * S.fleet_condition.length);
        S.fleet_condition[cond_idx] = Math.max(40, S.fleet_condition[cond_idx] - 2 - S.rng() * 5);
      }

      // --- Delay cascade ---
      if (S.delay_minutes_this_week > 0) {
        weekly_total_delay_min += S.delay_minutes_this_week;
        S.weekly_delay_events++;
      }

      // Accumulate
      S.weekly_revenue += route_revenue;
      S.weekly_cost += route_cost;
      weekly_total_trains++;
      weekly_total_pax += passengers;
      weekly_total_delay_min += S.delay_minutes_this_week;
    }
  }

  // --- Fixed overhead ---
  S.weekly_cost += C.OVERHEAD_WEEKLY;

  // --- Lease costs for extra sets ---
  if (S.extra_sets > 0) {
    S.weekly_cost += S.extra_sets * C.E320_LEASE_PER_WEEK;
  }

  // --- Debt service ---
  S.weekly_cost += S.debt_per_week;

  // --- Net ---
  S.weekly_profit = S.weekly_revenue - S.weekly_cost;
  S.cash += S.weekly_profit;
  S.min_cash = Math.min(S.min_cash, S.cash);

  // Accumulate
  S.total_revenue += S.weekly_revenue;
  S.total_cost += S.weekly_cost;
  S.total_profit += S.weekly_profit;
  S.total_breakdowns += S.weekly_breakdowns;
  S.total_cancellations += S.weekly_cancellations;
  S.total_delay_events += S.weekly_delay_events;

  // History
  S.cash_history.push(S.cash);
  S.revenue_history.push(S.weekly_revenue);
  S.profit_history.push(S.weekly_profit);

  // Trim history
  if (S.cash_history.length > 52) S.cash_history.shift();
  if (S.revenue_history.length > 52) S.revenue_history.shift();
  if (S.profit_history.length > 52) S.profit_history.shift();

  // --- Fired check ---
  if (S.cash < -20000000) {
    S.fired = true;
    S.fired_reason = 'Cash below -€20M';
    out.events.push('FIRED — cash below -€20M');
  }

  // --- Maintenance recovery (condition slowly improves if well-maintained) ---
  if (S.maint_quality >= 1.0) {
    for (let i = 0; i < S.fleet_condition.length; i++) {
      S.fleet_condition[i] = Math.min(100, S.fleet_condition[i] + 0.1);
    }
  }

  // Week output
  out.revenue = S.weekly_revenue;
  out.cost = S.weekly_cost;
  out.profit = S.weekly_profit;
  out.cash = S.cash;
  out.breakdowns = S.weekly_breakdowns;
  out.cancellations = S.weekly_cancellations;
  out.delay_minutes = weekly_total_delay_min;
  out.pax = weekly_total_pax;
  out.trains = weekly_total_trains;
  out.fleet_available = S.fleet_available;

  S.weekOutput = out;
  return out;
}

// ============================================================
// HELPERS
// ============================================================
function getSeasonalMultiplier(week) {
  const C = EUROSTAR_CONSTANTS;
  if (week >= 51 || week <= 2) return C.SEASONAL['christmas'];
  if (week >= 3  && week <= 5)  return C.SEASONAL['easter'];
  if (week >= 28 && week <= 34) return C.SEASONAL['summer'];
  if (week === 8 || week === 40) return C.SEASONAL['half-term'];
  if (week >= 1  && week <= 2)  return C.SEASONAL['january'];
  return C.SEASONAL['default'];
}

function logIncident(S, type, description) {
  S.incidents.push({
    week: S.week,
    type,
    description,
    cash: S.cash,
  });
}

// ============================================================
// DERIVED STATE
// ============================================================
function recalc(S) {
  const C = EUROSTAR_CONSTANTS;

  // Fleet availability from condition
  const avg_condition = S.fleet_condition.reduce((a, b) => a + b, 0) / S.fleet_condition.length;
  S.fleet_available = Math.floor(
    (C.ACTIVE_SETS + S.extra_sets) * (avg_condition / 100) * C.FLEET_AVAILABILITY
  );
}

// ============================================================
// MODULE EXPORTS
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EUROSTAR_CONSTANTS,
    ROUTES,
    newEurostarGame,
    tickWeek,
    loadScenario,
    bindRng,
    getSeasonalMultiplier,
    logIncident,
    recalc,
  };
}
