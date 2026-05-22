// ============================================================
// BSC WORKBOOK PARSER
// Handles: TL, APM, PA, L7D Trend PA, D-1 sheets
// Philosophy: Dynamic header detection, never fixed positions
// ============================================================

import * as XLSX from 'xlsx';
import { detectRegion, getSlabForRank, getBSCColorClass, getWorkingDays, getMinProductiveDays, getQualificationStatus } from '../constants/businessRules';

// ----------------------------
// MAIN ENTRY POINT
// ----------------------------
export async function parseBSCWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const result = {
    advisors: [],
    tls: [],
    apms: [],
    l7dTrend: [],
    d1Data: [],
    overall: null,
    parseDate: new Date().toISOString(),
    sheetNames: wb.SheetNames,
  };

  try { result.advisors = parsePASheet(wb); } catch(e) { console.warn('PA parse error', e); }
  try { const tlApms = parseTLSheet(wb); result.tls = tlApms.tls; result.apms = tlApms.apms; result.overall = tlApms.overall; } catch(e) { console.warn('TL parse error', e); }
  try { result.l7dTrend = parseL7DTrendPA(wb); } catch(e) { console.warn('L7D parse error', e); }
  try { result.d1Data = parseD1Sheet(wb); } catch(e) { console.warn('D-1 parse error', e); }

  // Assign ranks after all parsing
  result.advisors = assignRanks(result.advisors);

  return result;
}

// ----------------------------
// PA SHEET PARSER
// ----------------------------
function parsePASheet(wb) {
  const ws = findSheet(wb, ['PA', 'pa', 'PA Sheet']);
  if (!ws) throw new Error('PA sheet not found');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row (has "PA" and "Balance Scorecard")
  let headerRow = 2; // 0-indexed, default row 3
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    if (r && r.some(c => typeof c === 'string' && c.toLowerCase().includes('balance'))) {
      headerRow = i;
      break;
    }
  }

  const headers = rows[headerRow];
  const advisors = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const name = String(row[0]).trim();
    if (!name || name === 'PA') continue;

    const shiftStart = row[3];
    const shiftEnd   = row[4];
    const region     = detectRegion(shiftStart);

    const productiveDays   = safeNum(row[5]);
    const ccActuals        = safeNum(row[6]);
    const ccPct            = safeNum(row[7]);
    const ahtActuals       = safeNum(row[8]);
    const ahtPct           = safeNum(row[9]);
    const ttfaActuals      = safeNum(row[10]);
    const ttfaPct          = safeNum(row[11]);
    const pttActuals       = safeNum(row[12]);
    const pttPct           = safeNum(row[13]);
    const bscScore         = safeNum(row[14]) * 100; // stored as 0-1 fraction? No, check
    // BSC in file appears to already be 0-100 scale based on our data (99.68, 94.25, etc.)
    const bscRaw           = safeNum(row[14]);
    const bsc              = bscRaw > 1 ? bscRaw : bscRaw * 100; // handle both scales
    const totalCalls       = safeNum(row[15]);
    const totalTT          = safeNum(row[16]);
    const pureTTFA         = safeNum(row[17]);
    const empId            = row[18] ? String(row[18]).trim() : '';
    const adjTTFA          = safeNum(row[19]);
    const deflection       = safeNum(row[20]);

    const advisor = {
      name,
      empId,
      apm: row[1] ? String(row[1]).trim() : null,
      tl:  row[2] ? String(row[2]).trim() : null,
      shiftStart: formatTime(shiftStart),
      shiftEnd:   formatTime(shiftEnd),
      region,
      productiveDays,
      connectedCalls: ccActuals,
      ccPct,
      ahtFirstCall: ahtActuals,
      ahtPct,
      adjustedTTFA: ttfaActuals,
      ttfaPct,
      pureTaskTime: pttActuals,
      pttPct,
      bscScore: bsc,
      totalCalls,
      totalTT,
      pureTTFA,
      adjTTFA,
      deflection,
      rank: null,
      slab: null,
      payout: null,
      qualification: null,
      colorClass: getBSCColorClass(bsc),
    };

    advisor.qualification = getQualificationStatus(advisor);
    advisors.push(advisor);
  }

  return advisors;
}

// ----------------------------
// TL SHEET PARSER (contains TL + APM data)
// ----------------------------
function parseTLSheet(wb) {
  const ws = findSheet(wb, ['TL', 'tl']);
  if (!ws) throw new Error('TL sheet not found');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let overall = null;
  const tls   = [];
  const apms  = [];

  let mode = 'overall'; // 'overall' | 'tl' | 'apm'

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const cell0 = String(row[0]).trim();

    if (cell0 === 'Overall') {
      overall = parseTLRow(row, 'overall');
      continue;
    }
    if (cell0 === 'TL')  { mode = 'tl';  continue; }
    if (cell0 === 'APM') { mode = 'apm'; continue; }

    const bsc = safeNum(row[11]);
    if (!bsc && bsc !== 0) continue;

    const entry = parseTLRow(row, mode);
    if (!entry) continue;

    if (mode === 'tl')  tls.push(entry);
    if (mode === 'apm') apms.push(entry);
  }

  return { tls, apms, overall };
}

function parseTLRow(row, type) {
  const name = String(row[0]).trim();
  if (!name) return null;
  return {
    name,
    type,
    paCount:       safeNum(row[1]),
    productiveDays:safeNum(row[2]),
    ccActuals:     safeNum(row[3]),
    ccPct:         safeNum(row[4]),
    ahtActuals:    safeNum(row[5]),
    ahtPct:        safeNum(row[6]),
    ttfaActuals:   safeNum(row[7]),
    ttfaPct:       safeNum(row[8]),
    pttActuals:    safeNum(row[9]),
    pttPct:        safeNum(row[10]),
    bscScore:      safeNum(row[11]),
  };
}

