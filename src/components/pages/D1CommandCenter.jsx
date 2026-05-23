// ============================================================
// D-1 COMMAND CENTER
// Three separate frames: TL | APM | PA
// Each frame filterable independently
// BSC shown as rounded % (e.g. 90%)
// ============================================================
import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { toDDMMYYYY } from '../../utils/dateUtils.js';
import PageExportButton from '../shared/PageExportButton.jsx';

// ── BSC badge — D-1 format: "90%" rounded ─────────────────
function D1BSC({ val }) {
  if (val == null) return <span className="bsc-badge bsc-na">—</span>;
  const v   = val > 1 ? val : val * 100;
  const pct = Math.round(v);
  const cls = pct >= 71 ? 'bsc-green' : pct >= 60 ? 'bsc-yellow' : 'bsc-red';
  return <span className={`bsc-badge ${cls}`}>{pct}%</span>;
}

// ── Delta indicator ───────────────────────────────────────
const TARGETS = { ccActuals:21, ahtActuals:780, ttfaActuals:0.95, pttActuals:145 };

function Delta({ actual, target, lowerIsBetter=false }) {
  if (actual == null || target == null) return null;
  const diff = actual - target;
  const pct  = target !== 0 ? (diff / target) * 100 : 0;
  const good = lowerIsBetter ? diff <= 0 : diff >= 0;
  const abs  = Math.abs(pct).toFixed(1);
  return (
    <span style={{
      fontSize:9, fontWeight:700, padding:'1px 4px', borderRadius:3,
      background: good ? '#dcfce7' : '#fee2e2',
      color: good ? '#166534' : '#991b1b',
      marginLeft: 4,
    }}>
      {good ? '▲' : '▼'} {abs}%
    </span>
  );
}

// ── Metric cell formatter ──────────────────────────────────
function MetCell({ val, isPercent, isPct }) {
  if (val == null) return <td>—</td>;
  let display;
  if (isPct) {
    const v = val > 1 ? val : val * 100;
    display = Math.round(v) + '%';
  } else if (isPercent) {
    display = Math.round(val > 1 ? val : val * 100) + '%';
  } else {
    display = Math.round(val);
  }
  return <td>{display}</td>;
}

// ── Shared table header ────────────────────────────────────
function D1Header({ label }) {
  return (
    <thead>
      <tr>
        <th style={{ textAlign:'left', minWidth:160 }}>{label}</th>
        <th>D-1 BSC</th>
        <th>Avg Dials</th>
        <th>Prod%</th>
        <th>CC Actuals</th>
        <th>CC %Ach</th>
        <th>AHT (s)</th>
        <th>AHT %Ach</th>
        <th>TTFA</th>
        <th>TTFA %Ach</th>
        <th>PTT (min)</th>
        <th>PTT %Ach</th>
      </tr>
    </thead>
  );
}

// ── Single data row ────────────────────────────────────────
function D1Row({ r, nameStyle }) {
  return (
    <tr>
      <td style={{ textAlign:'left', fontWeight:700, ...nameStyle }}>{r.name}</td>
      <td><D1BSC val={r.bscScore}/></td>
      <MetCell val={r.avgDials}/>
      <MetCell val={r.pctProductive} isPct/>
      <MetCell val={r.ccActuals}/>
      <MetCell val={r.ccPct} isPct/>
      <MetCell val={r.ahtActuals}/>
      <MetCell val={r.ahtPct} isPct/>
      <MetCell val={r.ttfaActuals} isPct/>
      <MetCell val={r.ttfaPct} isPct/>
      <MetCell val={r.pttActuals}/>
      <MetCell val={r.pttPct} isPct/>
    </tr>
  );
}

