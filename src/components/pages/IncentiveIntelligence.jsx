import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getBSCColorClass, formatINR, getWorkingDaysElapsed, getWorkingDaysRemaining } from '../../constants/businessRules.js';
import { generateScenarios, calcEffortScore } from '../../engines/scenarioEngine.js';
import MultiSelect from '../shared/MultiSelect.jsx';

import DonutChart from '../shared/DonutChart.jsx';
import BSCTrendChart from '../shared/BSCTrendChart.jsx';

function pctDisp(val) {
  if (val===null||val===undefined) return '—';
  const v = val > 1 ? val : val * 100;
  return Math.round(v) + '%';
}

export default function IncentiveIntelligence() {
  const { state, getFilteredAdvisors } = useApp();
  const { bscData, effortData, absenceOverrides } = state;
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);
  const [tlFilter, setTlFilter] = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter, setPaFilter] = useState([]);
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');

  if (!bscData) return (
    <div className="empty-state"><div className="empty-icon">📊</div><h3>No BSC Data Loaded</h3><p>Upload your BSC Excel workbook to activate Incentive Intelligence.</p></div>
  );

  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));

  // Multi-select filters
  const advisors = useMemo(() => {
    let list = allAdvisors.filter(a => !absentNames.has(a.name));
    if (tlFilter.length)  list = list.filter(a => tlFilter.includes(a.tl));
    if (apmFilter.length) list = list.filter(a => apmFilter.includes(a.apm));
    if (paFilter.length)  list = list.filter(a => paFilter.includes(a.name));
    return list;
  }, [allAdvisors, tlFilter, apmFilter, paFilter, absentNames]);

  const sorted = useMemo(() => {
    return [...advisors].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [advisors, sortKey, sortDir]);

  const qualified   = advisors.filter(a => a.qualification?.qualified);
  const atRisk      = advisors.filter(a => a.qualification?.pdStatus === 'At Risk');
  const offTrack    = advisors.filter(a => a.qualification?.pdStatus === 'Off Track');
  const critical    = advisors.filter(a => a.bscScore < 60);
  const projPool    = qualified.reduce((s, a) => s + (a.payout || 0), 0);
  const green       = advisors.filter(a => a.bscScore >= 71);
  const yellow      = advisors.filter(a => a.bscScore >= 60 && a.bscScore < 71);
  const red         = advisors.filter(a => a.bscScore < 60);

  const uniqueTLs  = [...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const uniqueAPMs = [...new Set(allAdvisors.map(a => a.apm).filter(Boolean))].sort();
  const uniquePAs  = allAdvisors.map(a => a.name).sort();

  const effortSummary = effortData?.aggregated || {};
  const getEffortScore = (name) => {
    const d = effortSummary[name];
    if (!d) return null;
    const dates = Object.values(d);
    const totalDials = dates.reduce((s, x) => s + x.dials, 0);
    const totalConn  = dates.reduce((s, x) => s + x.connected, 0);
    const totalPTT   = dates.reduce((s, x) => s + x.pttMinutes, 0);
    const days = dates.length || 1;
    return calcEffortScore(totalDials / days, totalConn / totalDials, totalPTT / days);
  };

  const scenario = selectedAdvisor ? generateScenarios(selectedAdvisor, allAdvisors.length) : null;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const donutData = [
    { label: 'Green (71-100)', value: green.length, color: '#16a34a' },
    { label: 'Yellow (60-70)', value: yellow.length, color: '#ca8a04' },
    { label: 'Red (0-60)',     value: red.length,    color: '#dc2626' },
  ];

  const trendData = bscData.l7dTrend || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FILTERS */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <MultiSelect label="TL" options={uniqueTLs} value={tlFilter} onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA" options={uniquePAs} value={paFilter} onChange={setPaFilter} placeholder="Search PA..." searchable />
          {(tlFilter.length || apmFilter.length || paFilter.length) > 0 && (
            <button className="btn btn-outline btn-sm" onClick={() => { setTlFilter([]); setApmFilter([]); setPaFilter([]); }}>✕ Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{advisors.length} advisors</span>
        </div>
      </div>

      {/* TOP STATS STRIP — Incentive */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        {[
          { label:'Total Advisors',       value:advisors.length, sub:`${absentNames.size} absent`, accent:'#6366f1' },
          { label:'Qualified',            value:qualified.length, sub:`${(qualified.length/Math.max(advisors.length,1)*100).toFixed(1)}%`, accent:'#16a34a' },
          { label:'At Risk',              value:atRisk.length, sub:`${(atRisk.length/Math.max(advisors.length,1)*100).toFixed(1)}%`, accent:'#f59e0b' },
          { label:'Critical (<60 BSC)',   value:critical.length, sub:`${(critical.length/Math.max(advisors.length,1)*100).toFixed(1)}%`, accent:'#dc2626' },
          { label:'Projected Pool',       value:formatINR(projPool), sub:`${qualified.length} advisors`, accent:'#8b5cf6', big:true },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background: s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: s.big ? 20 : 28 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* CHARTS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title">BSC Distribution</div>
          <DonutChart data={donutData} total={advisors.length} label="Advisors" size={180} />
          <div style={{ marginTop: 12 }}>
            {donutData.map(d => (
              <div key={d.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:d.color }} />
                  <span>{d.label}</span>
                </div>
                <span style={{ fontWeight:700 }}>{d.value} ({(d.value/Math.max(advisors.length,1)*100).toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">BSC Trend — Last 7 Days</div>
          <BSCTrendChart trendData={trendData} advisors={advisors} />
        </div>
      </div>

      {/* MAIN TABLE */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <span>Advisor Incentive Intelligence</span>
          <div style={{ display:'flex', gap:8 }}>
            <select className="filter-select" style={{ fontSize:11 }} value={sortKey} onChange={e=>setSortKey(e.target.value)}>
              <option value="rank">Sort: Rank</option>
              <option value="bscScore">Sort: BSC</option>
              <option value="payout">Sort: Payout</option>
              <option value="productiveDays">Sort: Prod Days</option>
              <option value="name">Sort: Name</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => setSortDir(d => d==='asc'?'desc':'asc')}>
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['rank','name','empId','tl','apm','region','productiveDays','bscScore','connectedCalls','ahtFirstCall','adjustedTTFA','pureTaskTime','slab','payout','status'].map(k => (
                  <th key={k} onClick={() => handleSort(k)} style={k==='name'||k==='tl'||k==='apm'?{textAlign:'left'}:{}}>
                    {COL_LABELS[k]} {sortKey===k ? (sortDir==='asc'?'↑':'↓') : ''}
                  </th>
                ))}
                <th>Scenario</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => {
                const qs = a.qualification || {};
                const statusColor = qs.pdStatus==='Met'?'badge-green':qs.pdStatus==='On Track'?'badge-blue':qs.pdStatus==='At Risk'?'badge-yellow':'badge-red';
                return (
                  <tr key={a.name} style={{ background: selectedAdvisor?.name===a.name?'#f0fdf4':'' }}>
                    <td><span className={`rank-badge ${a.rank<=7?'top7':a.rank<=15?'top15':a.rank<=23?'top23':''}`}>{a.rank}</span></td>
                    <td style={{ textAlign:'left', fontWeight:700, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</td>
                    <td style={{ fontSize:11, color:'var(--text-muted)' }}>{a.empId||'—'}</td>
                    <td style={{ textAlign:'left', fontSize:12 }}>{a.tl||'—'}</td>
                    <td style={{ textAlign:'left', fontSize:12 }}>{a.apm||'—'}</td>
                    <td><span className={`badge badge-${a.region==='US'?'blue':'green'}`}>{a.region}</span></td>
                    <td>
                      <div>{a.productiveDays}</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>{qs.needed>0?`${qs.needed} needed`:''}</div>
                    </td>
                    <td><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(1)||'—'}</span></td>
                    <td>{a.connectedCalls?.toFixed(1)||'—'}</td>
                    <td>{a.ahtFirstCall?.toFixed(0)||'—'}</td>
                    <td>{a.adjustedTTFA!=null?(a.adjustedTTFA>1?a.adjustedTTFA.toFixed(1):( a.adjustedTTFA*100).toFixed(1))+'%':'—'}</td>
                    <td>{a.pureTaskTime?.toFixed(1)||'—'}</td>
                    <td><span style={{ fontSize:11, fontWeight:600 }}>{a.slab||'—'}</span></td>
                    <td style={{ fontWeight:800, color: a.payout>=80000?'#166534':a.payout>=40000?'#1e40af':'#6b7280' }}>
                      {a.payout>0?formatINR(a.payout):'—'}
                    </td>
                    <td><span className={`badge ${statusColor}`}>{qs.pdStatus||'—'}</span></td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => { setSelectedAdvisor(a); setActiveScenario(null); }}>
                        Simulate
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign:'left', fontWeight:700 }}>TOTAL ({sorted.length} advisors)</td>
                <td>{(sorted.reduce((s,a)=>s+(a.productiveDays||0),0)/Math.max(sorted.length,1)).toFixed(1)} avg</td>
                <td>{(sorted.reduce((s,a)=>s+(a.bscScore||0),0)/Math.max(sorted.length,1)).toFixed(1)} avg</td>
                <td colSpan={5} />
                <td style={{ fontWeight:800, color:'#166534' }}>{formatINR(sorted.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SCENARIO PANEL */}
      {selectedAdvisor && scenario && (
        <div className="card" style={{ border:'2px solid #3b82f6' }}>
          <div className="card-title" style={{ justifyContent:'space-between' }}>
            <span>🎯 Scenario Engine — {selectedAdvisor.name}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedAdvisor(null)}>✕ Close</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:20 }}>
            {/* Current state */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8 }}>CURRENT STATE</div>
              <div className="stat-card" style={{ marginBottom:12 }}>
                <div className="stat-label">BSC Score</div>
                <div className="stat-value">{scenario.currentBSC.toFixed(1)}</div>
                <div className="stat-sub">Rank #{scenario.currentRank} · {scenario.currentSlab}</div>
              </div>
              <div className="stat-card" style={{ marginBottom:12 }}>
                <div className="stat-label">Current Payout</div>
                <div className="stat-value" style={{ fontSize:18 }}>{formatINR(scenario.currentPayout)}</div>
              </div>
              <div className="stat-card" style={{ marginBottom:12 }}>
                <div className="stat-label">Qualification Prob.</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                  <div style={{ flex:1, height:8, background:'#e2e8f0', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${scenario.qualificationProbability}%`, background: scenario.qualificationProbability>=70?'#16a34a':scenario.qualificationProbability>=50?'#eab308':'#ef4444', borderRadius:4 }} />
                  </div>
                  <span style={{ fontWeight:800, fontSize:14 }}>{scenario.qualificationProbability}%</span>
                </div>
              </div>
              {!scenario.isEligible && (
                <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#991b1b' }}>
                  ⚠ {scenario.eligibilityMessage}
                </div>
              )}
            </div>
            {/* 3 Scenarios */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8 }}>CHOOSE YOUR PATH</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {scenario.scenarios.map(sc => (
                  <div key={sc.id}
                    onClick={() => setActiveScenario(activeScenario?.id===sc.id ? null : sc)}
                    style={{ border:`2px solid ${activeScenario?.id===sc.id?sc.color:'var(--border)'}`, borderRadius:10, padding:14, cursor:'pointer', background: activeScenario?.id===sc.id?sc.color+'12':'white', transition:'all .15s' }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{sc.emoji}</div>
                    <div style={{ fontWeight:800, fontSize:13, color:sc.color }}>{sc.label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>{sc.description}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                      <div style={{ background:'#f8fafc', borderRadius:6, padding:'6px 8px' }}>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>Proj. BSC</div>
                        <div style={{ fontWeight:800, fontSize:14 }}>{sc.projectedBSC.toFixed(1)}</div>
                        <div style={{ fontSize:10, color: sc.bscDelta>0?'#16a34a':'#dc2626' }}>{sc.bscDelta>0?'+':''}{sc.bscDelta.toFixed(1)}</div>
                      </div>
                      <div style={{ background:'#f8fafc', borderRadius:6, padding:'6px 8px' }}>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>Proj. Payout</div>
                        <div style={{ fontWeight:800, fontSize:12, color:'#166534' }}>{formatINR(sc.projectedPayout)}</div>
                        <div style={{ fontSize:10, color: sc.payoutDelta>0?'#16a34a':sc.payoutDelta===0?'#6b7280':'#dc2626' }}>
                          {sc.payoutDelta>0?'+':''}{formatINR(sc.payoutDelta)}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop:10 }}>
                      {sc.actions.slice(0,2).map((act,i) => (
                        <div key={i} style={{ fontSize:11, padding:'4px 0', borderTop:'1px solid #f1f5f9', color:'var(--text-secondary)' }}>
                          <span style={{ fontWeight:600, color:sc.color }}>{act.metric}: </span>{act.action}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {activeScenario && (
                <div style={{ marginTop:12, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:8, color:'#166534' }}>📋 {activeScenario.label} — Daily Targets</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 }}>
                    {[
                      { label:'Connects/Day', val:activeScenario.targets.connectedCalls, target:21 },
                      { label:'AHT (sec)',     val:activeScenario.targets.ahtFirstCall,   target:780 },
                      { label:'TTFA%',         val:(activeScenario.targets.adjustedTTFA*100).toFixed(1)+'%', target:'95%' },
                      { label:'PTT (min)',      val:activeScenario.targets.pureTaskTime,   target:145 },
                    ].map(m => (
                      <div key={m.label} style={{ background:'white', borderRadius:6, padding:'8px 10px', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>{m.label}</div>
                        <div style={{ fontWeight:800, fontSize:16, color:activeScenario.color }}>{m.val}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>target: {m.target}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#166534', fontStyle:'italic' }}>
                    Select this scenario to set as your daily coaching target. Rank #{activeScenario.projectedRank} · {activeScenario.slab} · {formatINR(activeScenario.projectedPayout)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const COL_LABELS = {
  rank:'Rank', name:'PA Name', empId:'EMP ID', tl:'TL', apm:'APM', region:'Region',
  productiveDays:'Prod Days', bscScore:'BSC', connectedCalls:'Connects',
  ahtFirstCall:'AHT(s)', adjustedTTFA:'TTFA%', pureTaskTime:'PTT(min)',
  slab:'Slab', payout:'Payout ₹', status:'Status',
};
