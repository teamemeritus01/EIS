// ============================================================
// EMERITUS OPERATIONAL INTELLIGENCE PLATFORM
// Business Rules — FY26 Q4
// Source: Additional Compensation Plan v2.9 (06 May 2026)
// ============================================================


// ============================================================
// QUARTERLY CONFIGURATION — Loads from localStorage if saved
// Falls back to FY26 Q4 defaults
// ============================================================
const CONFIG_KEY = 'emeritus_quarterly_config';

export function loadQuarterlyConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveQuarterlyConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function resetQuarterlyConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

export function getActiveConfig() {
  const saved = loadQuarterlyConfig();
  if (!saved) return null;
  return saved;
}

export const QUARTER = 'FY26 Q4';
export const QUARTER_START = new Date('2026-04-01');
export const QUARTER_END = new Date('2026-06-30');

// ----------------------------
// METRIC TARGETS
// ----------------------------
export const METRIC_TARGETS = {
  connectedCalls: 21,       // per productive day
  ahtFirstCall: 780,        // seconds
  adjustedTTFA: 0.95,       // 95%
  pureTaskTime: 145,        // minutes per productive day
};

export const METRIC_WEIGHTS = {
  connectedCalls: 0.25,
  ahtFirstCall: 0.25,
  adjustedTTFA: 0.25,
  pureTaskTime: 0.25,
};

// ----------------------------
// BSC FORMULA
// BSC = Σ [ weight × min(actual/target, 1.0) ] × 100
// ----------------------------
export function calcBSC(actuals) {
  const { connectedCalls, ahtFirstCall, adjustedTTFA, pureTaskTime } = actuals;
  const cc  = Math.min(connectedCalls / METRIC_TARGETS.connectedCalls, 1.0);
  const aht = Math.min(ahtFirstCall   / METRIC_TARGETS.ahtFirstCall,   1.0);
  const ttfa= Math.min(adjustedTTFA   / METRIC_TARGETS.adjustedTTFA,   1.0);
  const ptt = Math.min(pureTaskTime   / METRIC_TARGETS.pureTaskTime,   1.0);
  return (cc * 0.25 + aht * 0.25 + ttfa * 0.25 + ptt * 0.25) * 100;
}

// ----------------------------
// GATING CRITERIA
// ----------------------------
export const GATING = {
  minBSC: 60,
  minProductiveDaysPct: 0.75,
};

// ----------------------------
// WORKING DAYS — Q4
// ----------------------------
export const WORKING_DAYS = {
  ROW: { April: 20, May: 19, June: 19, total: 58 },
  US:  { April: 22, May: 19, June: 21, total: 62 },
};

// ----------------------------
// ROW vs US DETECTION
// Shift start < 18:30 (hour < 18 or hour==18 min==0 is boundary)
// Rule: shiftStartHour < 18 → ROW; >= 18 → US
// 12:30–21:00 = ROW, 13:30–22:00 = ROW
// 18:30+ = US
// ----------------------------
export function detectRegion(shiftStartTime) {
  if (!shiftStartTime) return 'ROW';
  let hour = 0;
  let min  = 0;
  if (typeof shiftStartTime === 'string') {
    const parts = shiftStartTime.split(':');
    hour = parseInt(parts[0], 10);
    min  = parseInt(parts[1] || '0', 10);
  } else if (shiftStartTime instanceof Date) {
    hour = shiftStartTime.getHours();
    min  = shiftStartTime.getMinutes();
  } else {
    // Could be an Excel time fraction or a time object from openpyxl
    hour = Math.floor(shiftStartTime * 24);
    min  = Math.floor((shiftStartTime * 24 - hour) * 60);
  }
  const totalMins = hour * 60 + min;
  return totalMins < 18 * 60 ? 'ROW' : 'US'; // <18:00 → ROW, >=18:00 → US
}

export function getWorkingDays(region) {
  return region === 'US' ? WORKING_DAYS.US.total : WORKING_DAYS.ROW.total;
}

