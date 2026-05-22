import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { calcEffortScore } from '../../engines/scenarioEngine.js';
import { METRIC_TARGETS } from '../../constants/businessRules.js';
import MultiSelect from '../shared/MultiSelect.jsx';

export default function EffortIntelligence() {
  const { state } = useApp();
  const { effortData, bscData, absenceOverrides } = state;
  const [tlFilter, setTlFilter]   = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [sortKey, setSortKey]     = useState('effortScore');
  const [sortDir, setSortDir]     = useState('desc');

  if (!effortData) return (
    <div className="empty-state"><div className="empty-icon">📞</div><h3>No Effort Data</h3><p>Upload your Raw Effort CSV to activate this module.</p></div>
  );

  const absentNames = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));
  const allAdvisors = bscData?.advisors || [];
  const uniqueTLs   = [...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a => a.apm).filter(Boolean))].sort();

  const advisorMap = useMemo(() => {
    const m = {};
    allAdvisors.forEach(a => { m[a.name] = a; });
    return m;
  }, [allAdvisors]);

  const effortRows = useMemo(() => {
    const agg = effortData.aggregated || {};
    let rows = Object.entries(agg).map(([name, dateMap]) => {
      const dates = Object.values(dateMap);
      const prodDays   = dates.filter(d => d.isProductiveDay).length;
      const totalDials = dates.reduce((s,d)=>s+d.dials,0);
      const totalConn  = dates.reduce((s,d)=>s+d.connected,0);
      const totalPTT   = dates.reduce((s,d)=>s+d.pttMinutes,0);
      const days = prodDays || 1;
      const connRate = totalDials > 0 ? totalConn / totalDials : 0;
      const avgPTT   = totalPTT / days;
      const bscAdv   = advisorMap[name];
      const effortScore = calcEffortScore(totalDials/days, connRate, avgPTT);
      return {
        name, prodDays, totalDials, totalConn, totalPTT, connRate,
        avgDials: totalDials/days, avgPTT, effortScore,
        tl: bscAdv?.tl, apm: bscAdv?.apm,
        absent: absentNames.has(name),
        warning: effortScore < 30 ? 'Low Activity' : effortScore < 50 ? 'Below Target' : null,
      };
    });
    if (tlFilter.length)  rows = rows.filter(r => tlFilter.includes(r.tl));
    if (apmFilter.length) rows = rows.filter(r => apmFilter.includes(r.apm));
    return rows.sort((a,b) => sortDir==='desc'?b[sortKey]-a[sortKey]:a[sortKey]-b[sortKey]);
  }, [effortData, advisorMap, tlFilter, apmFilter, sortKey, sortDir, absentNames]);

  const totals = useMemo(() => ({
    dials: effortRows.reduce((s,r)=>s+r.totalDials,0),
    conn:  effortRows.reduce((s,r)=>s+r.totalConn,0),
    ptt:   effortRows.reduce((s,r)=>s+r.totalPTT,0),
  }), [effortRows]);

  const connRate = totals.dials > 0 ? (totals.conn/totals.dials*100).toFixed(1) : '0';
  const dateRange = effortData.dateRange;

  const handleSort = (k) => { if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(k); setSortDir('desc'); } };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {dateRange && <div className="badge badge-blue" style={{ alignSelf:'flex-start' }}>📅 {dateRange.from} → {dateRange.to}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Total Dials',     value:totals.dials.toLocaleString(), accent:'#6366f1' },
          { label:'Connected Calls', value:totals.conn.toLocaleString(),  accent:'#16a34a' },
          { label:'PTT (min)',       value:Math.round(totals.ptt).toLocaleString(), accent:'#3b82f6' },
          { label:'Connect Rate',    value:connRate+'%', accent:'#f59e0b' },
          { label:'Advisors',        value:effortRows.length, accent:'#8b5cf6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding:'12px 16px' }}>
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <MultiSelect label="TL" options={uniqueTLs} value={tlFilter} onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <select className="filter-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
            <option value="effortScore">Sort: Effort Score</option>
            <option value="totalDials">Sort: Dials</option>
            <option value="totalConn">Sort: Connects</option>
            <option value="totalPTT">Sort: PTT</option>
            <option value="connRate">Sort: Connect Rate</option>
          </select>
          <button className="btn btn-outline btn-sm" onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}>{sortDir==='desc'?'↓':'↑'}</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr>
            {[['name','Advisor'],['tl','TL'],['apm','APM'],['totalDials','Total Dials'],['totalConn','Connected'],['connRate','Conn. Rate'],['totalPTT','PTT (min)'],['avgDials','Avg Dials/Day'],['avgPTT','Avg PTT/Day'],['prodDays','Prod Days'],['effortScore','Effort Score']].map(([k,l])=>(
              <th key={k} onClick={()=>handleSort(k)} style={['name','tl','apm'].includes(k)?{textAlign:'left',cursor:'pointer'}:{cursor:'pointer'}}>
                {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
              </th>
            ))}
            <th>Status</th>
          </tr></thead>
          <tbody>
            {effortRows.map(r=>(
              <tr key={r.name} style={{ background:r.absent?'#fee2e2':r.warning?'#fff7ed':'' }}>
                <td style={{ textAlign:'left', fontWeight:700 }}>{r.name}{r.absent&&<span className="badge badge-red" style={{ marginLeft:6, fontSize:10 }}>Absent</span>}</td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.tl||'—'}</td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.apm||'—'}</td>
                <td>{r.totalDials.toLocaleString()}</td>
                <td>{r.totalConn}</td>
                <td>{(r.connRate*100).toFixed(1)}%</td>
                <td>{Math.round(r.totalPTT)}</td>
                <td>{r.avgDials.toFixed(1)}</td>
                <td>{r.avgPTT.toFixed(1)}</td>
                <td>{r.prodDays}</td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ flex:1, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden', width:40 }}>
                      <div style={{ height:'100%', width:`${r.effortScore}%`, background:r.effortScore>=70?'#16a34a':r.effortScore>=40?'#eab308':'#ef4444', borderRadius:3 }} />
                    </div>
                    <span style={{ fontWeight:800, fontSize:12, color:r.effortScore>=70?'#166534':r.effortScore>=40?'#854d0e':'#991b1b', minWidth:24 }}>{r.effortScore}</span>
                  </div>
                </td>
                <td>{r.warning?<span className="badge badge-yellow">{r.warning}</span>:r.absent?<span className="badge badge-red">Excluded</span>:<span className="badge badge-green">Active</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <td colSpan={3} style={{ textAlign:'left', fontWeight:700 }}>TOTAL ({effortRows.length})</td>
            <td style={{ fontWeight:700 }}>{totals.dials.toLocaleString()}</td>
            <td style={{ fontWeight:700 }}>{totals.conn.toLocaleString()}</td>
            <td style={{ fontWeight:700 }}>{connRate}%</td>
            <td style={{ fontWeight:700 }}>{Math.round(totals.ptt).toLocaleString()}</td>
            <td colSpan={5} />
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}
