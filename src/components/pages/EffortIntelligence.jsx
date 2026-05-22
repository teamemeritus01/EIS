import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { calcEffortScore } from '../../engines/scenarioEngine.js';
import { filterRowsByDate, getShiftDates, aggregateFilteredRows, summariseAgg } from '../../parsers/effortParser.js';
import { exportEffortExcel } from '../../utils/exportUtils.js';
import { getCurrentOperationalDay, opDayLabel, formatShiftDate, toDDMMYYYY } from '../../utils/dateUtils.js';
import MultiSelect from '../shared/MultiSelect.jsx';

export default function EffortIntelligence() {
  const { state, addAbsence, removeAbsence, notify } = useApp();
  const { effortData, bscData, absenceOverrides } = state;

  const allDates   = useMemo(() => getShiftDates(effortData?.rows), [effortData]);
  const todayOpDay = getCurrentOperationalDay();

  // Auto-select: today's operational day if available, else latest
  const defaultDate = useMemo(() => {
    if (!allDates.length) return '';
    if (allDates.includes(todayOpDay)) return todayOpDay;
    return allDates[allDates.length - 1];
  }, [allDates, todayOpDay]);

  const [selDate,    setSelDate]   = useState('');
  const [tlFilter,   setTlFilter]  = useState([]);
  const [apmFilter,  setApmFilter] = useState([]);
  const [paFilter,   setPaFilter]  = useState([]);
  const [showAbsent, setShowAbsent]= useState(false);
  const [sortKey,    setSortKey]   = useState('totalTT');
  const [sortDir,    setSortDir]   = useState('desc');
  const [exporting,  setExporting] = useState('');

  // When data loads, auto-set date
  useEffect(() => { if (defaultDate) setSelDate(defaultDate); }, [defaultDate]);

  const allAdvisors = bscData?.advisors || [];
  const uniqueTLs   = [...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a=>a.apm).filter(Boolean))].sort();
  const advisorMeta = useMemo(()=>{ const m={}; allAdvisors.forEach(a=>{m[a.name]=a;}); return m; }, [allAdvisors]);

  // Filter rows by selected date
  const effortRows = useMemo(() => {
    if (!effortData?.rows) return [];
    return selDate ? filterRowsByDate(effortData.rows, selDate) : effortData.rows;
  }, [effortData, selDate]);

  // All PA names from effort data
  const uniquePAs = useMemo(() => {
    if (!effortData?.rows) return [];
    return [...new Set(effortData.rows.map(r=>r.advisor))].filter(Boolean).sort();
  }, [effortData]);

  // Build summaries
  const summaries = useMemo(() => {
    const agg  = aggregateFilteredRows(effortRows);
    let   rows = summariseAgg(agg).map(r => {
      const meta  = advisorMeta[r.name] || {};
      const absent= (absenceOverrides[r.name]||[]).includes(selDate) || (absenceOverrides[r.name]||[]).includes('all');
      const score = calcEffortScore(r.totalDials / Math.max(Object.keys(agg[r.name]||{}).length,1), r.connRate, r.totalTT / Math.max(Object.keys(agg[r.name]||{}).length,1));
      return { ...r, tl:meta.tl, apm:meta.apm, region:meta.region, absent, score };
    });
    if (tlFilter.length)  rows = rows.filter(r=>tlFilter.includes(r.tl));
    if (apmFilter.length) rows = rows.filter(r=>apmFilter.includes(r.apm));
    if (paFilter.length)  rows = rows.filter(r=>paFilter.includes(r.name));
    if (!showAbsent)      rows = rows.filter(r=>!r.absent);
    return rows.sort((a,b) => sortDir==='desc' ? (b[sortKey]??0)-(a[sortKey]??0) : (a[sortKey]??0)-(b[sortKey]??0));
  }, [effortRows, advisorMeta, absenceOverrides, tlFilter, apmFilter, paFilter, showAbsent, sortKey, sortDir, selDate]);

  const totals = useMemo(() => ({
    dials: summaries.reduce((s,r)=>s+r.totalDials,0),
    conn:  summaries.reduce((s,r)=>s+r.totalConn,0),
    tt:    summaries.reduce((s,r)=>s+r.totalTT,0),
  }), [summaries]);

  const handleSort = k => { if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(k); setSortDir('desc'); } };
  const markAbsent = name => { addAbsence(name, selDate||new Date().toISOString().split('T')[0]); notify(`${name} marked absent`, 'info'); };
  const unmark     = name => { removeAbsence(name, selDate||new Date().toISOString().split('T')[0]); notify(`Absence removed for ${name}`, 'success'); };

  const doExport = async () => {
    setExporting('excel');
    try { await exportEffortExcel(summaries, selDate); }
    catch(e) { notify('Export failed: '+e.message, 'error'); }
    setExporting('');
  };

  if (!effortData) return (
    <div className="empty-state"><div className="empty-icon">📞</div><h3>No Effort Data Loaded</h3><p>Upload your Raw Effort CSV file from the Upload Center.</p></div>
  );

  const COLS = [
    ['name','Advisor',true],['tl','TL',true],['apm','APM',true],
    ['totalDials','Total Calls',false],['totalConn','Connected',false],
    ['totalTT','Talk Time (min)',false],['connRate','Conn Rate %',false],
    ['avgTalkPerConnect','Avg Talk/Connect',false],['score','Effort Score',false],
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* FILTER BAR */}
      <div className="card" style={{ padding:'10px 14px' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>

          {/* Operational Day Picker */}
          <div style={{ background:'#f0fdf4', border:'1px solid var(--green-border)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:8 }}>
            <span>📅</span>
            <div>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)' }}>Operational Day (10AM→10AM)</div>
              <select value={selDate} onChange={e=>setSelDate(e.target.value)}
                style={{ border:'none', background:'transparent', fontWeight:700, fontSize:12, color:'var(--em-green)', cursor:'pointer', outline:'none' }}>
                <option value="">All Dates (QTD)</option>
                {[...allDates].reverse().map(d=>(
                  <option key={d} value={d}>{formatShiftDate(d)}</option>
                ))}
              </select>
              {selDate && <div style={{ fontSize:9, color:'var(--text-muted)' }}>{opDayLabel(selDate)}</div>}
            </div>
          </div>

          <MultiSelect label="TL"  options={uniqueTLs}  value={tlFilter}  onChange={setTlFilter} />
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter} />
          <MultiSelect label="PA"  options={uniquePAs}  value={paFilter}  onChange={setPaFilter} searchable placeholder="Search PA..." />

          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', padding:'4px 8px', background:'#fee2e2', borderRadius:6 }}>
            <input type="checkbox" checked={showAbsent} onChange={e=>setShowAbsent(e.target.checked)} />
            Show Absent
          </label>

          {(tlFilter.length||apmFilter.length||paFilter.length)>0 &&
            <button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setPaFilter([]);}}>✕ Clear</button>
          }
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>
            {summaries.length} advisors · {effortRows.length.toLocaleString()} calls
            {allDates.length === 0 && <span style={{ color:'#dc2626', marginLeft:8 }}>⚠ No shift dates found — re-upload CSV</span>}
          </span>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Total Calls',     value:totals.dials.toLocaleString(), accent:'#6366f1' },
          { label:'Connected Calls', value:totals.conn.toLocaleString(),  accent:'#16a34a' },
          { label:'Talk Time (min)', value:totals.tt.toFixed(0),         accent:'#3b82f6' },
          { label:'Connect Rate',    value:totals.dials>0?(totals.conn/totals.dials*100).toFixed(1)+'%':'—', accent:'#f59e0b' },
          { label:'Avg Talk/Connect',value:totals.conn>0?(totals.tt/totals.conn).toFixed(2):'—', accent:'#8b5cf6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{background:s.accent}}/><div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:22}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* EXPORT */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button className="btn btn-primary btn-sm" onClick={doExport} disabled={!!exporting}>
          {exporting?'⏳ Exporting...':'📊 Export Excel (Team Effort Summary format)'}
        </button>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>
          {selDate ? `Shift: ${opDayLabel(selDate)}` : 'QTD — All Dates'}
          {' '}· Absent excluded: {Object.values(absenceOverrides).filter(d=>d.includes(selDate)).length}
        </span>
      </div>

      {/* TABLE */}
      {summaries.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>
            {effortRows.length === 0 && selDate
              ? `No calls found for ${formatShiftDate(selDate)}`
              : 'No data matches current filters'}
          </div>
          <div style={{ fontSize:12 }}>
            {effortRows.length === 0 && selDate
              ? 'Try selecting a different date or "All Dates (QTD)"'
              : 'Clear filters to see all advisors'}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLS.map(([k,l,left])=>(
                  <th key={k} onClick={()=>handleSort(k)} style={{ textAlign:left?'left':'center', cursor:'pointer' }}>
                    {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
                  </th>
                ))}
                <th>Mark Absent</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(r=>(
                <tr key={r.name} style={{ background:r.absent?'#fff5f5':'' }}>
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
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:40, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${r.score}%`, background:r.score>=70?'#16a34a':r.score>=40?'#eab308':'#ef4444', borderRadius:3 }}/>
                      </div>
                      <span style={{ fontWeight:800, fontSize:12, color:r.score>=70?'#166534':r.score>=40?'#854d0e':'#991b1b' }}>{r.score}</span>
                    </div>
                  </td>
                  <td>
                    {r.absent
                      ? <button className="btn btn-outline btn-sm" style={{ fontSize:10 }} onClick={()=>unmark(r.name)}>✕ Remove</button>
                      : <button className="btn btn-danger btn-sm" style={{ fontSize:10 }} onClick={()=>markAbsent(r.name)}>🔒 Absent</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign:'left', fontWeight:800 }}>Grand Total ({summaries.length})</td>
                <td style={{ fontWeight:800 }}>{totals.dials.toLocaleString()}</td>
                <td style={{ fontWeight:800 }}>{totals.conn}</td>
                <td style={{ fontWeight:800 }}>{totals.tt.toFixed(2)}</td>
                <td style={{ fontWeight:800 }}>{totals.dials>0?(totals.conn/totals.dials*100).toFixed(2)+'%':'—'}</td>
                <td style={{ fontWeight:800 }}>{totals.conn>0?(totals.tt/totals.conn).toFixed(2):'—'}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
