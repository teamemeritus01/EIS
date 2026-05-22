import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';

// Operational hour label
const HOUR_L = h => h===0?'12AM':h<12?`${h}AM`:h===12?'12PM':`${h-12}PM`;

// Convert hour to operational-day order position (10AM=0, 11AM=1, ..., 9AM=23)
const opPos = h => (h - 10 + 24) % 24;
const sortHours = hours => [...hours].sort((a,b) => opPos(a) - opPos(b));

function getAdvisorWindow(hourData) {
  const activeHours = Object.entries(hourData).filter(([,v])=>v.dials>0).map(([h])=>parseInt(h));
  if (!activeHours.length) return { min:0, max:0, hours:[] };
  // Sort by operational position
  const sorted = sortHours(activeHours);
  return { min:sorted[0], max:sorted[sorted.length-1], hours:sorted };
}

function colorForValue(v, max) {
  if (!max || !v) return '#f1f5f9';
  const p = Math.min(v/max, 1);
  if (p < 0.2) return '#dbeafe';
  if (p < 0.4) return '#93c5fd';
  if (p < 0.6) return '#60a5fa';
  if (p < 0.8) return '#3b82f6';
  return '#1d4ed8';
}

export default function HeatmapIntelligence() {
  const { state } = useApp();
  const { effortData, bscData, absenceOverrides } = state;
  const [metric, setMetric]       = useState('dials');
  const [tlFilter, setTlFilter]   = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');

  if (!effortData) return <div className="empty-state"><div className="empty-icon">🔥</div><h3>No Effort Data</h3></div>;

  const allAdvisors = bscData?.advisors||[];
  const uniqueTLs   = ['All', ...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const advisorMeta = useMemo(()=>{ const m={}; allAdvisors.forEach(a=>{m[a.name]=a;}); return m; }, [allAdvisors]);
  const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));

  // Build per-advisor, per-hour aggregation
  const hourGrid = useMemo(() => {
    const grid = {};
    for (const row of (effortData.rows||[])) {
      const meta = advisorMeta[row.advisor];
      if (tlFilter!=='All' && meta?.tl !== tlFilter) continue;
      if (shiftFilter!=='All' && meta?.region !== shiftFilter) continue;
      if (!grid[row.advisor]) grid[row.advisor] = {};
      const h = row.hour;
      if (!grid[row.advisor][h]) grid[row.advisor][h] = { dials:0, connects:0, pttMins:0 };
      grid[row.advisor][h].dials    += 1;
      grid[row.advisor][h].connects += row.connected||0;
      grid[row.advisor][h].pttMins  += row.pttMinutes||0;
    }
    return grid;
  }, [effortData, tlFilter, shiftFilter, advisorMeta]);

  // Get union of all active hours (first-to-last across team)
  const teamActiveHours = useMemo(() => {
    const allActive = new Set();
    for (const [adv, hours] of Object.entries(hourGrid)) {
      if (absentNames.has(adv)) continue;
      for (const [h, v] of Object.entries(hours)) {
        if (v.dials > 0) allActive.add(parseInt(h));
      }
    }
    return sortHours([...allActive]);
  }, [hourGrid, absentNames]);

  const getValue = (adv, h) => {
    const cell = hourGrid[adv]?.[h];
    if (!cell) return 0;
    if (metric==='dials')    return cell.dials;
    if (metric==='connects') return cell.connects;
    if (metric==='ptt')      return Math.round(cell.pttMins);
    return 0;
  };

  const maxVal = useMemo(() => {
    let m = 0;
    for (const adv of Object.keys(hourGrid)) {
      for (const h of teamActiveHours) m = Math.max(m, getValue(adv, h));
    }
    return m||1;
  }, [hourGrid, teamActiveHours, metric]);

  const advisorList = Object.keys(hourGrid).filter(n=>!absentNames.has(n)).sort();

  // Per-advisor window (first call to last call)
  const advisorWindows = useMemo(() => {
    const w = {};
    advisorList.forEach(adv => { w[adv] = getAdvisorWindow(hourGrid[adv]||{}); });
    return w;
  }, [advisorList, hourGrid]);

  // Hour totals across active advisors
  const hourTotals = useMemo(() => {
    const t = {};
    teamActiveHours.forEach(h => { t[h] = advisorList.reduce((s,adv) => s + getValue(adv,h), 0); });
    return t;
  }, [advisorList, teamActiveHours, hourGrid, metric]);

  const METRIC_LABELS = { dials:'Dials', connects:'Connected Calls', ptt:'PTT (min)' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Controls */}
      <div className="card" style={{ padding:'10px 14px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <div>
            {Object.entries(METRIC_LABELS).map(([k,l])=>(
              <button key={k} className={`btn btn-sm ${metric===k?'btn-primary':'btn-outline'}`} style={{ marginRight:6 }} onClick={()=>setMetric(k)}>{l}</button>
            ))}
          </div>
          <select className="filter-select" value={tlFilter} onChange={e=>setTlFilter(e.target.value)}>
            {uniqueTLs.map(t=><option key={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={shiftFilter} onChange={e=>setShiftFilter(e.target.value)}>
            <option value="All">All Shifts</option>
            <option value="ROW">ROW</option>
            <option value="US">US</option>
          </select>
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>
            Showing hours: {teamActiveHours[0]!==undefined?HOUR_L(teamActiveHours[0]):''} → {teamActiveHours[teamActiveHours.length-1]!==undefined?HOUR_L(teamActiveHours[teamActiveHours.length-1]):''} (first-to-last call window)
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, fontSize:11, alignItems:'center' }}>
        <span style={{ fontWeight:600, color:'var(--text-muted)' }}>Intensity:</span>
        {[0,0.2,0.4,0.6,0.8,1].map(p=>(
          <div key={p} style={{ display:'flex', alignItems:'center', gap:3 }}>
            <div style={{ width:18, height:12, background:colorForValue(p*100,100), borderRadius:2 }}/>
            <span style={{ color:'var(--text-muted)' }}>{Math.round(p*100)}%</span>
          </div>
        ))}
        <span style={{ marginLeft:8, color:'var(--text-muted)', fontStyle:'italic' }}>
          ⚠ Only showing hours between first and last call of team — not 24hr
        </span>
      </div>

      {/* Hour summary bar */}
      <div className="card">
        <div className="card-title">{METRIC_LABELS[metric]} by Hour (Team Active Window)</div>
        <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:90, overflowX:'auto', padding:'0 4px' }}>
          {teamActiveHours.map(h=>{
            const val = hourTotals[h]||0;
            const maxH = Math.max(...Object.values(hourTotals),1);
            const pct  = val/maxH;
            return (
              <div key={h} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:34 }}>
                <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:700 }}>{val||''}</div>
                <div style={{ width:30, height:Math.max(pct*64,2), background:'#3b82f6', borderRadius:'3px 3px 0 0' }}/>
                <div style={{ fontSize:9, color:'var(--text-muted)', transform:'rotate(-35deg)', transformOrigin:'top left', whiteSpace:'nowrap', marginLeft:4 }}>
                  {HOUR_L(h)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advisor × Hour heatmap */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <span>Advisor Activity Heatmap — {METRIC_LABELS[metric]}</span>
          <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>Window = first call to last call per advisor</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, zIndex:5, background:'white' }}>
              <tr>
                <th style={{ textAlign:'left', padding:'6px 14px', minWidth:160, borderBottom:'2px solid var(--border)', position:'sticky', left:0, background:'white', zIndex:6 }}>
                  Advisor / Hour
                </th>
                {teamActiveHours.map(h=>(
                  <th key={h} style={{ width:34, padding:'4px 2px', textAlign:'center', fontSize:9, color:'var(--text-muted)', fontWeight:600, borderBottom:'2px solid var(--border)' }}>
                    {HOUR_L(h)}
                  </th>
                ))}
                <th style={{ padding:'4px 10px', fontSize:10, color:'var(--text-muted)', borderBottom:'2px solid var(--border)', borderLeft:'2px solid var(--border)' }}>Total</th>
                <th style={{ padding:'4px 10px', fontSize:10, color:'var(--text-muted)', borderBottom:'2px solid var(--border)' }}>Window</th>
              </tr>
            </thead>
            <tbody>
              {advisorList.map(adv => {
                const win      = advisorWindows[adv];
                const rowTotal = teamActiveHours.reduce((s,h)=>s+getValue(adv,h),0);
                const advMax   = Math.max(...teamActiveHours.map(h=>getValue(adv,h)),1);
                return (
                  <tr key={adv}>
                    <td style={{ padding:'2px 14px', fontWeight:600, fontSize:12, position:'sticky', left:0, background:'white', zIndex:2, borderRight:'1px solid var(--border)', whiteSpace:'nowrap' }}>
                      {adv}
                      <span style={{ marginLeft:6, fontSize:9, color:advisorMeta[adv]?.region==='US'?'#1e40af':'#166534', fontWeight:700 }}>
                        {advisorMeta[adv]?.region||''}
                      </span>
                    </td>
                    {teamActiveHours.map(h=>{
                      const v     = getValue(adv, h);
                      const inWin = win.hours.includes(h);
                      return (
                        <td key={h} style={{
                          width:34, height:26,
                          background: !inWin ? '#f8fafc' : colorForValue(v, advMax),
                          border: '1px solid white',
                          position: 'relative',
                          opacity: inWin ? 1 : 0.3,
                        }}>
                          {v > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, color: v/advMax>0.5?'white':'#1e40af', position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {v>99?'99+':v}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign:'center', fontWeight:700, fontSize:11, borderLeft:'2px solid var(--border)', color:'var(--em-green)' }}>{rowTotal}</td>
                    <td style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap', padding:'2px 8px' }}>
                      {win.hours.length>0 ? `${HOUR_L(win.min)} → ${HOUR_L(win.max)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--border)', background:'#f8fafc' }}>
                <td style={{ padding:'4px 14px', fontWeight:700, fontSize:11, position:'sticky', left:0, background:'#f8fafc' }}>TOTAL</td>
                {teamActiveHours.map(h=>(
                  <td key={h} style={{ textAlign:'center', fontSize:10, fontWeight:700, padding:'4px 2px', color:'var(--text-primary)' }}>
                    {hourTotals[h]||''}
                  </td>
                ))}
                <td style={{ textAlign:'center', fontWeight:800, fontSize:12, borderLeft:'2px solid var(--border)', color:'var(--em-green)' }}>
                  {teamActiveHours.reduce((s,h)=>s+(hourTotals[h]||0),0)}
                </td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