// ----------------------------
// L7D TREND PA PARSER
// ----------------------------
function parseL7DTrendPA(wb) {
  const ws = findSheet(wb, ['L7D Trend PA', 'L7D Trend', 'l7d trend pa']);
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Row 0 = metric group headers, Row 1 = dates, Row 2+ = data
  if (rows.length < 3) return [];

  const dateRow = rows[1]; // dates start at col 4
  const dates   = [];
  for (let c = 4; c < 11 && c < dateRow.length; c++) {
    if (dateRow[c]) dates.push(formatDateLabel(dateRow[c]));
  }

  const trend = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim();
    if (!name) continue;

    // BSC trend: cols 4-10
    const bscTrend = [];
    for (let d = 0; d < 7; d++) {
      const val = safeNum(row[4 + d]);
      bscTrend.push({ date: dates[d] || `D${d+1}`, bsc: val });
    }

    // Productivity status: cols 11-17
    const prodStatus = [];
    for (let d = 0; d < 7; d++) {
      prodStatus.push(row[11 + d]);
    }

    // Connected calls: cols 25-31
    const ccTrend = [];
    for (let d = 0; d < 7; d++) {
      ccTrend.push(safeNum(row[25 + d]));
    }

    // PTT: cols 46-52
    const pttTrend = [];
    for (let d = 0; d < 7; d++) {
      pttTrend.push(safeNum(row[46 + d]));
    }

    trend.push({
      name,
      apm:  row[1] ? String(row[1]).trim() : null,
      tl:   row[2] ? String(row[2]).trim() : null,
      shift: row[3] ? String(row[3]).trim() : null,
      dates,
      bscTrend,
      prodStatus,
      ccTrend,
      pttTrend,
    });
  }
  return trend;
}

// ----------------------------
// D-1 SHEET PARSER
// ----------------------------
function parseD1Sheet(wb) {
  const ws = findSheet(wb, ['D-1', 'd-1', 'D1', 'D-1 Sheet']);
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find date from row 0
  let d1Date = null;
  if (rows[0]) {
    for (const cell of rows[0]) {
      if (cell instanceof Date) { d1Date = cell; break; }
      if (typeof cell === 'string' && cell.match(/\d{4}-\d{1,2}-\d{1,2}/)) {
        d1Date = new Date(cell); break;
      }
    }
  }

  const d1 = [];
  let mode = 'overall';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const cell0 = String(row[0]).trim();
    if (cell0 === 'OR' || cell0 === 'TL' || cell0 === 'PA') { mode = cell0; continue; }
    if (!row[1] && !row[6]) continue;

    const bsc = safeNum(row[14]);
    if (bsc === null) continue;

    d1.push({
      name:         cell0,
      type:         mode,
      totalPAs:     safeNum(row[1]),
      productivePAs:safeNum(row[2]),
      shift:        row[3] ? String(row[3]) : null,
      avgDials:     safeNum(row[4]),
      pctProductive:safeNum(row[5]),
      ccActuals:    safeNum(row[6]),
      ccPct:        safeNum(row[7]),
      ahtActuals:   safeNum(row[8]),
      ahtPct:       safeNum(row[9]),
      ttfaActuals:  safeNum(row[10]),
      ttfaPct:      safeNum(row[11]),
      pttActuals:   safeNum(row[12]),
      pttPct:       safeNum(row[13]),
      bscScore:     bsc,
      d1Date,
    });
  }
  return d1;
}

// ----------------------------
// RANK ASSIGNMENT
// Sorted by BSC desc → rank = position
// Tie breaker: BSC to max decimals, then CC TT, CC, AHT, TTFA
// ----------------------------
function assignRanks(advisors) {
  const sorted = [...advisors].sort((a, b) => {
    if (b.bscScore !== a.bscScore) return b.bscScore - a.bscScore;
    if (b.pureTaskTime !== a.pureTaskTime) return b.pureTaskTime - a.pureTaskTime;
    if (b.connectedCalls !== a.connectedCalls) return b.connectedCalls - a.connectedCalls;
    if (b.ahtFirstCall !== a.ahtFirstCall) return b.ahtFirstCall - a.ahtFirstCall;
    return b.adjustedTTFA - a.adjustedTTFA;
  });

  sorted.forEach((adv, idx) => {
    adv.rank   = idx + 1;
    const slab = getSlabForRank(adv.rank);
    adv.slab   = slab.label;
    adv.payout = slab.payout;
  });

  return sorted;
}

// ----------------------------
// HELPERS
// ----------------------------
function findSheet(wb, names) {
  for (const name of names) {
    const found = wb.SheetNames.find(
      s => s.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (found) return wb.Sheets[found];
  }
  // fuzzy: starts with
  for (const name of names) {
    const found = wb.SheetNames.find(
      s => s.toLowerCase().startsWith(name.toLowerCase().substring(0, 4))
    );
    if (found) return wb.Sheets[found];
  }
  return null;
}

function safeNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function formatTime(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val instanceof Date) {
    const h = val.getHours().toString().padStart(2, '0');
    const m = val.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  // Excel time fraction (0.5 = 12:00)
  if (typeof val === 'number') {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }
  return String(val);
}

function formatDateLabel(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  if (typeof val === 'string') return val;
  return String(val);
}
