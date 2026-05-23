// ============================================================
// INCENTIVE INTELLIGENCE — Inline Scenario Expander
// Simulate button shows below advisor name, expands in-row
// ============================================================
import React, { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getBSCColorClass, formatINR, getWorkingDaysElapsed, getWorkingDaysRemaining } from '../../constants/businessRules.js';
import { generateScenarios } from '../../engines/scenarioEngine.js';
import MultiSelect from '../shared/MultiSelect.jsx';
import DonutChart from '../shared/DonutChart.jsx';
import PageExportButton from '../shared/PageExportButton.jsx';
import BSCTrendChart from '../shared/BSCTrendChart.jsx';

function pctDisp(val) {
  if (val===null||val===undefined) return '—';
  const v = val > 1 ? val : val * 100;
  return Math.round(v) + '%';
}

// ── Inline Scenario Panel (expands below advisor in table) ─
function InlineScenario({ advisor, totalAdvisors, onClose }) {
  const [selScenario, setSelScenario] = useState(null);
  const sc = useMemo(() => {
    try { return generateScenarios(advisor, totalAdvisors); }
    catch(e) { return null; }
  }, [advisor]);
  if (!sc) return <div style={{padding:20,color:'var(--txt3)'}}>Scenario data unavailable for this advisor.</div>;

  return (
    <tr>
      <td colSpan={16} style={{ padding:0, background:'#f8fafc', borderBottom:'2px solid var(--em-green)' }}>
        <div style={{ padding:'16px 20px' }}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div>
              <span style={{ fontWeight:800, fontSize:14 }}>{advisor.name} — Scenario Planner</span>
              <span style={{ marginLeft:10, fontSize:11, color:'var(--text-muted)' }}>
                Current: BSC {sc.currentBSC.toFixed(1)} · Rank #{sc.currentRank} · {formatINR(sc.currentPayout)}
                · Qual. Prob. <strong style={{ color: sc.qualificationProbability>=70?'#166534':sc.qualificationProbability>=50?'#854d0e':'#991b1b' }}>{sc.qualificationProbability}%</strong>
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
          </div>

          {/* Eligibility alert */}
          {!sc.isEligible && (
            <div style={{ marginBottom:12, padding:'8px 14px', background:'#fff7ed', border:'1px solid #fdba74', borderRadius:8, fontSize:12, color:'#9a3412' }}>
              ⚠ {sc.eligibilityMessage}
            </div>
          )}

          {/* Science note */}
          <div style={{ marginBottom:12, padding:'6px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, fontSize:11, color:'#0369a1' }}>
            📐 {sc.scienceNote}
          </div>

          {/* 3 Scenario Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {sc.scenarios.map(s=>{
              const isSelected = selScenario?.id === s.id;
              return (
                <div key={s.id} onClick={()=>setSelScenario(isSelected?null:s)}
                  style={{ border:`2px solid ${isSelected?s.color:'var(--border)'}`, borderRadius:10, padding:14, cursor:'pointer', background:isSelected?s.color+'0D':'white', transition:'all .15s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <span style={{ fontSize:18 }}>{s.emoji}</span>
                      <div style={{ fontWeight:800, fontSize:13, color:s.color }}>{s.label}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:9, color:'var(--text-muted)' }}>Achievability</div>
                      <div style={{ fontWeight:800, fontSize:12, color:s.achievabilityScore>=80?'#166534':s.achievabilityScore>=65?'#854d0e':'#dc2626' }}>
                        {s.achievabilityLabel} ({s.achievabilityScore}%)
                      </div>
                      <div style={{ fontSize:9, color:'var(--text-muted)' }}>{s.timeToAchieve}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10, minHeight:30 }}>{s.description}</div>

                  {/* Metric targets */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                    {[
                      ['Connects/day', s.targets.connectedCalls, 21],
                      ['AHT (sec)',    s.targets.ahtFirstCall,   780],
                      ['TTFA%',        (s.targets.adjustedTTFA*100).toFixed(0)+'%', '95%'],
                      ['PTT (min)',    s.targets.pureTaskTime,   145],
                    ].map(([label,val,target])=>(
                      <div key={label} style={{ background:'#f8fafc', borderRadius:6, padding:'6px 8px' }}>
                        <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</div>
                        <div style={{ fontWeight:800, fontSize:14, color:s.color }}>{val}</div>
                        <div style={{ fontSize:9, color:'var(--text-muted)' }}>target: {target}</div>
                      </div>
                    ))}
                  </div>

                  {/* Projected outcome */}
                  <div style={{ display:'flex', justifyContent:'space-between', background:s.color+'10', borderRadius:6, padding:'6px 10px' }}>
                    <div style={{ fontSize:11 }}>
                      <div style={{ color:'var(--text-muted)', fontSize:9 }}>BSC</div>
                      <div style={{ fontWeight:800 }}>{s.projectedBSC.toFixed(1)} <span style={{ color:s.bscDelta>0?'#166534':'#dc2626', fontSize:10 }}>({s.bscDelta>0?'+':''}{s.bscDelta.toFixed(1)})</span></div>
                    </div>
                    <div style={{ fontSize:11 }}>
                      <div style={{ color:'var(--text-muted)', fontSize:9 }}>Rank</div>
                      <div style={{ fontWeight:800 }}>#{s.projectedRank}</div>
                    </div>
                    <div style={{ fontSize:11 }}>
                      <div style={{ color:'var(--text-muted)', fontSize:9 }}>Payout</div>
                      <div style={{ fontWeight:800, color:'#166534' }}>{formatINR(s.projectedPayout)}</div>
                    </div>
                    <div style={{ fontSize:11 }}>
                      <div style={{ color:'var(--text-muted)', fontSize:9 }}>Δ Payout</div>
                      <div style={{ fontWeight:800, color:s.payoutDelta>0?'#166534':s.payoutDelta===0?'#6b7280':'#dc2626' }}>
                        {s.payoutDelta>0?'+':''}{formatINR(s.payoutDelta)}
                      </div>
                    </div>
                  </div>

                  {/* Coaching notes (on selection) */}
                  {isSelected && (
                    <div style={{ marginTop:10 }}>
                      {s.coachingNotes.map((note,i)=>(
                        <div key={i} style={{ fontSize:11, padding:'4px 0', borderTop:'1px solid #f1f5f9', color:'var(--text-secondary)', display:'flex', gap:6 }}>
                          <span style={{ color:s.color, fontWeight:700, flexShrink:0 }}>→</span>{note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────
export default function IncentiveIntelligence() {
  const { state } = useApp();
  const { bscData, effortData, absenceOverrides } = state;
  const [expandedAdvisor, setExpandedAdvisor] = useState(null);
  const [tlFilter,  setTlFilter]  = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter,  setPaFilter]  = useState([]);
  const [sortKey,   setSortKey]   = useState('rank');
  const [sortDir,   setSortDir]   = useState('asc');

  if (!bscData) return (
    <div className="empty-state"><div className="empty-icon">🏆</div><h3>No BSC Data</h3><p>Upload the BSC Excel workbook to activate Incentive Intelligence.</p></div>
  );

  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides).filter(n=>(absenceOverrides[n]||[]).length>0));
  const uniqueTLs   = [...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a=>a.apm).filter(Boolean))].sort();
  const uniquePAs   = allAdvisors.map(a=>a.name).sort();

  const advisors = useMemo(() => {
    let list = allAdvisors.filter(a=>!absentNames.has(a.name));
    if (tlFilter.length)  list = list.filter(a=>tlFilter.includes(a.tl));
    if (apmFilter.length) list = list.filter(a=>apmFilter.includes(a.apm));
    if (paFilter.length)  list = list.filter(a=>paFilter.includes(a.name));
    return list.sort((a,b) => {
      const av=a[sortKey]??0, bv=b[sortKey]??0;
      return sortDir==='asc'?(av>bv?1:-1):(av<bv?1:-1);
    });
  }, [allAdvisors, tlFilter, apmFilter, paFilter, sortKey, sortDir, absentNames]);

  const qualified   = advisors.filter(a=>a.qualification?.qualified);
  const atRisk      = advisors.filter(a=>a.qualification?.pdStatus==='At Risk');
  const projPool    = qualified.reduce((s,a)=>s+(a.payout||0),0);
  const green       = advisors.filter(a=>a.bscScore>=71);
  const yellow      = advisors.filter(a=>a.bscScore>=60&&a.bscScore<71);
  const red         = advisors.filter(a=>a.bscScore<60);

  const handleSort = k => { if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(k); setSortDir('asc'); } };
  const isFiltered = tlFilter.length > 0 || apmFilter.length > 0 || paFilter.length > 0;
  const toggleSim  = name => setExpandedAdvisor(v => v===name ? null : name);

  const donutData = [
    { label:'Green (71-100)', value:green.length,  color:'#16a34a' },
    { label:'Yellow (60-70)', value:yellow.length, color:'#ca8a04' },
    { label:'Red (0-60)',     value:red.length,    color:'#dc2626' },
  ];

  const COL_HEADERS = [
    ['rank','Rank'],['name','PA Name'],['empId','EMP ID'],
    ['tl','TL'],['apm','APM'],['region','Region'],
    ['productiveDays','Prod Days'],['bscScore','BSC'],
    ['connectedCalls','Connects'],['ahtFirstCall','AHT (s)'],
    ['adjustedTTFA','TTFA %'],['pureTaskTime','PTT (min)'],
    ['slab','Slab'],['payout','Payout ₹'],['status','Status'],
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Filters */}
      <div className="card" style={{ padding:'10px 14px' }}>
        <div className="filter-bar" style={{alignItems:"center"}} style={{ marginBottom:0 }}>
          <MultiSelect label="TL"  options={uniqueTLs}  value={tlFilter}  onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA"  options={uniquePAs}  value={paFilter}  onChange={setPaFilter} searchable />
          {(tlFilter.length||apmFilter.length||paFilter.length)>0&&<button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setPaFilter([]);}}>✕ Clear</button>}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{advisors.length} advisors</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Total Advisors',    value:advisors.length, sub:`${absentNames.size} absent`, accent:'#6366f1' },
          { label:'Qualified',         value:qualified.length, sub:pctDisp(qualified.length/Math.max(advisors.length,1)), accent:'#16a34a' },
          { label:'At Risk',           value:atRisk.length, sub:pctDisp(atRisk.length/Math.max(advisors.length,1)), accent:'#f59e0b' },
          { label:'Critical (<60 BSC)',value:red.length, sub:pctDisp(red.length/Math.max(advisors.length,1)), accent:'#dc2626' },
          { label:'Projected Pool',    value:formatINR(projPool), sub:`${qualified.length} advisors`, accent:'#8b5cf6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{background:s.accent}}/><div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:20}}>{s.value}</div><div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:14 }}>
        <div className="card"><div className="card-title">BSC Distribution</div>
          <DonutChart data={donutData} total={advisors.length} label="Advisors" size={130}/>
          <div style={{marginTop:8}}>{donutData.map(d=>(
            <div key={d.label} style={{display:'flex',justifyContent:'space-between',fontSize:10,padding:'2px 0'}}>
              <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:8,height:8,borderRadius:1,background:d.color}}/><span>{d.label}</span></div>
              <span style={{fontWeight:700}}>{d.value} ({pctDisp(d.value/Math.max(advisors.length,1))})</span>
            </div>
          ))}</div>
        </div>
        <div className="card"><div className="card-title">BSC Trend — Last 7 Days</div>
          <BSCTrendChart trendData={bscData.l7dTrend} advisors={advisors}/>
        </div>
      </div>

      {/* Sort controls */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>Sort by:</span>
        {[['rank','Rank'],['bscScore','BSC'],['payout','Payout'],['productiveDays','Prod Days']].map(([k,l])=>(
          <button key={k} className={`btn btn-sm ${sortKey===k?'btn-primary':'btn-outline'}`} onClick={()=>handleSort(k)}>
            {l} {sortKey===k?(sortDir==='asc'?'↑':'↓'):''}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:'var(--text-muted)' }}>
          💡 Click "Simulate" below any advisor name to see 3 improvement scenarios
        </span>
      </div>

      {/* Main Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {COL_HEADERS.map(([k,l])=>(
                <th key={k} onClick={()=>handleSort(k)} style={{ textAlign:['name','tl','apm'].includes(k)?'left':'center', cursor:'pointer' }}>
                  {l} {sortKey===k?(sortDir==='asc'?'↑':'↓'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {advisors.map(a => {
              const qs = a.qualification||{};
              const scCls = qs.pdStatus==='Met'?'badge-green':qs.pdStatus==='On Track'?'badge-blue':qs.pdStatus==='At Risk'?'badge-yellow':'badge-red';
              const isExpanded = expandedAdvisor === a.name;
              return (
                <>
                  <tr key={a.name} style={{ background:isExpanded?'#f0fdf4':'', borderLeft:isExpanded?'3px solid var(--em-green)':'3px solid transparent' }}>
                    <td><span className={`rank-badge ${a.rank<=7?'top7':a.rank<=15?'top15':a.rank<=23?'top23':''}`}>{a.rank}</span></td>
                    <td style={{ textAlign:'left' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{a.name}</div>
                      <button
                        onClick={()=>toggleSim(a.name)}
                        style={{ fontSize:10, color:isExpanded?'#dc2626':'var(--em-green)', background:'none', border:'none', cursor:'pointer', fontWeight:700, padding:'1px 0', display:'block', marginTop:2 }}>
                        {isExpanded ? '▲ Hide Scenarios' : '▼ Simulate'}
                      </button>
                    </td>
                    <td style={{ fontSize:11, color:'var(--text-muted)' }}>{a.empId||'—'}</td>
                    <td style={{ textAlign:'left', fontSize:11 }}>{a.tl||'—'}</td>
                    <td style={{ textAlign:'left', fontSize:11 }}>{a.apm||'—'}</td>
                    <td><span className={`badge badge-${a.region==='US'?'blue':'green'}`}>{a.region}</span></td>
                    <td>
                      <div>{a.productiveDays}</div>
                      {qs.needed>0&&<div style={{fontSize:9,color:'#f59e0b'}}>{qs.needed} more needed</div>}
                    </td>
                    <td><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(2)||'—'}</span></td>
                    <td>{a.connectedCalls != null ? Math.round(a.connectedCalls) : '—'}</td>
                    <td>{a.ahtFirstCall != null ? Math.round(a.ahtFirstCall) : '—'}</td>
                    <td>{a.adjustedTTFA != null ? Math.round(a.adjustedTTFA > 1 ? a.adjustedTTFA : a.adjustedTTFA*100)+'%' : '—'}</td>
                    <td>{a.pureTaskTime != null ? Math.round(a.pureTaskTime) : '—'}</td>
                    <td style={{ fontSize:11, fontWeight:600 }}>{a.slab||'—'}</td>
                    <td style={{ fontWeight:800, color:a.payout>=80000?'#166534':a.payout>=40000?'#1e40af':'#6b7280' }}>
                      {a.payout>0?formatINR(a.payout):'—'}
                    </td>
                    <td><span className={`badge ${scCls}`}>{qs.pdStatus||'—'}</span></td>
                  </tr>
                  {isExpanded && (
                    <InlineScenario
                      key={a.name+'-sc'}
                      advisor={a}
                      totalAdvisors={allAdvisors.length}
                      onClose={()=>setExpandedAdvisor(null)}
                    />
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{textAlign:'left',fontWeight:800}}>TOTAL / AVG ({advisors.length})</td>
              <td style={{fontWeight:700}}>{(advisors.reduce((s,a)=>s+(a.productiveDays||0),0)/Math.max(advisors.length,1)).toFixed(1)}</td>
              <td><span className="bsc-badge bsc-green">{(advisors.reduce((s,a)=>s+(a.bscScore||0),0)/Math.max(advisors.length,1)).toFixed(1)}</span></td>
              <td colSpan={5}/>
              <td style={{fontWeight:800,color:'#166534'}}>{formatINR(qualified.reduce((s,a)=>s+(a.payout||0),0))}</td>
              <td/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
