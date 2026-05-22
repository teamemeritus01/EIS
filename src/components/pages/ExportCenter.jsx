import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { copyToTeams, copyToCSV, exportFormattedExcel, exportPDF, DEFAULT_ADVISOR_COLUMNS } from '../../utils/exportUtils.js';

export default function ExportCenter() {
  const { state, getFilteredAdvisors } = useApp();
  const { bscData, effortData, absenceOverrides } = state;
  const [mode, setMode] = useState('filtered'); // 'filtered' | 'all'
  const [includeAbsent, setIncludeAbsent] = useState(false);
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState('');

  if (!bscData) return (
    <div className="empty-state"><div className="empty-icon">📤</div><h3>No Data Loaded</h3><p>Upload BSC data to enable exports.</p></div>
  );

  const absentNames = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));

  const allAdvisors  = bscData.advisors || [];
  const filteredAdvisors = getFilteredAdvisors();

  const baseList = mode === 'all' ? allAdvisors : filteredAdvisors;
  const exportList = includeAbsent ? baseList : baseList.filter(a => !absentNames.has(a.name));

  const totalPayout  = exportList.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);
  const qualified    = exportList.filter(a=>a.qualification?.qualified).length;

  const doExport = async (type) => {
    setExporting(type);
    const opts = { filterLabel: mode==='all'?'All Advisors':'Filtered View' };
    try {
      if (type==='teams')   { copyToTeams(exportList, DEFAULT_ADVISOR_COLUMNS); setCopied('teams'); setTimeout(()=>setCopied(''),3000); }
      if (type==='csv')     { copyToCSV(exportList, DEFAULT_ADVISOR_COLUMNS); }
      if (type==='excel')   { exportFormattedExcel(exportList, DEFAULT_ADVISOR_COLUMNS, opts); }
      if (type==='pdf')     { exportPDF(exportList, DEFAULT_ADVISOR_COLUMNS, opts); }
    } catch(e) { console.error(e); }
    setExporting('');
  };

  const EXPORTS = [
    { id:'teams',  icon:'💬', label:'Copy to Teams', desc:'Tab-separated text — paste directly into Microsoft Teams chat', btn:'Copy' },
    { id:'csv',    icon:'📋', label:'Copy to Excel (CSV)', desc:'UTF-8 CSV with proper encoding — open in Excel, Google Sheets', btn:'Download CSV' },
    { id:'excel',  icon:'📊', label:'Formatted Excel (.xlsx)', desc:'Color-coded BSC, bold headers, totals row, freeze panes, slab distribution', btn:'Download Excel' },
    { id:'pdf',    icon:'📄', label:'PDF Report', desc:'Print-ready, compact, Emeritus branded, color-coded, professional layout', btn:'Download PDF' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Export config */}
      <div className="card">
        <div className="card-title">Export Configuration</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>EXPORT MODE</div>
            <div style={{ display:'flex', gap:8 }}>
              {['filtered','all'].map(m => (
                <button key={m} className={`btn ${mode===m?'btn-primary':'btn-outline'}`} onClick={()=>setMode(m)}>
                  {m==='filtered'?'Current Filtered View':'All Advisors'}
                </button>
              ))}
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6 }}>
              {mode==='filtered'?`${filteredAdvisors.length} advisors (active filters applied)`:`${allAdvisors.length} total advisors`}
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>ABSENT ADVISORS</div>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
              <input type="checkbox" checked={includeAbsent} onChange={e=>setIncludeAbsent(e.target.checked)} style={{ width:16, height:16 }} />
              <span style={{ fontSize:13 }}>Include absent advisors in export</span>
            </label>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
              {absentNames.size} advisor(s) currently marked absent — {includeAbsent?'INCLUDED':'EXCLUDED'}
            </div>
          </div>
        </div>
      </div>

      {/* Export preview */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Advisors in Export', value:exportList.length },
          { label:'Qualified', value:qualified },
          { label:'Absent Excluded', value:includeAbsent?0:absentNames.size },
          { label:'Total Payout', value:`₹${totalPayout.toLocaleString('en-IN')}` },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:'var(--em-green)' }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Export buttons */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {EXPORTS.map(ex => (
          <div key={ex.id} className="card" style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:32 }}>{ex.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{ex.label}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>{ex.desc}</div>
            </div>
            <button className="btn btn-primary" onClick={()=>doExport(ex.id)} disabled={!!exporting || exportList.length===0}>
              {exporting===ex.id ? '⏳ Exporting...' : copied===ex.id ? '✓ Copied!' : ex.btn}
            </button>
          </div>
        ))}
      </div>

      {/* Preview table */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <span>Export Preview — First 10 Rows</span>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>{exportList.length} total rows in export</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Rank</th><th style={{ textAlign:'left' }}>PA Name</th><th>TL</th><th>APM</th><th>Region</th><th>Prod Days</th><th>BSC</th><th>Slab</th><th>Payout ₹</th><th>Status</th>
            </tr></thead>
            <tbody>
              {exportList.slice(0,10).map(a=>(
                <tr key={a.name}>
                  <td>{a.rank}</td>
                  <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                  <td style={{ fontSize:11 }}>{a.tl||'—'}</td>
                  <td style={{ fontSize:11 }}>{a.apm||'—'}</td>
                  <td><span className={`badge badge-${a.region==='US'?'blue':'green'}`}>{a.region}</span></td>
                  <td>{a.productiveDays}</td>
                  <td><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(1)}</span></td>
                  <td style={{ fontSize:11 }}>{a.slab||'—'}</td>
                  <td style={{ fontWeight:800, color:'#166534' }}>{a.payout>0?`₹${a.payout.toLocaleString('en-IN')}`:'—'}</td>
                  <td><span className={`badge badge-${a.qualification?.pdStatus==='On Track'?'green':a.qualification?.pdStatus==='At Risk'?'yellow':'red'}`}>{a.qualification?.pdStatus||'—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {exportList.length > 10 && <div style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)', padding:'10px 0' }}>+ {exportList.length-10} more rows in full export</div>}
      </div>
    </div>
  );
}
