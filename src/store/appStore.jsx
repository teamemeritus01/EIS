// ============================================================
// EMERITUS APP STORE — Complete clean rewrite
// Session persistence: 12 hours, survives refresh
// Storage: 1MB cap, 7-day reconciliation reset
// Roles: admin | director | tl | apm
// ============================================================

import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

// ── 1. Constants (MUST come first — used by everything below) ─
const PERSIST_KEY  = 'em_app_v3';
const SESSION_KEY  = 'em_session_v1';
const SESSION_TTL  = 12 * 60 * 60 * 1000;   // 12 hours in ms
const STORAGE_MAX  = 1 * 1024 * 1024;        // 1 MB in bytes
const MEM_TTL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ── 2. Session helpers (MUST come before loadSession() call) ──
function saveSession(user, role) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      user, role,
      loginTime:  Date.now(),
      expiresAt:  Date.now() + SESSION_TTL,
    }));
  } catch {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

// ── 3. Persistence helpers ─────────────────────────────────
function loadPersistedState() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // 7-day reset for reconciliation memory
    if (saved._savedAt && (Date.now() - saved._savedAt) > MEM_TTL_MS) {
      return { ...saved, reconciliationApproved: [], reconciliationQueue: [] };
    }
    return saved;
  } catch { return null; }
}

function persistState(partial) {
  try {
    const existing = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}');
    const next     = { ...existing, ...partial, _savedAt: Date.now() };
    const serialized = JSON.stringify(next);
    if (serialized.length <= STORAGE_MAX) {
      localStorage.setItem(PERSIST_KEY, serialized);
    }
  } catch (e) { console.warn('persistState failed', e); }
}

// ── 4. Load session + persisted data (AFTER helpers defined) ─
const _sess   = loadSession();
const _saved  = loadPersistedState();

// ── 5. Initial state ──────────────────────────────────────
const INITIAL_STATE = {
  // Auth — restored from 12-hour session if still valid
  auth: _sess
    ? { loggedIn: true, user: _sess.user, role: _sess.role }
    : { loggedIn: false, user: null, role: null },

  // Data
  bscData:        _saved?.bscData        || null,
  effortData: (() => {
    try {
      const raw = sessionStorage.getItem('em_effort');
      return raw ? JSON.parse(raw) : (_saved?.effortData || null);
    } catch { return null; }
  })(),
  attendanceData: (() => {
    try {
      const raw = sessionStorage.getItem('em_attendance');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })(),

  // Filters
  filters: {
    tl: 'All', apm: 'All', shift: 'All',
    region: 'All', qualification: 'All', riskType: 'All', search: '',
  },

  // UI
  activeTab:    'executive',
  uploadStatus: _saved?.uploadStatus || { bsc: null, effort: null, attendance: null, comp: null },
  loading:      {},

  // Overrides
  absenceOverrides:      _saved?.absenceOverrides      || {},
  reconciliationQueue:   _saved?.reconciliationQueue   || [],
  reconciliationApproved:_saved?.reconciliationApproved|| [],
  notifications: [],
};

// ── 6. Reducer ─────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case 'LOGIN':
      return { ...state, auth: { loggedIn: true, user: action.user, role: action.role } };
    case 'LOGOUT':
      return { ...state, auth: { loggedIn: false, user: null, role: null } };

    case 'SET_BSC_DATA':
      return { ...state, bscData: action.payload, uploadStatus: { ...state.uploadStatus, bsc: 'success' } };
    case 'SET_EFFORT_DATA':
      return { ...state, effortData: action.payload, uploadStatus: { ...state.uploadStatus, effort: 'success' } };
    case 'SET_ATTENDANCE_DATA':
      return { ...state, attendanceData: action.payload, uploadStatus: { ...state.uploadStatus, attendance: 'success' } };

    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'RESET_FILTERS':
      return { ...state, filters: { ...INITIAL_STATE.filters } };

    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: { ...state.loading, [action.key]: action.value } };

    case 'ADD_ABSENCE_OVERRIDE': {
      const ov = { ...state.absenceOverrides };
      if (!ov[action.advisor]) ov[action.advisor] = [];
      if (!ov[action.advisor].includes(action.date))
        ov[action.advisor] = [...ov[action.advisor], action.date];
      return { ...state, absenceOverrides: ov };
    }
    case 'REMOVE_ABSENCE_OVERRIDE': {
      const ov = { ...state.absenceOverrides };
      if (ov[action.advisor])
        ov[action.advisor] = ov[action.advisor].filter(d => d !== action.date);
      return { ...state, absenceOverrides: ov };
    }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [{ id: Date.now(), ...action.payload }, ...state.notifications.slice(0,49)] };
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] };

    case 'ADD_TO_RECON_QUEUE':
      return { ...state, reconciliationQueue: [...state.reconciliationQueue, ...action.payload] };
    case 'APPROVE_RECON': {
      const targetShift = action.targetShiftDate || action.item.shiftDate;
      // Re-inject approved call into effortData.rows with the corrected shiftDate
      const reinjectedRow = {
        ...action.item,
        shiftDate:    targetShift,
        originalShiftDate: action.item.shiftDate,
        reconApproved: true,
        isPTT: action.item.connected === 1 && (action.item.duration || 0) > 1.5,
        pttMinutes: (action.item.connected === 1 && (action.item.duration || 0) > 1.5) ? action.item.duration : 0,
      };
      const updatedRows = state.effortData
        ? [...(state.effortData.rows || []).filter(r => r.sig !== action.item.sig), reinjectedRow]
        : null;
      return {
        ...state,
        reconciliationQueue: state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, {
          ...action.item,
          status: 'approved',
          targetShiftDate: targetShift,
          originalShiftDate: action.item.shiftDate,
          resolvedAt: new Date().toISOString(),
          modifiedBy: state.auth.user || 'Admin',
        }],
        effortData: state.effortData ? { ...state.effortData, rows: updatedRows } : null,
      };
    }
    case 'SUPPRESS_RECON':
      return {
        ...state,
        reconciliationQueue:    state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, { ...action.item, status:'suppressed', resolvedAt:new Date().toISOString() }],
      };
    case 'IGNORE_RECON':
      return {
        ...state,
        reconciliationQueue:    state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, { ...action.item, status:'ignored', resolvedAt:new Date().toISOString() }],
      };
    case 'CLEAR_RECON_QUEUE':
      return { ...state, reconciliationQueue: [] };

    default:
      return state;
  }
}

