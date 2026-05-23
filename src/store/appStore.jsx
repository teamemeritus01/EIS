// ============================================================
// EMERITUS APP STORE — Clean v5.1
// PERSISTENCE POLICY (user-confirmed):
//   ✓ Absence overrides   → localStorage (permanent)
//   ✓ Reconciliation queue → localStorage (permanent)
//   ✓ Attendance data     → sessionStorage (tab session)
//   ✗ BSC data            → NOT persisted (re-upload each session)
//   ✗ Effort data         → NOT persisted (re-upload each session)
//   ✓ Auth session        → localStorage (12h TTL)
// ============================================================

import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

// ── Constants ────────────────────────────────────────────────
const SESSION_KEY   = 'em_session_v1';
const ABSENCE_KEY   = 'em_absences_v1';
const RECON_KEY     = 'em_recon_v1';
const SESSION_TTL   = 12 * 60 * 60 * 1000;   // 12 hours
const MEM_TTL_MS    = 7  * 24 * 60 * 60 * 1000; // 7 days

// ── One-time cleanup of stale keys from previous versions ────
try {
  ['em_effort','em_attendance_v0','em_state_v1','em_state_v2',
   'em_state_v3','em_app_v3','em_session_v0'].forEach(k => {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  });
} catch {}


// ── Session helpers ──────────────────────────────────────────
function saveSession(user, role) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      user, role, loginTime: Date.now(), expiresAt: Date.now() + SESSION_TTL
    }));
  } catch {}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

// ── Absence helpers (localStorage — permanent) ───────────────
function loadAbsences() {
  try { return JSON.parse(localStorage.getItem(ABSENCE_KEY) || '{}'); } catch { return {}; }
}
function saveAbsences(overrides) {
  try { localStorage.setItem(ABSENCE_KEY, JSON.stringify(overrides)); } catch {}
}

// ── Reconciliation helpers (localStorage — permanent) ────────
function loadRecon() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECON_KEY) || '{"queue":[],"approved":[],"savedAt":0}');
    // 7-day reset for queue (approved history kept longer)
    if (raw.savedAt && Date.now() - raw.savedAt > MEM_TTL_MS) {
      return { queue: [], approved: raw.approved || [], savedAt: Date.now() };
    }
    return raw;
  } catch { return { queue: [], approved: [], savedAt: Date.now() }; }
}
function saveRecon(queue, approved) {
  try { localStorage.setItem(RECON_KEY, JSON.stringify({ queue, approved, savedAt: Date.now() })); } catch {}
}

// ── Attendance helpers (sessionStorage — tab session only) ───
function loadAttendance() {
  try { return JSON.parse(sessionStorage.getItem('em_attendance') || 'null'); } catch { return null; }
}
function saveAttendance(data) {
  try {
    if (data) sessionStorage.setItem('em_attendance', JSON.stringify(data));
    else sessionStorage.removeItem('em_attendance');
  } catch {}
}

// ── Load persisted data ──────────────────────────────────────
const _sess   = loadSession();
const _abs    = loadAbsences();
const _recon  = loadRecon();
const _attend = loadAttendance();

// ── Initial state ────────────────────────────────────────────
const INITIAL_STATE = {
  auth: _sess
    ? { loggedIn: true, user: _sess.user, role: _sess.role }
    : { loggedIn: false, user: null, role: null },

  // These are NEVER persisted — must upload fresh each session
  bscData:        null,
  effortData:     null,
  attendanceData: _attend,  // sessionStorage only

  filters: { tl:'All', apm:'All', shift:'All', region:'All', qualification:'All', riskType:'All', search:'' },
  activeTab:    'executive',
  uploadStatus: { bsc: null, effort: null, attendance: null, comp: null },
  loading:      {},

  // These ARE persisted
  absenceOverrides:       _abs,
  reconciliationQueue:    _recon.queue,
  reconciliationApproved: _recon.approved,
  notifications: [],
};

