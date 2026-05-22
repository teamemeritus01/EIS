import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { toDDMMYYYY } from '../../utils/dateUtils.js';

// BSC display for D-1: show as "90%" rounded percentage
function D1BSC({ val }) {
  if (val == null || val === '—') return <span className="bsc-badge bsc-na">—</span>;
  const norm = val > 1 ? val : val * 100; // normalise to 0-100
  const pct  = Math.round(norm);
  const cls  = pct >= 71 ? 'bsc-green' : pct >= 60 ? 'bsc-yellow' : 'bsc-red';
  return <span className={`bsc-badge ${cls}`}>{pct}%</span>;
}

export default function D1CommandCenter() {
  const { state } = useApp();
  const { bscData } = state;
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('bscScore');
  const [sortDir, setSortDir] = useState('desc');

  if (!bscData) return <div className="empty-state"><div className="empty-icon">📅</div><h3>No Data Loaded</h3></div>;

  const d1Data = bscData.d1Data || [];
  const d1Date = d1Data[0]?.d1Date;
  const overall = d1Data.find(r => r.type === 'overall' || r.name === 'Overall');
  const tlRows  = d1Data.filter(r => r.type === 'TL');
  const paRows  = d1Data.filter(r => r.type === 'PA' ||
    (r.name && !['Overall','TL','APM'].includes(r.name) && r.name.length > 2));

  const filtered = paRows
    .filter(r => !search || r.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      const av = a[sortKey]??0, bv = b[sortKey]??0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const handleSort = k => {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Format date as DD/MM/YYYY
  const dateLabel = d1Date
    ? (d1Date instanceof Date
        ? toDDMMYYYY(d1Date)
        : toDDMMYYYY(String(d1Date).split('T')[0]))
    : 'Previous Day';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <h2 style={{ fontSize:16, fontWeight:800 }}>D-1 Command Center</h2>
        <span className="badge badge-blue">📅 {dateLabel}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Previous operational day • BSC shown as rounded %</span>
      </div>

      {/* Overall stats */}
      {overall && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
          {[
            { label:'Total PAs',       value: overall.totalPAs || '—' },
            { label:'Productive PAs',  value: overall.productivePAs || '—' },
            { label:'Avg Dials',       value: overall.avgDials?.toFixed(0) || '—' },
            { label:'BSC Score',       value: null, bsc: overall.bscScore },
            { label:'Connected Calls', value: overall.ccActuals?.toFixed(0) || '—' },
            { label:'PTT (min)',        value: overall.pttActuals?.toFixed(0) || '—' },
          ].map(s=>(
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize:20 }}>
                {s.bsc != null ? <D1BSC val={s.bsc}/> : s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TL rows */}
      {tlRows.length > 0 && (
        <div className="card">
          <div className="card-title">TL Performance — {dateLabel}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{textAlign:'left'}}>TL / APM</th>
                <th>Total PAs</th><th>Productive</th><th>Avg Dials</th>
                <th>Connects</th><th>AHT (s)</th><th>TTFA</th><th>PTT (min)</th>
                <th>BSC</th>
              </tr></thead>
              <tbody>
                {tlRows.map((r,i)=>(
                  <tr key={i}>
                    <td style={{textAlign:'left',fontWeight:700}}>{r.name}</td>
                    <td>{r.totalPAs||'—'}</td>
                    <td>{r.productivePAs||'—'}</td>
                    <td>{r.avgDials?.toFixed(0)||'—'}</td>
                    <td>{r.ccActuals != null ? Math.round(r.ccActuals) : '—'}</td>
                    <td>{r.ahtActuals != null ? Math.round(r.ahtActuals) : '—'}</td>
                    <td>{r.ttfaActuals != null ? Math.round(r.ttfaActuals > 1 ? r.ttfaActuals : r.ttfaActuals*100)+'%' : '—'}</td>
                    <td>{r.pttActuals != null ? Math.round(r.pttActuals) : '—'}</td>
                    <td><D1BSC val={r.bscScore}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PA rows */}
      <div className="card">
        <div className="card-title" style={{justifyContent:'space-between'}}>
          <span>PA Performance — {dateLabel}</span>
          <div style={{display:'flex',gap:8}}>
            <input className="search-input" placeholder="Search advisor..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:180}}/>
            <select className="filter-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
              <option value="bscScore">Sort: BSC</option>
              <option value="ccActuals">Sort: Connects</option>
              <option value="pttActuals">Sort: PTT</option>
              <option value="ahtActuals">Sort: AHT</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}>
              {sortDir==='desc'?'↓ Desc':'↑ Asc'}
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:'32px',color:'var(--text-muted)',fontSize:13}}>
            {paRows.length === 0 ? 'No D-1 PA data found in BSC file (requires D-1 sheet with PA rows)' : 'No results match search'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                {[['name','PA Name'],['avgDials','Avg Dials'],['pctProductive','% Productive'],
                  ['ccActuals','Connects'],['ahtActuals','AHT (s)'],
                  ['ttfaActuals','TTFA'],['pttActuals','PTT (min)'],['bscScore','BSC']].map(([k,l])=>(
                  <th key={k} onClick={()=>handleSort(k)} style={{textAlign:k==='name'?'left':'center',cursor:'pointer'}}>
                    {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((r,i)=>(
                  <tr key={i}>
                    <td style={{textAlign:'left',fontWeight:700}}>{r.name}</td>
                    <td>{r.avgDials?.toFixed(0)||'—'}</td>
                    <td>{r.pctProductive != null ? Math.round(r.pctProductive > 1 ? r.pctProductive : r.pctProductive*100)+'%' : '—'}</td>
                    <td>{r.ccActuals != null ? Math.round(r.ccActuals) : '—'}</td>
                    <td>{r.ahtActuals != null ? Math.round(r.ahtActuals) : '—'}</td>
                    <td>{r.ttfaActuals != null ? Math.round(r.ttfaActuals > 1 ? r.ttfaActuals : r.ttfaActuals*100)+'%' : '—'}</td>
                    <td>{r.pttActuals != null ? Math.round(r.pttActuals) : '—'}</td>
                    <td><D1BSC val={r.bscScore}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
