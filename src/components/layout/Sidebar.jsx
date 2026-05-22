import { useApp } from '../../store/appStore.jsx';

const NAV = [
  { section:'OVERVIEW' },
  { id:'upload',        label:'Upload Center',          icon:'⬆' },
  { id:'executive',     label:'Executive Overview',     icon:'🏠' },
  { section:'INCENTIVE INTELLIGENCE' },
  { id:'incentive',     label:'Incentive Intelligence', icon:'🏆' },
  { id:'d1',            label:'D-1 Command Center',     icon:'📅' },
  { id:'l7d',           label:'L7D BSC Trend',          icon:'📈' },
  { id:'scenario',      label:'Scenario Engine',        icon:'🎯' },
  { id:'atrisk',        label:'At-Risk Tracker',        icon:'⚠' },
  { section:'EFFORT INTELLIGENCE' },
  { id:'effort',        label:'Effort Intelligence',    icon:'📞' },
  { id:'heatmap',       label:'Heatmap Intelligence',   icon:'🔥' },
  { id:'deadhours',     label:'Dead Hours',             icon:'💤' },
  { id:'shiftsplit',    label:'Shift Split Analytics',  icon:'📊' },
  { section:'ATTENDANCE' },
  { id:'attendance',    label:'Attendance Intelligence',icon:'✅' },
  { id:'absence',       label:'Absence Manager',        icon:'🔒' },
  { section:'OPERATIONS' },
  { id:'reconciliation',label:'Reconciliation Center',  icon:'🔄' },
  { id:'export',        label:'Export Center',          icon:'📤' },
  { id:'config',        label:'Quarterly Config',       icon:'⚙' },
  { section:'FUTURE MODULES' },
  { id:'future_team',     label:'Team Intelligence',       icon:'👥', coming:true },
  { id:'future_learning', label:'Learning & Calibration',  icon:'📚', coming:true },
  { id:'future_quality',  label:'Quality Intelligence',    icon:'⭐', coming:true },
];

function SessionRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, padding:'2px 0', lineHeight:1.5 }}>
      <span style={{ color:'#4b5563' }}>{label}</span>
      <span style={{ color:'#9ca3af', fontWeight:600, maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' }}>{value || '—'}</span>
    </div>
  );
}

export default function Sidebar() {
  const { state, setTab } = useApp();
  const { activeTab, bscData, effortData, auth, reconciliationQueue = [], uploadStatus } = state;

  const atRiskCount  = bscData?.advisors?.filter(a=>a.qualification?.pdStatus==='At Risk'||a.qualification?.pdStatus==='Off Track').length || 0;
  const reconCount   = reconciliationQueue.length || 0;
  const sessionId    = `S-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
  const recordsProcd = effortData?.processedRows?.toLocaleString() || '—';
  const lastUpload   = effortData ? new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—';
  const uploadType   = effortData ? 'Hourly Upload' : '—';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-em">E</div>
        <div>
          <div className="logo-text">Emeritus OI</div>
          <div className="logo-sub">FY26 Q4 · India OC</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {NAV.map((item, i) => {
          if (item.section) return (
            <div key={i} className="sidebar-section">
              <div className="sidebar-section-label">{item.section}</div>
            </div>
          );
          if (item.coming) return (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 16px', fontSize:12, color:'#374151', opacity:.5 }}>
              <span style={{ width:16 }}>{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              <span style={{ fontSize:9, background:'#374151', color:'white', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>SOON</span>
            </div>
          );
          return (
            <div key={item.id} className={`sidebar-item${activeTab===item.id?' active':''}`} onClick={()=>setTab(item.id)}>
              <span className="tab-icon">{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              {item.id==='atrisk'        && atRiskCount>0 && <span className="badge">{atRiskCount}</span>}
              {item.id==='reconciliation'&& reconCount>0  && <span className="badge" style={{ background:'#f97316' }}>{reconCount}</span>}
            </div>
          );
        })}
      </div>

      {/* Session Info */}
      <div style={{ borderTop:'1px solid #1f2937', padding:'12px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', color:'#4b5563', textTransform:'uppercase', marginBottom:8 }}>SESSION INFO</div>
        <SessionRow label="Session ID"       value={sessionId} />
        <SessionRow label="Uploaded By"      value={auth.user || auth.role} />
        <SessionRow label="Upload Type"      value={uploadType} />
        <SessionRow label="Records Processed" value={recordsProcd} />
        <SessionRow label="Last Upload"      value={lastUpload} />
        <SessionRow label="BSC Advisors"     value={bscData?.advisors?.length} />
      </div>
    </aside>
  );
}
