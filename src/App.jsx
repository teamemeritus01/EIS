import { AppProvider, useApp } from './store/appStore.jsx';
import LoginScreen from './components/pages/LoginScreen.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import TopHeader from './components/layout/TopHeader.jsx';
import UploadCenter from './components/pages/UploadCenter.jsx';
import ExecutiveOverview from './components/pages/ExecutiveOverview.jsx';
import IncentiveIntelligence from './components/pages/IncentiveIntelligence.jsx';
import D1CommandCenter from './components/pages/D1CommandCenter.jsx';
import ScenarioEngine from './components/pages/ScenarioEngine.jsx';
import AtRiskTracker from './components/pages/AtRiskTracker.jsx';
import EffortIntelligence from './components/pages/EffortIntelligence.jsx';
import HeatmapIntelligence from './components/pages/HeatmapIntelligence.jsx';
import DeadHoursIntelligence from './components/pages/DeadHoursIntelligence.jsx';
import ShiftSplitAnalytics from './components/pages/ShiftSplitAnalytics.jsx';
import AttendanceIntelligence from './components/pages/AttendanceIntelligence.jsx';
import AbsenceManager from './components/pages/AbsenceManager.jsx';
import ReconciliationCenter from './components/pages/ReconciliationCenter.jsx';
import ExportCenter from './components/pages/ExportCenter.jsx';
import QuarterlyConfig from './components/pages/QuarterlyConfig.jsx';
import L7DTrend from './components/pages/L7DTrend.jsx';
import ToastContainer from './components/shared/ToastContainer.jsx';

function PlatformShell() {
  const { state } = useApp();
  const { activeTab, auth } = state;
  if (!auth.loggedIn) return <LoginScreen />;
  const renderPage = () => {
    switch (activeTab) {
      case 'upload':          return <UploadCenter />;
      case 'executive':       return <ExecutiveOverview />;
      case 'incentive':       return <IncentiveIntelligence />;
      case 'd1':              return <D1CommandCenter />;
      case 'scenario':        return <ScenarioEngine />;
      case 'atrisk':          return <AtRiskTracker />;
      case 'effort':          return <EffortIntelligence />;
      case 'heatmap':         return <HeatmapIntelligence />;
      case 'deadhours':       return <DeadHoursIntelligence />;
      case 'shiftsplit':      return <ShiftSplitAnalytics />;
      case 'attendance':      return <AttendanceIntelligence />;
      case 'absence':         return <AbsenceManager />;
      case 'reconciliation':  return <ReconciliationCenter />;
      case 'export':          return <ExportCenter />;
      case 'config':          return <QuarterlyConfig />;
      case 'l7d':            return <L7DTrend />;
      default:                return <ExecutiveOverview />;
    }
  };
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <TopHeader />
        <div className="page-content">{renderPage()}</div>
      </div>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return <AppProvider><PlatformShell /></AppProvider>;
}
