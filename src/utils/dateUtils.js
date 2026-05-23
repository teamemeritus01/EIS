// ── Local date string (avoids toISOString timezone shift) ────────
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// DD/MM/YYYY — standard format everywhere in the UI
export function toDDMMYYYY(dateStrOrObj) {
  if (!dateStrOrObj) return '—';
  let d;
  if (dateStrOrObj instanceof Date) {
    d = dateStrOrObj;
  } else {
    const s = String(dateStrOrObj);
    if (s.includes('-') && s.length >= 8) {
      const [y,m,da] = s.split('T')[0].split('-').map(Number);
      d = new Date(y, m-1, da);
    } else if (s.includes('/')) {
      const p = s.split('/');
      d = p[0].length===4 ? new Date(+p[0],+p[1]-1,+p[2]) : new Date(+p[2],+p[0]-1,+p[1]);
    } else { d = new Date(s); }
  }
  if (!d || isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// DD-Mon-YYYY (e.g., 22-May-2026) — for export file names/titles
export function toDDMonYYYY(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr).split('T')[0];
  const [y,m,da] = s.split('-').map(Number);
  const d = new Date(y, m-1, da);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${MON[d.getMonth()]}-${d.getFullYear()}`;
}

// Auto-detect operational day (10AM cutoff, fully local timezone)
export function getCurrentOperationalDay() {
  const now = new Date();
  if (now.getHours() < 10) {
    const d = new Date(now); d.setDate(d.getDate()-1);
    return localDateStr(d);
  }
  return localDateStr(now);
}

// "22/05/2026 10:00 AM → 23/05/2026 09:59 AM"
export function opDayLabel(dateStr) {
  if (!dateStr) return 'QTD';
  const [y,m,d] = dateStr.split('-').map(Number);
  const next = new Date(y, m-1, d+1);
  return `${toDDMMYYYY(dateStr)} 10:00 AM → ${toDDMMYYYY(localDateStr(next))} 09:59 AM`;
}

// "Wed, 22/05/2026" — for dropdowns
export function formatShiftDate(dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt  = new Date(y, m-1, d);
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${DAY[dt.getDay()]}, ${toDDMMYYYY(dateStr)}`;
}
