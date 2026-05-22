// ============================================================
// HEATMAP INTELLIGENCE
// Hour × Advisor activity density — operational day order (10AM→10AM)
// ============================================================
import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';

// Operational hour order: 10,11,12,...,23,0,1,...,9
const OP_HOURS = [...Array(24).keys()].map(i => (i + 10) % 24);
const HOUR_LABELS = h => {
  if (h === 0) return '12AM';
  if (h < 12)  return `${h}AM`;
  if (h === 12) return '12PM';
  return `${h - 12}PM`;
};

function interpolateColor(value, max) {
  if (max === 0 || value === 0) return '#f1f5f9';
  const pct = Math.min(value / max, 1);
  if (pct < 0.25) return `rgba(219,234,254,${0.4 + pct * 2})`;
  if (pct < 0.5)  return `rgba(147,197,253,${0.5 + pct})`;
  if (pct < 0.75) return `rgba(59,130,246,${0.6 + pct * 0.4})`;
  return `rgba(30,64,175,${0.7 + pct * 0.3})`;
}

function HeatCell({ value, max, label }) {
  const [tip, setTip] = useState(false);
  const bg = interpolateColor(value, max);
  const textColor = value / max > 0.5 ? 'white' : '#1e40af';
  return (
    <td
      style={{ width: 36, height: 28, background: bg, cursor: 'pointer', position: 'relative', transition: 'all .1s', border: '1px solid white' }}
      onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
    >
      {value > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: textColor, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{value > 99 ? '99+' : value}</span>}
      {tip && value > 0 && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: 'white', fontSize: 11, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 50, pointerEvents: 'none' }}>
          {label}: {value}
        </div>
      )}
    </td>
  );
}

