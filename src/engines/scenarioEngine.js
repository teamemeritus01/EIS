// ============================================================
// SCENARIO ENGINE v4 — Empirically Grounded
// Built from actual Emeritus FY26 Q4 BSC data (99 advisors)
// ============================================================
//
// KEY EMPIRICAL FINDINGS (from dataset analysis):
//   ROW (n=26): CC P25=11 P50=13 P75=15 P90=15 | AHT P50=666s P75=714s P90=836s
//   US  (n=71): CC P25=6  P50=8  P75=9  P90=11  | AHT P50=579s P75=679s P90=784s
//
//   BSC Sensitivity (per unit, at median):
//     ROW: +1 connect → +2.84 BSC pts  | +30s AHT → +1.93 BSC pts | +1pp TTFA → +0.26 pts
//     US:  +1 connect → +2.73 BSC pts  | +30s AHT → +1.59 BSC pts | +1pp TTFA → +0.26 pts
//
//   PTT is DERIVED: PTT = CC × (AHT/60) × fill_factor
//     ROW fill_factor = 0.888 (P50 empirical)
//     US  fill_factor = 0.927 (P50 empirical)
//
//   CC-PTT Pearson r: ROW=+0.866, US=+0.788 (strong positive)
//   CC-AHT: cross-sectional positive (better advisors excel at both)
//           BUT causal (forcing CC up) likely drops AHT — use -0.4 for scenario modelling
//
// IMPORTANT US CONTEXT:
//   US advisors work against heavy voicemail culture.
//   P75 is only 9.4 connects. Target of 21 is unrealistic.
//   AHT improvement is the highest-leverage action for US advisors.
// ============================================================

import { METRIC_TARGETS, SLAB_GRID, getSlabForRank, getMinProductiveDays, getWorkingDaysRemaining } from '../constants/businessRules.js';

const T = METRIC_TARGETS;

// ── Empirical percentile benchmarks from actual FY26 Q4 data ─────
const BENCHMARKS = {
  ROW: {
    P25:  { CC: 11.2, AHT: 592, TTFA: 0.80, PTT_fill: 0.791 },
    P50:  { CC: 13.3, AHT: 666, TTFA: 0.87, PTT_fill: 0.888 },
    P75:  { CC: 14.7, AHT: 714, TTFA: 0.93, PTT_fill: 0.935 },
    P90:  { CC: 15.1, AHT: 836, TTFA: 0.93, PTT_fill: 0.960 },
    fill: 0.888,
    maxCC: 18,
    minAHT: 400,
    label: 'India ROW Team',
  },
  US: {
    P25:  { CC: 6.4,  AHT: 456, TTFA: 0.88, PTT_fill: 0.850 },
    P50:  { CC: 7.9,  AHT: 579, TTFA: 0.92, PTT_fill: 0.927 },
    P75:  { CC: 9.4,  AHT: 679, TTFA: 0.95, PTT_fill: 0.990 },
    P90:  { CC: 10.5, AHT: 784, TTFA: 0.97, PTT_fill: 1.000 },
    fill: 0.927,
    maxCC: 14,
    minAHT: 300,
    label: 'India US Shift',
  },
};

// ── BSC exact formula ─────────────────────────────────────────────
function bsc(CC, AHT, TTFA, PTT) {
  return (
    Math.min(CC   / T.connectedCalls, 1.0) * 0.25 +
    Math.min(AHT  / T.ahtFirstCall,   1.0) * 0.25 +
    Math.min(TTFA / T.adjustedTTFA,   1.0) * 0.25 +
    Math.min(PTT  / T.pureTaskTime,   1.0) * 0.25
  ) * 100;
}

// ── PTT derivation (empirically grounded, NOT independently set) ──
function derivePTT(CC, AHT, region) {
  const fill = BENCHMARKS[region]?.fill || 0.90;
  return Math.max(CC * (AHT / 60) * fill, 0);
}

// ── Get advisor's current percentile rank in their region ─────────
function getPercentile(value, P25, P50, P75, P90) {
  if (value >= P90) return 'P90+';
  if (value >= P75) return 'P75';
  if (value >= P50) return 'P50';
  if (value >= P25) return 'P25';
  return 'Below P25';
}