// ── Reducer ──────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':  return { ...state, auth: { loggedIn:true,  user:action.user, role:action.role } };
    case 'LOGOUT': return { ...state, auth: { loggedIn:false, user:null,         role:null        } };

    case 'SET_BSC_DATA':
      return { ...state, bscData: action.payload, uploadStatus: { ...state.uploadStatus, bsc:'success' } };
    case 'SET_EFFORT_DATA':
      return { ...state, effortData: action.payload, uploadStatus: { ...state.uploadStatus, effort:'success' } };
    case 'SET_ATTENDANCE_DATA':
      return { ...state, attendanceData: action.payload, uploadStatus: { ...state.uploadStatus, attendance:'success' } };

    case 'SET_FILTER':   return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'RESET_FILTERS':return { ...state, filters: { tl:'All',apm:'All',shift:'All',region:'All',qualification:'All',riskType:'All',search:'' } };
    case 'SET_TAB':      return { ...state, activeTab: action.payload };
    case 'SET_LOADING':  return { ...state, loading: { ...state.loading, [action.key]: action.value } };

    case 'ADD_ABSENCE': {
      const ov = { ...state.absenceOverrides };
      if (!ov[action.advisor]) ov[action.advisor] = [];
      if (!ov[action.advisor].includes(action.date)) ov[action.advisor] = [...ov[action.advisor], action.date];
      saveAbsences(ov);
      return { ...state, absenceOverrides: ov };
    }
    case 'REMOVE_ABSENCE': {
      const ov = { ...state.absenceOverrides };
      if (ov[action.advisor]) ov[action.advisor] = ov[action.advisor].filter(d => d !== action.date);
      saveAbsences(ov);
      return { ...state, absenceOverrides: ov };
    }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [{ id:Date.now(), ...action.payload }, ...state.notifications.slice(0,49)] };

    case 'ADD_TO_RECON_QUEUE': {
      // Never re-add anomalies that were already resolved (approved/suppressed/ignored)
      const resolvedSigs = new Set(state.reconciliationApproved.map(r => r.sig));
      const existingSigs  = new Set(state.reconciliationQueue.map(r => r.sig));
      const fresh = (action.payload || []).filter(
        r => !resolvedSigs.has(r.sig) && !existingSigs.has(r.sig)
      );
      if (fresh.length === 0) return state; // nothing new to add
      const q = [...state.reconciliationQueue, ...fresh];
      saveRecon(q, state.reconciliationApproved);
      return { ...state, reconciliationQueue: q };
    }
    case 'APPROVE_RECON': {
      const target = action.targetShiftDate || action.item.shiftDate;
      const reinjected = {
        ...action.item, shiftDate: target, originalShiftDate: action.item.shiftDate,
        reconApproved: true, isPTT: action.item.connected===1 && (action.item.duration||0)>1.5,
        pttMinutes: (action.item.connected===1 && (action.item.duration||0)>1.5) ? action.item.duration : 0,
      };
      const updatedRows = state.effortData
        ? [...(state.effortData.rows||[]).filter(r=>r.sig!==action.item.sig), reinjected]
        : null;
      const q = state.reconciliationQueue.filter(r=>r.sig!==action.sig);
      const a = [...state.reconciliationApproved, {
        ...action.item, status:'approved', targetShiftDate:target,
        originalShiftDate:action.item.shiftDate, resolvedAt:new Date().toISOString(),
        modifiedBy: state.auth.user||'Admin',
      }];
      saveRecon(q, a);
      return { ...state, reconciliationQueue:q, reconciliationApproved:a,
        effortData: state.effortData ? { ...state.effortData, rows:updatedRows } : null };
    }
    case 'SUPPRESS_RECON': {
      const q = state.reconciliationQueue.filter(r=>r.sig!==action.sig);
      const a = [...state.reconciliationApproved, { ...action.item, status:'suppressed', resolvedAt:new Date().toISOString() }];
      saveRecon(q, a);
      return { ...state, reconciliationQueue:q, reconciliationApproved:a };
    }
    case 'IGNORE_RECON': {
      const q = state.reconciliationQueue.filter(r=>r.sig!==action.sig);
      const a = [...state.reconciliationApproved, { ...action.item, status:'ignored', resolvedAt:new Date().toISOString() }];
      saveRecon(q, a);
      return { ...state, reconciliationQueue:q, reconciliationApproved:a };
    }

    default: return state;
  }
}

// ── Provider ─────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const login  = useCallback((user, role) => { saveSession(user, role); dispatch({ type:'LOGIN',  user, role }); }, []);
  const logout = useCallback(() =>           { clearSession();           dispatch({ type:'LOGOUT' });            }, []);

  const setBSCData        = useCallback((d) => dispatch({ type:'SET_BSC_DATA',        payload:d }), []);
  const setEffortData     = useCallback((d) => dispatch({ type:'SET_EFFORT_DATA',     payload:d }), []);
  const setAttendanceData = useCallback((d) => { saveAttendance(d); dispatch({ type:'SET_ATTENDANCE_DATA', payload:d }); }, []);

  const setFilter    = useCallback((key,val) => dispatch({ type:'SET_FILTER',  key, value:val }), []);
  const resetFilters = useCallback(()        => dispatch({ type:'RESET_FILTERS' }),               []);
  const setTab       = useCallback((tab)     => dispatch({ type:'SET_TAB',     payload:tab }),     []);
  const setLoading   = useCallback((k,v)     => dispatch({ type:'SET_LOADING', key:k, value:v }),  []);

  const addAbsence    = useCallback((advisor,date) => dispatch({ type:'ADD_ABSENCE',    advisor,date }), []);
  const removeAbsence = useCallback((advisor,date) => dispatch({ type:'REMOVE_ABSENCE', advisor,date }), []);

  const notify = useCallback((message,type='info') => dispatch({ type:'ADD_NOTIFICATION', payload:{message,type} }), []);

  const getFilteredAdvisors = useCallback(() => {
    if (!state.bscData?.advisors) return [];
    let list = [...state.bscData.advisors];
    const { tl, apm, region, qualification, search } = state.filters;
    if (tl !== 'All')     list = list.filter(a => a.tl === tl);
    if (apm !== 'All')    list = list.filter(a => a.apm === apm);
    if (region !== 'All') list = list.filter(a => a.region === region);
    if (qualification === 'Qualified')     list = list.filter(a =>  a.qualification?.qualified);
    if (qualification === 'Not Qualified') list = list.filter(a => !a.qualification?.qualified);
    if (qualification === 'At Risk')       list = list.filter(a => a.qualification?.pdStatus === 'At Risk');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.empId?.toLowerCase().includes(q));
    }
    return list;
  }, [state.bscData, state.filters]);

  const addToReconQueue = useCallback((items) => dispatch({ type:'ADD_TO_RECON_QUEUE', payload:items }), []);
  const approveRecon    = useCallback((sig,item,tsd) => dispatch({ type:'APPROVE_RECON',  sig,item,targetShiftDate:tsd }), []);
  const suppressRecon   = useCallback((sig,item)     => dispatch({ type:'SUPPRESS_RECON', sig,item }), []);
  const ignoreRecon     = useCallback((sig,item)     => dispatch({ type:'IGNORE_RECON',   sig,item }), []);

  return (
    <AppContext.Provider value={{
      state, dispatch, login, logout,
      setBSCData, setEffortData, setAttendanceData,
      setFilter, resetFilters, setTab, setLoading,
      addAbsence, removeAbsence, notify, getFilteredAdvisors,
      addToReconQueue, approveRecon, suppressRecon, ignoreRecon,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
