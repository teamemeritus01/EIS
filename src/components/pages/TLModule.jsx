// ============================================================
// TL MODULE — Dedicated Team Lead Intelligence Layer
// TL → APM → PA hierarchy with full planning capability
// ============================================================
import React, { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { formatINR, getBSCColorClass, getMinProductiveDays } from '../../constants/businessRules.js';
import { generateScenarios } from '../../engines/scenarioEngine.js';

function BSCBadge({ val }) {
  if (!val) return <span className="bsc-badge bsc-na">—</span>;
  const v = val > 1 ? val : val * 100;
  const cls = v >= 71 ? 'bsc-green' : v >= 60 ? 'bsc-yellow' : 'bsc-red';
  return <span className={`bsc-badge ${cls}`}>{v.toFixed(2)}</span>;
}

function StatusBadge({ status }) {
  const map = { 'On Track':'badge-green','Met':'badge-green','At Risk':'badge-yellow','Off Track':'badge-red' };
  return <span className={`badge ${map[status]||'badge-gray'}`}>{status||'—'}</span>;
}

function APMCard({ apm, advisors, allAdvisors, expanded, onToggle }) {
  const apmAdvisors = advisors.filter(a => a.apm === apm);
  const avgBSC  = apmAdvisors.length ? apmAdvisors.reduce((s,a)=>s+(a.bscScore||0),0)/apmAdvisors.length : 0;
  const qualified = apmAdvisors.filter(a=>a.qualification?.qualified);
  const atRisk    = apmAdvisors.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track');
  const totalPay  = qualified.reduce((s,a)=>s+(a.payout||0),0);

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:10 }}>
      {/* APM Header */}
      <div
        onClick={onToggle}
        style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#f8fafc', cursor:'pointer',
                 borderLeft:`4px solid ${atRisk.length>2?'#ef4444':atRisk.length>0?'#f59e0b':'#16a34a'}` }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:14 }}>{apm}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>
            {apmAdvisors.length} PAs · {qualified.length} qualified · {atRisk.length} at risk
          </div>
        </div>
        {[
          ['Avg BSC', <BSCBadge val={avgBSC}/>],
          ['Payout Pool', <span style={{fontWeight:800,color:'#166534',fontSize:12}}>{formatINR(totalPay)}</span>],
          ['At Risk', <span className={`badge ${atRisk.length>0?'badge-red':'badge-green'}`}>{atRisk.length}</span>],
        ].map(([label, val]) => (
          <div key={label} style={{ textAlign:'center', minWidth:80 }}>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</div>
            <div style={{ marginTop:2 }}>{val}</div>
          </div>
        ))}
        <span style={{ fontSize:14, color:'var(--text-muted)' }}>{expanded?'▲':'▼'}</span>
      </div>

      {/* PA list under APM */}
      {expanded && (
        <div style={{ padding:14 }}>
          <table className="data-table" style={{ fontSize:12 }}>
            <thead><tr>
              <th style={{textAlign:'left'}}>Rank</th><th style={{textAlign:'left'}}>PA Name</th>
              <th>BSC</th><th>Prod Days</th><th>Connects</th>
              <th>AHT(s)</th><th>TTFA</th><th>PTT(min)</th>
              <th>Slab</th><th>Payout</th><th>Status</th>
            </tr></thead>
            <tbody>
              {apmAdvisors.sort((a,b)=>a.rank-b.rank).map(a=>(
                <tr key={a.name}>
                  <td style={{textAlign:'left'}}>
                    <span className={`rank-badge ${a.rank<=7?'top7':a.rank<=15?'top15':a.rank<=23?'top23':''}`}>{a.rank}</span>
                  </td>
                  <td style={{textAlign:'left',fontWeight:700,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</td>
                  <td><BSCBadge val={a.bscScore}/></td>
                  <td>{a.productiveDays}</td>
                  <td>{a.connectedCalls!=null?Math.round(a.connectedCalls):'—'}</td>
                  <td>{a.ahtFirstCall!=null?Math.round(a.ahtFirstCall):'—'}</td>
                  <td>{a.adjustedTTFA!=null?Math.round(a.adjustedTTFA>1?a.adjustedTTFA:a.adjustedTTFA*100)+'%':'—'}</td>
                  <td>{a.pureTaskTime!=null?Math.round(a.pureTaskTime):'—'}</td>
                  <td style={{fontSize:11}}>{a.slab||'—'}</td>
                  <td style={{fontWeight:800,color:'#166534',fontSize:11}}>{a.payout>0?formatINR(a.payout):'—'}</td>
                  <td><StatusBadge status={a.qualification?.pdStatus}/></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* APM Scenario: what does it take for this APM's team to hit next level? */}
          <APMScenarioBlock apmName={apm} advisors={apmAdvisors} allAdvisors={allAdvisors}/>
        </div>
      )}
    </div>
  );
}

function APMScenarioBlock({ apmName, advisors, allAdvisors }) {
  const atRisk   = advisors.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track');
  const notQual  = advisors.filter(a=>!a.qualification?.qualified);
  const avgBSC   = advisors.length ? advisors.reduce((s,a)=>s+(a.bscScore||0),0)/advisors.length : 0;
  const curPay   = advisors.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);

  // Simulate: what if each PA improves to their P50 benchmark?
  const projectedPay = advisors.reduce((s,a) => {
    const sc = generateScenarios(a, allAdvisors.length, null);
    const quickWin = sc.scenarios[0]; // Quick Win scenario
    return s + (quickWin.projectedPayout || 0);
  }, 0);

  return (
    <div style={{ marginTop:12, padding:'12px 14px', background:'#f0f9ff', borderRadius:8, border:'1px solid #bae6fd' }}>
      <div style={{ fontSize:12, fontWeight:800, color:'#0369a1', marginBottom:8 }}>
        📊 APM Intelligence — {apmName}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
        {[
          { label:'Team Size', value:advisors.length },
          { label:'At Risk / Not Qualified', value:`${atRisk.length} / ${notQual.length}`, color:atRisk.length>2?'#dc2626':'inherit' },
          { label:'Current Pool', value:formatINR(curPay) },
          { label:'If Quick Win Applied', value:formatINR(projectedPay), color:'#166534' },
        ].map(s=>(
          <div key={s.label} style={{ background:'white', borderRadius:6, padding:'8px 10px' }}>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{s.label}</div>
            <div style={{ fontWeight:800, fontSize:13, color:s.color||'var(--text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>
      {atRisk.length > 0 && (
        <div style={{ fontSize:11, color:'#9a3412' }}>
          ⚠ Priority coaching needed: {atRisk.map(a=>a.name).join(', ')}
        </div>
      )}
    </div>
  );
}

export default function TLModule() {
  const { state } = useApp();
  const { bscData, absenceOverrides } = state;
  const [selectedTL, setSelectedTL] = useState('All');
  const [expandedAPMs, setExpandedAPMs] = useState(new Set());
  const [sortKey, setSortKey] = useState('avgBSC');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'comparison' | 'scenario'

  if (!bscData) return <div className="empty-state"><div className="empty-icon">👥</div><h3>No BSC Data Loaded</h3></div>;

  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));
  const activeAdvisors = allAdvisors.filter(a=>!absentNames.has(a.name));

  const uniqueTLs = [...new Set(activeAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const tlAdvisors = selectedTL === 'All' ? activeAdvisors : activeAdvisors.filter(a=>a.tl===selectedTL);
  const uniqueAPMs = [...new Set(tlAdvisors.map(a=>a.apm).filter(Boolean))].sort();

  const toggleAPM = apm => {
    const next = new Set(expandedAPMs);
    next.has(apm) ? next.delete(apm) : next.add(apm);
    setExpandedAPMs(next);
  };

  // TL-level stats
  const tlStats = useMemo(() => {
    return uniqueTLs.map(tl => {
      const tlPAs = activeAdvisors.filter(a=>a.tl===tl);
      const tlAPMs = [...new Set(tlPAs.map(a=>a.apm).filter(Boolean))];
      const avgBSC = tlPAs.length ? tlPAs.reduce((s,a)=>s+(a.bscScore||0),0)/tlPAs.length : 0;
      const qualified = tlPAs.filter(a=>a.qualification?.qualified).length;
      const atRisk    = tlPAs.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track').length;
      const payout    = tlPAs.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);
      return { tl, paCount:tlPAs.length, apmCount:tlAPMs.length, avgBSC, qualified, atRisk, payout };
    }).sort((a,b) => b[sortKey] - a[sortKey]);
  }, [activeAdvisors, uniqueTLs, sortKey]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Tab strip */}
      <div className="tab-strip">
        {[['overview','TL Overview'],['comparison','TL Comparison'],['scenario','TL Scenario Planning']].map(([id,label])=>(
          <div key={id} className={`tab-pill ${activeTab===id?'active':''}`} onClick={()=>setActiveTab(id)}>{label}</div>
        ))}
      </div>

      {/* TL OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          {/* TL Comparison Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14, marginBottom:8 }}>
            {tlStats.map(tl=>(
              <div key={tl.tl} className="card" style={{ borderLeft:`4px solid ${tl.atRisk>3?'#ef4444':tl.atRisk>0?'#f59e0b':'#16a34a'}`, cursor:'pointer', background:selectedTL===tl.tl?'#f0fdf4':'white' }}
                onClick={()=>setSelectedTL(selectedTL===tl.tl?'All':tl.tl)}>
                <div style={{ fontWeight:800, fontSize:15, marginBottom:8 }}>{tl.tl}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    ['PAs',tl.paCount],['APMs',tl.apmCount],
                    ['Avg BSC',<BSCBadge val={tl.avgBSC}/>],
                    ['Qualified',<span className="badge badge-green">{tl.qualified}/{tl.paCount}</span>],
                    ['At Risk',<span className={`badge ${tl.atRisk>0?'badge-red':'badge-green'}`}>{tl.atRisk}</span>],
                    ['Payout',<span style={{fontWeight:800,color:'#166534',fontSize:11}}>{formatINR(tl.payout)}</span>],
                  ].map(([label,val])=>(
                    <div key={label} style={{ background:'#f8fafc', borderRadius:6, padding:'6px 8px' }}>
                      <div style={{ fontSize:9, color:'var(--text-muted)' }}>{label}</div>
                      <div style={{ fontWeight:700 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="card" style={{ padding:'10px 14px' }}>
            <div className="filter-bar" style={{ marginBottom:0 }}>
              <select className="filter-select" value={selectedTL} onChange={e=>setSelectedTL(e.target.value)}>
                <option value="All">All TLs</option>
                {uniqueTLs.map(t=><option key={t}>{t}</option>)}
              </select>
              <button className="btn btn-outline btn-sm" onClick={()=>setExpandedAPMs(new Set(uniqueAPMs))}>Expand All APMs</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setExpandedAPMs(new Set())}>Collapse All</button>
              <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>
                {selectedTL!=='All'?`${selectedTL} ·`:''} {uniqueAPMs.length} APMs · {tlAdvisors.length} PAs
              </span>
            </div>
          </div>

          {/* APM accordion */}
          {uniqueAPMs.map(apm=>(
            <APMCard key={apm} apm={apm} advisors={tlAdvisors} allAdvisors={allAdvisors}
              expanded={expandedAPMs.has(apm)} onToggle={()=>toggleAPM(apm)}/>
          ))}
        </>
      )}

      {/* TL COMPARISON */}
      {activeTab === 'comparison' && (
        <div className="card">
          <div className="card-title">TL Performance Comparison</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{textAlign:'left'}}>Team Lead</th>
                <th>APMs</th><th>PAs</th>
                <th>Avg BSC</th><th>Qualified</th><th>Qual %</th>
                <th>At Risk</th><th>Payout Pool</th>
                <th>Top Performer</th>
              </tr></thead>
              <tbody>
                {tlStats.map(tl=>{
                  const tlPAs = activeAdvisors.filter(a=>a.tl===tl.tl);
                  const top = tlPAs.sort((a,b)=>a.rank-b.rank)[0];
                  return (
                    <tr key={tl.tl}>
                      <td style={{textAlign:'left',fontWeight:800}}>{tl.tl}</td>
                      <td>{tl.apmCount}</td>
                      <td>{tl.paCount}</td>
                      <td><BSCBadge val={tl.avgBSC}/></td>
                      <td style={{fontWeight:700,color:'#166534'}}>{tl.qualified}</td>
                      <td>{Math.round(tl.qualified/Math.max(tl.paCount,1)*100)}%</td>
                      <td style={{color:tl.atRisk>0?'#dc2626':'#16a34a',fontWeight:700}}>{tl.atRisk}</td>
                      <td style={{fontWeight:800,color:'#166534'}}>{formatINR(tl.payout)}</td>
                      <td style={{fontSize:11}}>
                        {top?<><span className="rank-badge top7">{top.rank}</span> {top.name.split(' ')[0]}</>:'—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TL SCENARIO */}
      {activeTab === 'scenario' && (
        <TLScenarioPlan advisors={activeAdvisors} tlStats={tlStats} allAdvisors={allAdvisors}/>
      )}
    </div>
  );
}

function TLScenarioPlan({ advisors, tlStats, allAdvisors }) {
  const [selTL, setSelTL] = useState('');
  const uniqueTLs = [...new Set(advisors.map(a=>a.tl).filter(Boolean))].sort();

  const tlPAs = selTL ? advisors.filter(a=>a.tl===selTL) : [];
  const uniqueAPMs = [...new Set(tlPAs.map(a=>a.apm).filter(Boolean))].sort();

  const apmSummaries = uniqueAPMs.map(apm => {
    const pas = tlPAs.filter(a=>a.apm===apm);
    const avgBSC = pas.length ? pas.reduce((s,a)=>s+(a.bscScore||0),0)/pas.length : 0;
    const atRisk  = pas.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track');
    const curPay  = pas.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);

    // Project: what if at-risk PAs achieve Quick Win?
    const projPay = pas.reduce((s,a) => {
      const sc = generateScenarios(a, allAdvisors.length, null);
      return s + sc.scenarios[0].projectedPayout;
    }, 0);

    const bottomPA = [...pas].sort((a,b)=>b.rank-a.rank)[0];
    const quickWinForBottom = bottomPA ? generateScenarios(bottomPA, allAdvisors.length, null) : null;

    return { apm, paCount:pas.length, avgBSC, atRisk, curPay, projPay, bottomPA, quickWinForBottom };
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="card" style={{ padding:'10px 14px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <select className="filter-select" value={selTL} onChange={e=>setSelTL(e.target.value)}>
            <option value="">Select TL to plan...</option>
            {uniqueTLs.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {!selTL ? (
        <div className="empty-state card"><div>👥</div><h3>Select a Team Lead</h3><p>Choose a TL above to see APM-level planning scenarios.</p></div>
      ) : (
        <>
          {/* TL summary */}
          <div className="card" style={{ background:'linear-gradient(135deg,#0f172a,#166534)', color:'white', border:'none' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>{selTL} — Team Planning View</div>
            <div style={{ display:'flex', gap:20 }}>
              {[
                ['APMs', uniqueAPMs.length],
                ['Total PAs', tlPAs.length],
                ['Current Pool', formatINR(tlPAs.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0))],
                ['If All Improve (Quick Win)', formatINR(apmSummaries.reduce((s,a)=>s+a.projPay,0))],
              ].map(([l,v])=>(
                <div key={l} style={{ background:'rgba(255,255,255,.1)', borderRadius:8, padding:'8px 14px' }}>
                  <div style={{ fontSize:10, opacity:.7 }}>{l}</div>
                  <div style={{ fontWeight:800, fontSize:14 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* APM-level plan */}
          {apmSummaries.map(apm=>(
            <div key={apm.apm} className="card" style={{ borderLeft:`4px solid ${apm.atRisk.length>2?'#ef4444':apm.atRisk.length>0?'#f59e0b':'#16a34a'}` }}>
              <div className="card-title" style={{ justifyContent:'space-between' }}>
                <span>{apm.apm}</span>
                <div style={{ display:'flex', gap:8 }}>
                  <span className="badge badge-blue">{apm.paCount} PAs</span>
                  {apm.atRisk.length>0&&<span className="badge badge-red">{apm.atRisk.length} at risk</span>}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
                {[
                  ['Avg BSC', <BSCBadge val={apm.avgBSC}/>],
                  ['Current Payout', <span style={{fontWeight:800,color:'#166534',fontSize:12}}>{formatINR(apm.curPay)}</span>],
                  ['If Quick Win', <span style={{fontWeight:800,color:'#3b82f6',fontSize:12}}>{formatINR(apm.projPay)}</span>],
                  ['Uplift Potential', <span style={{fontWeight:800,color:'#f59e0b',fontSize:12}}>+{formatINR(apm.projPay-apm.curPay)}</span>],
                ].map(([l,v])=>(
                  <div key={l} style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
                    <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{l}</div>
                    <div style={{ marginTop:2 }}>{v}</div>
                  </div>
                ))}
              </div>
              {apm.atRisk.length>0&&(
                <div style={{ fontSize:11, color:'#9a3412', background:'#fff7ed', borderRadius:6, padding:'8px 12px', marginBottom:10 }}>
                  ⚠ Priority intervention: {apm.atRisk.map(a=>a.name).join(', ')}
                </div>
              )}
              {apm.quickWinForBottom && (
                <div style={{ fontSize:11, color:'#1e40af', background:'#eff6ff', borderRadius:6, padding:'8px 12px' }}>
                  💡 Lowest ranked PA ({apm.bottomPA?.name}): {apm.quickWinForBottom.pattern.coaching}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