// ── BSC breakdown per metric ──────────────────────────────────────
function breakdown(CC, AHT, TTFA, PTT) {
  return {
    CC:   { score: Math.min(CC/T.connectedCalls, 1)*25,   gap: Math.max(0, (1-CC/T.connectedCalls)*25)   },
    AHT:  { score: Math.min(AHT/T.ahtFirstCall, 1)*25,   gap: Math.max(0, (1-AHT/T.ahtFirstCall)*25)   },
    TTFA: { score: Math.min(TTFA/T.adjustedTTFA, 1)*25,  gap: Math.max(0, (1-TTFA/T.adjustedTTFA)*25)  },
    PTT:  { score: Math.min(PTT/T.pureTaskTime, 1)*25,   gap: Math.max(0, (1-PTT/T.pureTaskTime)*25)   },
  };
}

// ── Sensitivity: BSC gain per 1 unit improvement at current level ─
function sensitivity(CC, AHT, TTFA, PTT, region) {
  const fill = BENCHMARKS[region]?.fill || 0.90;
  const base = bsc(CC, AHT, TTFA, PTT);
  const perCC   = CC  < T.connectedCalls ? bsc(CC+1, AHT, TTFA, derivePTT(CC+1,AHT,region)) - base : 0;
  const per30sAHT = AHT < T.ahtFirstCall ? bsc(CC, AHT+30, TTFA, derivePTT(CC,AHT+30,region)) - base : 0;
  const per1ppTTFA = TTFA < T.adjustedTTFA ? bsc(CC, AHT, TTFA+0.01, PTT) - base : 0;
  return { perCC: +perCC.toFixed(2), per30sAHT: +per30sAHT.toFixed(2), per1ppTTFA: +per1ppTTFA.toFixed(2) };
}

