import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import PageExportButton from '../shared/PageExportButton.jsx';
import { classifyCode } from '../../parsers/attendanceParser.js';

const LEAVE_COLORS = { present:'#16a34a', absent:'#dc2626', late:'#f59e0b', holiday:'#6366f1', weekend:'#94a3b8' };
const LEAVE_LABELS = { present:'Present', absent:'Absent', late:'Late Login', holiday:'Holiday/RH', weekend:'Week Off' };

export default function AttendanceIntelligence() {
  const { state } = useApp();
  const { attendanceData, bscData } = state;
  const [view, setView] = useState('summary'); // 'summary' | 'calendar' | 'correlation'
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [search, setSearch] = useState('');

  if (!attendanceData) return (
    <div className="empty-state">
      <div className="empty-icon">📅</div>
      <h3>No Attendance Data</h3>
      <p>Upload your Leave Planner Excel file (FY26 Leave Planner) to activate attendance intelligence.</p>
    </div>
  );

  const { lookup, advisors: attAdvisors } = attendanceData;
  const bscAdvisors = bscData?.advisors || [];
  const advisorBSC  = useMemo(() => { const m = {}; bscAdvisors.forEach(a => { m[a.name] = a; }); return m; }, [bscAdvisors]);

  // Summary per advisor
  const summaries = useMemo(() => {
    return attAdvisors
      .filter(n => !search || n.toLowerCase().includes(search.toLowerCase()))
      .map(name => {
        const days = Object.entries(lookup[name] || {});
        const q4Days = days.filter(([date]) => date >= '2026-04-01' && date <= '2026-06-30');
        const present  = q4Days.filter(([,v]) => v.status === 'present').length;
        const absent   = q4Days.filter(([,v]) => v.status === 'absent').length;
        const late     = q4Days.filter(([,v]) => v.status === 'late').length;
        const holiday  = q4Days.filter(([,v]) => v.status === 'holiday').length;
        const weekend  = q4Days.filter(([,v]) => v.status === 'weekend').length;
        const working  = q4Days.filter(([,v]) => !['weekend','holiday'].includes(v.status)).length;
        const leaveTypes = {};
        q4Days.filter(([,v]) => v.status === 'absent').forEach(([,v]) => { const c = v.code||'Unknown'; leaveTypes[c] = (leaveTypes[c]||0)+1; });
        const bsc = advisorBSC[name];
        return { name, present, absent, late, holiday, weekend, working, leaveTypes, bsc, pctPresent: working > 0 ? (present+late)/working : 0 };
      })
      .sort((a,b) => b.absent - a.absent);
  }, [attAdvisors, lookup, search, advisorBSC]);

  // Selected advisor calendar
  const calendarDays = useMemo(() => {
    if (!selectedAdvisor) return [];
    const entries = Object.entries(lookup[selectedAdvisor] || {})
      .filter(([d]) => d >= '2026-04-01' && d <= '2026-06-30')
      .sort(([a],[b]) => a.localeCompare(b));
    return entries.map(([date, info]) => ({ date, ...info }));
  }, [selectedAdvisor, lookup]);

  const totals = useMemo(() => ({
    totalPresent: summaries.reduce((s,a)=>s+a.present,0),
    totalAbsent:  summaries.reduce((s,a)=>s+a.absent,0),
    totalLate:    summaries.reduce((s,a)=>s+a.late,0),
    avgPct:       summaries.length ? summaries.reduce((s,a)=>s+a.pctPresent,0)/summaries.length : 0,
    mostAbsent:   summaries[0]?.name || '—',
  }), [summaries]);

  const STATUS_CELL = {
    present: { bg:'#dcfce7', text:'P', color:'#166534' },
    absent:  { bg:'#fee2e2', text:'A', color:'#991b1b' },
    late:    { bg:'#fef9c3', text:'L', color:'#854d0e' },
    holiday: { bg:'#ede9fe', text:'H', color:'#5b21b6' },
    weekend: { bg:'#f1f5f9', text:'W', color:'#94a3b8' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Advisors Tracked',   value:attAdvisors.length,                  accent:'#6366f1' },
          { label:'Total Present (Q4)', value:totals.totalPresent,                  accent:'#16a34a' },
          { label:'Total Absent (Q4)',  value:totals.totalAbsent,                   accent:'#dc2626' },
          { label:'Late Logins',        value:totals.totalLate,                     accent:'#f59e0b' },
          { label:'Avg Attendance%',    value:(totals.avgPct*100).toFixed(1)+'%',   accent:'#3b82f6' },
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-accent" style={{ background:s.accent }}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tab strip */}
      <div className="tab-strip">
        {[['summary','Summary Table'],['calendar','Calendar View'],['correlation','BSC Correlation']].map(([id,label])=>(
          <div key={id} className={`tab-pill ${view===id?'active':''}`} onClick={()=>setView(id)}>{label}</div>
        ))}
      </div>

      {/* Summary Table */}
      {view === 'summary' && (
        <div className="card">
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <input className="search-input" placeholder="Search advisor..." value={search} onChange={e=>setSearch(e.target.value)} />
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{summaries.length} advisors</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{ textAlign:'left' }}>Advisor</th>
                <th>Present</th><th>Absent</th><th>Late</th><th>Holidays</th>
                <th>Attendance%</th><th>Leave Types</th>
                {bscData && <th>BSC</th>}
                <th>Calendar</th>
              </tr></thead>
              <tbody>
                {summaries.map(a=>(
                  <tr key={a.name} style={{ background:a.absent>=5?'#fff5f5':'' }}>
                    <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                    <td style={{ color:'#166534', fontWeight:700 }}>{a.present}</td>
                    <td style={{ color:a.absent>0?'#dc2626':'inherit', fontWeight:a.absent>0?700:400 }}>{a.absent}</td>
                    <td style={{ color:a.late>0?'#854d0e':'inherit' }}>{a.late}</td>
                    <td>{a.holiday}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="progress-bar" style={{ width:60 }}>
                          <div className="fill" style={{ width:`${a.pctPresent*100}%`, background:a.pctPresent>=0.9?'#16a34a':a.pctPresent>=0.75?'#eab308':'#ef4444' }} />
                        </div>
                        <span style={{ fontSize:11, fontWeight:700 }}>{(a.pctPresent*100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize:11 }}>
                      {Object.entries(a.leaveTypes).slice(0,2).map(([code,count])=>(
                        <span key={code} style={{ marginRight:4 }}>{code}×{count}</span>
                      ))}
                    </td>
                    {bscData && <td>{a.bsc?<span className={`bsc-badge ${a.bsc.colorClass}`}>{a.bsc.bscScore?.toFixed(1)}</span>:'—'}</td>}
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={()=>{ setSelectedAdvisor(a.name); setView('calendar'); }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="card">
          <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
            <select className="filter-select" value={selectedAdvisor||''} onChange={e=>setSelectedAdvisor(e.target.value)}>
              <option value="">Select Advisor...</option>
              {attAdvisors.map(n=><option key={n}>{n}</option>)}
            </select>
            <div style={{ display:'flex', gap:10 }}>
              {Object.entries(STATUS_CELL).map(([status,{bg,text,color}])=>(
                <span key={status} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                  <span style={{ background:bg, color, fontWeight:800, padding:'1px 5px', borderRadius:3, fontSize:10 }}>{text}</span>
                  {LEAVE_LABELS[status]}
                </span>
              ))}
            </div>
          </div>
          {selectedAdvisor && calendarDays.length > 0 ? (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {calendarDays.map(({ date, status, code }) => {
                const cell = STATUS_CELL[status] || STATUS_CELL.present;
                const d = new Date(date);
                return (
                  <div key={date} style={{ width:52, borderRadius:6, overflow:'hidden', border:'1px solid #e2e8f0', flexShrink:0 }} title={`${date}: ${code || status}`}>
                    <div style={{ background:'#f8fafc', fontSize:9, textAlign:'center', padding:'2px 0', color:'var(--text-muted)' }}>
                      {d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}
                    </div>
                    <div style={{ background:cell.bg, color:cell.color, fontWeight:800, fontSize:11, textAlign:'center', padding:'4px 0' }}>
                      {cell.text}
                    </div>
                    {code && code !== 'WO' && <div style={{ background:cell.bg, fontSize:8, textAlign:'center', padding:'1px 2px', color:cell.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{code}</div>}
                  </div>
                );
              })}
            </div>
          ) : <div className="empty-state"><div>📅</div><h3>Select an advisor above</h3></div>}
        </div>
      )}

      {/* BSC Correlation */}
      {view === 'correlation' && bscData && (
        <div className="card">
          <div className="card-title">Attendance vs BSC Correlation</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>Advisors with higher absence tend to have lower BSC due to fewer productive days.</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th style={{ textAlign:'left' }}>Advisor</th>
                <th>Absent Days</th><th>Attendance%</th><th>BSC Score</th><th>Prod Days</th><th>Qualification Status</th><th>Risk Signal</th>
              </tr></thead>
              <tbody>
                {summaries.filter(a=>a.bsc).sort((a,b)=>b.absent-a.absent).map(a=>(
                  <tr key={a.name} style={{ background:a.absent>=5&&a.bsc?.bscScore<70?'#fff5f5':'' }}>
                    <td style={{ textAlign:'left', fontWeight:700 }}>{a.name}</td>
                    <td style={{ fontWeight:700, color:a.absent>=5?'#dc2626':a.absent>=3?'#f97316':'inherit' }}>{a.absent}</td>
                    <td>{(a.pctPresent*100).toFixed(0)}%</td>
                    <td>{a.bsc?<span className={`bsc-badge ${a.bsc.colorClass}`}>{a.bsc.bscScore?.toFixed(1)}</span>:'—'}</td>
                    <td>{a.bsc?.productiveDays||'—'}</td>
                    <td><span className={`badge badge-${a.bsc?.qualification?.pdStatus==='On Track'?'green':a.bsc?.qualification?.pdStatus==='At Risk'?'yellow':'red'}`}>{a.bsc?.qualification?.pdStatus||'—'}</span></td>
                    <td>{a.absent>=5&&a.bsc?.bscScore<65?<span className="badge badge-red">High Risk</span>:a.absent>=3?<span className="badge badge-yellow">Watch</span>:<span className="badge badge-green">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
