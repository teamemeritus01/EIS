import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { exportBSCExcel, exportEffortExcel, exportPDF, exportCSV, copyToTeams } from '../../utils/exportUtils.js';
import { toDDMMYYYY } from '../../utils/dateUtils.js';
import { getShiftDates, filterRowsByDate, aggregateFilteredRows, summariseAgg } from '../../parsers/effortParser.js';

export default function ExportCenter() {
  const { state, getFilteredAdvisors } = useApp();
  const { bscData, effortData, absenceOverrides } = state;
  const [mode, setMode]             = useState('filtered');
  const [includeAbsent, setIncludeAbsent] = useState(false);
  const [effortDate, setEffortDate] = useState('');
  const [exporting, setExporting]   = useState('');
  const [copied, setCopied]         = useState('');

  const allAdvisors      = bscData?.advisors || [];
  const filteredAdvisors = getFilteredAdvisors();
  const absentNames      = new Set(Object.keys(absenceOverrides).filter(n=>absenceOverrides[n]?.length>0));
  const baseList         = mode==='all' ? allAdvisors : filteredAdvisors;
  const exportList       = includeAbsent ? baseList : baseList.filter(a=>!absentNames.has(a.name));
  const allDates         = getShiftDates(effortData?.rows);

  // Effort rows for selected date
  const effortRows = useMemo(() => {
    if (!effortData?.rows) return [];
    return effortDate ? filterRowsByDate(effortData.rows, effortDate) : effortData.rows;
  }, [effortData, effortDate]);

  const effortSummary = useMemo(() => {
    const agg = aggregateFilteredRows(effortRows.filter(r=>!absentNames.has(r.advisor)));
    return summariseAgg(agg);
  }, [effortRows, absentNames]);

  const doExport = async (type) => {
    setExporting(type);
    try {
      if (type==='bsc_excel') await exportBSCExcel(exportList, { absentNames });
      if (type==='effort_excel') await exportEffortExcel(effortSummary, effortDate);
      if (type==='pdf')     exportPDF(exportList);
      if (type==='bsc_csv') { exportCSV(exportList); }
      if (type==='teams')   { copyToTeams(exportList, 'bsc'); setCopied('teams'); setTimeout(()=>setCopied(''),3000); }
    } catch(e) { console.error(e); }
    setExporting('');
  };

  const totalPayout = exportList.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);

  if (!bscData) return <div className="empty-state"><div className="empty-icon">📤</div><h3>No Data Loaded</h3></div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="card">
        <div className="card-title">Export Configuration</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>MODE</div>
            <div style={{ display:'flex', gap:8 }}>
              {['filtered','all'].map(m=>(
                <button key={m} className={`btn ${mode===m?'btn-primary':'btn-outline'}`} onClick={()=>setMode(m)}>
                  {m==='filtered'?`Filtered (${filteredAdvisors.length})`:`All (${allAdvisors.length})`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>ABSENT ADVISORS</div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={includeAbsent} onChange={e=>setIncludeAbsent(e.target.checked)} style={{ width:15,height:15 }}/>
              <span style={{ fontSize:13 }}>Include absent ({absentNames.size})</span>
            </label>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>EFFORT DATE (for Effort export)</div>
            <select className="filter-select" value={effortDate} onChange={e=>setEffortDate(e.target.value)}>
              <option value="">All Dates (QTD)</option>
              {[...allDates].reverse().map(d=>(
                <option key={d} value={d}>{new Date(d+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short'})}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          {label:'BSC Advisors in Export',value:exportList.length},
          {label:'Qualified',value:exportList.filter(a=>a.qualification?.qualified).length},
          {label:'Absent Excluded',value:includeAbsent?0:absentNames.size},
          {label:'Total Payout',value:`₹${totalPayout.toLocaleString('en-IN')}`},
        ].map(s=>(
          <div key={s.label} className="stat-card"><div className="stat-accent" style={{background:'var(--em-green)'}}/><div className="stat-label">{s.label}</div><div className="stat-value" style={{fontSize:20}}>{s.value}</div></div>
        ))}
      </div>

      {/* BSC Exports */}
      <div className="card">
        <div className="card-title">📊 BSC / Incentive Exports</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 }}>
          {[
            { id:'bsc_excel', icon:'📊', label:'Formatted Excel',  desc:'Color-coded rows, merged headers, ₹ amounts — matches your BSC format exactly' },
            { id:'bsc_csv',   icon:'📋', label:'CSV (Data only)',  desc:'Clean CSV — open in Excel or Google Sheets' },
            { id:'pdf',       icon:'📄', label:'PDF Report',       desc:'Print-ready, color-coded, professional layout' },
            { id:'teams',     icon:'💬', label:'Copy to Teams',    desc:'Tab-separated — paste directly into Teams chat' },
          ].map(ex=>(
            <div key={ex.id} className="card" style={{ padding:14, cursor:'pointer', border:exporting===ex.id?'2px solid var(--em-green)':'1px solid var(--border)' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>{ex.icon}</div>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{ex.label}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>{ex.desc}</div>
              <button className="btn btn-primary btn-sm" style={{ width:'100%' }} onClick={()=>doExport(ex.id)} disabled={!!exporting||exportList.length===0}>
                {exporting===ex.id?'⏳ Exporting...':copied===ex.id?'✓ Copied!':'Export'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Effort Export */}
      <div className="card">
        <div className="card-title">📞 Effort / Team Summary Export</div>
        <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ flex:1, padding:14, background:'#f8fafc', borderRadius:8, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>📊</div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Team Effort Summary (Excel)</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
              Matches your sample format exactly: Team Effort Summary title, Shift Date, navy header, Advisor/Total Calls/Connected/Talk Time/Conn Rate/Avg Talk per Connect, Grand Total row.
              {effortDate && <span style={{ color:'var(--em-green)', fontWeight:600 }}> Shift: {new Date(effortDate+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>}
              {!effortDate && <span style={{ color:'#f59e0b', fontWeight:600 }}> Select a date above for single-shift export, or leave blank for QTD.</span>}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>Advisors in export: {effortSummary.length}</div>
            <button className="btn btn-primary" onClick={()=>doExport('effort_excel')} disabled={!!exporting||!effortData}>
              {exporting==='effort_excel'?'⏳ Exporting...':'📊 Download Team Effort Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
