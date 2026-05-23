import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';

const NAV = [
  { section: 'OVERVIEW' },
  { id:'upload',        label:'Upload Center',          icon:'⬆', roles:['admin','director','tl','apm'] },
  { id:'executive',     label:'Executive Overview',     icon:'🏠', roles:['admin','director','tl','apm'] },
  { section: 'INCENTIVE' },
  { id:'incentive',     label:'Incentive Intelligence', icon:'🏆', roles:['admin','director','tl','apm'] },
  { id:'d1',            label:'D-1 Command Center',     icon:'📅', roles:['admin','director','tl','apm'] },
  { id:'l7d',           label:'L7D BSC Trend',          icon:'📈', roles:['admin','director','tl','apm'] },
  { id:'scenario',      label:'Scenario Engine',        icon:'🎯', roles:['admin','director','tl','apm'] },
  { id:'atrisk',        label:'At-Risk Tracker',        icon:'⚠',  roles:['admin','director','tl','apm'] },
  { section: 'EFFORT INTELLIGENCE' },
  { id:'effort',        label:'Effort Intelligence',    icon:'📞', roles:['admin','director','tl','apm'] },
  { id:'heatmap',       label:'Heatmap Intelligence',   icon:'🔥', roles:['admin','director','tl','apm'] },
  { id:'deadhours',     label:'Dead Hours',             icon:'💤', roles:['admin','director','tl','apm'] },
  { id:'shiftsplit',    label:'Shift Split Analytics',  icon:'📊', roles:['admin','director','tl'] },
  { section: 'ATTENDANCE' },
  { id:'attendance',    label:'Attendance Intelligence',icon:'✅', roles:['admin','director','tl','apm'] },
  { id:'absence',       label:'Absence Manager',        icon:'🔒', roles:['admin','tl','apm'] },
  { section: 'TEAM MANAGEMENT' },
  { id:'tl',            label:'TL Module',              icon:'👥', roles:['admin','director','tl'] },
  { section: 'OPERATIONS' },
  { id:'reconciliation',label:'Reconciliation Center',  icon:'🔄', roles:['admin','tl'] },
  { id:'export',        label:'Export Center',          icon:'📤', roles:['admin','director','tl','apm'] },
  { id:'config',        label:'Quarterly Config',       icon:'⚙',  roles:['admin'] },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { state, setTab, logout } = useApp();
  const { activeTab, bscData, reconciliationQueue=[], auth } = state;
  const role = auth.role || 'admin';

  const atRiskCount  = bscData?.advisors?.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track').length || 0;
  const reconCount   = reconciliationQueue.length || 0;
  const recordsProcd = state.effortData?.processedRows?.toLocaleString() || '—';
  const lastUpload   = state.effortData ? new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—';

  const visibleNav = NAV.filter(item => {
    if (item.section) return true;
    return !item.roles || item.roles.includes(role);
  });

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && <div className="sidebar-overlay active" onClick={onMobileClose}/>}

      <aside className={`sidebar ${collapsed?'collapsed':''} ${mobileOpen?'mobile-open':''}`}>
        {/* Collapse toggle (desktop) */}
        <button className="sidebar-collapse-btn" onClick={onToggle} title={collapsed?'Expand':'Collapse'}>
          {collapsed ? '→' : '←'}
        </button>

        {/* Logo */}
        <div className="logo-block">
          <div className="logo-em">E</div>
          <div>
            <div className="logo-text">Emeritus OI</div>
            <div className="logo-sub" style={{color:'#4b5563'}}>FY26 Q4 · India OC</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {visibleNav.map((item, i) => {
            if (item.section) return (
              <div key={i} className="sidebar-section">
                <div className="sidebar-section-label">{item.section}</div>
              </div>
            );
            const isActive = activeTab === item.id;
            return (
              <div key={item.id}
                className={`sidebar-item ${isActive?'active':''}`}
                onClick={()=>{ setTab(item.id); onMobileClose?.(); }}
                title={item.label}>
                <span className="tab-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
                {item.id==='atrisk'        && atRiskCount>0 && <span className="sidebar-badge">{atRiskCount}</span>}
                {item.id==='reconciliation'&& reconCount>0  && <span className="sidebar-badge orange">{reconCount}</span>}
              </div>
            );
          })}
        </nav>

        {/* Session Info */}
        <div className="sidebar-session">
          <div className="session-row"><span>Role</span><span style={{color:'#4ade80',fontWeight:700}}>{auth.role?.toUpperCase()}</span></div>
          <div className="session-row"><span>User</span><span>{auth.user||'—'}</span></div>
          <div className="session-row"><span>Records</span><span>{recordsProcd}</span></div>
          <div className="session-row"><span>Last Upload</span><span>{lastUpload}</span></div>
          <div className="session-row"><span>BSC Advisors</span><span>{bscData?.advisors?.length||'—'}</span></div>
          <div style={{marginTop:10}}>
            <button onClick={logout}
              style={{width:'100%',padding:'6px',background:'rgba(239,68,68,.15)',border:'1px solid rgba(239,68,68,.3)',
                borderRadius:'6px',color:'#f87171',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
              Sign Out
            </button>
          </div>
          <div style={{textAlign:'center',marginTop:8,fontSize:9,color:'#374151'}}>v3.0 · Session: 12h · 1MB limit</div>
        </div>
      </aside>
    </>
  );
}