export default function HeatmapIntelligence() {
  const { state } = useApp();
  const { effortData, bscData, absenceOverrides } = state;
  const [metric, setMetric]     = useState('dials');    // 'dials' | 'ptt' | 'connects'
  const [tlFilter, setTlFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All'); // 'All' | 'ROW' | 'US'
  const [view, setView]         = useState('advisor');   // 'advisor' | 'team' | 'hour'

  if (!effortData) return (
    <div className="empty-state"><div className="empty-icon">🔥</div><h3>No Effort Data</h3><p>Upload Raw Effort CSV to view the activity heatmap.</p></div>
  );

  const allAdvisors   = bscData?.advisors || [];
  const uniqueTLs     = ['All', ...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const absentNames   = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));

  const advisorMeta = useMemo(() => {
    const m = {};
    allAdvisors.forEach(a => { m[a.name] = a; });
    return m;
  }, [allAdvisors]);

  // Build hour grid: { advisorName: { hour: { dials, connects, pttMinutes } } }
  const hourGrid = useMemo(() => {
    const grid = {};
    const rows = effortData.rows || [];
    for (const row of rows) {
      if (!grid[row.advisor]) grid[row.advisor] = {};
      const h = row.hour;
      if (!grid[row.advisor][h]) grid[row.advisor][h] = { dials: 0, connects: 0, pttMinutes: 0 };
      grid[row.advisor][h].dials      += 1;
      grid[row.advisor][h].connects   += row.connected || 0;
      grid[row.advisor][h].pttMinutes += row.pttMinutes || 0;
    }
    return grid;
  }, [effortData]);

  // Filter advisors
  const filteredAdvisors = useMemo(() => {
    let list = Object.keys(hourGrid);
    const meta = advisorMeta;
    if (tlFilter !== 'All')     list = list.filter(n => meta[n]?.tl === tlFilter);
    if (shiftFilter !== 'All')  list = list.filter(n => meta[n]?.region === shiftFilter);
    list = list.filter(n => !absentNames.has(n));
    return list.sort();
  }, [hourGrid, tlFilter, shiftFilter, absentNames, advisorMeta]);

  // Per-hour totals (for "Hour Summary" view)
  const hourTotals = useMemo(() => {
    const totals = {};
    OP_HOURS.forEach(h => { totals[h] = { dials: 0, connects: 0, pttMinutes: 0, advisors: 0 }; });
    for (const advisor of filteredAdvisors) {
      for (const h of OP_HOURS) {
        const cell = hourGrid[advisor]?.[h];
        if (cell && cell.dials > 0) {
          totals[h].dials      += cell.dials;
          totals[h].connects   += cell.connects;
          totals[h].pttMinutes += cell.pttMinutes;
          totals[h].advisors   += 1;
        }
      }
    }
    return totals;
  }, [filteredAdvisors, hourGrid]);

  const getValue = (advisor, hour) => {
    const cell = hourGrid[advisor]?.[hour];
    if (!cell) return 0;
    if (metric === 'dials')    return cell.dials;
    if (metric === 'connects') return cell.connects;
    if (metric === 'ptt')      return Math.round(cell.pttMinutes);
    return 0;
  };

  const getHourTotal = (hour) => {
    const cell = hourTotals[hour];
    if (!cell) return 0;
    if (metric === 'dials')    return cell.dials;
    if (metric === 'connects') return cell.connects;
    if (metric === 'ptt')      return Math.round(cell.pttMinutes);
    return 0;
  };

  const maxVal = useMemo(() => {
    let max = 0;
    for (const adv of filteredAdvisors) {
      for (const h of OP_HOURS) max = Math.max(max, getValue(adv, h));
    }
    return max || 1;
  }, [filteredAdvisors, hourGrid, metric]);

  const maxHourTotal = Math.max(...OP_HOURS.map(h => getHourTotal(h)), 1);

  // Dead hours: hours where total activity < 10% of peak
  const deadHours = OP_HOURS.filter(h => getHourTotal(h) < maxHourTotal * 0.1);

  const METRIC_LABELS = { dials: 'Dials', connects: 'Connected Calls', ptt: 'PTT (min)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, marginRight: 8, color: 'var(--text-muted)' }}>METRIC</span>
            {Object.entries(METRIC_LABELS).map(([k, l]) => (
              <button key={k} className={`btn btn-sm ${metric === k ? 'btn-primary' : 'btn-outline'}`} style={{ marginRight: 6 }} onClick={() => setMetric(k)}>{l}</button>
            ))}
          </div>
          <select className="filter-select" value={tlFilter} onChange={e => setTlFilter(e.target.value)}>
            {uniqueTLs.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
            <option value="All">All Shifts</option>
            <option value="ROW">ROW Only</option>
            <option value="US">US Only</option>
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {filteredAdvisors.length} advisors · {deadHours.length} dead hours detected
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="card" style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>INTENSITY:</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 20, height: 14, background: interpolateColor(p * 100, 100), borderRadius: 2, border: '1px solid #e2e8f0' }} />
              <span>{Math.round(p * 100)}%</span>
            </div>
          ))}
          <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 20, height: 14, background: '#fee2e2', borderRadius: 2, border: '1px solid #fca5a5' }} />
            <span style={{ color: '#dc2626' }}>Dead Hour</span>
          </div>
        </div>
      </div>

      {/* Hour totals bar */}
      <div className="card">
        <div className="card-title">Hour Summary — {METRIC_LABELS[metric]} by Hour (All Advisors)</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 4, minWidth: 'max-content', alignItems: 'flex-end', height: 80, padding: '0 4px' }}>
            {OP_HOURS.map(h => {
              const val = getHourTotal(h);
              const pct = maxHourTotal > 0 ? val / maxHourTotal : 0;
              const isDead = deadHours.includes(h);
              return (
                <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 9, color: isDead ? '#dc2626' : 'var(--text-muted)', fontWeight: isDead ? 700 : 400 }}>{val || ''}</div>
                  <div style={{ width: 32, height: Math.max(pct * 56, 2), background: isDead ? '#fca5a5' : '#3b82f6', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
                  <div style={{ fontSize: 9, color: isDead ? '#dc2626' : 'var(--text-muted)', fontWeight: isDead ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {HOUR_LABELS(h)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {deadHours.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#991b1b', background: '#fee2e2', borderRadius: 6, padding: '6px 12px' }}>
            ⚠ Dead hours detected: {deadHours.map(h => HOUR_LABELS(h)).join(', ')}
          </div>
        )}
      </div>

      {/* Advisor × Hour Grid */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <span>Advisor Activity Heatmap — {METRIC_LABELS[metric]}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hover cells for details</span>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 600 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 'max-content' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'white' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 12px', minWidth: 160, borderBottom: '2px solid var(--border)', position: 'sticky', left: 0, background: 'white', zIndex: 6 }}>
                  Advisor / Hour
                </th>
                {OP_HOURS.map(h => (
                  <th key={h} style={{ width: 36, padding: '4px 2px', textAlign: 'center', fontSize: 9, color: deadHours.includes(h) ? '#dc2626' : 'var(--text-muted)', fontWeight: deadHours.includes(h) ? 800 : 600, borderBottom: '2px solid var(--border)', borderLeft: h === 18 || h === 0 ? '2px solid #e2e8f0' : undefined }}>
                    {HOUR_LABELS(h)}
                  </th>
                ))}
                <th style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)', borderLeft: '2px solid var(--border)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdvisors.map(adv => {
                const advMeta = advisorMeta[adv];
                const rowTotal = OP_HOURS.reduce((s, h) => s + getValue(adv, h), 0);
                return (
                  <tr key={adv}>
                    <td style={{ padding: '2px 12px', fontWeight: 600, fontSize: 12, position: 'sticky', left: 0, background: 'white', zIndex: 2, borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {adv}
                      <span style={{ marginLeft: 6, fontSize: 9, color: advMeta?.region === 'US' ? '#1e40af' : '#166534', fontWeight: 700 }}>{advMeta?.region || ''}</span>
                    </td>
                    {OP_HOURS.map(h => (
                      <HeatCell key={h} value={getValue(adv, h)} max={maxVal} label={`${adv} @ ${HOUR_LABELS(h)}`} />
                    ))}
                    <td style={{ padding: '2px 8px', fontWeight: 700, fontSize: 11, textAlign: 'center', borderLeft: '2px solid var(--border)', color: 'var(--em-green)' }}>
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                <td style={{ padding: '4px 12px', fontWeight: 700, fontSize: 11, position: 'sticky', left: 0, background: '#f8fafc' }}>TOTAL</td>
                {OP_HOURS.map(h => (
                  <td key={h} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '4px 2px', color: deadHours.includes(h) ? '#dc2626' : 'var(--text-primary)' }}>
                    {getHourTotal(h) || ''}
                  </td>
                ))}
                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, borderLeft: '2px solid var(--border)', color: 'var(--em-green)' }}>
                  {OP_HOURS.reduce((s, h) => s + getHourTotal(h), 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
