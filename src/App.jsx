import { useState } from 'react';
import { AppProvider, useApp } from './store/appStore.jsx';
import LoginScreen from './components/pages/LoginScreen.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import TopHeader from './components/layout/TopHeader.jsx';
import UploadCenter from './components/pages/UploadCenter.jsx';
import ExecutiveOverview from './components/pages/ExecutiveOverview.jsx';
import IncentiveIntelligence from './components/pages/IncentiveIntelligence.jsx';
import D1CommandCenter from './components/pages/D1CommandCenter.jsx';
import L7DTrend from './components/pages/L7DTrend.jsx';
import ScenarioEngine from './components/pages/ScenarioEngine.jsx';
import AtRiskTracker from './components/pages/AtRiskTracker.jsx';
import EffortIntelligence from './components/pages/EffortIntelligence.jsx';
import ShiftSplitAnalytics from './components/pages/ShiftSplitAnalytics.jsx';
import AttendanceIntelligence from './components/pages/AttendanceIntelligence.jsx';
import AbsenceManager from './components/pages/AbsenceManager.jsx';
import TLModule from './components/pages/TLModule.jsx';
import ReconciliationCenter from './components/pages/ReconciliationCenter.jsx';
import ExportCenter from './components/pages/ExportCenter.jsx';
import QuarterlyConfig from './components/pages/QuarterlyConfig.jsx';
import ToastContainer from './components/shared/ToastContainer.jsx';

const PAGE_TITLES = {
  upload:'Upload Center', executive:'Executive Overview', incentive:'Incentive Intelligence',
  d1:'D-1 Command Center', l7d:'L7D BSC Trend', scenario:'Scenario Engine',
  atrisk:'At-Risk Tracker', effort:'Effort Intelligence', heatmap:'Heatmap Intelligence',
  deadhours:'Dead Hours Intelligence', shiftsplit:'Shift Split Analytics',
  attendance:'Attendance Intelligence', absence:'Absence Manager',
  tl:'TL Management Module', reconciliation:'Reconciliation Center',
  export:'Export Center', config:'Quarterly Configuration',
};

function PlatformShell() {
  const { state } = useApp();
  const { activeTab, auth } = state;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!auth.loggedIn) return <LoginScreen/>;

  const renderPage = () => {
    switch (activeTab) {
      case 'upload':         return <UploadCenter/>;
      case 'executive':      return <ExecutiveOverview/>;
      case 'incentive':      return <IncentiveIntelligence/>;
      case 'd1':             return <D1CommandCenter/>;
      case 'l7d':            return <L7DTrend/>;
      case 'scenario':       return <ScenarioEngine/>;
      case 'atrisk':         return <AtRiskTracker/>;
      case 'effort':         return <EffortIntelligence/>;
      case 'shiftsplit':     return <ShiftSplitAnalytics/>;
      case 'attendance':     return <AttendanceIntelligence/>;
      case 'absence':        return <AbsenceManager/>;
      case 'tl':             return <TLModule/>;
      case 'reconciliation': return <ReconciliationCenter/>;
      case 'export':         return <ExportCenter/>;
      case 'config':         return <QuarterlyConfig/>;
      default:               return <ExecutiveOverview/>;
    }
  };

  const title = PAGE_TITLES[activeTab] || 'Executive Overview';

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={()=>setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={()=>setMobileOpen(false)}
      />
      <div className="main-content">
        <TopHeader
          sidebarCollapsed={sidebarCollapsed}
          onMobileToggle={()=>setMobileOpen(!mobileOpen)}
        />
        <div className="page-content">
          {/* Page title */}
          <div className="page-header">
            <div>
              <div className="page-title">{title}</div>
              <div className="page-sub">FY26 Q4 · Emeritus India Online Certificates</div>
            </div>
          </div>
          {renderPage()}
        </div>
      </div>
      <ToastContainer/>
    </div>
  );
}

export default function App() {
  return <AppProvider><PlatformShell/></AppProvider>;
}