// ── 7. Provider ────────────────────────────────────────────
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Auth
  const login = useCallback((user, role) => {
    saveSession(user, role);
    dispatch({ type: 'LOGIN', user, role });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    dispatch({ type: 'LOGOUT' });
  }, []);

  // Data setters
  const setBSCData = useCallback((data) => {
    dispatch({ type: 'SET_BSC_DATA', payload: data });
    persistState({ bscData: data, uploadStatus: { bsc: 'success' } });
  }, []);

  const setEffortData = useCallback((data) => {
    dispatch({ type: 'SET_EFFORT_DATA', payload: data });
    // Save to sessionStorage (survives navigation + page refresh within session)
    if (data) {
      try {
        const serialized = JSON.stringify(data);
        if (serialized.length < 8 * 1024 * 1024) { // 8MB limit
          sessionStorage.setItem('em_effort', serialized);
        } else {
          // Too large — save without raw rows but keep aggregated
          const lite = { ...data, rows: data.rows?.slice(0, 5000) };
          sessionStorage.setItem('em_effort', JSON.stringify(lite));
        }
      } catch(e) { console.warn('Effort sessionStorage save failed:', e.message); }
    } else {
      sessionStorage.removeItem('em_effort');
    }
  }, []);

  const setAttendanceData = useCallback((data) => {
    dispatch({ type: 'SET_ATTENDANCE_DATA', payload: data });
    // Keep attendance in sessionStorage (survives tab navigation, cleared on close)
    if (data) {
      try { sessionStorage.setItem('em_attendance', JSON.stringify(data)); } catch {}
    } else {
      sessionStorage.removeItem('em_attendance');
    }
  }, []);

  // Filters
  const setFilter    = useCallback((key, value) => dispatch({ type: 'SET_FILTER', key, value }), []);
  const resetFilters = useCallback(() => dispatch({ type: 'RESET_FILTERS' }), []);
  const setTab       = useCallback((tab) => dispatch({ type: 'SET_TAB', payload: tab }), []);
  const setLoading   = useCallback((key, val) => dispatch({ type: 'SET_LOADING', key, value: val }), []);

  // Absence
  const addAbsence = useCallback((advisor, date) => {
    dispatch({ type: 'ADD_ABSENCE_OVERRIDE', advisor, date });
    // Persist absence overrides immediately
    const current = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}');
    const ov = { ...((current.absenceOverrides || {})) };
    if (!ov[advisor]) ov[advisor] = [];
    if (!ov[advisor].includes(date)) ov[advisor] = [...ov[advisor], date];
    persistState({ absenceOverrides: ov });
  }, []);

  const removeAbsence = useCallback((advisor, date) => {
    dispatch({ type: 'REMOVE_ABSENCE_OVERRIDE', advisor, date });
    const current = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}');
    const ov = { ...((current.absenceOverrides || {})) };
    if (ov[advisor]) ov[advisor] = ov[advisor].filter(d => d !== date);
    persistState({ absenceOverrides: ov });
  }, []);

  // Notifications
  const notify = useCallback((message, type = 'info') =>
    dispatch({ type: 'ADD_NOTIFICATION', payload: { message, type } }), []);

  // Filtered advisors
  const getFilteredAdvisors = useCallback(() => {
    if (!state.bscData?.advisors) return [];
    let list = [...state.bscData.advisors];
    const { tl, apm, region, qualification, search } = state.filters;
    if (tl !== 'All')     list = list.filter(a => a.tl === tl);
    if (apm !== 'All')    list = list.filter(a => a.apm === apm);
    if (region !== 'All') list = list.filter(a => a.region === region);
    if (qualification === 'Qualified')     list = list.filter(a => a.qualification?.qualified);
    if (qualification === 'Not Qualified') list = list.filter(a => !a.qualification?.qualified);
    if (qualification === 'At Risk')       list = list.filter(a => a.qualification?.pdStatus === 'At Risk');
    if (qualification === 'Off Track')     list = list.filter(a => a.qualification?.pdStatus === 'Off Track');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.empId?.toLowerCase().includes(q));
    }
    return list;
  }, [state.bscData, state.filters]);

  // Reconciliation
  const addToReconQueue = useCallback((items) => dispatch({ type: 'ADD_TO_RECON_QUEUE', payload: items }), []);
  const approveRecon    = useCallback((sig, item, targetShiftDate) => dispatch({ type: 'APPROVE_RECON', sig, item, targetShiftDate }), []);
  const suppressRecon   = useCallback((sig, item) => dispatch({ type: 'SUPPRESS_RECON', sig, item }), []);
  const ignoreRecon     = useCallback((sig, item) => dispatch({ type: 'IGNORE_RECON', sig, item }), []);

  const value = {
    state, dispatch,
    login, logout,
    setBSCData, setEffortData, setAttendanceData,
    setFilter, resetFilters, setTab, setLoading,
    addAbsence, removeAbsence,
    notify, getFilteredAdvisors,
    addToReconQueue, approveRecon, suppressRecon, ignoreRecon,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
