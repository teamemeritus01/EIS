// ============================================================
// EFFORT INTELLIGENCE — With date filter, PA multi-select, inline absent
// ============================================================
import { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { calcEffortScore } from '../../engines/scenarioEngine.js';
import { filterRowsByDate, getShiftDates, aggregateFilteredRows, summariseAgg } from '../../parsers/effortParser.js';
import { exportEffortExcel, copyToTeams } from '../../utils/exportUtils.js';
import MultiSelect from '../shared/MultiSelect.jsx';

function pctDisp(v) {
  if (v===null||v===undefined) return '—';
  return (v > 1 ? v : v*100).toFixed(1) + '%';
}

export default function EffortIntelligence() {
  const { state, addAbsence, removeAbsence, notify } = useApp();
  const { effortData, bscData, absenceOverrides } = state;

  // ── Filters ───────────────────────────────────────────────
  const allDates    = useMemo(() => getShiftDates(effortData?.rows), [effortData]);
  const latestDate  = allDates[allDates.length - 1] || '';
  const [selDate, setSelDate]   = useState(latestDate);
  const [tlFilter, setTlFilter] = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter, setPaFilter]   = useState([]);
  const [showAbsent, setShowAbsent] = useState(false);
  const [sortKey, setSortKey]     = useState('totalTT');
  const [sortDir, setSortDir]     = useState('desc');
  const [exporting, setExporting] = useState('');

  const allAdvisors = bscData?.advisors || [];
  const uniqueTLs   = [...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a=>a.apm).filter(Boolean))].sort();
  const advisorMeta = useMemo(() => { const m={}; allAdvisors.forEach(a=>{m[a.name]=a;}); return m; }, [allAdvisors]);

  // ── Date label ────────────────────────────────────────────
  const dateLabelFull = useCallback((d) => {
    if (!d) return 'All Dates (QTD)';
    const from = new Date(d+'T10:00:00');
    const to   = new Date(from); to.setDate(to.getDate()+1);
    const fmt  = dt => dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    return `${fmt(from)} 10:00 AM → ${fmt(to)} 09:59 AM`;
  }, []);

  // ── Aggregate ─────────────────────────────────────────────
  const effortRows = useMemo(() => {
    if (!effortData?.rows) return [];
    return selDate ? filterRowsByDate(effortData.rows, selDate) : effortData.rows;
  }, [effortData, selDate]);

  const advisorSummaries = useMemo(() => {
    const agg  = aggregateFilteredRows(effortRows);
    const rows = summariseAgg(agg).map(r => {
      const meta   = advisorMeta[r.name] || {};
      const absent = (absenceOverrides[r.name]||[]).includes(selDate||'any');
      const score  = calcEffortScore(r.totalDials, r.connRate, r.totalTT);
      return { ...r, tl:meta.tl, apm:meta.apm, region:meta.region, absent, score };
    });

    let filtered = rows;
    if (tlFilter.length)  filtered = filtered.filter(r=>tlFilter.includes(r.tl));
    if (apmFilter.length) filtered = filtered.filter(r=>apmFilter.includes(r.apm));
    if (paFilter.length)  filtered = filtered.filter(r=>paFilter.includes(r.name));
    if (!showAbsent)      filtered = filtered.filter(r=>!r.absent);

    return filtered.sort((a,b) => {
      const av=a[sortKey]??0, bv=b[sortKey]??0;
      return sortDir==='desc' ? bv-av : av-bv;
    });
  }, [effortRows, advisorMeta, absenceOverrides, tlFilter, apmFilter, paFilter, showAbsent, sortKey, sortDir, selDate]);

  const uniquePAs = useMemo(() => [...new Set(summariseAgg(aggregateFilteredRows(effortRows)).map(r=>r.name))].sort(), [effortRows]);

  const totals = useMemo(() => ({
    dials: advisorSummaries.reduce((s,r)=>s+r.totalDials,0),
    conn:  advisorSummaries.reduce((s,r)=>s+r.totalConn,0),
    tt:    advisorSummaries.reduce((s,r)=>s+r.totalTT,0),
  }), [advisorSummaries]);

  const handleSort = (k) => {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const markAbsent = (name) => {
    const date = selDate || new Date().toISOString().split('T')[0];
    addAbsence(name, date);
    notify(`${name} marked absent for ${date}`, 'info');
  };
  const unmarkAbsent = (name) => {
    const date = selDate || new Date().toISOString().split('T')[0];
    removeAbsence(name, date);
    notify(`Absence removed for ${name}`, 'success');
  };

  const doExport = async (type) => {
    setExporting(type);
    try {
      if (type==='excel') await exportEffortExcel(advisorSummaries, selDate, {});
      if (type==='teams') { copyToTeams([]); notify('Copied to clipboard', 'success'); }
    } catch(e) { notify('Export failed: '+e.message, 'error'); }
    setExporting('');
  };

  if (!effortData) return (
    <div className="empty-state"><div className="empty-icon">📞</div><h3>No Effort Data</h3><p>Upload your Raw Effort CSV to activate Effort Intelligence.</p></div>
  );

  const COLS = [
    ['name','Advisor Name',true],['tl','TL',true],['apm','APM',true],
    ['totalDials','Total Calls',false],['totalConn','Connected',false],
    ['totalTT','Talk Time (min)',false],['connRate','Conn Rate %',false],
    ['avgTalkPerConnect','Avg Talk/Connect',false],
    ['totalPTT','PTT (min)',false],['score','Effort Score',false],
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Date + filter bar */}
      <div className="card" style={{ padding:'12px 16px' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          {/* Operational Day picker */}
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0fdf4', border:'1px solid var(--green-border)', borderRadius:8, padding:'6px 12px' }}>
            <span style={{ fontSize:13 }}>📅</span>
            <div>
              <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>Operational Day (10AM → 10AM)</div>
              <select value={selDate} onChange={e=>setSelDate(e.target.value)} style={{ border:'none', background:'transparent', fontWeight:700, fontSize:13, color:'var(--em-green)', cursor:'pointer', outline:'none' }}>
                <option value="">All Dates (QTD)</option>
                {[...allDates].reverse().map(d=>(
                  <option key={d} value={d}>{new Date(d+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</option>
                ))}
              </select>
              {selDate && <div style={{ fontSize:9, color:'var(--text-muted)' }}>{dateLabelFull(selDate)}</div>}
            </div>
          </div>

          <MultiSelect label="TL" options={uniqueTLs} value={tlFilter} onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA" options={uniquePAs} value={paFilter} onChange={setPaFilter} searchable placeholder="Search PA..." />

          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', padding:'4px 8px', background:'#fee2e2', borderRadius:6, border:'1px solid #fca5a5' }}>
            <input type="checkbox" checked={showAbsent} onChange={e=>setShowAbsent(e.target.checked)} />
            Show Absent
          </label>

          {(tlFilter.length||apmFilter.length||paFilter.length)>0 &&
            <button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setPaFilter([]);}}>✕ Clear</button>
          }
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{advisorSummaries.length} advisors · {effortRows.length} calls</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Total Calls',     value:totals.dials.toLocaleString(), accent:'#6366f1' },
          { label:'Connected Calls', value:totals.conn.toLocaleString(),  accent:'#16a34a' },
          { label:'Talk Time (min)', value:totals.tt.toFixed(0),         accent:'#3b82f6' },
          { label:'Connect Rate',    value:totals.dials>0?(totals.conn/totals.dials*100).toFixed(1)+'%':'—', accent:'#f59e0b' },
          { label:'Avg Talk/Connect',value:totals.conn>0?(totals.tt/totals.conn).toFixed(2):'—', accent:'#8b5cf6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Export bar */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)' }}>Export:</span>
        <button className="btn btn-primary btn-sm" onClick={()=>doExport('excel')} disabled={!!exporting}>
          {exporting==='excel'?'⏳ Exporting...':'📊 Excel (Formatted)'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={()=>doExport('csv')}>📋 CSV</button>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>
          {selDate ? `Shift: ${dateLabelFull(selDate)}` : 'QTD — All Dates'}
        </span>
      </div>

      {/* Main table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {COLS.map(([k,l,leftAlign])=>(
                <th key={k} onClick={()=>handleSort(k)} style={{ textAlign:leftAlign?'left':'center', cursor:'pointer' }}>
                  {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
                </th>
              ))}
              <th>Mark Absent</th>
            </tr>
          </thead>
          <tbody>
            {advisorSummaries.map(r=>(
              <tr key={r.name} style={{ background:r.absent?'#fee2e2':'' }}>
                <td style={{ textAlign:'left', fontWeight:700 }}>
                  {r.name}
                  {r.absent && <span className="badge badge-red" style={{ marginLeft:6, fontSize:9 }}>Absent</span>}
                </td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.tl||'—'}</td>
                <td style={{ textAlign:'left', fontSize:11 }}>{r.apm||'—'}</td>
                <td>{r.totalDials.toLocaleString()}</td>
                <td>{r.totalConn}</td>
                <td>{r.totalTT.toFixed(2)}</td>
                <td>{(r.connRate*100).toFixed(2)}%</td>
                <td>{r.avgTalkPerConnect.toFixed(2)}</td>
                <td>{r.totalPTT.toFixed(1)}</td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:36, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${r.score}%`, background:r.score>=70?'#16a34a':r.score>=40?'#eab308':'#ef4444', borderRadius:3 }}/>
                    </div>
                    <span style={{ fontWeight:800, fontSize:12, color:r.score>=70?'#166534':r.score>=40?'#854d0e':'#991b1b' }}>{r.score}</span>
                  </div>
                </td>
                <td>
                  {r.absent
                    ? <button className="btn btn-outline btn-sm" style={{ fontSize:10 }} onClick={()=>unmarkAbsent(r.name)}>✕ Remove</button>
                    : <button className="btn btn-danger btn-sm" style={{ fontSize:10 }} onClick={()=>markAbsent(r.name)}>🔒 Absent</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign:'left', fontWeight:800 }}>Grand Total ({advisorSummaries.length})</td>
              <td style={{ fontWeight:800 }}>{totals.dials.toLocaleString()}</td>
              <td style={{ fontWeight:800 }}>{totals.conn.toLocaleString()}</td>
              <td style={{ fontWeight:800 }}>{totals.tt.toFixed(2)}</td>
              <td style={{ fontWeight:800 }}>{totals.dials>0?(totals.conn/totals.dials*100).toFixed(2)+'%':'—'}</td>
              <td style={{ fontWeight:800 }}>{totals.conn>0?(totals.tt/totals.conn).toFixed(2):'—'}</td>
              <td colSpan={3}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
