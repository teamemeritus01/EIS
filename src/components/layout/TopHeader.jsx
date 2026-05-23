import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getCurrentOperationalDay, opDayLabel, formatShiftDate } from '../../utils/dateUtils.js';
import { getShiftDates, filterRowsByDate, aggregateFilteredRows, summariseAgg } from '../../parsers/effortParser.js';
import { exportBSCExcel, exportEffortExcel, exportCSV, exportPDF, copyToTeams } from '../../utils/exportUtils.js';


const PAGE_EXPORT_CONFIG = {
  executive:     { label:'Overview Export', formats:['pdf','teams'] },
  incentive:     { label:'Export Incentive Report', formats:['excel','csv','pdf','teams'] },
  effort:        { label:'Export Effort Summary', formats:['effort_excel','csv'] },
  d1:            { label:'Export D-1 Report', formats:['excel','csv'] },
  l7d:           { label:'Export L7D Trend', formats:['csv'] },
  scenario:      { label:'Export Scenarios', formats:['pdf'] },
  atrisk:        { label:'Export At-Risk List', formats:['excel','csv'] },
  attendance:    { label:'Export Attendance', formats:['excel','csv'] },
  tl:            { label:'Export TL Report', formats:['excel','pdf'] },
  export:        null,
  default:       { label:'Export', formats:['excel','csv','pdf'] },
};

const FORMAT_LABELS = {
  excel:'📊 BSC Excel',  effort_excel:'📋 Effort Excel',
  csv:'📄 CSV Data',     pdf:'📄 PDF Report',
  teams:'💬 Copy to Teams',
};

