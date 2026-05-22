// ============================================================
// RAW EFFORT FILE PARSER
// Handles: Dialer CSV from Salesforce/RingDNA
// Implements: Operational-day logic, PTT, duplicate suppression
// ============================================================

import Papa from 'papaparse';
import { EFFORT_RULES, getShiftDate, getRowSignature } from '../constants/businessRules';

const STORAGE_KEY = 'emeritus_reconciliation_memory';
const MAX_MEMORY_BYTES = 1024 * 1024; // 1 MB
const MEMORY_TTL_DAYS  = 7;

// ----------------------------
// COLUMN NAME ALIASES
// Handles: CSV ("Assigned") vs Excel ("Advisor") name differences
// ----------------------------
const FIELD_ALIASES = {
  advisor:    ['Assigned', 'Advisor', 'advisor', 'PA', 'Agent', 'Name'],
  duration:   ['Dialer Duration (min)', 'duration', 'Duration', 'Dialer Duration'],
  connected:  ['Dialer Call Connected?', 'Dialer Call Connected', 'Connected', 'connected'],
  date:       ['Created Date', 'Date', 'created_date', 'Call Date'],
  hour:       ['Dialer Call Hour Of Day (Agent)', 'Hour', 'hour', 'Call Hour'],
  callType:   ['Calls/SMS', 'Type', 'type'],
};

function resolveField(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h && h.trim().toLowerCase() === alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

// ----------------------------
// MAIN ENTRY POINT
// ----------------------------
export async function parseEffortCSV(file) {
  const text = await file.text();
  const memory = loadReconciliationMemory();

  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { data, meta } = results;
        const headers = meta.fields || [];

        // Resolve column indices
        const fields = {
          advisor:   resolveFieldName(headers, FIELD_ALIASES.advisor),
          duration:  resolveFieldName(headers, FIELD_ALIASES.duration),
          connected: resolveFieldName(headers, FIELD_ALIASES.connected),
          date:      resolveFieldName(headers, FIELD_ALIASES.date),
          hour:      resolveFieldName(headers, FIELD_ALIASES.hour),
          callType:  resolveFieldName(headers, FIELD_ALIASES.callType),
        };

        const rows        = [];
        const anomalies   = [];
        const duplicates  = [];
        const now         = new Date();

        for (const rawRow of data) {
          const row = extractRow(rawRow, fields);
          if (!row || !row.advisor) continue;

          // Skip SMS rows
          if (row.callType && row.callType.toLowerCase() === 'sms') continue;

          // Compute operational shift date
          const shiftDate = getShiftDate(row.date, row.hour);
          if (!shiftDate) continue;

          // Check for future timestamps
          const callDate = new Date(row.date);
          if (callDate > now) {
            anomalies.push({ ...row, shiftDate, reason: 'Future timestamp' });
            continue;
          }

          // Compute signature for deduplication
          const sig = getRowSignature({
            advisor: row.advisor,
            createdDate: row.date,
            hour: row.hour,
            duration: row.duration,
            connected: row.connected,
          });

          if (memory.processed[sig]) {
            duplicates.push({ ...row, shiftDate, sig });
            continue;
          }

          // PTT logic
          const isPTT = row.connected === 1 && row.duration > EFFORT_RULES.pttMinDurationMin;

          rows.push({
            ...row,
            shiftDate,
            sig,
            isPTT,
            pttMinutes: isPTT ? row.duration : 0,
          });

          // Add to memory
          memory.processed[sig] = { date: now.toISOString() };
        }

        // Persist updated memory
        saveReconciliationMemory(memory);

        // Aggregate by advisor + shiftDate
        const aggregated = aggregateEffort(rows);

        resolve({
          rows,
          aggregated,
          anomalies,
          duplicates,
          totalRows: data.length,
          processedRows: rows.length,
          dateRange: getDateRange(rows),
          advisors: Object.keys(aggregated),
        });
      },
    });
  });
}

function resolveFieldName(headers, aliases) {
  for (const alias of aliases) {
    const found = headers.find(h => h && h.trim().toLowerCase() === alias.toLowerCase());
    if (found) return found;
  }
  return null;
}

function extractRow(rawRow, fields) {
  const advisor  = fields.advisor  ? rawRow[fields.advisor]?.trim()  : null;
  const dateStr  = fields.date     ? rawRow[fields.date]?.trim()     : null;
  const hourStr  = fields.hour     ? rawRow[fields.hour]             : '0';
  const durStr   = fields.duration ? rawRow[fields.duration]         : '0';
  const connStr  = fields.connected? rawRow[fields.connected]        : '0';
  const callType = fields.callType ? rawRow[fields.callType]?.trim() : 'Calls';

  if (!advisor || !dateStr) return null;

  return {
    advisor,
    date:      dateStr,
    hour:      parseInt(hourStr, 10) || 0,
    duration:  parseFloat(durStr)   || 0,
    connected: parseInt(connStr, 10) || 0,
    callType,
  };
}