// ── PATTERN DETECTION ──────────────────────────────────────────────
function detectPattern(CC, AHT, TTFA, PTT, region) {
  const bench = BENCHMARKS[region];
  const cc_pct  = CC   / T.connectedCalls;
  const aht_pct = AHT  / T.ahtFirstCall;
  const ptt_pct = PTT  / T.pureTaskTime;
  const is_high_cc  = CC  >= bench.P75.CC;
  const is_low_cc   = CC  <= bench.P25.CC;
  const is_high_aht = AHT >= bench.P75.AHT;
  const is_low_aht  = AHT <= bench.P25.AHT;
  const is_low_ttfa = TTFA < 0.87;

  if (is_high_cc && is_low_aht) return {
    code: 'HIGH_CC_LOW_AHT', icon: '📞⚡',
    label: 'Volume Over Quality',
    diagnosis: `Strong connect rate (${CC.toFixed(1)}/day) but conversations averaging only ${Math.round(AHT)}s — too short for maximum BSC impact.`,
    mainLever: 'AHT',
    insight: `Each +30s you add to first-call AHT is worth +${sensitivity(CC,AHT,TTFA,PTT,region).per30sAHT.toFixed(2)} BSC pts. With ${CC.toFixed(0)} connects/day, deepening calls is your biggest remaining opportunity.`,
    coaching: 'Use 3 discovery questions before mentioning the programme. Ask about career goals, timeline, and current pain points. Target 11-13 minutes per first call.',
    achievability: 88,
  };
  if (is_low_cc && is_high_aht) return {
    code: 'LOW_CC_HIGH_AHT', icon: '🎯📉',
    label: 'Quality Over Volume',
    diagnosis: `Deep, quality conversations (AHT ${Math.round(AHT)}s) but only ${CC.toFixed(1)} connects/day. PTT limited by connect volume.`,
    mainLever: 'CC',
    insight: `Each additional connect adds +${sensitivity(CC,AHT,TTFA,PTT,region).perCC.toFixed(2)} BSC pts (including derived PTT gain). Your call quality is already strong — the unlock is more connects.`,
    coaching: `After each call, don't pause — immediately dial the next IC. Target zero dead minutes between connects. ${region === 'US' ? 'Even voicemails count toward dials — keep the pace.' : 'Batch your callbacks for off-peak hours to protect prime dialing time.'}`,
    achievability: 75,
  };
  if (is_low_aht && !is_high_cc) return {
    code: 'LOW_AHT', icon: '⏱️📉',
    label: 'Conversations Too Brief',
    diagnosis: `AHT of ${Math.round(AHT)}s is in the bottom 25% for ${region} advisors. Short calls mean leads aren't engaged deeply enough on first contact.`,
    mainLever: 'AHT',
    insight: `Moving from P25 (${Math.round(bench.P25.AHT)}s) to P50 (${Math.round(bench.P50.AHT)}s) AHT — adding just ${Math.round(bench.P50.AHT - AHT)}s per call — would add ~${((bench.P50.AHT-AHT)/30*sensitivity(CC,AHT,TTFA,PTT,region).per30sAHT).toFixed(1)} BSC pts.`,
    coaching: 'Do NOT pitch in the first 3 minutes. Spend the first half of the call in discovery. Ask: "What outcome are you hoping for in the next 12 months?" Then listen for 60+ seconds.',
    achievability: 82,
  };
  if (is_low_ttfa) return {
    code: 'LOW_TTFA', icon: '⚡🐌',
    label: 'Slow First Attempts',
    diagnosis: `TTFA at ${(TTFA*100).toFixed(1)}% — missing the 2-hour contact window. Leads are going cold before first attempt.`,
    mainLever: 'TTFA',
    insight: `Note: TTFA adds only +${sensitivity(CC,AHT,TTFA,PTT,region).per1ppTTFA.toFixed(2)} BSC pts per 1pp improvement. Focus on TTFA as a habit but prioritise CC and AHT for BSC gains.`,
    coaching: 'Every IC assigned in the last 24 hours: call first thing in your shift. Set a 2-hour timer on any new IC. TTFA compliance builds trust with APMs and protects qualification.',
    achievability: 90,
  };
  if (cc_pct >= 0.7 && aht_pct >= 0.7 && ptt_pct >= 0.7) return {
    code: 'HIGH_PERFORMER', icon: '🏆📈',
    label: 'High Performer Optimisation',
    diagnosis: `Strong performance across all metrics. Now in marginal-gains territory — small improvements can move rank significantly.`,
    mainLever: region === 'US' ? 'AHT' : 'CC',
    insight: `At this level, +1 connect adds +${sensitivity(CC,AHT,TTFA,PTT,region).perCC.toFixed(2)} BSC pts. +30s AHT adds +${sensitivity(CC,AHT,TTFA,PTT,region).per30sAHT.toFixed(2)} pts. Focus on consistency over peaks.`,
    coaching: 'Your QTD BSC is strong. Maintain consistency — even 1-2 below-average days can shift your rank. Protect your PTT by managing your call schedule around high-energy hours.',
    achievability: 70,
  };
  // Default
  const bd = breakdown(CC, AHT, TTFA, PTT);
  const biggest_gap = Object.entries(bd).sort((a,b)=>b[1].gap-a[1].gap)[0];
  return {
    code: 'BALANCED_BELOW', icon: '📊➡️',
    label: 'Consistent, Needs a Push',
    diagnosis: `Metrics are balanced but all below target. Weakest BSC contributor: ${biggest_gap[0]} (${biggest_gap[1].score.toFixed(1)}/25 pts, gap: ${biggest_gap[1].gap.toFixed(1)} pts).`,
    mainLever: biggest_gap[0],
    insight: `${biggest_gap[0]} is your highest-opportunity metric right now. Closing just 50% of the gap adds ~${(biggest_gap[1].gap*0.5).toFixed(1)} BSC points.`,
    coaching: `This week: pick ONE metric — ${biggest_gap[0]} — and focus there exclusively. Small, consistent daily improvements compound over a quarter.`,
    achievability: 78,
  };
}

// ── L7D analysis (uses actual BSC trend + CC trend data) ─────────
function analyseL7D(l7dData, advisorName) {
  if (!l7dData?.length) return null;
  const a = l7dData.find(x => x.name === advisorName);
  if (!a) return null;
  const bscVals = (a.bscTrend || []).map(b => b?.bsc).filter(v => v && v > 0);
  const ccVals  = (a.ccTrend  || []).filter(v => v && v > 0);
  if (!bscVals.length) return null;
  const mean = arr => arr.reduce((s,v)=>s+v,0)/arr.length;
  const bsc_avg  = mean(bscVals);
  const bsc_peak = Math.max(...bscVals);
  const bsc_low  = Math.min(...bscVals);
  const trend    = bscVals.length >= 4
    ? mean(bscVals.slice(-3)) - mean(bscVals.slice(0,3))
    : 0;
  const cc_peak  = ccVals.length ? Math.max(...ccVals) : null;
  const cc_avg   = ccVals.length ? mean(ccVals)        : null;
  return {
    bsc_avg:  +bsc_avg.toFixed(1),
    bsc_peak: +bsc_peak.toFixed(1),
    bsc_low:  +bsc_low.toFixed(1),
    trend_direction: trend > 1.5 ? 'improving' : trend < -1.5 ? 'declining' : 'stable',
    trend_pts: +trend.toFixed(1),
    cc_peak:  cc_peak ? +cc_peak.toFixed(1) : null,
    cc_avg:   cc_avg  ? +cc_avg.toFixed(1)  : null,
  };
}

