import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';

export default function AbsenceManager() {
  const { state, addAbsence, removeAbsence, notify } = useApp();
  const { bscData, absenceOverrides, attendanceData } = state;
  const [selectedPAs, setSelectedPAs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('Absent');
  const [search, setSearch] = useState('');
  const [tlFilter, setTlFilter] = useState('All');
  const [apmFilter, setApmFilter] = useState('All');

  if (!bscData) return (
    <div className="empty-state"><div className="empty-icon">🔒</div><h3>No Data Loaded</h3><p>Upload BSC data to manage advisor absence.</p></div>
  );

  const allAdvisors = bscData.advisors || [];
  const uniqueTLs  = ['All', ...new Set(allAdvisors.map(a => a.tl).filter(Boolean))].sort();
  const uniqueAPMs = ['All', ...new Set(allAdvisors.map(a => a.apm).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    let list = allAdvisors;
    if (tlFilter !== 'All')  list = list.filter(a => a.tl === tlFilter);
    if (apmFilter !== 'All') list = list.filter(a => a.apm === apmFilter);
    if (search.trim()) list = list.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [allAdvisors, tlFilter, apmFilter, search]);

  const togglePA = (name) => {
    setSelectedPAs(prev => prev.includes(name) ? prev.filter(n=>n!==name) : [...prev, name]);
  };

  const selectAll = () => setSelectedPAs(filtered.map(a => a.name));
  const clearSel  = () => setSelectedPAs([]);

  const markAbsent = () => {
    if (!selectedPAs.length) { notify('Select at least one advisor', 'error'); return; }
    selectedPAs.forEach(name => addAbsence(name, selectedDate));
    notify(`${selectedPAs.length} advisor(s) marked absent for ${selectedDate}`, 'success');
    setSelectedPAs([]);
  };

  const removeOverride = (name, date) => {
    removeAbsence(name, date);
    notify(`Removed absence override for ${name}`, 'info');
  };

  // Active overrides list
  const activeOverrides = useMemo(() => {
    const list = [];
    for (const [name, dates] of Object.entries(absenceOverrides)) {
      for (const date of (dates || [])) {
        const adv = allAdvisors.find(a => a.name === name);
        list.push({ name, date, tl: adv?.tl, apm: adv?.apm });
      }
    }
    return list.sort((a,b) => a.date.localeCompare(b.date));
  }, [absenceOverrides, allAdvisors]);

  const absentToday = Object.entries(absenceOverrides)
    .filter(([,dates]) => dates?.includes(selectedDate)).map(([name]) => name);

  const REASONS = ['Absent', 'EL - Earned Leave', 'SL - Sick Leave', 'UL - Unplanned Leave', 'CO - Comp Off', 'Leave Without Pay'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Total Advisors', value:allAdvisors.length, accent:'#6366f1' },
          { label:'Absent Today', value:absentToday.length, accent:'#dc2626' },
          { label:'Active Overrides', value:activeOverrides.length, accent:'#f59e0b' },
          { label:'Selected', value:selectedPAs.length, accent:'#166534' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:16 }}>
        {/* Left: advisor list with multi-select */}
        <div className="card">
          <div className="card-title">Mark Advisors Absent</div>
          {/* Controls */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input className="search-input" placeholder="Search advisor..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:160 }} />
            <select className="filter-select" value={tlFilter} onChange={e=>setTlFilter(e.target.value)}>
              {uniqueTLs.map(t=><option key={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={apmFilter} onChange={e=>setApmFilter(e.target.value)}>
              {uniqueAPMs.map(a=><option key={a}>{a}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" onClick={selectAll}>Select All ({filtered.length})</button>
            {selectedPAs.length > 0 && <button className="btn btn-outline btn-sm" onClick={clearSel}>Clear ({selectedPAs.length})</button>}
          </div>

          {/* Mark controls */}
          <div style={{ display:'flex', gap:8, marginBottom:14, padding:'12px 14px', background:'#fef9c3', borderRadius:8, border:'1px solid #fde047', flexWrap:'wrap', alignItems:'center' }}>
            <label style={{ fontSize:12, fontWeight:600 }}>Date:</label>
            <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{ padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:13 }} />
            <label style={{ fontSize:12, fontWeight:600 }}>Reason:</label>
            <select className="filter-select" value={reason} onChange={e=>setReason(e.target.value)}>
              {REASONS.map(r=><option key={r}>{r}</option>)}
            </select>
            <button className="btn btn-danger" onClick={markAbsent} disabled={!selectedPAs.length}>
              🔒 Mark {selectedPAs.length || ''} Absent
            </button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{ width:40, textAlign:'center' }}>
                  <input type="checkbox" checked={selectedPAs.length===filtered.length && filtered.length>0} onChange={e=>e.target.checked?selectAll():clearSel()} />
                </th>
                <th style={{ textAlign:'left' }}>PA Name</th>
                <th style={{ textAlign:'left' }}>TL</th>
                <th style={{ textAlign:'left' }}>APM</th>
                <th>Region</th>
                <th>BSC</th>
                <th>Status Today</th>
              </tr></thead>
              <tbody>
                {filtered.map(a => {
                  const isAbsent = absenceOverrides[a.name]?.includes(selectedDate);
                  return (
                    <tr key={a.name} style={{ background: selectedPAs.includes(a.name)?'#fef9c3':isAbsent?'#fee2e2':'' }}>
                      <td style={{ textAlign:'center' }}>
                        <input type="checkbox" checked={selectedPAs.includes(a.name)} onChange={()=>togglePA(a.name)} disabled={isAbsent} />
                      </td>
                      <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                      <td style={{ textAlign:'left', fontSize:12 }}>{a.tl||'—'}</td>
                      <td style={{ textAlign:'left', fontSize:12 }}>{a.apm||'—'}</td>
                      <td><span className={`badge badge-${a.region==='US'?'blue':'green'}`}>{a.region}</span></td>
                      <td><span className={`bsc-badge ${a.colorClass}`}>{a.bscScore?.toFixed(1)}</span></td>
                      <td>{isAbsent ? <span className="badge badge-red">🔒 Absent</span> : <span className="badge badge-green">Present</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: active overrides */}
        <div className="card">
          <div className="card-title">Active Overrides ({activeOverrides.length})</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
            Advisors marked absent are excluded from all exports and operational aggregation. Raw telemetry preserved.
          </div>
          {activeOverrides.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 16px', color:'var(--text-muted)', fontSize:13 }}>No active overrides</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:500, overflowY:'auto' }}>
              {activeOverrides.map((o, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fee2e2', borderRadius:8, border:'1px solid #fca5a5' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{o.name}</div>
                    <div style={{ fontSize:11, color:'#991b1b' }}>{o.date} · {o.tl||'Unknown TL'}</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => removeOverride(o.name, o.date)} style={{ fontSize:11 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
          {activeOverrides.length > 0 && (
            <div style={{ marginTop:12, padding:'10px 12px', background:'var(--em-green-bg)', borderRadius:8, fontSize:12, color:'var(--green-text)' }}>
              ✓ {activeOverrides.length} override(s) active. These advisors are excluded from exports unless overridden.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