// ----------------------------
// AGGREGATION
// Returns: { advisorName: { shiftDate: { dials, connected, pttCalls, pttMinutes } } }
// ----------------------------
function aggregateEffort(rows) {
  const agg = {};

  for (const row of rows) {
    if (!agg[row.advisor]) agg[row.advisor] = {};
    if (!agg[row.advisor][row.shiftDate]) {
      agg[row.advisor][row.shiftDate] = {
        dials: 0, connected: 0, pttCalls: 0, pttMinutes: 0, totalTT: 0,
      };
    }
    const slot = agg[row.advisor][row.shiftDate];
    slot.dials      += 1;
    slot.totalTT    += row.duration;
    if (row.connected === 1) slot.connected += 1;
    if (row.isPTT)           { slot.pttCalls += 1; slot.pttMinutes += row.pttMinutes; }
  }

  // Mark productive days (dials >= 20)
  for (const advisor of Object.keys(agg)) {
    for (const date of Object.keys(agg[advisor])) {
      agg[advisor][date].isProductiveDay =
        agg[advisor][date].dials >= EFFORT_RULES.minDialsForProductiveDay;
    }
  }

  return agg;
}

// ----------------------------
// SUMMARY PER ADVISOR (flat view)
// ----------------------------
export function summarizeEffort(aggregated) {
  return Object.entries(aggregated).map(([name, dateMap]) => {
    const dates = Object.values(dateMap);
    const prodDays = dates.filter(d => d.isProductiveDay).length;
    const totalDials    = dates.reduce((s, d) => s + d.dials, 0);
    const totalConn     = dates.reduce((s, d) => s + d.connected, 0);
    const totalPTT      = dates.reduce((s, d) => s + d.pttMinutes, 0);
    const totalPTTCalls = dates.reduce((s, d) => s + d.pttCalls, 0);
    const totalTT       = dates.reduce((s, d) => s + d.totalTT, 0);
    const avgDials      = prodDays > 0 ? totalDials / prodDays : 0;
    const avgPTT        = prodDays > 0 ? totalPTT   / prodDays : 0;
    return {
      name, prodDays, totalDials, totalConn, totalPTT,
      totalPTTCalls, totalTT, avgDials, avgPTT,
      dateBreakdown: dateMap,
    };
  });
}

// ----------------------------
// HEATMAP DATA (hour × weekday density)
// ----------------------------
export function buildHeatmapData(rows) {
  const grid = {};
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      grid[`${h}-${d}`] = { hour: h, day: d, dials: 0, pttMinutes: 0 };
    }
  }
  for (const row of rows) {
    const date = new Date(row.date);
    const day  = date.getDay();
    const key  = `${row.hour}-${day}`;
    if (grid[key]) {
      grid[key].dials     += 1;
      grid[key].pttMinutes+= row.pttMinutes || 0;
    }
  }
  return Object.values(grid);
}

// ----------------------------
// DEAD HOURS DETECTION
// Finds hours with <5% of average activity
// ----------------------------
export function detectDeadHours(rows) {
  const hourCounts = Array(24).fill(0);
  for (const row of rows) {
    if (row.hour >= 0 && row.hour < 24) hourCounts[row.hour]++;
  }
  const avg = hourCounts.reduce((s, c) => s + c, 0) / 24;
  return hourCounts
    .map((count, hour) => ({ hour, count, isDead: count < avg * 0.1 }))
    .filter(h => h.isDead);
}

// ----------------------------
// RECONCILIATION MEMORY
// ----------------------------
function loadReconciliationMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const mem = JSON.parse(raw);
    // Purge entries older than TTL
    const now   = Date.now();
    const ttlMs = MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
    const processed = {};
    for (const [sig, entry] of Object.entries(mem.processed || {})) {
      if (now - new Date(entry.date).getTime() < ttlMs) {
        processed[sig] = entry;
      }
    }
    return { ...mem, processed };
  } catch {
    return emptyMemory();
  }
}

function saveReconciliationMemory(memory) {
  try {
    const serialized = JSON.stringify(memory);
    if (serialized.length > MAX_MEMORY_BYTES) {
      // Trim oldest entries
      const entries = Object.entries(memory.processed)
        .sort((a, b) => new Date(a[1].date) - new Date(b[1].date));
      const trimmed = {};
      let size = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = JSON.stringify({ [entries[i][0]]: entries[i][1] });
        if (size + entry.length > MAX_MEMORY_BYTES * 0.8) break;
        trimmed[entries[i][0]] = entries[i][1];
        size += entry.length;
      }
      memory.processed = trimmed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (e) {
    console.warn('Failed to save reconciliation memory', e);
  }
}

function emptyMemory() {
  return { processed: {}, overrides: {}, createdAt: new Date().toISOString() };
}

export function clearReconciliationMemory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getReconciliationStats() {
  const mem = loadReconciliationMemory();
  const count = Object.keys(mem.processed).length;
  const sizeBytes = JSON.stringify(mem).length;
  return { count, sizeBytes, sizeKB: Math.round(sizeBytes / 1024) };
}

function getDateRange(rows) {
  if (!rows.length) return null;
  const dates = rows.map(r => r.shiftDate).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}