export default function TopHeader({ sidebarCollapsed, onMobileToggle }) {
  const { state, setTab } = useApp();
  const { activeTab, auth, bscData, effortData, absenceOverrides } = state;
  const [now, setNow]       = useState(new Date());
  const [showNotif, setShowNotif] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [opDay, setOpDay]   = useState(getCurrentOperationalDay());
  const [exporting, setExporting] = useState('');
  const notifRef  = useRef();
  const exportRef = useRef();

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = e => {
      if (notifRef.current && !notifRef.current.contains(e.target))  setShowNotif(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const n = new Date();
      setNow(n);
      // Auto-update operational day at exactly 10:00 AM (crossover)
      // Check every minute boundary
      if (n.getSeconds() === 0 && n.getMinutes() === 0 && n.getHours() === 10) {
        const newOpDay = getCurrentOperationalDay();
        setOpDay(newOpDay);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Auto-set opDay when effort data loads
  useEffect(() => {
    if (effortData?.rows) {
      const dates = getShiftDates(effortData.rows);
      const today = getCurrentOperationalDay();
      if (dates.includes(today)) setOpDay(today);
      else if (dates.length > 0) setOpDay(dates[dates.length - 1]);
    }
  }, [effortData]);

  const atRiskCount = bscData?.advisors?.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track').length || 0;
  const reconCount  = state.reconciliationQueue?.length || 0;
  const totalAlerts = atRiskCount + reconCount;

  const fmtTime  = d => d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  const fmtDate  = d => d.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short'});

  // Page export config
  const expCfg = PAGE_EXPORT_CONFIG[activeTab] || PAGE_EXPORT_CONFIG.default;
  const allDates = getShiftDates(effortData?.rows || []);

  const handleExport = async (fmt) => {
    setExporting(fmt); setShowExport(false);
    const advisors = bscData?.advisors || [];
    const absentNames = new Set(Object.keys(absenceOverrides||{}).filter(n=>(absenceOverrides[n]||[]).length>0));
    const filtered = advisors.filter(a=>!absentNames.has(a.name));
    try {
      if (fmt==='excel')        await exportBSCExcel(filtered, { absentNames });
      else if (fmt==='effort_excel') {
        const rows = opDay ? effortData?.rows?.filter(r=>r.shiftDate===opDay) : (effortData?.rows||[]);
        const summary = summariseAgg(aggregateFilteredRows(rows||[]));
        await exportEffortExcel(summary, opDay);
      }
      else if (fmt==='csv')     exportCSV(filtered);
      else if (fmt==='pdf')     exportPDF(filtered, opDay);
      else if (fmt==='teams')   copyToTeams(filtered);
    } catch(e) { console.error(e); }
    setExporting('');
  };

  return (
    <header className="top-header">
      {/* Mobile hamburger */}
      <button onClick={onMobileToggle}
        style={{display:'none',background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--txt2)',padding:'4px'}}
        className="mobile-menu-btn">☰</button>

      {/* Operational Day */}
      <div className="header-opday">
        <span style={{fontSize:14}}>📅</span>
        <div>
          <div className="header-opday-label">Shift Date</div>
          <select value={opDay} onChange={e=>setOpDay(e.target.value)}
            style={{border:'none',background:'transparent',fontWeight:700,fontSize:11.5,color:'var(--brand-d)',cursor:'pointer',outline:'none'}}>
            <option value="">All Dates (QTD)</option>
            {[...allDates].reverse().map(d=>(
              <option key={d} value={d}>{formatShiftDate(d)}</option>
            ))}
            {!allDates.includes(opDay) && opDay && <option value={opDay}>{formatShiftDate(opDay)} (today)</option>}
          </select>
          <div style={{fontSize:9,color:'var(--brand-d)',opacity:.7}}>{opDayLabel(opDay)}</div>
        </div>
      </div>

      {/* Live clock */}
      <div className="header-clock">{fmtTime(now)}</div>

      <div className="header-spacer"/>

      {/* Page-contextual export */}
      {expCfg && (
        <div className="ctx-export-wrap" ref={exportRef}>
          <button className="header-export-btn" onClick={()=>setShowExport(!showExport)} disabled={!!exporting}>
            {exporting ? '⏳' : '📤'} {exporting ? 'Exporting...' : expCfg.label} ▾
          </button>
          {showExport && (
            <div className="ctx-export-menu">
              <div style={{padding:'8px 12px',fontSize:10,color:'var(--txt3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>
                {expCfg.label}
              </div>
              <div className="ctx-export-divider"/>
              {expCfg.formats.map(fmt=>(
                <div key={fmt} className="ctx-export-item" onClick={()=>handleExport(fmt)}>
                  <span style={{fontSize:16}}>{FORMAT_LABELS[fmt]?.split(' ')[0]}</span>
                  <span>{FORMAT_LABELS[fmt]?.split(' ').slice(1).join(' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      <div style={{position:'relative'}} ref={notifRef}>
        <button className="header-icon-btn" onClick={()=>setShowNotif(!showNotif)}>
          🔔
          {totalAlerts > 0 && <span className="header-notif-dot"/>}
        </button>
        {showNotif && (
          <div className="notif-dropdown">
            <div className="notif-header">
              <span>Notifications</span>
              <span style={{fontSize:11,color:'var(--txt3)'}}>{totalAlerts} active</span>
            </div>
            {reconCount > 0 && (
              <div className="notif-item" onClick={()=>{setTab('reconciliation');setShowNotif(false);}}>
                <div className="notif-title" style={{color:'var(--orange)'}}>🔄 {reconCount} Reconciliation Anomalies</div>
                <div className="notif-sub">Future-timestamp rows need review</div>
              </div>
            )}
            {atRiskCount > 0 && (
              <div className="notif-item" onClick={()=>{setTab('atrisk');setShowNotif(false);}}>
                <div className="notif-title" style={{color:'var(--yellow)'}}>⚠ {atRiskCount} Advisors At Risk</div>
                <div className="notif-sub">Qualification risk — needs intervention</div>
              </div>
            )}
            {totalAlerts===0 && <div style={{padding:'20px',textAlign:'center',color:'var(--txt3)',fontSize:12}}>✅ All systems clear</div>}
          </div>
        )}
      </div>

      {/* User */}
      <div className="header-user">
        <div className="header-avatar">{(auth.user||'U')[0].toUpperCase()}</div>
        <div>
          <div className="header-user-name">{auth.user||'User'}</div>
          <div className="header-user-role">{auth.role?.toUpperCase()} · {fmtDate(now)}</div>
        </div>
      </div>
    </header>
  );
}