// ── Build one scenario ────────────────────────────────────────────
function buildScenario(id, label, emoji, color, desc, targetCC, targetAHT, targetTTFA, region, currentBSC, currentRank, currentPayout, context) {
  const targetPTT = derivePTT(targetCC, targetAHT, region);
  const projBSC   = bsc(targetCC, targetAHT, targetTTFA, targetPTT);
  const bscDelta  = projBSC - currentBSC;
  // Rank estimate: use BSC delta to estimate rank movement
  // From data: ~2.84 BSC pts per rank position change (approx at median)
  const rankDelta = Math.round(bscDelta / 2.5);
  const projRank  = Math.max(1, currentRank - rankDelta);
  const projPay   = getSlabForRank(projRank).payout;
  const bd        = breakdown(targetCC, targetAHT, targetTTFA, targetPTT);

  return {
    id, label, emoji, color, description: desc,
    targets: {
      connectedCalls: +targetCC.toFixed(1),
      ahtFirstCall:   Math.round(targetAHT),
      adjustedTTFA:   +targetTTFA.toFixed(3),
      pureTaskTime:   +targetPTT.toFixed(1),
    },
    projectedBSC:    +projBSC.toFixed(2),
    projectedRank:   projRank,
    projectedPayout: projPay,
    bscDelta:        +bscDelta.toFixed(2),
    payoutDelta:     projPay - currentPayout,
    slab:            getSlabForRank(projRank).label,
    metricBreakdown: bd,
    context,
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ══════════════════════════════════════════════════════════════════
export function generateScenarios(advisor, totalAdvisors = 99, l7dData = null) {
  const region   = advisor.region || 'US';
  const bench    = BENCHMARKS[region];
  const curCC    = advisor.connectedCalls  || 0;
  const curAHT   = advisor.ahtFirstCall    || 0;
  // Normalise TTFA: stored as fraction (0.94) or percentage (94) — ensure fraction
  const rawTTFA  = advisor.adjustedTTFA    || 0;
  const curTTFA  = rawTTFA > 1 ? rawTTFA / 100 : rawTTFA;
  const curPTT   = advisor.pureTaskTime    || 0;
  const curBSC   = advisor.bscScore        || 0;
  const curRank  = advisor.rank            || 50;
  const curPay   = advisor.payout          || 0;

  const minPD    = getMinProductiveDays(region);
  const remaining= getWorkingDaysRemaining();
  const l7d      = analyseL7D(l7dData, advisor.name);
  const pattern  = detectPattern(curCC, curAHT, curTTFA, curPTT, region);
  const sens     = sensitivity(curCC, curAHT, curTTFA, curPTT, region);
  const bd       = breakdown(curCC, curAHT, curTTFA, curPTT);

  // ── Advisor's current percentile ─────────────────────────────
  const cc_pctl  = getPercentile(curCC,  bench.P25.CC,  bench.P50.CC,  bench.P75.CC,  bench.P90.CC);
  const aht_pctl = getPercentile(curAHT, bench.P25.AHT, bench.P50.AHT, bench.P75.AHT, bench.P90.AHT);

  // ── SCENARIO 1: QUICK WIN (→ P50 for region) ─────────────────
  // Target: move weakest metric to the regional median
  // Most achievable — 50% of team already achieves this
  const qw_CC   = Math.min(Math.max(curCC + 1, bench.P50.CC), bench.maxCC);
  const qw_AHT  = Math.min(Math.max(curAHT + 30, bench.P50.AHT), bench.P90.AHT);
  const qw_TTFA = Math.min(Math.max(curTTFA, bench.P50.TTFA), 0.97);
  const qwCtx   = `Reach the regional median — 50% of ${region} advisors on your team achieve this level consistently.`;

  // ── SCENARIO 2: BENCHMARKED (→ P75 for region) ───────────────
  // Target: reach good performer level — top 25% of region
  // Requires 3-4 weeks of consistent coaching focus
  const bm_CC   = Math.min(Math.max(curCC + 2, bench.P75.CC), bench.maxCC);
  const bm_AHT  = Math.min(Math.max(curAHT + 60, bench.P75.AHT), bench.P90.AHT);
  const bm_TTFA = Math.min(Math.max(curTTFA + 0.03, bench.P75.TTFA), 0.97);
  const bmCtx   = `Top-25% performance for ${region} shift. Verified achievable — 25% of your team is already here.`;

  // ── SCENARIO 3: ELITE STRETCH (→ P90, capped by L7D peak) ────
  // Target: elite performance, but capped at 115% of advisor's personal L7D best
  // Prevents unrealistic targets
  const l7d_cc_cap = l7d?.cc_peak ? l7d.cc_peak * 1.15 : bench.P90.CC;
  const el_CC   = Math.min(Math.max(curCC + 3, bench.P90.CC), bench.maxCC, l7d_cc_cap);
  const el_AHT  = Math.min(Math.max(curAHT + 120, bench.P90.AHT), T.ahtFirstCall);
  const el_TTFA = Math.min(Math.max(curTTFA + 0.05, bench.P90.TTFA), 0.97);
  const elCtx   = l7d?.cc_peak
    ? `Based on your L7D best of ${l7d.cc_peak.toFixed(1)} connects — this targets 15% above your recent peak.`
    : `Top-10% performance for ${region} shift. Requires sustained elite-level daily effort.`;

  // ── Qualification path ─────────────────────────────────────────
  const pdNeeded = Math.max(0, minPD - (advisor.productiveDays || 0));

  return {
    advisor:      advisor.name,
    empId:        advisor.empId,
    region,
    currentBSC:   +curBSC.toFixed(2),
    currentRank:  curRank,
    currentPayout: curPay,
    currentSlab:  advisor.slab,
    isEligible:   advisor.qualification?.qualified,
    productiveDays: advisor.productiveDays,
    minPD, remaining, pdNeeded,
    qualificationProbability: calcQualProb(advisor),
    eligibilityMessage: !advisor.qualification?.qualified
      ? (pdNeeded > 0
          ? `${pdNeeded} more productive days needed (${advisor.productiveDays}/${minPD}) — dials ≥ 20/day`
          : `BSC must reach 60 — currently ${curBSC.toFixed(1)}, gap: ${(60 - curBSC).toFixed(1)} pts`)
      : null,

    // Pattern intelligence
    pattern,
    l7d,
    sensitivity: sens,
    breakdown: bd,
    cc_percentile: cc_pctl,
    aht_percentile: aht_pctl,

    // Data note shown in UI
    dataNote: `Benchmarks from actual FY26 Q4 data (${region}: n=${region==='ROW'?26:71} advisors). PTT derived: CC × (AHT/60) × ${bench.fill.toFixed(3)}.`,

    scenarios: [
      buildScenario(
        'quick_win', 'Quick Win', '📌', '#6366f1',
        `Reach the ${region} median — achievable in 1-2 weeks with focused effort.`,
        qw_CC, qw_AHT, qw_TTFA, region, curBSC, curRank, curPay, qwCtx
      ),
      buildScenario(
        'benchmarked', 'Benchmark Push', '⚖️', '#f59e0b',
        `Reach top-25% for ${region} shift — 3-4 weeks of consistent coaching.`,
        bm_CC, bm_AHT, bm_TTFA, region, curBSC, curRank, curPay, bmCtx
      ),
      buildScenario(
        'elite', 'Elite Stretch', '🚀', '#ef4444',
        `Top-10% performance — requires peak daily effort sustained over 6-8 weeks.`,
        el_CC, el_AHT, el_TTFA, region, curBSC, curRank, curPay, elCtx
      ),
    ],
  };
}

function calcQualProb(advisor) {
  const { bscScore, qualification } = advisor;
  const { pdStatus, needed, remaining: rem } = qualification || {};
  let p = 50;
  if (pdStatus==='Met') p+=30; else if (pdStatus==='On Track') p+=15; else if (pdStatus==='Off Track') p-=20;
  if (bscScore>=75) p+=20; else if (bscScore>=65) p+=10; else if (bscScore>=60) p+=5; else p-=15;
  if (needed===0) p+=5; else if (rem > 0 && needed > rem) p-=20;
  return Math.min(97, Math.max(3, p));
}

// ── Effort Score (from effort telemetry) ─────────────────────────
export function calcEffortScore(avgDials, connRate, avgPTT) {
  const dPct = Math.min((avgDials || 0) / 100, 1) * 100;
  const cPct = Math.min((connRate  || 0) / 0.25, 1) * 100;
  const pPct = Math.min((avgPTT   || 0) / T.pureTaskTime, 1) * 100;
  return Math.min(100, Math.round(dPct * 0.30 + cPct * 0.30 + pPct * 0.40));
}
