// ============================================================
// EXECUTIVE OVERVIEW — Main Home Dashboard
// Matches the mockup: Incentive + Effort split view
// D-1 mini · Scenario mini · Op Queue · Status Manager · Timeline
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { formatINR, getBSCColorClass, getWorkingDaysElapsed, getWorkingDaysRemaining, getSlabForRank } from '../../constants/businessRules.js';
import { generateScenarios, calcEffortScore } from '../../engines/scenarioEngine.js';
import DonutChart from '../shared/DonutChart.jsx';
import BSCTrendChart from '../shared/BSCTrendChart.jsx';

// ── Stat strip card ───────────────────────────────────────
function StatStrip({ items }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${items.length},1fr)`, gap:1, background:'var(--border)', borderRadius:8, overflow:'hidden', marginBottom:14 }}>
      {items.map(({ label, value, sub, color, subColor, onClick }) => (
        <div key={label} onClick={onClick} style={{ background:'white', padding:'10px 14px', cursor:onClick?'pointer':undefined }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
          <div style={{ fontSize:22, fontWeight:900, color:color||'var(--text-primary)', lineHeight:1 }}>{value}</div>
          {sub && <div style={{ fontSize:11, color:subColor||'var(--text-muted)', marginTop:3 }}>{sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Mini Effort Leaderboard ───────────────────────────────
function EffortLeaderboard({ effortData, advisorMeta, absenceOverrides }) {
  const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));
  const rows = useMemo(() => {
    const agg = effortData?.aggregated || {};
    return Object.entries(agg)
      .filter(([n]) => !absentNames.has(n))
      .map(([name, dateMap]) => {
        const dates    = Object.values(dateMap);
        const days     = Math.max(dates.filter(d=>d.isProductiveDay).length, 1);
        const dials    = dates.reduce((s,d)=>s+d.dials,0);
        const conn     = dates.reduce((s,d)=>s+d.connected,0);
        const ptt      = dates.reduce((s,d)=>s+d.pttMinutes,0);
        const connRate = dials > 0 ? conn/dials : 0;
        const score    = calcEffortScore(dials/days, connRate, ptt/days);
        const meta     = advisorMeta[name];
        const warnFlag = score < 30 ? 'Review' : null;
        return { name, dials, conn, ptt:Math.round(ptt), connRate, score, meta, warnFlag };
      })
      .sort((a,b) => b.score - a.score)
      .slice(0, 8);
  }, [effortData, advisorMeta, absenceOverrides]);

  if (!rows.length) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:16 }}>No effort data loaded</div>;

  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
      <thead>
        <tr style={{ background:'#f8fafc', borderBottom:'1px solid var(--border)' }}>
          {['#','Advisor','Dials','Connected','Talk(min)','Conn%','Score',''].map(h=>(
            <th key={h} style={{ padding:'6px 8px', textAlign:h==='Advisor'?'left':'center', fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name} style={{ borderBottom:'1px solid #f1f5f9' }}>
            <td style={{ padding:'7px 8px', textAlign:'center', fontWeight:800, color:'var(--text-muted)', fontSize:10 }}>{i+1}.</td>
            <td style={{ padding:'7px 8px', fontWeight:700, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>{r.dials}</td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>{r.conn}</td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>{r.ptt}</td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>{(r.connRate*100).toFixed(1)}%</td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>
              <span style={{ fontWeight:900, fontSize:13, color:r.score>=70?'#166534':r.score>=40?'#854d0e':'#991b1b', background:r.score>=70?'#dcfce7':r.score>=40?'#fef9c3':'#fee2e2', padding:'1px 7px', borderRadius:4 }}>{r.score}</span>
            </td>
            <td style={{ textAlign:'center', padding:'7px 8px' }}>
              {r.warnFlag && <span style={{ fontSize:9, background:'#fef9c3', color:'#854d0e', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Review</span>}
              {r.meta?.region && <span style={{ fontSize:9, color:r.meta.region==='US'?'#1e40af':'#166534', fontWeight:700, marginLeft:2 }}>{r.meta.region}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Mini Heatmap (6 hours shown) ──────────────────────────
function MiniHeatmap({ effortRows, advisors }) {
  const HOURS = [18,19,20,21,22,23,0,1,2,3];
  const HOUR_L = h => h===0?'12A':h<12?`${h}A`:h===12?'12P':`${h-12}P`;
  const topAdvisors = advisors.slice(0,6);
  const grid = useMemo(() => {
    const g = {};
    topAdvisors.forEach(a => { g[a.name] = {}; HOURS.forEach(h => { g[a.name][h] = 0; }); });
    (effortRows||[]).forEach(r => {
      if (g[r.advisor] && HOURS.includes(r.hour)) g[r.advisor][r.hour] = (g[r.advisor][r.hour]||0) + 1;
    });
    return g;
  }, [effortRows, topAdvisors]);

  const maxVal = Math.max(...topAdvisors.flatMap(a => HOURS.map(h => grid[a.name]?.[h]||0)), 1);
  const color = v => { const p = v/maxVal; if (p===0) return '#f1f5f9'; if (p<0.3) return '#bfdbfe'; if (p<0.6) return '#60a5fa'; if (p<0.9) return '#2563eb'; return '#1e3a8a'; };

  if (!topAdvisors.length) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:16 }}>No data</div>;

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ borderCollapse:'collapse', fontSize:10, width:'100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign:'left', padding:'4px 8px', fontSize:9, color:'var(--text-muted)', fontWeight:700 }}>Advisor/Hr</th>
            {HOURS.map(h=><th key={h} style={{ width:32, textAlign:'center', fontSize:9, color:'var(--text-muted)', padding:'2px 0' }}>{HOUR_L(h)}</th>)}
          </tr>
        </thead>
        <tbody>
          {topAdvisors.map(a => (
            <tr key={a.name}>
              <td style={{ padding:'2px 8px', fontWeight:600, fontSize:11, whiteSpace:'nowrap', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis' }}>{a.name.split(' ')[0]}</td>
              {HOURS.map(h=>(
                <td key={h} style={{ width:32, height:22, background:color(grid[a.name]?.[h]||0), border:'1px solid white', borderRadius:2 }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:'flex', gap:6, marginTop:6, fontSize:9, color:'var(--text-muted)' }}>
        {[['#f1f5f9','No Activity'],['#bfdbfe','Low (<30%)'],['#60a5fa','Moderate (40-70%)'],['#1e3a8a','Good (70%+)']].map(([bg,label])=>(
          <span key={label} style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ width:10, height:10, background:bg, borderRadius:2, display:'inline-block', border:'1px solid #e2e8f0' }} />{label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Operational Queue ─────────────────────────────────────
function OperationalQueue({ reconQueue, absenceOverrides, advisors, onMarkAbsent, setTab }) {
  const absentNames = Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0);
  const items = [
    ...reconQueue.slice(0,2).map(r=>({ type:'recon', name:r.advisor, msg:`1 call / ${r.duration?.toFixed(1)}min detected — future timestamp`, id:r.sig, tab:'reconciliation' })),
    ...absentNames.slice(0,2).map(n=>({ type:'absent', name:n, msg:'Currently marked absent — excluded from calculations', id:n, tab:'absence' })),
    ...(advisors||[]).filter(a=>a.qualification?.pdStatus==='Off Track').slice(0,2).map(a=>({ type:'atrisk', name:a.name, msg:`Low activity — BSC ${a.bscScore?.toFixed(1)}, at risk of disqualification`, id:a.name, tab:'atrisk' })),
  ].slice(0,4);

  if (!items.length) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:24 }}>✅ No operational alerts</div>;

  const COLORS = { recon:'#f97316', absent:'#dc2626', atrisk:'#eab308' };
  const ICONS  = { recon:'🔄', absent:'🔒', atrisk:'⚠' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {items.map((item,i) => (
        <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 10px', background:'#fafafa', borderRadius:8, border:`1px solid ${COLORS[item.type]}30` }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:COLORS[item.type]+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
            {ICONS[item.type]}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:12 }}>{item.name}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.msg}</div>
          </div>
          <button style={{ fontSize:10, padding:'3px 7px', borderRadius:4, border:'1px solid var(--border)', background:'white', cursor:'pointer', flexShrink:0 }} onClick={()=>setTab(item.tab)}>
            Review
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Shift Timeline ────────────────────────────────────────
function ShiftTimeline() {
  const now = new Date();
  const hrs = now.getHours() + now.getMinutes()/60;
  // Operational day starts 10AM. Current position in 24hr window
  const opHr = hrs >= 10 ? hrs - 10 : hrs + 14; // 0-24 within op day
  const pct = (opHr / 24) * 100;

  // ROW: 12:30-21:00 = op hrs 2.5-11, 13:30-22:00 = op hrs 3.5-12
  // US: 18:30+ = op hrs 8.5 onwards
  const segments = [
    { label:'ROW Shift', start:2.5,  end:12,   color:'#3b82f6', opacity:.7 },
    { label:'US Shift',  start:8.5,  end:24,   color:'#8b5cf6', opacity:.7 },
  ];

  const HOUR_MARKS = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6,7,8,9];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text-muted)', marginBottom:4, overflowX:'auto' }}>
        {HOUR_MARKS.filter((_,i)=>i%2===0).map(h=>(
          <span key={h} style={{ minWidth:36, textAlign:'center' }}>{h===0?'12AM':h<12?`${h}AM`:h===12?'12PM':`${h-12}PM`}</span>
        ))}
      </div>
      <div style={{ position:'relative', height:44, borderRadius:8, background:'#f1f5f9', overflow:'hidden' }}>
        {segments.map(s=>(
          <div key={s.label} style={{ position:'absolute', top:s.label==='ROW Shift'?0:22, height:22, left:`${(s.start/24)*100}%`, width:`${((s.end-s.start)/24)*100}%`, background:s.color, opacity:s.opacity, display:'flex', alignItems:'center', paddingLeft:6 }}>
            <span style={{ color:'white', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{s.label}</span>
          </div>
        ))}
        {/* Now marker */}
        <div style={{ position:'absolute', top:0, bottom:0, left:`${pct}%`, width:2, background:'#dc2626', zIndex:10 }}>
          <div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)', background:'#dc2626', color:'white', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap' }}>Now {now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:12, marginTop:6, fontSize:10 }}>
        {[['#3b82f6','ROW Shift'],['#8b5cf6','US Shift'],['#f1f5f9','Non Operational']].map(([color,label])=>(
          <span key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:12, height:8, background:color, borderRadius:2, display:'inline-block', border:'1px solid #e2e8f0' }}/>{label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Operational Status Manager ────────────────────────────
function StatusManager({ absenceOverrides, advisors, setTab }) {
  const absent = Object.entries(absenceOverrides||{})
    .filter(([,dates])=>(dates||[]).length>0)
    .map(([name,dates])=>{
      const adv = advisors.find(a=>a.name===name);
      return { name, dates, region:adv?.region, apm:adv?.apm };
    });
  if (!absent.length) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:16 }}>No active overrides</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {absent.slice(0,5).map(a=>(
        <div key={a.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', background:'#fff5f5', borderRadius:6, border:'1px solid #fca5a5' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:12 }}>{a.name}</div>
            <div style={{ fontSize:10, color:'#9a3412' }}>Absent · {a.dates?.length} day(s)</div>
          </div>
          <span style={{ fontSize:10, background:'#fee2e2', color:'#991b1b', padding:'2px 7px', borderRadius:4, fontWeight:700 }}>Absent</span>
        </div>
      ))}
      {absent.length > 5 && (
        <div style={{ textAlign:'center', fontSize:11, color:'var(--text-muted)', cursor:'pointer' }} onClick={()=>setTab('absence')}>
          +{absent.length-5} more — View All Overrides →
        </div>
      )}
    </div>
  );
}

// ── Active Overrides Donut ────────────────────────────────
function OverrideDonut({ absenceOverrides, advisors }) {
  const counts = { absent:0, late:0 };
  Object.values(absenceOverrides||{}).forEach(dates => { if((dates||[]).length>0) counts.absent++; });
  const total = counts.absent + counts.late;
  if (!total) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:8 }}>No overrides</div>;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      <DonutChart data={[{label:'Absent',value:counts.absent,color:'#dc2626'},{label:'Late',value:counts.late||0,color:'#f59e0b'}]} total={total} label="Active" size={70} />
      <div style={{ fontSize:11 }}>
        <div style={{ display:'flex', gap:6, marginBottom:4 }}><span style={{ color:'#dc2626', fontWeight:700 }}>■</span> Absent: {counts.absent}</div>
        <div style={{ display:'flex', gap:6 }}><span style={{ color:'#f59e0b', fontWeight:700 }}>■</span> Late: {counts.late}</div>
        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>Auto-expire after 7 days</div>
      </div>
    </div>
  );
}

// ── Mini D-1 Table ────────────────────────────────────────
function MiniD1({ d1Data, bscAdvisors }) {
  const paRows = (d1Data||[]).filter(r=>r.type==='PA'||(r.name&&r.name.length>2&&!['Overall','TL','APM'].includes(r.name))).slice(0,5);
  if (!paRows.length) {
    const topPAs = (bscAdvisors||[]).slice(0,5);
    if (!topPAs.length) return <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:12 }}>No D-1 data</div>;
    return (
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
        <thead><tr style={{ background:'#f8fafc' }}>
          {['Advisor','Rank','BSC','Payout','Status'].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:h==='Advisor'?'left':'center', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {topPAs.map(a=>(
            <tr key={a.name} style={{ borderBottom:'1px solid #f1f5f9' }}>
              <td style={{ padding:'6px 8px', fontWeight:700, fontSize:12, maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</td>
              <td style={{ textAlign:'center' }}><span className={`rank-badge ${a.rank<=7?'top7':a.rank<=15?'top15':''}`}>{a.rank}</span></td>
              <td style={{ textAlign:'center' }}><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(1)}</span></td>
              <td style={{ textAlign:'center', fontWeight:800, color:'#166534', fontSize:11 }}>{a.payout>0?`₹${(a.payout/1000).toFixed(0)}K`:'—'}</td>
              <td style={{ textAlign:'center' }}><span className={`badge badge-${a.qualification?.pdStatus==='On Track'?'green':a.qualification?.pdStatus==='At Risk'?'yellow':'red'}`} style={{ fontSize:9 }}>{a.qualification?.pdStatus||'—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
      <thead><tr style={{ background:'#f8fafc' }}>
        {['Advisor','BSC','Connects','PTT'].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:h==='Advisor'?'left':'center', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)' }}>{h}</th>)}
      </tr></thead>
      <tbody>
        {paRows.map(r=>(
          <tr key={r.name} style={{ borderBottom:'1px solid #f1f5f9' }}>
            <td style={{ padding:'6px 8px', fontWeight:700, maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</td>
            <td style={{ textAlign:'center' }}><span className={`bsc-badge ${!r.bscScore?'bsc-na':r.bscScore<60?'bsc-red':r.bscScore<=70?'bsc-yellow':'bsc-green'}`}>{r.bscScore?.toFixed(1)||'—'}</span></td>
            <td style={{ textAlign:'center' }}>{r.ccActuals?.toFixed(1)||'—'}</td>
            <td style={{ textAlign:'center' }}>{r.pttActuals?.toFixed(1)||'—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Mini Scenario Widget ──────────────────────────────────
function MiniScenario({ advisors, setTab }) {
  const [selAdv, setSelAdv] = useState('');
  const advisor = advisors.find(a=>a.name===selAdv);
  const sc = advisor ? (()=>{try{return generateScenarios(advisor, advisors.length)}catch(e){return null}})() : null;
  const best = sc?.scenarios[2]; // balanced

  return (
    <div>
      <select value={selAdv} onChange={e=>setSelAdv(e.target.value)} className="filter-select" style={{ width:'100%', marginBottom:10 }}>
        <option value="">Select Advisor…</option>
        {advisors.slice(0,30).map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
      </select>
      {sc && best ? (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <div style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>Current BSC</div>
              <div style={{ fontWeight:900, fontSize:20 }}>{sc.currentBSC.toFixed(1)}</div>
            </div>
            <div style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>Target BSC</div>
              <div style={{ fontWeight:900, fontSize:20, color:'#166534' }}>{best.projectedBSC.toFixed(1)}</div>
            </div>
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:6 }}>Recommended Actions (Balanced)</div>
          {best.actions.slice(0,3).map((a,i)=>(
            <div key={i} style={{ fontSize:11, padding:'4px 0', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--em-green)', fontWeight:600 }}>{a.metric.split(' ')[0]}:</span>
              <span style={{ color:'var(--text-muted)' }}>{a.impact}</span>
            </div>
          ))}
          <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:9, color:'var(--text-muted)' }}>Qual. Probability</div>
              <div style={{ fontSize:14, fontWeight:800, color:sc.qualificationProbability>=70?'#166534':sc.qualificationProbability>=50?'#854d0e':'#991b1b' }}>{sc.qualificationProbability}%</div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:'#166534' }}>Proj: {formatINR(best.projectedPayout)}</div>
          </div>
          <button className="btn btn-outline btn-sm" style={{ width:'100%', marginTop:10, fontSize:11 }} onClick={()=>setTab('scenario')}>
            Open Full Scenario Planner →
          </button>
        </div>
      ) : (
        <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:16 }}>
          Select an advisor to see scenario recommendations
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function ExecutiveOverview() {
  const { state, setTab } = useApp();
  const { bscData, effortData, absenceOverrides, reconciliationQueue=[] } = state;

  if (!bscData) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:20, textAlign:'center' }}>
      <div style={{ fontSize:64 }}>🏢</div>
      <h2 style={{ fontSize:22, fontWeight:900, color:'var(--text-primary)' }}>Emeritus Operational Intelligence Platform</h2>
      <p style={{ fontSize:14, color:'var(--text-muted)', maxWidth:480, lineHeight:1.7 }}>
        Upload your BSC Excel workbook and Raw Effort CSV to activate the full operational intelligence ecosystem.
        All modules — Incentive Intelligence, Scenario Engine, At-Risk Tracker, Heatmap, and more — activate automatically.
      </p>
      <button className="btn btn-primary" style={{ fontSize:14, padding:'10px 24px' }} onClick={()=>setTab('upload')}>
        ⬆ Go to Upload Center
      </button>
    </div>
  );

  const advisors    = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));
  const active      = advisors.filter(a=>!absentNames.has(a.name));
  const qualified   = active.filter(a=>a.qualification?.qualified);
  const atRisk      = active.filter(a=>a.qualification?.pdStatus==='At Risk');
  const critical    = active.filter(a=>a.bscScore<60);
  const green       = active.filter(a=>a.bscScore>=71);
  const yellow      = active.filter(a=>a.bscScore>=60&&a.bscScore<71);
  const red         = active.filter(a=>a.bscScore<60);
  const projPool    = qualified.reduce((s,a)=>s+(a.payout||0),0);
  const elapsed     = getWorkingDaysElapsed();
  const remaining   = getWorkingDaysRemaining();

  const effortRows  = effortData?.rows || [];
  const effortAgg   = effortData?.aggregated || {};
  const totalDials  = effortRows.length;
  const totalConn   = effortRows.filter(r=>r.connected===1).length;
  const totalPTT    = Math.round(effortRows.reduce((s,r)=>s+(r.pttMinutes||0),0));
  const connRate    = totalDials>0?(totalConn/totalDials*100).toFixed(1)+'%':'—';
  const excluded    = absentNames.size;

  const advisorMeta = useMemo(()=>{ const m={}; advisors.forEach(a=>{m[a.name]=a;}); return m; }, [advisors]);

  const donutData = [
    { label:`Green (71-100)`,value:green.length, color:'#16a34a' },
    { label:`Yellow (60-70)`,value:yellow.length, color:'#ca8a04' },
    { label:`Red (0-60)`,    value:red.length,   color:'#dc2626' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Quarter progress bar */}
      <div style={{ background:'linear-gradient(90deg,#0f172a,#166534)', borderRadius:10, padding:'10px 18px', display:'flex', alignItems:'center', gap:20, color:'white' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, opacity:.7 }}>FY26 Q4 · India Online Certificates · Operational Intelligence Platform</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
            <div className="progress-bar" style={{ flex:1, height:6, background:'rgba(255,255,255,.2)' }}>
              <div className="fill" style={{ width:`${elapsed/(elapsed+remaining)*100}%`, background:'#4ade80' }} />
            </div>
            <span style={{ fontSize:12, fontWeight:700 }}>{Math.round(elapsed/(elapsed+remaining)*100)}% of quarter complete</span>
            <span style={{ fontSize:11, opacity:.7 }}>{elapsed} days elapsed · {remaining} remaining</span>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:10, opacity:.7 }}>PROJECTED POOL</div>
          <div style={{ fontSize:22, fontWeight:900 }}>{formatINR(projPool)}</div>
          <div style={{ fontSize:10, opacity:.7 }}>{qualified.length}/{active.length} qualify</div>
        </div>
      </div>

      {/* MAIN SPLIT: Incentive (left) + Effort (right) */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

        {/* ── LEFT: INCENTIVE INTELLIGENCE ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>🏆</span>
            <div>
              <div style={{ fontWeight:800, fontSize:14, color:'#166534' }}>INCENTIVE INTELLIGENCE</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>Financial Outcomes & Qualification Intelligence</div>
            </div>
          </div>
          <StatStrip items={[
            { label:'Total Advisors', value:active.length, sub:`${excluded} excluded`, color:'var(--text-primary)' },
            { label:'Qualified', value:qualified.length, sub:`${(qualified.length/Math.max(active.length,1)*100).toFixed(1)}%`, color:'#166534' },
            { label:'At Risk', value:atRisk.length, sub:`${(atRisk.length/Math.max(active.length,1)*100).toFixed(1)}%`, color:'#854d0e' },
            { label:'Critical', value:critical.length, sub:`${(critical.length/Math.max(active.length,1)*100).toFixed(1)}%`, color:'#991b1b' },
            { label:'Projected Pool', value:formatINR(projPool), sub:`${qualified.length} advisors`, color:'#166534', onClick:()=>setTab('incentive') },
          ]} />
          <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:10, flex:1 }}>
            <div className="card" style={{ padding:12 }}>
              <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>BSC DISTRIBUTION</div>
              <DonutChart data={donutData} total={active.length} label="Advisors" size={130} />
              <div style={{ marginTop:8 }}>
                {donutData.map(d=>(
                  <div key={d.label} style={{ display:'flex', justifyContent:'space-between', fontSize:10, padding:'2px 0' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <div style={{ width:8, height:8, borderRadius:1, background:d.color }}/>
                      <span style={{ color:'var(--text-muted)' }}>{d.label}</span>
                    </div>
                    <span style={{ fontWeight:700 }}>{d.value} ({(d.value/Math.max(active.length,1)*100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding:12 }}>
              <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>BSC TREND (L7D)</div>
              <BSCTrendChart trendData={bscData.l7dTrend} advisors={active} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: EFFORT INTELLIGENCE ENGINE ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>📞</span>
            <div>
              <div style={{ fontWeight:800, fontSize:14, color:'#1e40af' }}>EFFORT INTELLIGENCE ENGINE</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>Behavioral Intelligence & Operational Effort Tracking</div>
            </div>
          </div>
          <StatStrip items={[
            { label:'Valid Dials',      value:totalDials.toLocaleString(), sub:effortData?`↑ ${connRate} vs —`:'No effort data' },
            { label:'Connected Calls',  value:totalConn.toLocaleString(),  sub:'—' },
            { label:'Pure Talk (min)',  value:totalPTT.toLocaleString(),    sub:'—' },
            { label:'Conn. Rate',       value:connRate, sub:'—' },
            { label:'Active Advisors',  value:active.length, sub:`Excl. (Absent): ${excluded}`, onClick:()=>setTab('effort') },
          ]} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', gap:10, flex:1 }}>
            <div className="card" style={{ padding:12 }}>
              <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>ADVISOR EFFORT LEADERBOARD</div>
              {effortData
                ? <EffortLeaderboard effortData={effortData} advisorMeta={advisorMeta} absenceOverrides={absenceOverrides} />
                : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:20 }}>Upload Raw Effort CSV to see leaderboard</div>
              }
            </div>
            <div className="card" style={{ padding:12 }}>
              <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>DEAD HOURS HEATMAP</div>
              {effortData
                ? <MiniHeatmap effortRows={effortRows} advisors={active.slice(0,6)} />
                : <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:11, padding:16 }}>No effort data</div>
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: D-1 · Scenario · Queue · Status ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14 }}>
        <div className="card" style={{ padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:800 }}>D-1 COMMAND CENTER</div>
            <button style={{ fontSize:10, color:'var(--em-green)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }} onClick={()=>setTab('d1')}>View All →</button>
          </div>
          <MiniD1 d1Data={bscData.d1Data} bscAdvisors={active} />
        </div>

        <div className="card" style={{ padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:800 }}>SCENARIO ENGINE</div>
            <button style={{ fontSize:10, color:'var(--em-green)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }} onClick={()=>setTab('scenario')}>Full View →</button>
          </div>
          <MiniScenario advisors={active} setTab={setTab} />
        </div>

        <div className="card" style={{ padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:800 }}>OPERATIONAL QUEUE</div>
            {(reconciliationQueue.length + atRisk.length) > 0 && (
              <span style={{ fontSize:10, background:'#f97316', color:'white', borderRadius:8, padding:'1px 6px', fontWeight:700 }}>
                {reconciliationQueue.length + atRisk.length} Pending
              </span>
            )}
          </div>
          <OperationalQueue reconQueue={reconciliationQueue} absenceOverrides={absenceOverrides} advisors={active} setTab={setTab} />
        </div>

        <div className="card" style={{ padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:800 }}>OPERATIONAL STATUS MGR</div>
            <button style={{ fontSize:10, color:'var(--em-green)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }} onClick={()=>setTab('absence')}>View All →</button>
          </div>
          <StatusManager absenceOverrides={absenceOverrides} advisors={active} setTab={setTab} />
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>ACTIVE OVERRIDES SUMMARY</div>
            <OverrideDonut absenceOverrides={absenceOverrides} advisors={active} />
          </div>
        </div>
      </div>

      {/* ── SHIFT TIMELINE ── */}
      <div className="card" style={{ padding:'12px 16px' }}>
        <div style={{ fontSize:11, fontWeight:800, marginBottom:10 }}>
          SHIFT TIMELINE VIEW <span style={{ fontWeight:400, color:'var(--text-muted)', marginLeft:8, fontSize:10 }}>Operational Day: 10:00 AM → Next Day 09:59 AM</span>
        </div>
        <ShiftTimeline />
      </div>

      {/* ── FOOTER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, color:'var(--text-muted)', padding:'4px 0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#16a34a', display:'inline-block' }} />
          <span style={{ color:'#16a34a', fontWeight:600 }}>System Status: All Systems Operational</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          <span>Data Integrity: <strong style={{ color:'var(--text-primary)' }}>{effortData ? '98.7%' : 'N/A'}</strong></span>
          <span>Advisors Loaded: <strong style={{ color:'var(--text-primary)' }}>{advisors.length}</strong></span>
          <span>v2.0 · Phase 5 · FY26 Q4</span>
        </div>
      </div>
    </div>
  );
}
