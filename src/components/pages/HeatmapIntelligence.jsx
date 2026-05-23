// ============================================================
// HEATMAP INTELLIGENCE
// • Only includes PAs with >= 20 dials (productive)
// • First call hour → Last call hour window per advisor per shift
// • Multi-select: TL / APM / PA / Date filters
// ============================================================
import React, { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getShiftDates, aggregateFilteredRows } from '../../parsers/effortParser.js';
import { getCurrentOperationalDay, formatShiftDate } from '../../utils/dateUtils.js';
import { EFFORT_RULES } from '../../constants/businessRules.js';
import MultiSelect from '../shared/MultiSelect.jsx';

const HOUR_L = h => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`;

function heatColor(pct) {
  if (pct === null) return '#f1f5f9'; // no activity in window
  if (pct === 0)   return '#e0f2fe';  // active hour
  if (pct < 0.3)   return '#93c5fd';
  if (pct < 0.6)   return '#3b82f6';
  return '#1d4ed8'; // high dead
}

export default function HeatmapIntelligence() {
  const { state } = useApp();
  const { effortData, bscData } = state;

  const allDates   = useMemo(() => getShiftDates(effortData?.rows), [effortData]);
  const todayOpDay = getCurrentOperationalDay();
  const defaultDate = allDates.includes(todayOpDay) ? todayOpDay : allDates[allDates.length - 1] || '';

  const [selDates,  setSelDates]  = useState([]);
  const [tlFilter,  setTlFilter]  = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter,  setPaFilter]  = useState([]);
  const [metric,    setMetric]    = useState('deadPct'); // 'deadPct' | 'dials' | 'ptt'

  // Effective dates (default = today's op day)
  const effectiveDates = selDates.length > 0 ? selDates : (defaultDate ? [defaultDate] : allDates);

  // Build advisor metadata map from BSC
  const advisorMeta = useMemo(() => {
    const m = {};
    (bscData?.advisors || []).forEach(a => { m[a.name] = a; });
    return m;
  }, [bscData]);

  const uniqueTLs  = useMemo(() => [...new Set((bscData?.advisors||[]).map(a=>a.tl).filter(Boolean))].sort(), [bscData]);
  const uniqueAPMs = useMemo(() => [...new Set((bscData?.advisors||[]).map(a=>a.apm).filter(Boolean))].sort(), [bscData]);

  // Compute heatmap data
  const { heatRows, allHours } = useMemo(() => {
    if (!effortData?.rows) return { heatRows: [], allHours: [] };

    // Filter rows to selected dates
    const dateSet = new Set(effectiveDates);
    const filteredRows = effortData.rows.filter(r => dateSet.has(r.shiftDate));

    // Aggregate per advisor
    const agg = {};
    for (const row of filteredRows) {
      const adv = row.advisor;
      if (!agg[adv]) agg[adv] = { dials: 0, hours: {}, meta: advisorMeta[adv] || {} };
      agg[adv].dials += 1;
      const h = row.hour;
      if (!agg[adv].hours[h]) agg[adv].hours[h] = { calls: 0, ptt: 0 };
      agg[adv].hours[h].calls += 1;
      if (row.isPTT) agg[adv].hours[h].ptt += row.pttMinutes || 0;
    }

    // Apply hierarchy filters and productive day filter (>= 20 dials)
    let rows = Object.entries(agg)
      .filter(([, d]) => d.dials >= EFFORT_RULES.minDialsForProductiveDay)
      .map(([name, d]) => {
        const meta      = d.meta;
        const hourKeys  = Object.keys(d.hours).map(Number);
        // Determine shift window from region (ROW: 10AM-10PM, US: 6PM-10AM)
        const region = meta.region || 'ROW';
        let windowHours;
        if (region === 'US') {
          // US shift: 18:00 → 09:00 (wraps midnight)
          windowHours = [...Array.from({length:6},(_,i)=>18+i), ...Array.from({length:10},(_,i)=>i)];
        } else {
          // ROW shift: 10:00 → 21:00
          windowHours = Array.from({length:12},(_,i)=>10+i);
        }
        const activeHours = hourKeys.filter(h => windowHours.includes(h));
        const deadHours   = windowHours.filter(h => !hourKeys.includes(h));
        const deadPct     = windowHours.length > 0 ? deadHours.length / windowHours.length : 0;
        const firstHour   = Math.min(...windowHours);
        const lastHour    = Math.max(...windowHours);
        return { name, tl: meta.tl, apm: meta.apm, region,
          totalDials: d.dials, firstHour, lastHour, windowHours, activeHours, deadHours,
          deadPct, hours: d.hours };
      });

    if (tlFilter.length)  rows = rows.filter(r => tlFilter.includes(r.tl));
    if (apmFilter.length) rows = rows.filter(r => apmFilter.includes(r.apm));
    if (paFilter.length)  rows = rows.filter(r => paFilter.includes(r.name));

    rows.sort((a, b) => b.deadPct - a.deadPct);

    // All hours across ALL advisors' windows for X-axis
    const hourSet = new Set();
    rows.forEach(r => r.windowHours.forEach(h => hourSet.add(h)));
    const allHours = [...hourSet].sort((a, b) => a - b);

    return { heatRows: rows, allHours };
  }, [effortData, effectiveDates, tlFilter, apmFilter, paFilter, advisorMeta]);

  if (!effortData?.rows) return (
    <div className="empty-state card">
      <div className="empty-icon">🔥</div>
      <h3>No Effort Data Loaded</h3>
      <p>Upload your Raw Effort CSV to activate the Heatmap.</p>
    </div>
  );

  const uniquePAs = [...new Set(effortData.rows.map(r => r.advisor).filter(Boolean))].sort();
  const avgDead   = heatRows.length ? heatRows.reduce((s, r) => s + r.deadPct, 0) / heatRows.length : 0;
  const highRisk  = heatRows.filter(r => r.deadPct > 0.4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)' }}>📅 Dates:</span>
          <div className="date-multi-grid" style={{ maxHeight: 'none' }}>
            {[...allDates].reverse().map(d => (
              <button key={d} className={`date-chip ${selDates.includes(d) ? 'selected' : ''}`}
                onClick={() => setSelDates(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])}>
                {formatShiftDate(d)}
              </button>
            ))}
          </div>
          {selDates.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSelDates([])}>✕ Clear</button>}
        </div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <MultiSelect label="TL"  options={uniqueTLs}  value={tlFilter}  onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA"  options={uniquePAs}  value={paFilter}  onChange={setPaFilter} searchable />
          <select className="filter-select" value={metric} onChange={e => setMetric(e.target.value)}>
            <option value="deadPct">View: Dead Hour %</option>
            <option value="dials">View: Call Volume</option>
          </select>
          {(tlFilter.length || apmFilter.length || paFilter.length) > 0 &&
            <button className="btn btn-outline btn-sm" onClick={() => { setTlFilter([]); setApmFilter([]); setPaFilter([]); }}>✕ Clear All</button>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt3)' }}>
            Showing: {effectiveDates.map(d => formatShiftDate(d)).join(', ')} · {heatRows.length} PAs (≥20 dials only)
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Active PAs', value: heatRows.length, accent: '#16a34a', sub: '≥20 dials' },
          { label: 'Avg Dead Hour %', value: `${(avgDead * 100).toFixed(1)}%`, accent: '#f59e0b', sub: 'within active window' },
          { label: 'High Risk PAs', value: highRisk.length, accent: '#ef4444', sub: '>40% dead hours' },
          { label: 'Excluded PAs', value: (effortData.advisors?.length || 0) - heatRows.length, accent: '#94a3b8', sub: '<20 dials (non-productive)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background: s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="card" style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: 'var(--txt2)' }}>Legend:</span>
          {[
            { color: '#e0f2fe', label: 'Active (0% dead)' },
            { color: '#93c5fd', label: 'Low (<30%)' },
            { color: '#3b82f6', label: 'Moderate (30-60%)' },
            { color: '#1d4ed8', label: 'High (>60%)' },
            { color: '#f1f5f9', label: 'Outside window' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 14, height: 14, background: color, borderRadius: 2, border: '1px solid #e2e8f0' }} />
              <span>{label}</span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--txt3)' }}>
            Window = First call hour → Last call hour per advisor
          </span>
        </div>
      </div>

      {/* Heatmap grid */}
      {heatRows.length === 0 ? (
        <div className="empty-state card"><div>🔍</div><h3>No productive advisors match filters</h3></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--s900)', color: 'white' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--s900)', zIndex: 2, fontSize: 11, fontWeight: 700 }}>
                    Advisor / Hr
                  </th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>Window</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>Dead%</th>
                  {allHours.map(h => (
                    <th key={h} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: '#94a3b8', fontSize: 10, minWidth: 28 }}>
                      {HOUR_L(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map((row, i) => (
                  <tr key={row.name} style={{ borderBottom: '1px solid var(--s100)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 700, fontSize: 12, position: 'sticky', left: 0, background: i % 2 === 0 ? 'white' : '#f8fafc', zIndex: 1, whiteSpace: 'nowrap' }}>
                      {row.name}
                      <div style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 400 }}>{row.apm || ''}</div>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>
                      {HOUR_L(row.firstHour)}→{HOUR_L(row.lastHour)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11,
                      color: row.deadPct > 0.4 ? '#dc2626' : row.deadPct > 0.2 ? '#d97706' : '#16a34a' }}>
                      {(row.deadPct * 100).toFixed(0)}%
                    </td>
                    {allHours.map(h => {
                      const inWindow = h >= row.firstHour && h <= row.lastHour;
                      const hourData = row.hours[h];
                      const isActive = Boolean(hourData);
                      const isDead   = inWindow && !isActive;
                      const calls    = hourData?.calls || 0;
                      let bg = '#f1f5f9'; // outside window
                      if (inWindow) {
                        if (isDead) {
                          const deadFrac = row.deadHours.length / Math.max(row.windowHours.length, 1);
                          bg = deadFrac > 0.6 ? '#1d4ed8' : deadFrac > 0.3 ? '#3b82f6' : '#93c5fd';
                        } else {
                          bg = '#e0f2fe'; // active hour
                        }
                      }
                      return (
                        <td key={h}
                          title={inWindow ? (isDead ? `${HOUR_L(h)} — Dead hour (no calls)` : `${HOUR_L(h)} — ${calls} calls`) : `${HOUR_L(h)} — Outside window`}
                          style={{ padding: '4px 2px', textAlign: 'center' }}>
                          <div style={{ width: 24, height: 24, margin: '0 auto', borderRadius: 4, background: bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: isDead ? '#dbeafe' : '#1e40af' }}>
                            {isActive && calls > 0 ? calls : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
