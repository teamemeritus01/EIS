import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';

const HOUR_L = h => h===0?'12:00 AM':h<12?`${h}:00 AM`:h===12?'12:00 PM':`${h-12}:00 PM`;
const opPos  = h => (h - 10 + 24) % 24;
const sortHours = arr => [...arr].sort((a,b) => opPos(a)-opPos(b));

export default function DeadHoursIntelligence() {
  const { state } = useApp();
  const { effortData, bscData } = state;
  const [threshold, setThreshold] = useState(15); // % of peak = dead
  const [tlFilter, setTlFilter]   = useState('All');

  if (!effortData) return <div className="empty-state"><div className="empty-icon">💤</div><h3>No Effort Data</h3></div>;

  const allAdvisors = bscData?.advisors||[];
  const uniqueTLs   = ['All', ...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const advisorMeta = useMemo(()=>{ const m={}; allAdvisors.forEach(a=>{m[a.name]=a;}); return m; },[allAdvisors]);

  // Build per-advisor hourly dial counts
  const advisorHours = useMemo(() => {
    const agg = {};
    for (const row of (effortData.rows||[])) {
      const meta = advisorMeta[row.advisor];
      if (tlFilter!=='All' && meta?.tl!==tlFilter) continue;
      if (!agg[row.advisor]) agg[row.advisor] = {};
      const h = row.hour;
      agg[row.advisor][h] = (agg[row.advisor][h]||0) + 1;
    }
    return agg;
  }, [effortData, tlFilter, advisorMeta]);

  // Per-advisor analysis: only look at hours BETWEEN first and last call
  const advisorAnalysis = useMemo(() => {
    return Object.entries(advisorHours).map(([name, hours]) => {
      const activeHours = Object.entries(hours).filter(([,v])=>v>0).map(([h])=>parseInt(h));
      if (!activeHours.length) return null;

      const sortedActive = sortHours(activeHours);
      const firstH = sortedActive[0];
      const lastH  = sortedActive[sortedActive.length-1];

      // Get all hours in the window (first to last, in operational order)
      const windowHours = [];
      let cur = firstH;
      windowHours.push(cur);
      while (cur !== lastH) {
        cur = (cur + 1) % 24;
        windowHours.push(cur);
      }

      const peakInWindow = Math.max(...windowHours.map(h=>hours[h]||0), 1);
      const deadInWindow = windowHours.filter(h => (hours[h]||0) < peakInWindow * (threshold/100));
      const meta = advisorMeta[name];

      return {
        name, firstH, lastH, windowHours, peakInWindow,
        deadHours: deadInWindow, deadCount: deadInWindow.length,
        totalDials: Object.values(hours).reduce((s,v)=>s+v,0),
        tl: meta?.tl, apm: meta?.apm, region: meta?.region,
        hours,
      };
    }).filter(Boolean).sort((a,b) => {
      // Sort by dead% within window
      const pa = a.deadCount/Math.max(a.windowHours.length,1);
      const pb = b.deadCount/Math.max(b.windowHours.length,1);
      return pb - pa;
    });
  }, [advisorHours, threshold, advisorMeta]);

  // Team-level: union of all windows
  const teamWindow = useMemo(() => {
    const allHours = new Set();
    advisorAnalysis.forEach(a => a.windowHours.forEach(h=>allHours.add(h)));
    return sortHours([...allHours]);
  }, [advisorAnalysis]);

  const teamHourTotals = useMemo(() => {
    const t = {};
    teamWindow.forEach(h=>{ t[h] = Object.values(advisorHours).reduce((s,hours)=>s+(hours[h]||0),0); });
    return t;
  }, [teamWindow, advisorHours]);

  const teamPeak = Math.max(...Object.values(teamHourTotals),1);
  const teamDead = teamWindow.filter(h => (teamHourTotals[h]||0) < teamPeak*(threshold/100));

  const SEV = d => d>=8?{label:'Critical',cls:'badge-red'}:d>=5?{label:'High',cls:'badge-orange'}:d>=3?{label:'Medium',cls:'badge-yellow'}:{label:'Low',cls:'badge-green'};

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="card" style={{ padding:'10px 14px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:12, fontWeight:600 }}>Dead hour threshold:</span>
            <input type="range" min={5} max={30} value={threshold} onChange={e=>setThreshold(+e.target.value)} style={{ width:120 }}/>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--em-green)', minWidth:40 }}>{'<'}{threshold}% of peak</span>
          </div>
          <select className="filter-select" value={tlFilter} onChange={e=>setTlFilter(e.target.value)}>
            {uniqueTLs.map(t=><option key={t}>{t}</option>)}
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
            <span className="badge badge-red">{teamDead.length} team dead hours</span>
            <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>Window: first call → last call only</span>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Advisors Analysed', value:advisorAnalysis.length, accent:'#6366f1' },
          { label:'Team Dead Hours', value:teamDead.length, sub:`Out of ${teamWindow.length} active hours`, accent:'#dc2626' },
          { label:'Peak Activity Hour', value:HOUR_L(teamWindow.reduce((a,b)=>teamHourTotals[a]>teamHourTotals[b]?a:b, teamWindow[0]||0)), sub:`${teamPeak} dials`, accent:'#166534' },
          { label:'Advisors w/ 5+ Dead', value:advisorAnalysis.filter(a=>a.deadCount>=5).length, sub:'High inactivity', accent:'#f97316' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{background:s.accent}}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:18}}>{s.value}</div>
            {s.sub&&<div className="stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Team activity bar - active window only */}
      <div className="card">
        <div className="card-title">
          Team Activity Pattern — Active Window Only
          <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8, fontWeight:400 }}>
            ({HOUR_L(teamWindow[0]||0)} → {HOUR_L(teamWindow[teamWindow.length-1]||0)})
          </span>
        </div>
        <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:90, overflowX:'auto' }}>
          {teamWindow.map(h=>{
            const val  = teamHourTotals[h]||0;
            const pct  = val/teamPeak;
            const dead = teamDead.includes(h);
            return (
              <div key={h} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:34 }}>
                {dead && <div style={{ fontSize:11 }}>💤</div>}
                <div style={{ fontSize:9, color:dead?'#dc2626':'var(--text-muted)', fontWeight:700 }}>{val||''}</div>
                <div style={{ width:30, height:Math.max(pct*64,2), background:dead?'#fca5a5':'#3b82f6', borderRadius:'3px 3px 0 0' }}/>
                <div style={{ fontSize:9, color:dead?'#dc2626':'var(--text-muted)', fontWeight:dead?700:400, transform:'rotate(-35deg)', transformOrigin:'top left', whiteSpace:'nowrap', marginLeft:4 }}>
                  {HOUR_L(h).replace(':00','')}
                </div>
              </div>
            );
          })}
        </div>
        {teamDead.length>0&&(
          <div style={{ marginTop:10, padding:'8px 12px', background:'#fee2e2', borderRadius:8, fontSize:12, color:'#991b1b' }}>
            <strong>Dead windows within active hours:</strong> {teamDead.map(h=>HOUR_L(h)).join(' · ')}
            <div style={{ marginTop:4, fontSize:11 }}>These gaps exist between the team's first and last call — indicating low utilization within the active shift window.</div>
          </div>
        )}
      </div>

      {/* Per-advisor table */}
      <div className="card">
        <div className="card-title">Advisor Dead Hour Analysis (First-to-Last Call Window)</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th style={{textAlign:'left'}}>Advisor</th><th style={{textAlign:'left'}}>TL</th>
              <th>Region</th><th>Active Window</th><th>Window Hours</th>
              <th>Dead Hours</th><th>Dead %</th><th>Severity</th>
              <th>Total Dials</th><th style={{textAlign:'left'}}>Dead Windows</th>
            </tr></thead>
            <tbody>
              {advisorAnalysis.map(a=>{
                const deadPct = Math.round(a.deadCount/Math.max(a.windowHours.length,1)*100);
                const sev = SEV(a.deadCount);
                return (
                  <tr key={a.name} style={{ background:a.deadCount>=5?'#fff5f5':a.deadCount>=3?'#fff7ed':'' }}>
                    <td style={{textAlign:'left',fontWeight:700}}>{a.name}</td>
                    <td style={{textAlign:'left',fontSize:11}}>{a.tl||'—'}</td>
                    <td><span className={`badge badge-${a.region==='US'?'blue':'green'}`}>{a.region||'—'}</span></td>
                    <td style={{fontSize:11,whiteSpace:'nowrap'}}>{HOUR_L(a.firstH)} → {HOUR_L(a.lastH)}</td>
                    <td>{a.windowHours.length}</td>
                    <td style={{fontWeight:700,color:a.deadCount>=5?'#dc2626':'inherit'}}>{a.deadCount}</td>
                    <td style={{fontWeight:700,color:deadPct>=40?'#dc2626':deadPct>=20?'#f97316':'inherit'}}>{deadPct}%</td>
                    <td><span className={`badge ${sev.cls}`}>{sev.label}</span></td>
                    <td>{a.totalDials.toLocaleString()}</td>
                    <td style={{textAlign:'left',fontSize:11,color:'var(--text-muted)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {a.deadHours.slice(0,5).map(h=>HOUR_L(h)).join(' · ')}{a.deadHours.length>5?` +${a.deadHours.length-5}`:''}
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
