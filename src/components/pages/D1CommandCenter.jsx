import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { formatINR, getSlabForRank } from '../../constants/businessRules.js';

export default function D1CommandCenter() {
  const { state } = useApp();
  const { bscData } = state;
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('bscScore');
  const [sortDir, setSortDir] = useState('desc');

  if (!bscData) return <div className="empty-state"><div className="empty-icon">📅</div><h3>No Data Loaded</h3></div>;

  const d1Data   = bscData.d1Data || [];
  const d1Date   = d1Data[0]?.d1Date;
  const overall  = d1Data.find(r => r.type==='overall' || r.name==='Overall');
  const tlRows   = d1Data.filter(r => r.type==='TL' || r.name==='TL');
  const paRows   = d1Data.filter(r => r.type==='PA' || (r.name && r.name!=='Overall' && r.name!=='TL' && r.name!=='APM' && r.name.length>2));

  const filtered = paRows
    .filter(r => !search || r.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      const av=a[sortKey]??0, bv=b[sortKey]??0;
      return sortDir==='desc'?(bv-av):(av-bv);
    });

  const handleSort = (key) => {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const dateStr = d1Date ? (d1Date instanceof Date ? d1Date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : String(d1Date)) : 'Previous Day';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <h2 style={{ fontSize:16, fontWeight:800 }}>D-1 Command Center</h2>
        <span className="badge badge-blue">📅 {dateStr}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Previous operational day performance</span>
      </div>

      {/* Overall stats */}
      {overall && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
          {[
            { label:'Total PAs', value:overall.totalPAs||'—' },
            { label:'Productive PAs', value:overall.productivePAs||'—' },
            { label:'Avg Dials', value:overall.avgDials?.toFixed(1)||'—' },
            { label:'BSC Score', value:overall.bscScore?.toFixed(1)||'—', isScore:true },
            { label:'Connected Calls', value:overall.ccActuals?.toFixed(1)||'—' },
            { label:'Avg PTT (min)', value:overall.pttActuals?.toFixed(1)||'—' },
          ].map(s=>(
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize:22 }}>
                {s.isScore ? <span className={`bsc-badge ${s.value<60?'bsc-red':s.value<=70?'bsc-yellow':'bsc-green'}`}>{s.value}</span> : s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TL Rows */}
      {tlRows.length > 0 && (
        <div className="card">
          <div className="card-title">TL Performance — {dateStr}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{ textAlign:'left' }}>TL / APM</th>
                <th>Total PAs</th><th>Productive PAs</th><th>Avg Dials</th>
                <th>Connected Calls</th><th>AHT (s)</th><th>TTFA%</th><th>PTT (min)</th><th>BSC Score</th>
              </tr></thead>
              <tbody>
                {tlRows.map((r,i)=>(
                  <tr key={i}>
                    <td style={{ textAlign:'left', fontWeight:700 }}>{r.name}</td>
                    <td>{r.totalPAs||'—'}</td><td>{r.productivePAs||'—'}</td>
                    <td>{r.avgDials?.toFixed(1)||'—'}</td>
                    <td>{r.ccActuals?.toFixed(1)||'—'}</td>
                    <td>{r.ahtActuals?.toFixed(0)||'—'}</td>
                    <td>{r.ttfaActuals?(r.ttfaActuals*100).toFixed(1)+'%':'—'}</td>
                    <td>{r.pttActuals?.toFixed(1)||'—'}</td>
                    <td><span className={`bsc-badge ${!r.bscScore?'bsc-na':r.bscScore<60?'bsc-red':r.bscScore<=70?'bsc-yellow':'bsc-green'}`}>{r.bscScore?.toFixed(1)||'—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PA rows */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <span>PA Performance — {dateStr}</span>
          <input className="search-input" placeholder="Search advisor..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:200 }} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              {[
                ['name','PA Name'], ['avgDials','Avg Dials'], ['pctProductive','% Productive'],
                ['ccActuals','Connects'], ['ahtActuals','AHT (s)'],
                ['ttfaActuals','TTFA%'], ['pttActuals','PTT (min)'], ['bscScore','BSC'],
              ].map(([k,l])=>(
                <th key={k} onClick={()=>handleSort(k)} style={k==='name'?{textAlign:'left',cursor:'pointer'}:{cursor:'pointer'}}>
                  {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>No D-1 PA data found in BSC file</td></tr>
              ) : filtered.map((r,i)=>(
                <tr key={i}>
                  <td style={{ textAlign:'left', fontWeight:700 }}>{r.name}</td>
                  <td>{r.avgDials?.toFixed(1)||'—'}</td>
                  <td>{r.pctProductive?(r.pctProductive*100).toFixed(0)+'%':'—'}</td>
                  <td>{r.ccActuals?.toFixed(1)||'—'}</td>
                  <td>{r.ahtActuals?.toFixed(0)||'—'}</td>
                  <td>{r.ttfaActuals?(r.ttfaActuals*100).toFixed(1)+'%':'—'}</td>
                  <td>{r.pttActuals?.toFixed(1)||'—'}</td>
                  <td><span className={`bsc-badge ${!r.bscScore?'bsc-na':r.bscScore<60?'bsc-red':r.bscScore<=70?'bsc-yellow':'bsc-green'}`}>{r.bscScore?.toFixed(1)||'—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
