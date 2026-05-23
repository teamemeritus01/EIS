import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { generateScenarios } from '../../engines/scenarioEngine.js';
import { formatINR } from '../../constants/businessRules.js';
import MultiSelect from '../shared/MultiSelect.jsx';

export default function ScenarioEngine() {
  const { state } = useApp();
  const { bscData } = state;
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [activeScenario, setActiveScenario]   = useState(null);
  const [viewMode, setViewMode] = useState('pa'); // 'pa' | 'apm' | 'tl'
  const [search, setSearch]     = useState('');
  const [tlFilter, setTlFilter] = useState([]);

  if (!bscData) return <div className="empty-state"><div className="empty-icon">🎯</div><h3>No Data Loaded</h3></div>;

  const allAdvisors = bscData.advisors || [];
  const uniqueTLs   = [...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();

  const filteredAdvisors = allAdvisors
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()))
    .filter(a => !tlFilter.length || tlFilter.includes(a.tl));

  const scenario = selectedAdvisor ? generateScenarios(selectedAdvisor, allAdvisors.length) : null;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, alignItems:'start' }}>
      {/* Left: Advisor picker */}
      <div className="card" style={{ position:'sticky', top:0 }}>
        <div className="card-title">Select Advisor</div>
        <div style={{ display:'flex', gap:6, marginBottom:10 }}>
          {['pa','apm','tl'].map(m=>(
            <button key={m} className={`btn btn-sm ${viewMode===m?'btn-primary':'btn-outline'}`} onClick={()=>setViewMode(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <input className="search-input" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:'100%', marginBottom:8 }} />
        <MultiSelect label="TL Filter" options={uniqueTLs} value={tlFilter} onChange={setTlFilter} />
        <div style={{ marginTop:8, maxHeight:500, overflowY:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
          {filteredAdvisors.map(a=>(
            <div key={a.name}
              onClick={()=>{ setSelectedAdvisor(a); setActiveScenario(null); }}
              style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', background:selectedAdvisor?.name===a.name?'#f0fdf4':'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{a.name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>#{a.rank} · {a.tl?.split(' ')[0]}</div>
              </div>
              <span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Scenario output */}
      {!scenario ? (
        <div className="empty-state card"><div className="empty-icon">🎯</div><h3>Select an Advisor</h3><p>Choose any advisor from the left panel to generate 3 personalized improvement scenarios.</p></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Header */}
          <div className="card" style={{ background:'linear-gradient(135deg,#0f172a,#166534)', color:'white', border:'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800 }}>{scenario.advisor}</div>
                <div style={{ fontSize:12, opacity:.8 }}>Rank #{scenario.currentRank} · {scenario.currentSlab} · {scenario.isEligible?'✅ Eligible':'❌ Not Yet Eligible'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, opacity:.7 }}>CURRENT PAYOUT</div>
                <div style={{ fontSize:24, fontWeight:900 }}>{formatINR(scenario.currentPayout)}</div>
              </div>
            </div>
            <div style={{ marginTop:12, display:'flex', gap:20 }}>
              {[
                { label:'BSC', value:scenario.currentBSC.toFixed(1) },
                { label:'Qual. Probability', value:scenario.qualificationProbability+'%' },
                { label:'PD Needed', value:scenario.productiveDaysNeeded>0?scenario.productiveDaysNeeded+' more':'✓ Met' },
                { label:'Days Remaining', value:scenario.remaining },
              ].map(s=>(
                <div key={s.label} style={{ background:'rgba(255,255,255,.1)', borderRadius:8, padding:'8px 12px', minWidth:80 }}>
                  <div style={{ fontSize:10, opacity:.7 }}>{s.label}</div>
                  <div style={{ fontWeight:800, fontSize:14 }}>{s.value}</div>
                </div>
              ))}
            </div>
            {!scenario.isEligible && (
              <div style={{ marginTop:10, background:'rgba(220,38,38,.2)', borderRadius:6, padding:'8px 12px', fontSize:12 }}>
                ⚠ Path to eligibility: {scenario.eligibilityMessage}
              </div>
            )}
          </div>

          {/* 3 Scenarios */}
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)' }}>
            {scenario.isEligible ? 'SLAB IMPROVEMENT SCENARIOS' : 'ELIGIBILITY + SLAB IMPROVEMENT SCENARIOS'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {scenario.scenarios.map(sc=>(
              <div key={sc.id}
                onClick={()=>setActiveScenario(activeScenario?.id===sc.id?null:sc)}
                style={{ border:`2px solid ${activeScenario?.id===sc.id?sc.color:'var(--border)'}`, borderRadius:12, padding:16, cursor:'pointer', background:activeScenario?.id===sc.id?sc.color+'10':'white', transition:'all .15s' }}>
                <div style={{ fontSize:24, marginBottom:6 }}>{sc.emoji}</div>
                <div style={{ fontWeight:800, fontSize:14, color:sc.color, marginBottom:4 }}>{sc.label}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12, minHeight:32 }}>{sc.description}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                  <div style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
                    <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>Proj. BSC</div>
                    <div style={{ fontWeight:900, fontSize:18 }}>{sc.projectedBSC.toFixed(1)}</div>
                    <div style={{ fontSize:10, color:sc.bscDelta>0?'#166534':'#dc2626', fontWeight:700 }}>{sc.bscDelta>0?'+':''}{sc.bscDelta.toFixed(1)} pts</div>
                  </div>
                  <div style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
                    <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase' }}>Proj. Payout</div>
                    <div style={{ fontWeight:900, fontSize:14, color:'#166534' }}>{formatINR(sc.projectedPayout)}</div>
                    <div style={{ fontSize:10, color:sc.payoutDelta>0?'#166534':sc.payoutDelta===0?'#6b7280':'#dc2626', fontWeight:700 }}>
                      {sc.payoutDelta>0?'+':''}{formatINR(Math.abs(sc.payoutDelta))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>Daily targets:</div>
                {[
                  ['Connects', sc.targets.connectedCalls+'/day', 21],
                  ['AHT', sc.targets.ahtFirstCall+'s', 780],
                  ['TTFA', (sc.targets.adjustedTTFA*100).toFixed(0)+'%', '95%'],
                  ['PTT', sc.targets.pureTaskTime+' min', 145],
                ].map(([k,v,t])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', borderTop:'1px solid #f1f5f9' }}>
                    <span style={{ color:'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight:700, color:sc.color }}>{v}</span>
                    <span style={{ color:'var(--text-muted)', fontSize:10 }}>/{t}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, textAlign:'center', fontSize:11, fontWeight:600, color:sc.color, background:sc.color+'10', borderRadius:6, padding:'4px 0' }}>
                  Rank #{sc.projectedRank} · {sc.slab}
                </div>
              </div>
            ))}
          </div>

          {/* Actions for selected scenario */}
          {activeScenario && (
            <div className="card" style={{ border:`2px solid ${activeScenario.color}` }}>
              <div className="card-title">📋 {activeScenario.emoji} {activeScenario.label} — Recommended Actions</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:10 }}>
                {activeScenario.actions.map((act,i)=>(
                  <div key={i} style={{ background:'#f8fafc', borderRadius:8, padding:'12px 14px', borderLeft:`3px solid ${activeScenario.color}` }}>
                    <div style={{ fontWeight:700, fontSize:12, color:activeScenario.color, marginBottom:4 }}>{act.metric}</div>
                    <div style={{ fontSize:12, marginBottom:4 }}>{act.action}</div>
                    <div style={{ fontSize:11, color:'#166534', fontWeight:600 }}>{act.impact}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
