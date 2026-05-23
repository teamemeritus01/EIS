// ============================================================
// L7D TREND — Last 7 Days BSC per advisor with full filters
// ============================================================
import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import PageExportButton from '../shared/PageExportButton.jsx';
import MultiSelect from '../shared/MultiSelect.jsx';

function bscCellStyle(bsc) {
  if (!bsc && bsc !== 0) return { bg:'#f1f5f9', color:'#94a3b8', text:'—' };
  if (bsc >= 71) return { bg:'#dcfce7', color:'#166534', text:bsc.toFixed(1) };
  if (bsc >= 60) return { bg:'#fef9c3', color:'#854d0e', text:bsc.toFixed(1) };
  return { bg:'#fee2e2', color:'#991b1b', text:bsc.toFixed(1) };
}

function TrendArrow({ values }) {
  const valid = values.filter(v => v !== null && v !== undefined && v > 0);
  if (valid.length < 2) return <span style={{ color:'var(--text-muted)' }}>—</span>;
  const first = valid[0], last = valid[valid.length - 1];
  const diff = last - first;
  if (Math.abs(diff) < 0.5) return <span style={{ color:'#6b7280', fontWeight:700 }}>→ {diff > 0 ? '+' : ''}{diff.toFixed(1)}</span>;
  if (diff > 0) return <span style={{ color:'#16a34a', fontWeight:800 }}>↑ +{diff.toFixed(1)}</span>;
  return <span style={{ color:'#dc2626', fontWeight:800 }}>↓ {diff.toFixed(1)}</span>;
}

