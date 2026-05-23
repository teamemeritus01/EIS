// ============================================================
// ATTENDANCE PARSER — Wide Format Excel (Leave Planner)
// Rows = dates, Columns = advisors
// ============================================================
import * as XLSX from 'xlsx';

// Leave code → operational status
const ABSENT_CODES  = new Set(['EL','SL','UL','PAL','LWP','HFD','CO','Unplanned Leave','unplanned leave']);
const HOLIDAY_CODES = new Set(['RH','YEH','OH']);
const WEEKEND_CODES = new Set(['WO']);
const LATE_CODES    = new Set(['Late Login','LATE Login','late login','LATE LOGIN']);

export function classifyCode(code) {
  if (!code) return 'present';
  const c = String(code).trim();
  if (ABSENT_CODES.has(c))  return 'absent';
  if (HOLIDAY_CODES.has(c)) return 'holiday';
  if (WEEKEND_CODES.has(c)) return 'weekend';
  if (LATE_CODES.has(c))    return 'late';
  return 'present'; // unknown codes treated as present
}

export async function parseAttendanceFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Try to find the main attendance sheet
  const sheetName = wb.SheetNames.find(s =>
    s.toLowerCase().includes('leave') ||
    s.toLowerCase().includes('attendance') ||
    s.toLowerCase().includes('planner')
  ) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row (has DAY, Month, DATE + advisor names)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    if (r && r.some(c => typeof c === 'string' && c.toLowerCase().includes('day'))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];
  // Find advisor columns (everything after DATE col, skip last "Programs Start" col)
  const advisorCols = [];
  for (let c = 3; c < headers.length; c++) {
    const h = headers[c];
    if (h && typeof h === 'string' && h.trim() &&
        !h.toLowerCase().includes('program') &&
        !h.toLowerCase().includes('start')) {
      advisorCols.push({ index: c, name: h.trim() });
    }
  }

  // Build lookup: advisorName → date → { code, status }
  const lookup = {};   // { advisorName: { 'YYYY-MM-DD': { code, status } } }
  const advisorNames = advisorCols.map(a => a.name);

  advisorNames.forEach(name => { lookup[name] = {}; });

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    // Parse date
    let date = row[2];
    if (!date) continue;
    if (typeof date === 'number') date = XLSX.SSF.parse_date_code(date);
    const dateStr = formatDate(date);
    if (!dateStr) continue;

    for (const col of advisorCols) {
      const raw    = row[col.index];
      const code   = raw ? String(raw).trim() : null;
      const status = classifyCode(code);
      lookup[col.name][dateStr] = { code, status };
    }
  }

  return {
    advisors: advisorNames,
    lookup,
    sheetName,
    dateRange: getDateRange(lookup, advisorNames[0]),
  };
}

// Check if an advisor is absent on a given date
export function isAbsent(lookup, advisorName, dateStr) {
  if (!lookup || !lookup[advisorName]) return false;
  const entry = lookup[advisorName][dateStr];
  return entry?.status === 'absent';
}

// Get all absence dates for an advisor in Q4
export function getAbsenceDates(lookup, advisorName) {
  if (!lookup || !lookup[advisorName]) return [];
  return Object.entries(lookup[advisorName])
    .filter(([, v]) => v.status === 'absent')
    .map(([date]) => date);
}

// Summary per advisor
export function getAttendanceSummary(lookup, advisorName) {
  if (!lookup || !lookup[advisorName]) return null;
  const entries = Object.entries(lookup[advisorName]);
  const present  = entries.filter(([,v]) => v.status === 'present').length;
  const absent   = entries.filter(([,v]) => v.status === 'absent').length;
  const late     = entries.filter(([,v]) => v.status === 'late').length;
  const holiday  = entries.filter(([,v]) => v.status === 'holiday').length;
  return { present, absent, late, holiday, total: entries.length };
}

function formatDate(date) {
  try {
    if (date instanceof Date) return date.toISOString().split('T')[0];
    if (typeof date === 'object' && date.y) {
      const y = date.y, m = String(date.m).padStart(2,'0'), d = String(date.d).padStart(2,'0');
      return `${y}-${m}-${d}`;
    }
    if (typeof date === 'string') {
      const d = new Date(date);
      if (!isNaN(d)) return d.toISOString().split('T')[0];
    }
    return null;
  } catch { return null; }
}

function getDateRange(lookup, firstAdvisor) {
  if (!firstAdvisor || !lookup[firstAdvisor]) return null;
  const dates = Object.keys(lookup[firstAdvisor]).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}