export function getMinProductiveDays(region) {
  const wd = getWorkingDays(region);
  return Math.ceil(wd * GATING.minProductiveDaysPct);
}

// ----------------------------
// COMPUTE WORKING DAYS ELAPSED (QTD)
// ----------------------------
export function getWorkingDaysElapsed() {
  const today = new Date();
  const start = new Date(QUARTER_START);
  let count = 0;
  const cur = new Date(start);
  while (cur <= today && cur <= QUARTER_END) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function getWorkingDaysRemaining() {
  const today = new Date();
  const start = today > QUARTER_START ? today : new Date(QUARTER_START);
  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= QUARTER_END) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ----------------------------
// QUALIFICATION STATUS
// ----------------------------
export function getQualificationStatus(advisor) {
  const { productiveDays, region, bscScore } = advisor;
  const minPD    = getMinProductiveDays(region);
  const totalWD  = getWorkingDays(region);
  const elapsed  = getWorkingDaysElapsed();
  const remaining= getWorkingDaysRemaining();
  const needed   = minPD - productiveDays;
  const bscOk    = bscScore >= GATING.minBSC;

  const pct = totalWD > 0 ? (productiveDays / totalWD) * 100 : 0;

  let pdStatus = 'On Track';
  if (needed <= 0) {
    pdStatus = 'Met';
  } else if (needed > remaining) {
    pdStatus = 'Off Track';
  } else {
    const requiredPace = needed / remaining;
    const currentPace  = elapsed > 0 ? productiveDays / elapsed : 0;
    if (requiredPace > 0.9) pdStatus = 'At Risk';
    else if (currentPace >= requiredPace * 0.85) pdStatus = 'On Track';
    else pdStatus = 'At Risk';
  }

  // For tentative incentive: qualified if BSC ok AND already met productive days target
  // (For mid-quarter view, use projectedQualified for forward-looking scenarios)
  const qualified = bscOk && (productiveDays >= minPD);
  const projectedPD = elapsed > 0
    ? Math.round((productiveDays / elapsed) * totalWD)
    : productiveDays;

  return {
    qualified,
    bscOk,
    pdStatus,
    productiveDays,
    minProductiveDays: minPD,
    totalWorkingDays: totalWD,
    pct: Math.round(pct * 10) / 10,
    needed: Math.max(needed, 0),
    remaining,
    projectedPD,
    projectedQualified: bscOk && projectedPD >= minPD,
  };
}

// ----------------------------
// INCENTIVE SLAB GRID (RANK-BASED)
// ----------------------------
export const SLAB_GRID = [
  { rankMin: 1,  rankMax: 7,  payout: 120000, label: 'Slab 1' },
  { rankMin: 8,  rankMax: 14, payout: 100000, label: 'Slab 2' },
  { rankMin: 15, rankMax: 23, payout: 80000,  label: 'Slab 3' },
  { rankMin: 24, rankMax: 33, payout: 70000,  label: 'Slab 4' },
  { rankMin: 34, rankMax: 44, payout: 60000,  label: 'Slab 5' },
  { rankMin: 45, rankMax: 56, payout: 40000,  label: 'Slab 6' },
  { rankMin: 57, rankMax: 69, payout: 30000,  label: 'Slab 7' },
  { rankMin: 70, rankMax: 77, payout: 15000,  label: 'Slab 8' },
  { rankMin: 78, rankMax: Infinity, payout: 0, label: 'No Payout' },
];

export function getSlabForRank(rank) {
  const slabs = (() => {
    try {
      const cfg = loadQuarterlyConfig();
      if (cfg?.slabGrid?.length > 0) return cfg.slabGrid;
    } catch {}
    return SLAB_GRID;
  })();
  // Support both field name formats: {rankMin,rankMax,payout} and {fromRank,toRank,amount}
  const found = slabs.find(s => {
    const lo = s.rankMin ?? s.fromRank ?? 0;
    const hi = s.rankMax ?? s.toRank   ?? 9999;
    const py = s.payout  ?? s.amount   ?? 0;
    s._lo = lo; s._hi = hi; s._payout = py;
    return rank >= lo && rank <= hi;
  });
  const slab = found || slabs[slabs.length - 1];
  return { payout: slab?.payout ?? slab?.amount ?? 0, label: slab?.label || `Rank ${slab?._lo}-${slab?._hi}` };
}

export function getPayoutForRank(rank, advisor) {
  // GATING CHECK — both criteria must pass for any payout
  if (advisor) {
    const config = loadQuarterlyConfig();
    const gate   = config?.gating || GATING;
    const bscGate = gate.minBSC || GATING.minBSC;
    const pdGate  = gate.minProductiveDaysPct != null ? gate.minProductiveDaysPct : GATING.minProductiveDaysPct;
    const bscOk   = (advisor.bscScore || 0) >= bscGate;
    // pdGate is stored as a fraction (0.75) — do NOT divide by 100
    const pdFrac  = pdGate > 1 ? pdGate / 100 : pdGate;
    const minPD   = Math.ceil(pdFrac * getWorkingDays(advisor.region));
    const pdOk    = (advisor.productiveDays || 0) >= minPD;
    if (!bscOk || !pdOk) return 0;
  }
  return getSlabForRank(rank).payout;
}

// ----------------------------
// BSC COLOR CODING
// ----------------------------
export function getBSCColor(bsc) {
  if (bsc === null || bsc === undefined) return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
  if (bsc < 60)  return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
  if (bsc <= 70) return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
  return           { bg: '#dcfce7', text: '#166534', border: '#86efac' };
}

export function getBSCColorClass(bsc) {
  if (bsc === null || bsc === undefined) return 'bsc-na';
  if (bsc < 60)  return 'bsc-red';
  if (bsc <= 70) return 'bsc-yellow';
  return           'bsc-green';
}

// ----------------------------
// TIE BREAKER ORDER
// ----------------------------
export const TIE_BREAKER_ORDER = [
  'bscScore',        // highest decimal wins
  'connectedCallsTT',
  'connectedCalls',
  'ahtFirstCall',
  'adjustedTTFA',
];

// ----------------------------
// EFFORT / PTT RULES
// ----------------------------
export const EFFORT_RULES = {
  minDialsForProductiveDay: 20,
  pttMinDurationMin: 1.5,        // 90 seconds = 1.5 minutes
  operationalDayStartHour: 10,   // 10 AM cutoff
};

// Assign shift date based on hour
export function getShiftDate(createdDateStr, hour) {
  const h = parseInt(hour, 10);
  // Parse M/D/YYYY manually to avoid timezone offset issues (critical for IST users)
  let date;
  if (typeof createdDateStr === 'string' && createdDateStr.includes('/')) {
    const parts = createdDateStr.split('/');
    if (parts.length === 3) {
      // M/D/YYYY → local date, no UTC conversion
      date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else { date = new Date(createdDateStr); }
  } else {
    date = new Date(createdDateStr);
  }
  if (!date || isNaN(date.getTime())) return null;
  if (h < EFFORT_RULES.operationalDayStartHour) {
    date.setDate(date.getDate() - 1);
  }
  // Use LOCAL date components — NOT toISOString() which converts to UTC
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const da = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Generate unique row signature for deduplication
export function getRowSignature(row) {
  return `${row.advisor}|${row.createdDate}|${row.hour}|${row.duration}|${row.connected}`;
}

// ----------------------------
// FORMATTING HELPERS
// ----------------------------
export function formatINR(amount) {
  if (amount === 0) return '₹0';
  return '₹' + amount.toLocaleString('en-IN');
}

export function formatPct(val, decimals = 1) {
  return (val * 100).toFixed(decimals) + '%';
}

export function formatBSC(val) {
  if (val === null || val === undefined) return '—';
  return val.toFixed(2);
}