export default function L7DTrend() {
  const { state } = useApp();
  const { bscData, absenceOverrides } = state;
  const [tlFilter, setTlFilter]   = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter, setPaFilter]   = useState([]);
  const [sortKey, setSortKey]     = useState('bscAvg');
  const [sortDir, setSortDir]     = useState('desc');
  const [search, setSearch]       = useState('');
  const [metric, setMetric]       = useState('bsc'); // 'bsc' | 'cc' | 'ptt'

  if (!bscData) return <div className="empty-state"><div className="empty-icon">📈</div><h3>No BSC Data</h3></div>;

  const trendData   = bscData.l7dTrend || [];
  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));
  const uniqueTLs   = [...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a=>a.apm).filter(Boolean))].sort();
  const uniquePAs   = allAdvisors.map(a=>a.name).sort();

  // Get 7 day labels
  const dates = trendData[0]?.dates || [];

  const enriched = useMemo(() => {
    return trendData.map(t => {
      const advMeta = allAdvisors.find(a=>a.name===t.name) || {};
      const bscVals = t.bscTrend?.map(b=>b.bsc) || [];
      const validBSC = bscVals.filter(v=>v>0);
      const bscAvg   = validBSC.length ? validBSC.reduce((s,v)=>s+v,0)/validBSC.length : 0;
      const lastBSC  = validBSC[validBSC.length-1] || 0;
      return { ...t, bscVals, bscAvg, lastBSC, tl:advMeta.tl, apm:advMeta.apm, region:advMeta.region, bscScore:advMeta.bscScore };
    });
  }, [trendData, allAdvisors]);

  const filtered = useMemo(() => {
    let list = enriched.filter(r=>!absentNames.has(r.name));
    if (tlFilter.length)  list = list.filter(r=>tlFilter.includes(r.tl));
    if (apmFilter.length) list = list.filter(r=>apmFilter.includes(r.apm));
    if (paFilter.length)  list = list.filter(r=>paFilter.includes(r.name));
    if (search)           list = list.filter(r=>r.name?.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b) => {
      const av=a[sortKey]??0, bv=b[sortKey]??0;
      return sortDir==='desc' ? bv-av : av-bv;
    });
  }, [enriched, tlFilter, apmFilter, paFilter, search, sortKey, sortDir, absentNames]);

  const handleSort = (k) => {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Summary stats
  const improving = filtered.filter(r=>(r.bscVals[r.bscVals.length-1]||0)>(r.bscVals[0]||0)+0.5).length;
  const declining = filtered.filter(r=>(r.bscVals[0]||0)>(r.bscVals[r.bscVals.length-1]||0)+0.5).length;
  const stable    = filtered.length - improving - declining;

  const METRICS = { bsc:'BSC Score', cc:'Connected Calls', ptt:'PTT (min)' };

  if (!trendData.length) return (
    <div className="empty-state">
      <div className="empty-icon">📈</div>
      <h3>No L7D Trend Data</h3>
      <p>The BSC workbook needs a "L7D Trend PA" sheet for this module. Upload a BSC file that includes this sheet.</p>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Stats strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Advisors',   value:filtered.length, accent:'#6366f1' },
          { label:'↑ Improving', value:improving, accent:'#16a34a' },
          { label:'→ Stable',   value:stable,    accent:'#f59e0b' },
          { label:'↓ Declining',value:declining, accent:'#dc2626' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding:'10px 14px' }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input className="search-input" placeholder="Search PA..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:160 }}/>
          <MultiSelect label="TL"  options={uniqueTLs}  value={tlFilter}  onChange={setTlFilter}  />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA"  options={uniquePAs}  value={paFilter}  onChange={setPaFilter} searchable />
          <div style={{ display:'flex', gap:4 }}>
            {Object.entries(METRICS).map(([k,l])=>(
              <button key={k} className={`btn btn-sm ${metric===k?'btn-primary':'btn-outline'}`} onClick={()=>setMetric(k)}>{l}</button>
            ))}
          </div>
          {(tlFilter.length||apmFilter.length||paFilter.length)>0&&<button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setPaFilter([]);}}>✕ Clear</button>}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{filtered.length} advisors</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, fontSize:11 }}>
        {[['#dcfce7','#166534','BSC ≥ 71 (Green)'],['#fef9c3','#854d0e','BSC 60-70 (Yellow)'],['#fee2e2','#991b1b','BSC < 60 (Red)'],['#f1f5f9','#94a3b8','No Data']].map(([bg,color,label])=>(
          <span key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:14, height:14, background:bg, borderRadius:3, border:'1px solid #e2e8f0', display:'inline-block' }}/>
            <span style={{ color }}>{label}</span>
          </span>
        ))}
      </div>

      {/* L7D Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign:'left', cursor:'pointer' }} onClick={()=>handleSort('name')}>PA Name {sortKey==='name'?(sortDir==='desc'?'↓':'↑'):''}</th>
              <th style={{ textAlign:'left' }}>TL</th>
              <th style={{ textAlign:'left' }}>APM</th>
              <th>Region</th>
              {dates.map((d,i)=>(
                <th key={i} style={{ cursor:'pointer' }}>{d}</th>
              ))}
              <th style={{ cursor:'pointer' }} onClick={()=>handleSort('bscAvg')}>7D Avg {sortKey==='bscAvg'?(sortDir==='desc'?'↓':'↑'):''}</th>
              <th style={{ cursor:'pointer' }} onClick={()=>handleSort('lastBSC')}>Latest {sortKey==='lastBSC'?(sortDir==='desc'?'↓':'↑'):''}</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.name}>
                <td style={{ textAlign:'left', fontWeight:700 }}>{r.name}</td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.tl||'—'}</td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.apm||'—'}</td>
                <td><span className={`badge badge-${r.region==='US'?'blue':'green'}`}>{r.region||'—'}</span></td>
                {(metric==='bsc' ? r.bscVals : metric==='cc' ? r.ccTrend : r.pttTrend).map((val,i)=>{
                  const style = metric==='bsc' ? bscCellStyle(val) : { bg:'#f8fafc', color:'var(--text-primary)', text:val!=null?val.toFixed?.(1)||val:'—' };
                  return (
                    <td key={i} style={{ background:style.bg, color:style.color, fontWeight:700, fontSize:12, transition:'all .1s' }}>
                      {style.text}
                    </td>
                  );
                })}
                <td>
                  {r.bscAvg > 0 ? <span className={`bsc-badge ${r.bscAvg>=71?'bsc-green':r.bscAvg>=60?'bsc-yellow':'bsc-red'}`}>{r.bscAvg.toFixed(1)}</span> : '—'}
                </td>
                <td>
                  {r.lastBSC > 0 ? <span className={`bsc-badge ${r.lastBSC>=71?'bsc-green':r.lastBSC>=60?'bsc-yellow':'bsc-red'}`}>{r.lastBSC.toFixed(1)}</span> : '—'}
                </td>
                <td><TrendArrow values={r.bscVals} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
