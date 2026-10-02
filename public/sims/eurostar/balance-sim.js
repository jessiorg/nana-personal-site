// Balance harness for Eurostar 3D. Runs the sim core headless across
// multiple strategies and prints profit/safety statistics.
//
// === USAGE ===
// node balance-sim.js              — run all scenarios
// node balance-sim.js T1          — run single scenario
// node balance-sim.js --seeds 120 — override seed count

const {
  EUROSTAR_CONSTANTS,
  ROUTES,
  newEurostarGame,
  tickWeek,
  bindRng,
} = require('./src/sim-core.js');

const SCENARIOS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11'];
const N_SEEDS = parseInt(process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1] || '60');
const N_WEEKS = 52;

// ============================================================
// SCENARIO LABELS
// ============================================================
const SCENARIO_LABELS = {
  T1:  'Baseline (standard demand, full maintenance)',
  T2:  'Peak Summer (demand +35%, load 95%)',
  T3:  'Winter Crisis (demand -30%, strikes, maint 80%)',
  T4:  'Tunnel Closure (14 days, demand -85%)',
  T5:  'Competitor Price War (demand -12%)',
  T6:  'Turnarounds (planned outages)',
  T7:  'Delivery Shock (demand -20%)',
  T8:  'Fleet Expansion (new routes +20%)',
  T9:  'H2 Fuel (hydrogen refueling stop)',
  T10: 'Contract (volume obligation)',
  T11: 'PE Acquisition (debt + leverage)',
};

// ============================================================
// RUN SINGLE SCENARIO
// ============================================================
function runScenario(name, nSeeds, nWeeks) {
  const C = EUROSTAR_CONSTANTS;

  const results = [];

  for (let seed = 0; seed < nSeeds; seed++) {
    const S = newEurostarGame(name);
    S.rngState = seed;          // deterministic seed per run
    bindRng(S);

    let fired = false;
    let fired_week = null;
    let min_cash = 25e6;
    let total_breakdowns = 0;
    let total_cancellations = 0;
    let explosions = 0;
    let first_breakdown_week = null;
    let first_explosion_week = null;

    for (let wk = 0; wk < nWeeks; wk++) {
      tickWeek(S);
      total_breakdowns += S.weekly_breakdowns;
      total_cancellations += S.weekly_cancellations;
      min_cash = Math.min(min_cash, S.cash);

      if (!fired && S.fired) {
        fired = true;
        fired_week = S.week;
      }

      if (first_breakdown_week === null && S.weekly_breakdowns > 0) {
        first_breakdown_week = S.week;
      }
    }

    // Weekly averages
    const weeks_run = fired ? fired_week : nWeeks;
    const avg_weekly_profit = S.total_profit / weeks_run;
    const avg_weekly_revenue = S.total_revenue / nWeeks;
    const avg_weekly_cost = S.total_cost / nWeeks;

    results.push({
      seed,
      total_profit: S.total_profit,
      avg_weekly_profit,
      avg_weekly_revenue,
      avg_weekly_cost,
      min_cash,
      fired,
      fired_week,
      total_breakdowns,
      total_cancellations,
      explosions,
      first_breakdown_week,
      first_explosion_week,
    });
  }

  return results;
}

