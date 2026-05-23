import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { calcEffortScore } from '../../engines/scenarioEngine.js';
import { filterRowsByDate, getShiftDates, aggregateFilteredRows, summariseAgg } from '../../parsers/effortParser.js';
import { exportEffortExcel, copyToTeams } from '../../utils/exportUtils.js';
import { getCurrentOperationalDay, opDayLabel, formatShiftDate, toDDMMYYYY } from '../../utils/dateUtils.js';
import MultiSelect from '../shared/MultiSelect.jsx';

const HOUR_L = h => h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`;
const PRESETS = [
  { label:'Today (Op Day)', fn:(dates,today)=>dates.includes(today)?[today]:dates.slice(-1) },
  { label:'Last 3 Days',    fn:(dates)=>dates.slice(-3) },
  { label:'Last 7 Days',    fn:(dates)=>dates.slice(-7) },
  { label:'All Dates',      fn:(dates)=>dates },
];

export default function EffortIntelligence() {
  const { state, addAbsence, removeAbsence, notify } = useApp();
  const { effortData, bscData, absenceOverrides } = state;

  const allDates   = useMemo(() => getShiftDates(effortData?.rows), [effortData]);
  const todayOpDay = getCurrentOperationalDay();

  // ── Date/Time Selection State ──────────────────────────────
  const [dateMode,      setDateMode]      = useState('single');  // 'single'|'range'|'multi'|'preset'
  const [selDate,       setSelDate]       = useState('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [selDates,      setSelDates]      = useState([]);
  const [hourFrom,      setHourFrom]      = useState(0);
  const [hourTo,        setHourTo]        = useState(23);
  const [showHourFilter,setShowHourFilter]= useState(false);

  // ── Other filters ──────────────────────────────────────────
  const [tlFilter,  setTlFilter]  = useState([]);
  const [apmFilter, setApmFilter] = useState([]);
  const [paFilter,  setPaFilter]  = useState([]);
  const [showAbsent,setShowAbsent]= useState(false);
  const [sortKey,   setSortKey]   = useState('totalTT');
  const [sortDir,   setSortDir]   = useState('desc');
  const [exporting, setExporting] = useState('');

  // Auto-set to today's operational day
  useEffect(() => {
    if (!allDates.length) return;
    const def = allDates.includes(todayOpDay) ? todayOpDay : allDates[allDates.length-1];
    setSelDate(def);
    setDateFrom(def); setDateTo(def);
    setSelDates([def]);
  }, [allDates, todayOpDay]);

  const allAdvisors = bscData?.advisors || [];
  const uniqueTLs   = [...new Set(allAdvisors.map(a=>a.tl).filter(Boolean))].sort();
  const uniqueAPMs  = [...new Set(allAdvisors.map(a=>a.apm).filter(Boolean))].sort();
  const advisorMeta = useMemo(()=>{ const m={}; allAdvisors.forEach(a=>{m[a.name]=a;}); return m; }, [allAdvisors]);

  // PA names from effort data
  const uniquePAs = useMemo(() => {
    if (!effortData?.rows) return [];
    return [...new Set(effortData.rows.map(r=>r.advisor))].filter(Boolean).sort();
  }, [effortData]);

  // ── Filter rows by selected dates + hours ─────────────────
  const effortRows = useMemo(() => {
    if (!effortData?.rows) return [];
    let rows = effortData.rows;

    if (dateMode==='single' && selDate) {
      rows = rows.filter(r => r.shiftDate === selDate);
    } else if (dateMode==='range' && dateFrom && dateTo) {
      rows = rows.filter(r => r.shiftDate >= dateFrom && r.shiftDate <= dateTo);
    } else if (dateMode==='multi' && selDates.length > 0) {
      const dSet = new Set(selDates);
      rows = rows.filter(r => dSet.has(r.shiftDate));
    }

    // Hour filter (applies to original hour, not shift date hour)
    if (hourFrom > 0 || hourTo < 23) {
      rows = rows.filter(r => r.hour >= hourFrom && r.hour <= hourTo);
    }

    return rows;
  }, [effortData, dateMode, selDate, dateFrom, dateTo, selDates, hourFrom, hourTo]);

  // Summarise
  const summaries = useMemo(() => {
    const agg  = aggregateFilteredRows(effortRows);
    let   rows = summariseAgg(agg).map(r => {
      const meta   = advisorMeta[r.name] || {};
      const absent = (absenceOverrides[r.name]||[]).includes(selDate) || (absenceOverrides[r.name]||[]).includes('all');
      const days   = Object.keys(agg[r.name]||{}).length || 1;
      const score  = calcEffortScore(r.totalDials/days, r.connRate, r.totalTT/days);
      return { ...r, tl:meta.tl, apm:meta.apm, region:meta.region, absent, score };
    });
    if (tlFilter.length)  rows = rows.filter(r=>tlFilter.includes(r.tl));
    if (apmFilter.length) rows = rows.filter(r=>apmFilter.includes(r.apm));
    if (paFilter.length)  rows = rows.filter(r=>paFilter.includes(r.name));
    if (!showAbsent)      rows = rows.filter(r=>!r.absent);
    return rows.sort((a,b) => sortDir==='desc'?(b[sortKey]??0)-(a[sortKey]??0):(a[sortKey]??0)-(b[sortKey]??0));
  }, [effortRows, advisorMeta, absenceOverrides, tlFilter, apmFilter, paFilter, showAbsent, sortKey, sortDir, selDate]);

  const totals = useMemo(()=>({
    dials:summaries.reduce((s,r)=>s+r.totalDials,0),
    conn: summaries.reduce((s,r)=>s+r.totalConn,0),
    tt:   summaries.reduce((s,r)=>s+r.totalTT,0),
    ptt:  summaries.reduce((s,r)=>s+r.totalPTT,0),
  }),[summaries]);

  const handleSort = k => { if(sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortKey(k);setSortDir('desc');} };
  const markAbsent = name => { addAbsence(name, selDate||todayOpDay); notify(`${name} marked absent`, 'info'); };
  const unmark     = name => { removeAbsence(name, selDate||todayOpDay); notify(`Absence removed`, 'success'); };

  const doExport = async (type) => {
    setExporting(type);
    try {
      if (type==='excel') await exportEffortExcel(summaries, selDate);
      if (type==='teams') { copyToTeams(summaries,'effort'); notify('Copied to clipboard','success'); }
    } catch(e) { notify('Export failed: '+e.message,'error'); }
    setExporting('');
  };

  const applyPreset = (preset) => {
    const dates = preset.fn(allDates, todayOpDay);
    if (dates.length===1) { setDateMode('single'); setSelDate(dates[0]); }
    else { setDateMode('multi'); setSelDates(dates); }
  };

  if (!effortData) return (
    <div className="empty-state card"><div className="empty-icon">📞</div><h3>No Effort Data Loaded</h3><p>Upload your Raw Effort CSV file from the Upload Center to activate this module.</p></div>
  );

  const dateLabel = dateMode==='single'&&selDate ? opDayLabel(selDate)
    : dateMode==='range'&&dateFrom&&dateTo ? `${toDDMMYYYY(dateFrom)} → ${toDDMMYYYY(dateTo)}`
    : dateMode==='multi'&&selDates.length ? `${selDates.length} dates selected`
    : 'All Dates (QTD)';

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* ── Date & Time Selection ── */}
      <div className="date-selector-wrap">
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
          <span style={{fontSize:12,fontWeight:700,color:'var(--txt2)'}}>📅 Date Filter:</span>
          <div className="date-mode-tabs">
            {[['single','Single Day'],['range','Date Range'],['multi','Multi-Select']].map(([m,l])=>(
              <button key={m} className={`date-mode-tab ${dateMode===m?'active':''}`} onClick={()=>setDateMode(m)}>{l}</button>
            ))}
          </div>
          {/* Quick Presets */}
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {PRESETS.map(p=>(
              <button key={p.label} className="btn btn-outline btn-sm" onClick={()=>applyPreset(p)} style={{fontSize:10}}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowHourFilter(!showHourFilter)} style={{marginLeft:'auto',fontSize:10}}>
            🕐 Hour Filter {showHourFilter?'▲':'▼'}
          </button>
        </div>

        {/* Single date */}
        {dateMode==='single' && (
          <select className="filter-select" value={selDate} onChange={e=>setSelDate(e.target.value)}>
            <option value="">All Dates (QTD)</option>
            {[...allDates].reverse().map(d=><option key={d} value={d}>{formatShiftDate(d)}</option>)}
          </select>
        )}

        {/* Date range */}
        {dateMode==='range' && (
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <label style={{fontSize:11,fontWeight:600}}>From:</label>
            <select className="filter-select" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}>
              {allDates.map(d=><option key={d} value={d}>{formatShiftDate(d)}</option>)}
            </select>
            <label style={{fontSize:11,fontWeight:600}}>To:</label>
            <select className="filter-select" value={dateTo} onChange={e=>setDateTo(e.target.value)}>
              {allDates.map(d=><option key={d} value={d}>{formatShiftDate(d)}</option>)}
            </select>
          </div>
        )}

        {/* Multi-date */}
        {dateMode==='multi' && (
          <div>
            <div style={{fontSize:11,color:'var(--txt3)',marginBottom:6}}>Click dates to select/deselect:</div>
            <div className="date-multi-grid">
              {[...allDates].reverse().map(d=>(
                <button key={d} className={`date-chip ${selDates.includes(d)?'selected':''}`}
                  onClick={()=>setSelDates(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])}>
                  {formatShiftDate(d)}
                </button>
              ))}
            </div>
            {selDates.length>0&&<div style={{fontSize:10,color:'var(--txt3)',marginTop:6}}>{selDates.length} date(s) selected</div>}
          </div>
        )}

        {/* Hour range filter */}
        {showHourFilter && (
          <div className="hour-range-wrap" style={{marginTop:12,padding:'10px 14px',background:'white',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
            <label>Hour Range:</label>
            <div style={{display:'flex',alignItems:'center',gap:10,flex:1}}>
              <select className="filter-select" value={hourFrom} onChange={e=>setHourFrom(+e.target.value)}>
                {Array.from({length:24},(_,i)=><option key={i} value={i}>{HOUR_L(i)}</option>)}
              </select>
              <span style={{fontSize:12,color:'var(--txt3)'}}>to</span>
              <select className="filter-select" value={hourTo} onChange={e=>setHourTo(+e.target.value)}>
                {Array.from({length:24},(_,i)=><option key={i} value={i}>{HOUR_L(i)}</option>)}
              </select>
              {(hourFrom>0||hourTo<23)&&<button className="btn btn-ghost btn-sm" onClick={()=>{setHourFrom(0);setHourTo(23);}}>Reset</button>}
            </div>
            <div style={{fontSize:10,color:'var(--txt3)',marginLeft:8}}>
              Showing calls between {HOUR_L(hourFrom)} and {HOUR_L(hourTo)}
            </div>
          </div>
        )}

        {/* Active filter summary */}
        <div style={{marginTop:8,fontSize:11,color:'var(--txt3)'}}>
          📊 Showing: <strong style={{color:'var(--brand-d)'}}>{dateLabel}</strong>
          {(hourFrom>0||hourTo<23) && <> · Hours: <strong style={{color:'var(--brand-d)'}}>{HOUR_L(hourFrom)} – {HOUR_L(hourTo)}</strong></>}
          {' '}· <strong>{effortRows.length.toLocaleString()}</strong> calls · <strong>{summaries.length}</strong> advisors
        </div>
      </div>

      {/* ── Hierarchy Filters ── */}
      <div className="card" style={{padding:'10px 14px'}}>
        <div className="filter-bar" style={{marginBottom:0}}>
          <MultiSelect label="TL"  options={uniqueTLs}  value={tlFilter}  onChange={setTlFilter}/>
          <MultiSelect label="APM" options={uniqueAPMs} value={apmFilter} onChange={setApmFilter}/>
          <MultiSelect label="PA"  options={uniquePAs}  value={paFilter}  onChange={setPaFilter} searchable placeholder="Search PA..."/>
          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',padding:'4px 8px',background:'var(--red-bg)',borderRadius:'var(--radius-sm)'}}>
            <input type="checkbox" checked={showAbsent} onChange={e=>setShowAbsent(e.target.checked)}/>
            Show Absent
          </label>
          {(tlFilter.length||apmFilter.length||paFilter.length)>0&&
            <button className="btn btn-outline btn-sm" onClick={()=>{setTlFilter([]);setApmFilter([]);setPaFilter([]);}}>✕ Clear</button>}
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}>
        {[
          {label:'Total Calls',    value:totals.dials.toLocaleString(), accent:'#6366f1'},
          {label:'Connected',      value:totals.conn.toLocaleString(),  accent:'#16a34a'},
          {label:'Talk Time (min)',value:totals.tt.toFixed(0),          accent:'#3b82f6'},
          {label:'Connect Rate',   value:totals.dials>0?(totals.conn/totals.dials*100).toFixed(1)+'%':'—', accent:'#f59e0b'},
          {label:'Avg Talk/Connect',value:totals.conn>0?(totals.tt/totals.conn).toFixed(2):'—',            accent:'#8b5cf6'},
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{background:s.accent}}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:22}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Export Bar ── */}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button className="btn btn-primary btn-sm" onClick={()=>doExport('excel')} disabled={!!exporting}>
          {exporting==='excel'?'⏳':'📊'} {exporting==='excel'?'Exporting...':'Export Team Effort Summary (Excel)'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={()=>doExport('teams')} disabled={!!exporting}>💬 Copy to Teams</button>
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--txt3)'}}>
          {dateLabel} {(hourFrom>0||hourTo<23)?`· ${HOUR_L(hourFrom)}–${HOUR_L(hourTo)}`:''}
        </span>
      </div>

      {/* ── Table ── */}
      {summaries.length===0 ? (
        <div className="empty-state card"><div>📋</div><h3>No Data for Selected Filters</h3>
          <p>Try selecting a different date or clearing filters. If you've just uploaded data, ensure the date filter matches your uploaded dates.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['name','Advisor',true],['tl','TL',true],['apm','APM',true],
                  ['totalDials','Total Calls'],['totalConn','Connected'],
                  ['totalPTT','PTT (min)'],['totalTT','Total TT (min)'],['connRate','Conn Rate %'],
                  ['avgTalkPerConnect','Avg PTT/Connect'],['score','Effort Score']].map(([k,l,left])=>(
                  <th key={k} onClick={()=>handleSort(k)} style={{textAlign:left?'left':'center',cursor:'pointer'}}>
                    {l} {sortKey===k?(sortDir==='desc'?'↓':'↑'):''}
                  </th>
                ))}
                <th>Mark Absent</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(r=>(
                <tr key={r.name} style={{background:r.absent?'#fff5f5':''}}>
                  <td style={{textAlign:'left',fontWeight:700}}>
                    {r.name}
                    {r.absent&&<span className="badge badge-red" style={{marginLeft:6,fontSize:9}}>Absent</span>}
                  </td>
                  <td style={{textAlign:'left',fontSize:11}}>{r.tl||'—'}</td>
                  <td style={{textAlign:'left',fontSize:11}}>{r.apm||'—'}</td>
                  <td>{r.totalDials.toLocaleString()}</td>
                  <td>{r.totalConn}</td>
                  <td style={{fontWeight:700,color:'var(--brand-d)'}}>{r.totalPTT.toFixed(2)}</td>
                  <td style={{color:'var(--txt3)'}}>{r.totalTT.toFixed(2)}</td>
                  <td>{(r.connRate*100).toFixed(2)}%</td>
                  <td>{r.totalConn>0?(r.totalPTT/r.totalConn).toFixed(2):'—'}</td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <div style={{width:40,height:6,background:'var(--s200)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${r.score}%`,background:r.score>=70?'#16a34a':r.score>=40?'#eab308':'#ef4444',borderRadius:3}}/>
                      </div>
                      <span style={{fontWeight:800,fontSize:12,color:r.score>=70?'#166534':r.score>=40?'#854d0e':'#991b1b'}}>{r.score}</span>
                    </div>
                  </td>
                  <td>
                    {r.absent
                      ? <button className="btn btn-outline btn-sm" style={{fontSize:10}} onClick={()=>unmark(r.name)}>✕ Remove</button>
                      : <button className="btn btn-danger btn-sm"  style={{fontSize:10}} onClick={()=>markAbsent(r.name)}>🔒 Absent</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{textAlign:'left'}}>Grand Total ({summaries.length})</td>
                <td>{totals.dials.toLocaleString()}</td>
                <td>{totals.conn.toLocaleString()}</td>
                <td style={{fontWeight:700}}>{totals.ptt.toFixed(2)}</td>
                <td>{totals.tt.toFixed(2)}</td>
                <td>{totals.dials>0?(totals.conn/totals.dials*100).toFixed(2)+'%':'—'}</td>
                <td>{totals.conn>0?(totals.ptt/totals.conn).toFixed(2):'—'}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
