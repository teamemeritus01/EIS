import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getMinProductiveDays, formatINR, getWorkingDaysRemaining } from '../../constants/businessRules.js';
import PageExportButton from '../shared/PageExportButton.jsx';
import MultiSelect from '../shared/MultiSelect.jsx';

export default function AtRiskTracker() {
  const { state } = useApp();
  const { bscData, absenceOverrides } = state;
  const [tlFilter, setTlFilter]   = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [riskFilter, setRiskFilter] = useState([]);
  const [sortKey, setSortKey] = useState('riskScore');
  const [sortDir, setSortDir] = useState('desc');

  if (!bscData) return <div className="empty-state"><div className="empty-icon">⚠</div><h3>No Data Loaded</h3></div>;

  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));
  const remaining   = getWorkingDaysRemaining();
  const uniqueTLs   = [...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a => a.apm).filter(Boolean))].sort();

  const calcRisk = (a) => {
    const { bscScore, productiveDays, region, qualification } = a;
    const minPD = getMinProductiveDays(region);
    const pdNeeded = Math.max(0, minPD - productiveDays);
    const pdPct = productiveDays / minPD;
    const bscGap = Math.max(0, 60 - bscScore);
    let score = 0;
    const risks = [];
    // PD risk
    if (pdNeeded > remaining) { score += 40; risks.push({ type:'Productive Days', severity:'critical', msg:`Needs ${pdNeeded} PD but only ${remaining} days left` }); }
    else if (pdNeeded > remaining * 0.7) { score += 25; risks.push({ type:'Productive Days', severity:'high', msg:`Needs ${pdNeeded} more PD — tight window` }); }
    else if (pdNeeded > 0) { score += 10; risks.push({ type:'Productive Days', severity:'medium', msg:`${pdNeeded} PD still needed` }); }
    // BSC risk
    if (bscScore < 55) { score += 35; risks.push({ type:'BSC Score', severity:'critical', msg:`BSC ${bscScore.toFixed(1)} — ${bscGap.toFixed(1)} below threshold` }); }
    else if (bscScore < 60) { score += 20; risks.push({ type:'BSC Score', severity:'high', msg:`BSC ${bscScore.toFixed(1)} — just below 60 threshold` }); }
    else if (bscScore < 65) { score += 8; risks.push({ type:'BSC Score', severity:'medium', msg:`BSC ${bscScore.toFixed(1)} — at risk of dropping below 60` }); }
    // Slab risk
    if (a.payout > 0 && a.rank > 60) { score += 10; risks.push({ type:'Slab Risk', severity:'medium', msg:`Rank ${a.rank} — at risk of 0 payout zone` }); }
    // Absent risk
    if (absentNames.has(a.name)) { score += 15; risks.push({ type:'Attendance', severity:'high', msg:'Currently marked absent' }); }
    return { score: Math.min(score, 100), risks };
  };

  const advisorsWithRisk = useMemo(() => {
    let list = allAdvisors.map(a => ({ ...a, ...calcRisk(a) }));
    list = list.filter(a => a.score > 0);
    if (tlFilter.length)    list = list.filter(a => tlFilter.includes(a.tl));
    if (apmFilter.length)   list = list.filter(a => apmFilter.includes(a.apm));
    if (riskFilter.length)  list = list.filter(a => a.risks.some(r => riskFilter.includes(r.type)));
    return list.sort((a,b) => sortDir==='desc'? b[sortKey]-a[sortKey] : a[sortKey]-b[sortKey]);
  }, [allAdvisors, tlFilter, apmFilter, riskFilter, sortKey, sortDir, absenceOverrides]);

  const critical = advisorsWithRisk.filter(a => a.score >= 60);
  const high     = advisorsWithRisk.filter(a => a.score >= 30 && a.score < 60);
  const medium   = advisorsWithRisk.filter(a => a.score < 30);

  const RISK_TYPES = ['Productive Days','BSC Score','Slab Risk','Attendance'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Total At-Risk', value:advisorsWithRisk.length, accent:'#f59e0b' },
          { label:'Critical (Score ≥60)', value:critical.length, accent:'#dc2626' },
          { label:'High (Score 30-59)', value:high.length, accent:'#f97316' },
          { label:'Medium (Score <30)', value:medium.length, accent:'#eab308' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding:'12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <MultiSelect label="TL" options={uniqueTLs} value={tlFilter} onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="Risk Type" options={RISK_TYPES} value={riskFilter} onChange={setRiskFilter} />
          <select className="filter-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
            <option value="riskScore">Sort: Risk Score</option>
            <option value="bscScore">Sort: BSC</option>
            <option value="productiveDays">Sort: Prod Days</option>
          </select>
          {(tlFilter.length||apmFilter.length||riskFilter.length)>0&&<button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setRiskFilter([]);}}>✕ Clear</button>}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{advisorsWithRisk.length} at-risk advisors</span>
        </div>
      </div>

              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <PageExportButton data={bscData?.advisors||[]} filteredData={filtered} type="bsc" label="Export At-Risk"/>
        </div>
<div className="table-wrap">
        <table className="data-table">
          <thead><tr>
            <th style={{ textAlign:'left' }}>PA Name</th>
            <th style={{ textAlign:'left' }}>TL / APM</th>
            <th>Risk Score</th>
            <th>BSC</th>
            <th>Prod Days</th>
            <th>PD Needed</th>
            <th>Days Left</th>
            <th style={{ textAlign:'left' }}>Risk Factors</th>
            <th>Payout at Risk</th>
          </tr></thead>
          <tbody>
            {advisorsWithRisk.map(a => {
              const minPD = getMinProductiveDays(a.region);
              const pdNeeded = Math.max(0, minPD - a.productiveDays);
              const severityColor = a.score>=60?'#dc2626':a.score>=30?'#f97316':'#eab308';
              return (
                <tr key={a.name} style={{ background: a.score>=60?'#fff5f5':a.score>=30?'#fff7ed':'' }}>
                  <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                  <td style={{ textAlign:'left', fontSize:12, lineHeight:1.4 }}>
                    <div>{a.tl||'—'}</div>
                    <div style={{ color:'var(--text-muted)' }}>{a.apm||'—'}</div>
                  </td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:severityColor+'20', border:`2px solid ${severityColor}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:severityColor }}>{a.score}</div>
                    </div>
                  </td>
                  <td><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(1)}</span></td>
                  <td>{a.productiveDays} / {minPD}</td>
                  <td style={{ color: pdNeeded>remaining?'#dc2626':'inherit', fontWeight: pdNeeded>remaining?700:400 }}>{pdNeeded > 0 ? pdNeeded : '✓'}</td>
                  <td>{remaining}</td>
                  <td style={{ textAlign:'left' }}>
                    {a.risks.map((r, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, marginBottom:2 }}>
                        <span style={{ color: r.severity==='critical'?'#dc2626':r.severity==='high'?'#f97316':'#eab308', fontWeight:700 }}>●</span>
                        <span>{r.msg}</span>
                      </div>
                    ))}
                  </td>
                  <td style={{ fontWeight:700, color:'#dc2626' }}>{a.payout>0?formatINR(a.payout):'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {advisorsWithRisk.length===0&&<div className="empty-state"><div>✅</div><h3>No At-Risk Advisors</h3><p>All advisors are on track for the current filters.</p></div>}
    </div>
  );
}