// ============================================================
// SUMMARIZE RESULTS
// ============================================================
function summarize(name, results, nWeeks) {
  const sorted = [...results].sort((a, b) => a.avg_weekly_profit - b.avg_weekly_profit);
  const n = results.length;
  const fired_count = results.filter(r => r.fired).length;
  const fired_pct = (fired_count / n * 100).toFixed(0);

  const p10_idx = Math.floor(n * 0.10);
  const p50_idx = Math.floor(n * 0.50);
  const p90_idx = Math.floor(n * 0.90);

  const avg_profit_p10 = sorted[p10_idx]?.avg_weekly_profit ?? 0;
  const avg_profit_p50 = sorted[p50_idx]?.avg_weekly_profit ?? 0;
  const avg_profit_p90 = sorted[p90_idx]?.avg_weekly_profit ?? 0;
  const avg_profit_mean = results.reduce((s, r) => s + r.avg_weekly_profit, 0) / n;

  const avg_breakdowns = results.reduce((s, r) => s + r.total_breakdowns, 0) / n;
  const avg_cancellations = results.reduce((s, r) => s + r.total_cancellations, 0) / n;

  const min_cash_sorted = [...results].sort((a, b) => a.min_cash - b.min_cash);
  const min_cash_p10 = min_cash_sorted[Math.floor(n * 0.10)]?.min_cash ?? 0;

  const first_bd_sorted = results.filter(r => r.first_breakdown_week !== null)
    .sort((a, b) => a.first_breakdown_week - b.first_breakdown_week);
  const bd_p50 = first_bd_sorted[Math.floor(first_bd_sorted.length * 0.50)]?.first_breakdown_week ?? null;

  const fired_weeks = results.filter(r => r.fired_week !== null).map(r => r.fired_week);
  const fired_p50_week = fired_weeks.length > 0
    ? fired_weeks.sort((a, b) => a - b)[Math.floor(fired_weeks.length / 2)]
    : null;

  // Weekly profit in M€
  const profit_to_M = v => (v / 1e6).toFixed(2);
  const cash_to_M = v => (v / 1e6).toFixed(0);

  return {
    name,
    label: SCENARIO_LABELS[name] || name,
    weeks: `${nWeeks} wks × ${n} seeds`,
    mean_profit: `€${profit_to_M(avg_profit_mean)}M`,
    p10: `€${profit_to_M(avg_profit_p10)}M`,
    p50: `€${profit_to_M(avg_profit_p50)}M`,
    p90: `€${profit_to_M(avg_profit_p90)}M`,
    breakdowns_mean: avg_breakdowns.toFixed(2),
    cancellations_mean: avg_cancellations.toFixed(2),
    fired_pct: `${fired_pct}%`,
    first_bd_p50: bd_p50 !== null ? `wk ${bd_p50}` : 'null',
    fired_p50_week: fired_p50_week !== null ? `wk ${fired_p50_week}` : 'null',
    min_tank_p10: `€${cash_to_M(min_cash_p10)}M`,
  };
}

// ============================================================
// FORMAT OUTPUT
// ============================================================
function printResult(r) {
  console.log(`\n=== ${r.name} ${r.label} (${r.weeks}) ===`);
  console.log(`avg $/wk: mean ${r.mean_profit}  p10 ${r.p10}  p90 ${r.p90}`);
  console.log(`breakdowns mean ${r.breakdowns_mean} | cancellations mean ${r.cancellations_mean} | fired ${r.fired_pct}`);
  console.log(`first breakdown wk: ${r.first_bd_p50} | fired week: ${r.fired_p50_week} | min cash p10 ${r.min_tank_p10}`);
}

// ============================================================
// MAIN
// ============================================================
const target = process.argv.find(a => SCENARIOS.includes(a)) || null;

console.log(`\n=== Eurostar Balance Sim — ${N_SEEDS} seeds × ${N_WEEKS} weeks ===\n`);

const scenarios_to_run = target ? [target] : SCENARIOS;

const all = {};
for (const name of scenarios_to_run) {
  const raw = runScenario(name, N_SEEDS, N_WEEKS);
  const summary = summarize(name, raw, N_WEEKS);
  all[name] = summary;
  printResult(summary);
}

console.log('\n=== SUMMARY TABLE ===');
console.log('SCENARIO               | MEAN $/WK  | P10       | P90       | BREAKDOWNS | FIRED  | MIN CASH P10');
console.log('-----------------------|-------------|------------|------------|------------|--------|-------------');
for (const name of scenarios_to_run) {
  const r = all[name];
  const n = (r.label + ' '.repeat(20)).slice(0, 20);
  console.log(
    `${name.padEnd(9)} ${n} | ${r.mean_profit.padEnd(11)} | ${r.p10.padEnd(10)} | ${r.p90.padEnd(10)} | ${r.breakdowns_mean.padEnd(10)} | ${r.fired_pct.padEnd(6)} | ${r.min_tank_p10}`
  );
}