// ── Frame wrapper ──────────────────────────────────────────
function Frame({ title, icon, color, children, count, badge }) {
  return (
    <div className="card" style={{ padding:0, border:`2px solid ${color}22`, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', background:`${color}11`, borderBottom:`1px solid ${color}33`,
        display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <span style={{ fontWeight:800, fontSize:14, color }}>{title}</span>
        {count != null && (
          <span style={{ fontSize:11, fontWeight:700, background:color, color:'white',
            borderRadius:99, padding:'2px 8px', marginLeft:4 }}>{count}</span>
        )}
        {badge && <span className="badge badge-blue" style={{ fontSize:10 }}>{badge}</span>}
      </div>
      <div style={{ padding:'12px 14px' }}>{children}</div>
    </div>
  );
}

export default function D1CommandCenter() {
  const { state } = useApp();
  const { bscData } = state;

  const [tlFilter,  setTlFilter]  = useState('All');
  const [apmFilter, setApmFilter] = useState('All');
  const [paSearch,  setPaSearch]  = useState('');
  const [sortPA,    setSortPA]    = useState('bscScore');
  const [sortDir,   setSortDir]   = useState('desc');

  if (!bscData) return (
    <div className="empty-state card">
      <div className="empty-icon">📅</div>
      <h3>No BSC Data Loaded</h3>
      <p>Upload your BSC Workbook to activate the D-1 Command Center.</p>
    </div>
  );

  const d1Data = bscData.d1Data || [];
  const allAdvisors = bscData.advisors || [];

  // ── Separate by type ──────────────────────────────────────
  const tlRows  = d1Data.filter(r => r.type === 'TL');
  const apmRows = d1Data.filter(r => r.type === 'APM');
  const paRows  = d1Data.filter(r => r.type === 'PA');

  // If no D-1 type data, fall back to BSC advisor hierarchy for PA frame
  const useBSCFallback = paRows.length === 0;

  // Unique TLs and APMs for filters
  const uniqueTLs  = useMemo(() => ['All', ...new Set(allAdvisors.map(a => a.tl).filter(Boolean)).keys ? [...new Set(allAdvisors.map(a => a.tl).filter(Boolean))] : []], [allAdvisors]);
  const uniqueAPMs = useMemo(() => {
    const base = tlFilter === 'All' ? allAdvisors : allAdvisors.filter(a => a.tl === tlFilter);
    return ['All', ...[...new Set(base.map(a => a.apm).filter(Boolean))]];
  }, [allAdvisors, tlFilter]);

  // ── D-1 date label ────────────────────────────────────────
  const d1Date = d1Data[0]?.d1Date;
  const dateLabel = d1Date
    ? toDDMMYYYY(d1Date instanceof Date ? d1Date.toISOString().split('T')[0] : String(d1Date).split('T')[0])
    : 'Previous Day';

  // ── TL frame data ─────────────────────────────────────────
  const filteredTL = useMemo(() => {
    let rows = tlRows.length > 0 ? tlRows : [];
    // Fallback: aggregate BSC advisors by TL
    if (rows.length === 0 && allAdvisors.length > 0) {
      const tlMap = {};
      allAdvisors.forEach(a => {
        if (!a.tl) return;
        if (!tlMap[a.tl]) tlMap[a.tl] = { name:a.tl, type:'TL', bscScores:[], dials:[] };
        tlMap[a.tl].bscScores.push(a.bscScore || 0);
      });
      rows = Object.values(tlMap).map(t => ({
        ...t,
        bscScore: t.bscScores.reduce((s,v)=>s+v,0) / t.bscScores.length,
        totalPAs: t.bscScores.length,
      }));
    }
    if (tlFilter !== 'All') rows = rows.filter(r => r.name === tlFilter);
    return rows.sort((a,b) => (b.bscScore||0) - (a.bscScore||0));
  }, [tlRows, allAdvisors, tlFilter]);

  // ── APM frame data ────────────────────────────────────────
  const filteredAPM = useMemo(() => {
    let rows = apmRows.length > 0 ? apmRows : [];
    // Fallback: aggregate by APM from BSC advisors
    if (rows.length === 0 && allAdvisors.length > 0) {
      const apmMap = {};
      allAdvisors.forEach(a => {
        if (!a.apm) return;
        if (tlFilter !== 'All' && a.tl !== tlFilter) return;
        if (!apmMap[a.apm]) apmMap[a.apm] = { name:a.apm, type:'APM', tl:a.tl, bscScores:[], paCount:0 };
        apmMap[a.apm].bscScores.push(a.bscScore || 0);
        apmMap[a.apm].paCount++;
      });
      rows = Object.values(apmMap).map(t => ({
        ...t,
        bscScore:  t.bscScores.reduce((s,v)=>s+v,0) / t.bscScores.length,
        totalPAs:  t.paCount,
      }));
    }
    if (tlFilter  !== 'All') rows = rows.filter(r => r.tl  === tlFilter  || !r.tl);
    if (apmFilter !== 'All') rows = rows.filter(r => r.name === apmFilter);
    return rows.sort((a,b) => (b.bscScore||0) - (a.bscScore||0));
  }, [apmRows, allAdvisors, tlFilter, apmFilter]);

  // ── PA frame data ─────────────────────────────────────────
  const filteredPA = useMemo(() => {
    let rows = useBSCFallback
      ? allAdvisors.map(a => ({
          name:         a.name,
          type:         'PA',
          tl:           a.tl,
          apm:          a.apm,
          bscScore:     a.bscScore,
          avgDials:     a.connectedCalls,     // approximate
          ccActuals:    a.connectedCalls,
          ahtActuals:   a.ahtFirstCall,
          ttfaActuals:  a.adjustedTTFA,
          pttActuals:   a.pureTaskTime,
          pctProductive:a.productiveDays,
          d1Date,
        }))
      : paRows;

    if (tlFilter  !== 'All') rows = rows.filter(r => r.tl  === tlFilter);
    if (apmFilter !== 'All') rows = rows.filter(r => r.apm === apmFilter);
    if (paSearch.trim())     rows = rows.filter(r => r.name?.toLowerCase().includes(paSearch.toLowerCase()));

    return rows.sort((a,b) => {
      const av = a[sortPA] ?? 0, bv = b[sortPA] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [paRows, allAdvisors, tlFilter, apmFilter, paSearch, sortPA, sortDir, useBSCFallback, d1Date]);

  const handleSortPA = key => {
    if (sortPA === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortPA(key); setSortDir('desc'); }
  };

  // ── Summary KPIs ──────────────────────────────────────────
  const avgBSC = filteredPA.length
    ? filteredPA.reduce((s,r)=>s+(r.bscScore||0),0)/filteredPA.length : 0;
  const paGreen  = filteredPA.filter(r => (r.bscScore||0) >= 71).length;
  const paYellow = filteredPA.filter(r => (r.bscScore||0) >= 60 && (r.bscScore||0) < 71).length;
  const paRed    = filteredPA.filter(r => (r.bscScore||0) < 60).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header bar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:12, color:'var(--txt3)', marginBottom:4 }}>
            📅 D-1 Date: <strong>{dateLabel}</strong>
            {useBSCFallback && <span className="badge badge-yellow" style={{ marginLeft:8, fontSize:10 }}>Using QTD BSC data (no D-1 sheet found)</span>}
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Global hierarchy filters */}
          <label style={{ fontSize:11, fontWeight:700, color:'var(--txt2)' }}>Filter:</label>
          <select className="filter-select" value={tlFilter} onChange={e => { setTlFilter(e.target.value); setApmFilter('All'); }}>
            {uniqueTLs.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={apmFilter} onChange={e => setApmFilter(e.target.value)}>
            {uniqueAPMs.map(a => <option key={a}>{a}</option>)}
          </select>
          {(tlFilter !== 'All' || apmFilter !== 'All') && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setTlFilter('All'); setApmFilter('All'); }}>✕ Clear</button>
          )}
        </div>
      </div>

      {/* KPI summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {[
          { label:'Total PAs',    value:filteredPA.length,    accent:'#6366f1' },
          { label:'Avg D-1 BSC',  value:`${Math.round(avgBSC)}%`, accent:'#16a34a' },
          { label:'Green (≥71%)', value:paGreen,              accent:'#16a34a' },
          { label:'Yellow (60-70)',value:paYellow,             accent:'#eab308' },
          { label:'Red (<60%)',    value:paRed,                accent:'#ef4444' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22, color:s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── FRAME 1: TL DATA ─────────────────────────────── */}
      <Frame title="Team Lead Performance" icon="👔" color="#7c3aed"
        count={filteredTL.length} badge={`D-1: ${dateLabel}`}>
        {filteredTL.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px', color:'var(--txt3)', fontSize:12 }}>
            No TL data in D-1 sheet — showing aggregated BSC summary instead
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <D1Header label="Team Lead"/>
              <tbody>
                {filteredTL.map((r,i) => (
                  <D1Row key={i} r={r} nameStyle={{ color:'#7c3aed' }}/>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Frame>

      {/* ── FRAME 2: APM DATA ─────────────────────────────── */}
      <Frame title="APM Performance" icon="📊" color="#0369a1"
        count={filteredAPM.length} badge={`D-1: ${dateLabel}`}>
        {filteredAPM.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px', color:'var(--txt3)', fontSize:12 }}>
            {apmRows.length === 0 ? 'No APM rows in D-1 sheet' : 'No APMs match current filters'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <D1Header label="APM"/>
              <tbody>
                {filteredAPM.map((r,i) => (
                  <tr key={i}>
                    <td style={{ textAlign:'left', fontWeight:700, color:'#0369a1' }}>
                      {r.name}
                      {r.tl && <div style={{ fontSize:10, color:'var(--txt3)', fontWeight:400 }}>TL: {r.tl}</div>}
                    </td>
                    <td><D1BSC val={r.bscScore}/></td>
                    <MetCell val={r.avgDials}/>
                    <MetCell val={r.pctProductive} isPct/>
                    <MetCell val={r.ccActuals}/>
                    <MetCell val={r.ccPct} isPct/>
                    <MetCell val={r.ahtActuals}/>
                    <MetCell val={r.ahtPct} isPct/>
                    <MetCell val={r.ttfaActuals} isPct/>
                    <MetCell val={r.ttfaPct} isPct/>
                    <MetCell val={r.pttActuals}/>
                    <MetCell val={r.pttPct} isPct/>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Frame>

      {/* ── FRAME 3: PA DATA ──────────────────────────────── */}
      <Frame title="PA Performance" icon="🧑‍💼" color="#16a34a"
        count={filteredPA.length} badge={`D-1: ${dateLabel}`}>
        {/* PA-level search */}
        <div className="filter-bar" style={{ marginBottom:12 }}>
          <input className="search-input" placeholder="Search PA name..." value={paSearch}
            onChange={e => setPaSearch(e.target.value)} style={{ width:200 }}/>
          <select className="filter-select" value={sortPA} onChange={e => setSortPA(e.target.value)}>
            <option value="bscScore">Sort: BSC Score</option>
            <option value="ccActuals">Sort: CC Actuals</option>
            <option value="ahtActuals">Sort: AHT</option>
            <option value="pttActuals">Sort: PTT</option>
            <option value="avgDials">Sort: Avg Dials</option>
            <option value="name">Sort: Name</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setSortDir(d => d==='asc'?'desc':'asc')}>
            {sortDir === 'desc' ? '↓ Desc' : '↑ Asc'}
          </button>
          {paSearch && <button className="btn btn-ghost btn-sm" onClick={() => setPaSearch('')}>✕</button>}
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--txt3)' }}>
            {filteredPA.length} PAs
          </span>
          <PageExportButton data={useBSCFallback ? allAdvisors : paRows} filteredData={filteredPA} type="bsc" label="Export PA Data"/>
        </div>

        {filteredPA.length === 0 ? (
          <div style={{ textAlign:'center', padding:'20px', color:'var(--txt3)', fontSize:12 }}>No PAs match current filters</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {[['name','PA Name',true],['apm','APM',true],['tl','TL',true],
                    ['bscScore','D-1 BSC'],['avgDials','Avg Dials'],['pctProductive','Prod%'],
                    ['ccActuals','CC'],['ccPct','CC%'],['ahtActuals','AHT(s)'],['ahtPct','AHT%'],
                    ['ttfaActuals','TTFA'],['ttfaPct','TTFA%'],['pttActuals','PTT(min)'],['pttPct','PTT%'],
                  ].map(([k,l,left]) => (
                    <th key={k} onClick={() => handleSortPA(k)}
                      style={{ textAlign:left?'left':'center', cursor:'pointer', whiteSpace:'nowrap' }}>
                      {l} {sortPA===k ? (sortDir==='desc'?'↓':'↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPA.map((r, i) => (
                  <tr key={i} style={{
                    background: (r.bscScore||0)>=71 ? '#f0fdf4' : (r.bscScore||0)>=60 ? '#fefce8' : '#fff5f5'
                  }}>
                    <td style={{ textAlign:'left', fontWeight:800, fontSize:12 }}>{r.name}</td>
                    <td style={{ textAlign:'left', fontSize:11, color:'var(--txt3)' }}>{r.apm||'—'}</td>
                    <td style={{ textAlign:'left', fontSize:11, color:'var(--txt3)' }}>{r.tl||'—'}</td>
                    <td><D1BSC val={r.bscScore}/></td>
                    <td>{r.avgDials != null ? Math.round(r.avgDials) : '—'}</td>
                    <td>{r.pctProductive != null ? Math.round(r.pctProductive > 1 ? r.pctProductive : r.pctProductive*100)+'%' : '—'}</td>
                    <td style={{ fontWeight:700 }}>
                      {r.ccActuals != null ? Math.round(r.ccActuals) : '—'}
                      {r.ccActuals != null && <Delta actual={r.ccActuals} target={21}/>}
                    </td>
                    <td>{r.ccPct != null ? Math.round(r.ccPct > 1 ? r.ccPct : r.ccPct*100)+'%' : '—'}</td>
                    <td>
                      {r.ahtActuals != null ? Math.round(r.ahtActuals) : '—'}
                      {r.ahtActuals != null && <Delta actual={r.ahtActuals} target={780} lowerIsBetter/>}
                    </td>
                    <td>{r.ahtPct != null ? Math.round(r.ahtPct > 1 ? r.ahtPct : r.ahtPct*100)+'%' : '—'}</td>
                    <td>
                      {r.ttfaActuals != null ? Math.round(r.ttfaActuals > 1 ? r.ttfaActuals : r.ttfaActuals*100)+'%' : '—'}
                      {r.ttfaActuals != null && <Delta actual={r.ttfaActuals > 1 ? r.ttfaActuals/100 : r.ttfaActuals} target={0.95}/>}
                    </td>
                    <td>{r.ttfaPct != null ? Math.round(r.ttfaPct > 1 ? r.ttfaPct : r.ttfaPct*100)+'%' : '—'}</td>
                    <td style={{ fontWeight:700 }}>
                      {r.pttActuals != null ? Math.round(r.pttActuals) : '—'}
                      {r.pttActuals != null && <Delta actual={r.pttActuals} target={145}/>}
                    </td>
                    <td>{r.pttPct != null ? Math.round(r.pttPct > 1 ? r.pttPct : r.pttPct*100)+'%' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Frame>
    </div>
  );
}
