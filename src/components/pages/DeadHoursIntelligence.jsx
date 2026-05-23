// ============================================================
// DEAD HOURS INTELLIGENCE
// • Excludes PAs with < 20 dials (non-productive)
// • First-to-last call window per advisor per shift
// • Multi-select: TL / APM / PA / Date filters
// • Identifies dead hour clusters and high-risk advisors
// ============================================================
import React, { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getShiftDates } from '../../parsers/effortParser.js';
import { getCurrentOperationalDay, formatShiftDate } from '../../utils/dateUtils.js';
import { EFFORT_RULES } from '../../constants/businessRules.js';
import MultiSelect from '../shared/MultiSelect.jsx';

const HOUR_L = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
const RISK_LABEL = pct => pct > 0.5 ? 'High Risk' : pct > 0.3 ? 'Moderate' : pct > 0.1 ? 'Low' : 'Clear';
const RISK_COLOR = pct => pct > 0.5 ? '#dc2626' : pct > 0.3 ? '#d97706' : pct > 0.1 ? '#ca8a04' : '#16a34a';

export default function DeadHoursIntelligence() {
  const { state } = useApp();
  const { effortData, bscData } = state;

  const allDates   = useMemo(() => getShiftDates(effortData?.rows), [effortData]);
  const todayOpDay = getCurrentOperationalDay();
  const defaultDate = allDates.includes(todayOpDay) ? todayOpDay : allDates[allDates.length - 1] || '';

  const [selDates,  setSelDates]  = useState([]);
  const [tlFilter,  setTlFilter]  = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter,  setPaFilter]  = useState([]);
  const [sortKey,   setSortKey]   = useState('deadPct');
  const [expandedPAs, setExpandedPAs] = useState(new Set());

  const effectiveDates = selDates.length > 0 ? selDates : (defaultDate ? [defaultDate] : allDates);

  const advisorMeta = useMemo(() => {
    const m = {};
    (bscData?.advisors || []).forEach(a => { m[a.name] = a; });
    return m;
  }, [bscData]);

  const uniqueTLs  = useMemo(() => [...new Set((bscData?.advisors||[]).map(a=>a.tl).filter(Boolean))].sort(), [bscData]);
  const uniqueAPMs = useMemo(() => [...new Set((bscData?.advisors||[]).map(a=>a.apm).filter(Boolean))].sort(), [bscData]);

  const deadData = useMemo(() => {
    if (!effortData?.rows) return [];
    const dateSet = new Set(effectiveDates);
    const filtered = effortData.rows.filter(r => dateSet.has(r.shiftDate));

    // Aggregate per advisor
    const agg = {};
    for (const row of filtered) {
      const adv = row.advisor;
      if (!agg[adv]) agg[adv] = { dials: 0, hours: new Map(), meta: advisorMeta[adv] || {} };
      agg[adv].dials += 1;
      const h = row.hour;
      if (!agg[adv].hours.has(h)) agg[adv].hours.set(h, { calls: 0, connected: 0, ptt: 0 });
      const slot = agg[adv].hours.get(h);
      slot.calls += 1;
      if (row.connected === 1)  slot.connected += 1;
      if (row.isPTT) slot.ptt += row.pttMinutes || 0;
    }

    let rows = Object.entries(agg)
      .filter(([, d]) => d.dials >= EFFORT_RULES.minDialsForProductiveDay) // >= 20 dials only
      .map(([name, d]) => {
        const meta      = d.meta;
        const hourKeys = [...d.hours.keys()].map(Number);
        // Use shift window from region (ROW: 10AM-9PM, US: 6PM-9AM)
        const region = meta.region || 'ROW';
        let window;
        if (region === 'US') {
          window = [...Array.from({length:6},(_,i)=>18+i), ...Array.from({length:10},(_,i)=>i)];
        } else {
          window = Array.from({length:12},(_,i)=>10+i);
        }
        const firstHour = Math.min(...window);
        const lastHour  = Math.max(...window);
        const active = window.filter(h => d.hours.has(h));
        const dead   = window.filter(h => !d.hours.has(h));
        const deadPct = window.length > 0 ? dead.length / window.length : 0;
        // Consecutive dead hour clusters
        const clusters = [];
        let cur = null;
        for (const h of window) {
          if (!d.hours.has(h)) {
            if (!cur) cur = { start: h, end: h };
            else cur.end = h;
          } else if (cur) { clusters.push(cur); cur = null; }
        }
        if (cur) clusters.push(cur);
        const maxCluster = clusters.reduce((mx, c) => Math.max(mx, c.end - c.start + 1), 0);
        return { name, tl: meta.tl, apm: meta.apm, region: meta.region,
          totalDials: d.dials, firstHour, lastHour,
          windowSize: window.length, activeHours: active.length, deadHours: dead.length,
          deadPct, clusters, maxCluster, deadList: dead, activeList: active, hours: d.hours };
      });

    if (tlFilter.length)  rows = rows.filter(r => tlFilter.includes(r.tl));
    if (apmFilter.length) rows = rows.filter(r => apmFilter.includes(r.apm));
    if (paFilter.length)  rows = rows.filter(r => paFilter.includes(r.name));

    return rows.sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name) : b[sortKey] - a[sortKey]);
  }, [effortData, effectiveDates, tlFilter, apmFilter, paFilter, advisorMeta, sortKey]);

  if (!effortData?.rows) return (
    <div className="empty-state card"><div className="empty-icon">💤</div><h3>No Effort Data Loaded</h3><p>Upload your Raw Effort CSV to activate Dead Hours analysis.</p></div>
  );

  const uniquePAs = [...new Set(effortData.rows.map(r => r.advisor).filter(Boolean))].sort();
  const highRisk  = deadData.filter(r => r.deadPct > 0.4);
  const avgDead   = deadData.length ? deadData.reduce((s, r) => s + r.deadPct, 0) / deadData.length : 0;
  const totalDeadHrs = deadData.reduce((s, r) => s + r.deadHours, 0);

  const toggleExpand = name => {
    const next = new Set(expandedPAs);
    next.has(name) ? next.delete(name) : next.add(name);
    setExpandedPAs(next);
  };

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
          <select className="filter-select" value={sortKey} onChange={e => setSortKey(e.target.value)}>
            <option value="deadPct">Sort: Dead Hour %</option>
            <option value="deadHours">Sort: Dead Hours Count</option>
            <option value="maxCluster">Sort: Longest Dead Cluster</option>
            <option value="totalDials">Sort: Total Calls</option>
            <option value="name">Sort: Name</option>
          </select>
          {(tlFilter.length || apmFilter.length || paFilter.length) > 0 &&
            <button className="btn btn-outline btn-sm" onClick={() => { setTlFilter([]); setApmFilter([]); setPaFilter([]); }}>✕ Clear</button>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt3)' }}>
            {effectiveDates.map(d => formatShiftDate(d)).join(', ')} · {deadData.length} PAs (≥20 dials)
          </span>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Productive PAs', value: deadData.length, accent: '#16a34a', sub: '≥20 dials in window' },
          { label: 'Avg Dead Hours %', value: `${(avgDead*100).toFixed(1)}%`, accent: '#f59e0b', sub: 'within active window' },
          { label: 'High Risk PAs', value: highRisk.length, accent: '#ef4444', sub: '>40% dead hours' },
          { label: 'Total Dead Hours', value: totalDeadHrs, accent: '#6366f1', sub: 'across all PAs' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background: s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Dead Hours Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Dead Hours Analysis</span>
          <span className="badge badge-gray" style={{ fontSize: 10 }}>Window = Shift window (ROW: 10AM–10PM · US: 6PM–10AM)</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpandedPAs(new Set(deadData.map(r => r.name)))} style={{ marginLeft: 'auto' }}>Expand All</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpandedPAs(new Set())}>Collapse All</button>
        </div>
        {deadData.length === 0 ? (
          <div className="empty-state"><div>🔍</div><h3>No productive advisors match filters</h3></div>
        ) : (
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table className="data-table">
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Advisor</th>
                <th>TL / APM</th>
                <th>Calls</th>
                <th>Window</th>
                <th>Active Hrs</th>
                <th>Dead Hrs</th>
                <th>Dead %</th>
                <th>Longest Gap</th>
                <th>Risk</th>
                <th>Details</th>
              </tr></thead>
              <tbody>
                {deadData.map(row => (
                  <React.Fragment key={row.name}>
                    <tr style={{ background: row.deadPct > 0.4 ? '#fff5f5' : row.deadPct > 0.2 ? '#fffbeb' : 'white' }}>
                      <td style={{ textAlign: 'left', fontWeight: 700 }}>{row.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--txt3)' }}>{row.tl||'—'} / {row.apm||'—'}</td>
                      <td>{row.totalDials}</td>
                      <td style={{ fontSize: 11 }}>{HOUR_L(row.firstHour)} → {HOUR_L(row.lastHour)}</td>
                      <td style={{ color: 'var(--brand)', fontWeight: 700 }}>{row.activeHours}</td>
                      <td style={{ color: row.deadHours > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{row.deadHours}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 50, height: 6, background: 'var(--s200)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.deadPct * 100}%`, background: RISK_COLOR(row.deadPct), borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 12, color: RISK_COLOR(row.deadPct) }}>{(row.deadPct * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: row.maxCluster > 2 ? '#dc2626' : 'var(--txt)' }}>
                        {row.maxCluster > 0 ? `${row.maxCluster}h` : '—'}
                      </td>
                      <td><span className="badge" style={{ background: RISK_COLOR(row.deadPct)+'22', color: RISK_COLOR(row.deadPct) }}>{RISK_LABEL(row.deadPct)}</span></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => toggleExpand(row.name)}>
                          {expandedPAs.has(row.name) ? '▲ Hide' : '▼ Show'}
                        </button>
                      </td>
                    </tr>
                    {expandedPAs.has(row.name) && (
                      <tr>
                        <td colSpan={10} style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--txt2)' }}>
                              Hour-by-hour breakdown — {row.name}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {Array.from({ length: row.lastHour - row.firstHour + 1 }, (_, i) => row.firstHour + i).map(h => {
                                const hourData = row.hours.get(h);
                                const isActive = Boolean(hourData);
                                return (
                                  <div key={h}
                                    title={isActive ? `${HOUR_L(h)}: ${hourData.calls} calls, ${hourData.connected} connected` : `${HOUR_L(h)}: No calls (DEAD)`}
                                    style={{ width: 44, padding: '4px 2px', borderRadius: 4, textAlign: 'center', fontSize: 10,
                                      background: isActive ? '#dcfce7' : '#fee2e2',
                                      border: `1px solid ${isActive ? '#bbf7d0' : '#fecaca'}`,
                                      color: isActive ? '#166534' : '#991b1b', fontWeight: 600 }}>
                                    <div>{HOUR_L(h)}</div>
                                    <div style={{ fontWeight: 800 }}>{isActive ? hourData.calls : '💤'}</div>
                                  </div>
                                );
                              })}
                            </div>
                            {row.clusters.length > 0 && (
                              <div style={{ marginTop: 10, fontSize: 11, color: '#9a3412', background: '#fff7ed', padding: '6px 10px', borderRadius: 6 }}>
                                ⚠ Dead hour clusters: {row.clusters.map(c => `${HOUR_L(c.start)}–${HOUR_L(c.end)} (${c.end-c.start+1}h)`).join(' · ')}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
