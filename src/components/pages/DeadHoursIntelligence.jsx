import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';

const OP_HOURS = [...Array(24).keys()].map(i => (i + 10) % 24);
const HOUR_LABEL = h => { if (h === 0) return '12:00 AM'; if (h < 12) return `${h}:00 AM`; if (h === 12) return '12:00 PM'; return `${h - 12}:00 PM`; };

export default function DeadHoursIntelligence() {
  const { state } = useApp();
  const { effortData, bscData } = state;
  const [threshold, setThreshold] = useState(10); // % of peak = dead
  const [tlFilter, setTlFilter] = useState('All');

  if (!effortData) return <div className="empty-state"><div className="empty-icon">💤</div><h3>No Effort Data</h3><p>Upload Raw Effort CSV to detect dead hours.</p></div>;

  const allAdvisors = bscData?.advisors || [];
  const uniqueTLs   = ['All', ...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const advisorMeta = useMemo(() => { const m = {}; allAdvisors.forEach(a => { m[a.name] = a; }); return m; }, [allAdvisors]);

  const rows = effortData.rows || [];

  // Per-advisor dead hours
  const advisorHours = useMemo(() => {
    const agg = {};
    for (const row of rows) {
      const meta = advisorMeta[row.advisor];
      if (tlFilter !== 'All' && meta?.tl !== tlFilter) continue;
      if (!agg[row.advisor]) agg[row.advisor] = {};
      const h = row.hour;
      if (!agg[row.advisor][h]) agg[row.advisor][h] = 0;
      agg[row.advisor][h] += 1;
    }
    return agg;
  }, [rows, tlFilter, advisorMeta]);

  // Hour totals
  const hourTotals = useMemo(() => {
    const t = {};
    OP_HOURS.forEach(h => { t[h] = 0; });
    for (const [, hours] of Object.entries(advisorHours)) {
      for (const [h, v] of Object.entries(hours)) t[parseInt(h)] = (t[parseInt(h)] || 0) + v;
    }
    return t;
  }, [advisorHours]);

  const peakHourDials = Math.max(...Object.values(hourTotals), 1);
  const deadHours = OP_HOURS.filter(h => (hourTotals[h] || 0) < peakHourDials * (threshold / 100));
  const activeHours = OP_HOURS.filter(h => !deadHours.includes(h));

  // Per-advisor dead hour count
  const advisorDeadHours = useMemo(() => {
    return Object.entries(advisorHours).map(([name, hours]) => {
      const peakAdv = Math.max(...Object.values(hours), 1);
      const dead = OP_HOURS.filter(h => (hours[h] || 0) < peakAdv * (threshold / 100));
      const meta = advisorMeta[name];
      return { name, deadCount: dead.length, deadHours: dead, meta, totalDials: Object.values(hours).reduce((s,v)=>s+v,0) };
    }).sort((a, b) => b.deadCount - a.deadCount);
  }, [advisorHours, threshold, advisorMeta]);

  const SEVERITY = count => count >= 12 ? { label:'Critical', cls:'badge-red' } : count >= 8 ? { label:'High', cls:'badge-orange' } : count >= 4 ? { label:'Medium', cls:'badge-yellow' } : { label:'Low', cls:'badge-green' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Controls */}
      <div className="card" style={{ padding:'12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:12, fontWeight:600 }}>Dead hour threshold:</span>
            <input type="range" min={5} max={30} value={threshold} onChange={e=>setThreshold(+e.target.value)} style={{ width:120 }} />
            <span style={{ fontSize:12, fontWeight:700, color:'var(--em-green)', minWidth:40 }}>{'<'}{threshold}% of peak</span>
          </div>
          <select className="filter-select" value={tlFilter} onChange={e=>setTlFilter(e.target.value)}>
            {uniqueTLs.map(t=><option key={t}>{t}</option>)}
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:12 }}>
            <span className="badge badge-red">{deadHours.length} dead hours</span>
            <span className="badge badge-green">{activeHours.length} active hours</span>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Dead Hours (Team)', value:deadHours.length, sub:'Out of 24 operational hours', accent:'#dc2626' },
          { label:'Peak Hour', value:HOUR_LABEL(OP_HOURS.reduce((a,b)=>hourTotals[a]>hourTotals[b]?a:b)), sub:`${Math.max(...Object.values(hourTotals))} dials`, accent:'#166534' },
          { label:'Advisors w/ 8+ Dead Hrs', value:advisorDeadHours.filter(a=>a.deadCount>=8).length, sub:'High inactivity risk', accent:'#f97316' },
          { label:'Total Dials (Filtered)', value:Object.values(hourTotals).reduce((s,v)=>s+v,0).toLocaleString(), sub:'Across active hours', accent:'#3b82f6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:20 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 24-hour activity bar chart */}
      <div className="card">
        <div className="card-title">24-Hour Activity Pattern (Operational Day: 10 AM → 10 AM)</div>
        <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:100, overflowX:'auto' }}>
          {OP_HOURS.map(h => {
            const val = hourTotals[h] || 0;
            const pct = val / peakHourDials;
            const isDead = deadHours.includes(h);
            const isShiftBoundary = h === 18; // US shift starts
            return (
              <div key={h} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:32 }}>
                {isShiftBoundary && <div style={{ position:'absolute', marginTop:-20, fontSize:9, color:'#1e40af', fontWeight:700 }}>US↑</div>}
                <div style={{ fontSize:9, color:isDead?'#dc2626':'var(--text-muted)', fontWeight:700 }}>{val||''}</div>
                <div style={{ width:28, height:Math.max(pct*72,2), background:isDead?'#fca5a5':'#3b82f6', borderRadius:'3px 3px 0 0', position:'relative' }}>
                  {isDead && <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', fontSize:10 }}>💤</div>}
                </div>
                <div style={{ fontSize:9, color:isDead?'#dc2626':'var(--text-muted)', fontWeight:isDead?700:400, transform:'rotate(-35deg)', transformOrigin:'top left', whiteSpace:'nowrap', marginLeft:4 }}>
                  {HOUR_LABEL(h).replace(':00','')}
                </div>
              </div>
            );
          })}
        </div>
        {deadHours.length > 0 && (
          <div style={{ marginTop:16, padding:'10px 14px', background:'#fee2e2', borderRadius:8, border:'1px solid #fca5a5', fontSize:12 }}>
            <strong style={{ color:'#991b1b' }}>Dead Hours Detected:</strong>{' '}
            <span style={{ color:'#991b1b' }}>{deadHours.map(h=>HOUR_LABEL(h)).join(' · ')}</span>
            <div style={{ marginTop:4, color:'#9a3412' }}>These windows have {'<'}{threshold}% of peak activity. Coach advisors to redistribute dialing effort into these hours.</div>
          </div>
        )}
      </div>

      {/* Per-advisor dead hours table */}
      <div className="card">
        <div className="card-title">Advisor Dead Hour Analysis</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th style={{ textAlign:'left' }}>Advisor</th>
              <th style={{ textAlign:'left' }}>TL</th>
              <th>Region</th>
              <th>Dead Hours</th>
              <th>Severity</th>
              <th>Total Dials</th>
              <th style={{ textAlign:'left' }}>Dead Windows</th>
            </tr></thead>
            <tbody>
              {advisorDeadHours.map(a => {
                const sev = SEVERITY(a.deadCount);
                return (
                  <tr key={a.name} style={{ background:a.deadCount>=12?'#fff5f5':a.deadCount>=8?'#fff7ed':'' }}>
                    <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                    <td style={{ textAlign:'left', fontSize:12 }}>{a.meta?.tl||'—'}</td>
                    <td><span className={`badge badge-${a.meta?.region==='US'?'blue':'green'}`}>{a.meta?.region||'—'}</span></td>
                    <td style={{ fontWeight:700, color:a.deadCount>=8?'#dc2626':'inherit' }}>{a.deadCount}/24</td>
                    <td><span className={`badge ${sev.cls}`}>{sev.label}</span></td>
                    <td>{a.totalDials.toLocaleString()}</td>
                    <td style={{ textAlign:'left', fontSize:11, color:'var(--text-muted)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.deadHours.slice(0,6).map(h=>HOUR_LABEL(h)).join(' · ')}{a.deadHours.length>6?` +${a.deadHours.length-6} more`:''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
