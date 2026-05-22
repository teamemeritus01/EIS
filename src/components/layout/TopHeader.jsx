import { useState, useEffect } from 'react';
import { getCurrentOperationalDay, opDayLabel } from '../../utils/dateUtils.js';
import { useApp } from '../../store/appStore.jsx';

export default function TopHeader() {
  const { state, setTab, logout } = useApp();
  const { auth, bscData, effortData, reconciliationQueue = [], uploadStatus } = state;
  const [now, setNow] = useState(new Date());
  const [opDay, setOpDay] = useState(getCurrentOperationalDay());
  const [shiftView, setShiftView] = useState('All');
  const [showNotif, setShowNotif] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(300); // 5 min

  useEffect(() => {
    const tick = setInterval(() => { setNow(new Date()); }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setRefreshTimer(t => t > 0 ? t - 1 : 300), 1000);
    return () => clearInterval(tick);
  }, []);

  const atRiskCount = bscData?.advisors?.filter(a =>
    a.qualification?.pdStatus === 'At Risk' || a.qualification?.pdStatus === 'Off Track'
  ).length || 0;

  const reconCount  = reconciliationQueue.length;
  const totalAlerts = atRiskCount + reconCount;

  const fmtTime = d => d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  const fmtRefresh = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // Operational day window label
  const opDayLabelStr = (() => {
    const d = new Date(opDay + 'T10:00:00');
    const d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    const fmt = dt => dt.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
    return `${fmt(d)} (10:00 AM – ${fmt(d2)} 09:59 AM)`;
  })();

  return (
    <header style={{ height:56, background:'white', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:10, flexShrink:0, zIndex:10 }}>
      {/* Operational Day */}
      <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f8fafc', border:'1px solid var(--border)', borderRadius:8, padding:'5px 10px', cursor:'pointer', fontSize:12 }}>
        <span style={{ fontSize:14 }}>📅</span>
        <div>
          <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>Operational Day</div>
          <div style={{ fontWeight:700, fontSize:11 }}>
            <input type="date" value={opDay} onChange={e => setOpDay(e.target.value)}
              style={{ border:'none', background:'transparent', fontSize:11, fontWeight:700, cursor:'pointer', color:'var(--text-primary)', outline:'none' }} />
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)' }}>{opDayLabelStr}</div>
        </div>
      </div>

      {/* Shift View */}
      <div style={{ display:'flex', gap:4 }}>
        {['All','ROW','US'].map(s => (
          <button key={s} onClick={() => setShiftView(s)}
            style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1px solid', borderColor: shiftView===s?'var(--em-green)':'var(--border)', background: shiftView===s?'var(--em-green-bg)':'white', color: shiftView===s?'var(--em-green)':'var(--text-secondary)' }}>
            {s === 'All' ? 'All Shifts' : `${s} Shift`}
            {s !== 'All' && shiftView===s && <span style={{ marginLeft:4, fontSize:9, color:'#16a34a' }}>●</span>}
          </button>
        ))}
      </div>

      {/* Current time */}
      <div style={{ background:'#0f172a', color:'white', borderRadius:8, padding:'5px 12px', fontSize:13, fontWeight:800, fontFamily:'monospace', letterSpacing:'.05em' }}>
        {fmtTime(now)}
      </div>

      <div style={{ flex:1 }} />

      {/* Upload quick action */}
      <button className="btn btn-primary" onClick={() => setTab('upload')} style={{ fontSize:12, padding:'6px 14px' }}>
        ⬆ Upload
      </button>

      {/* Export quick action */}
      <button className="btn btn-outline" onClick={() => setTab('export')} style={{ fontSize:12, padding:'6px 14px' }}>
        📤 Export ▾
      </button>

      {/* Auto-refresh timer */}
      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-muted)', background:'#f8fafc', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px' }}>
        <span>🔄</span><span style={{ fontFamily:'monospace', fontWeight:700 }}>{fmtRefresh(refreshTimer)}</span>
      </div>

      {/* Notifications */}
      <div style={{ position:'relative' }}>
        <button onClick={() => setShowNotif(!showNotif)} style={{ width:34, height:34, borderRadius:'50%', border:'1px solid var(--border)', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', fontSize:16 }}>
          🔔
          {totalAlerts > 0 && (
            <span style={{ position:'absolute', top:-2, right:-2, background:'#dc2626', color:'white', fontSize:9, fontWeight:900, borderRadius:'50%', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {totalAlerts > 9 ? '9+' : totalAlerts}
            </span>
          )}
        </button>
        {showNotif && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:280, background:'white', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', zIndex:100, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', fontWeight:700, fontSize:13, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
              <span>Notifications</span>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{totalAlerts} active</span>
            </div>
            {reconCount > 0 && (
              <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:'#fff7ed' }} onClick={() => { setTab('reconciliation'); setShowNotif(false); }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#9a3412' }}>🔄 {reconCount} Reconciliation Anomalies</div>
                <div style={{ fontSize:11, color:'#c2410c' }}>Future-timestamp rows need review</div>
              </div>
            )}
            {atRiskCount > 0 && (
              <div style={{ padding:'10px 14px', cursor:'pointer' }} onClick={() => { setTab('atrisk'); setShowNotif(false); }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#854d0e' }}>⚠ {atRiskCount} At-Risk Advisors</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>Advisors at qualification risk</div>
              </div>
            )}
            {totalAlerts === 0 && <div style={{ padding:'20px 14px', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>✅ All clear</div>}
          </div>
        )}
      </div>

      {/* User avatar */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--em-green)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13 }}>
          {(auth.user || 'U')[0].toUpperCase()}
        </div>
        <div style={{ fontSize:11, lineHeight:1.3 }}>
          <div style={{ fontWeight:700 }}>{auth.user || 'User'}</div>
          <div style={{ color:'var(--text-muted)', fontSize:10 }}>{auth.role} View</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={logout} style={{ fontSize:11 }}>Out</button>
      </div>
    </header>
  );
}
