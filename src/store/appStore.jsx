// ============================================================
// GLOBAL APP STATE STORE
// React Context + useReducer — no external state library needed
// ============================================================

import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext(null);

const INITIAL_STATE = {
  // Auth
  auth: { loggedIn: false, role: null, user: null },

  // Uploaded data
  bscData:        null,  // parsed BSC workbook output
  effortData:     null,  // parsed effort CSV output
  attendanceData: null,  // parsed attendance file output

  // Filters
  filters: {
    tl:      'All',
    apm:     'All',
    shift:   'All',
    region:  'All',
    qualification: 'All',
    riskType: 'All',
    search:  '',
  },

  // UI
  activeTab:    'upload',
  uploadStatus: { bsc: null, effort: null, attendance: null, comp: null },
  loading:      {},

  // Overrides (persisted to localStorage)
  absenceOverrides: {},  // { advisorName: [date1, date2, ...] }
  operationalNotes: {},

  // Notifications
  notifications: [],
  reconciliationQueue: [],  // anomaly rows awaiting review
  reconciliationApproved: [], // approved items
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, auth: { loggedIn: true, ...action.payload } };
    case 'LOGOUT':
      return { ...state, auth: { loggedIn: false, role: null, user: null } };

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

    case 'SET_UPLOAD_STATUS':
      return { ...state, uploadStatus: { ...state.uploadStatus, [action.key]: action.value } };

    case 'ADD_ABSENCE_OVERRIDE': {
      const overrides = { ...state.absenceOverrides };
      if (!overrides[action.advisor]) overrides[action.advisor] = [];
      if (!overrides[action.advisor].includes(action.date)) {
        overrides[action.advisor] = [...overrides[action.advisor], action.date];
      }
      return { ...state, absenceOverrides: overrides };
    }

    case 'REMOVE_ABSENCE_OVERRIDE': {
      const overrides = { ...state.absenceOverrides };
      if (overrides[action.advisor]) {
        overrides[action.advisor] = overrides[action.advisor].filter(d => d !== action.date);
      }
      return { ...state, absenceOverrides: overrides };
    }

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [
          { id: Date.now(), ...action.payload, timestamp: new Date() },
          ...state.notifications.slice(0, 49),
        ],
      };

    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] };
    case 'ADD_TO_RECON_QUEUE':
      return { ...state, reconciliationQueue: [...state.reconciliationQueue, ...action.payload] };
    case 'APPROVE_RECON':
      return { 
        ...state, 
        reconciliationQueue: state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, { ...action.item, status: 'approved', resolvedAt: new Date().toISOString() }]
      };
    case 'SUPPRESS_RECON':
      return { 
        ...state, 
        reconciliationQueue: state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, { ...action.item, status: 'suppressed', resolvedAt: new Date().toISOString() }]
      };
    case 'IGNORE_RECON':
      return { 
        ...state, 
        reconciliationQueue: state.reconciliationQueue.filter(r => r.sig !== action.sig),
        reconciliationApproved: [...state.reconciliationApproved, { ...action.item, status: 'ignored', resolvedAt: new Date().toISOString() }]
      };
    case 'CLEAR_RECON_QUEUE':
      return { ...state, reconciliationQueue: [] };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, loadPersistedState());

  const login  = useCallback((role, user) => dispatch({ type: 'LOGIN', payload: { role, user } }), []);
  const logout = useCallback(() => dispatch({ type: 'LOGOUT' }), []);

  const setBSCData        = useCallback((data) => { dispatch({ type: 'SET_BSC_DATA', payload: data }); persistState({ bscData: data }); }, []);
  const setEffortData     = useCallback((data) => { dispatch({ type: 'SET_EFFORT_DATA', payload: data }); persistState({ effortData: data }); }, []);
  const setAttendanceData = useCallback((data) => dispatch({ type: 'SET_ATTENDANCE_DATA', payload: data }), []);

  const setFilter     = useCallback((key, value) => dispatch({ type: 'SET_FILTER', key, value }), []);
  const resetFilters  = useCallback(() => dispatch({ type: 'RESET_FILTERS' }), []);
  const setTab        = useCallback((tab) => dispatch({ type: 'SET_TAB', payload: tab }), []);
  const setLoading    = useCallback((key, val) => dispatch({ type: 'SET_LOADING', key, value: val }), []);

  const addAbsence    = useCallback((advisor, date) => dispatch({ type: 'ADD_ABSENCE_OVERRIDE', advisor, date }), []);
  const removeAbsence = useCallback((advisor, date) => dispatch({ type: 'REMOVE_ABSENCE_OVERRIDE', advisor, date }), []);

  const notify = useCallback((message, type = 'info') =>
    dispatch({ type: 'ADD_NOTIFICATION', payload: { message, type } }), []);

  // Filtered advisors selector
  const getFilteredAdvisors = useCallback(() => {
    if (!state.bscData?.advisors) return [];
    let advisors = [...state.bscData.advisors];
    const { tl, apm, shift, region, qualification, search } = state.filters;

    if (tl !== 'All')     advisors = advisors.filter(a => a.tl === tl);
    if (apm !== 'All')    advisors = advisors.filter(a => a.apm === apm);
    if (region !== 'All') advisors = advisors.filter(a => a.region === region);
    if (shift !== 'All')  advisors = advisors.filter(a => {
      const shiftStr = `${a.shiftStart} - ${a.shiftEnd}`;
      return shiftStr === shift;
    });
    if (qualification === 'Qualified')    advisors = advisors.filter(a => a.qualification?.qualified);
    if (qualification === 'Not Qualified') advisors = advisors.filter(a => !a.qualification?.qualified);
    if (qualification === 'On Track')     advisors = advisors.filter(a => a.qualification?.pdStatus === 'On Track');
    if (qualification === 'At Risk')      advisors = advisors.filter(a => a.qualification?.pdStatus === 'At Risk');
    if (qualification === 'Off Track')    advisors = advisors.filter(a => a.qualification?.pdStatus === 'Off Track');
    if (search.trim()) {
      const q = search.toLowerCase();
      advisors = advisors.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.empId && a.empId.toLowerCase().includes(q))
      );
    }

    // Apply absence overrides (exclude effort days)
    advisors = advisors.map(a => {
      const excluded = state.absenceOverrides[a.name] || [];
      return { ...a, absenceExcludedDates: excluded };
    });

    return advisors;
  }, [state.bscData, state.filters, state.absenceOverrides]);

  const addToReconQueue = useCallback((items) => dispatch({ type: 'ADD_TO_RECON_QUEUE', payload: items }), []);
  const approveRecon  = useCallback((sig, item) => dispatch({ type: 'APPROVE_RECON', sig, item }), []);
  const suppressRecon = useCallback((sig, item) => dispatch({ type: 'SUPPRESS_RECON', sig, item }), []);
  const ignoreRecon   = useCallback((sig, item) => dispatch({ type: 'IGNORE_RECON', sig, item }), []);

  const value = {
    state,
    dispatch,
    login, logout,
    setBSCData, setEffortData, setAttendanceData,
    setFilter, resetFilters, setTab, setLoading,
    addAbsence, removeAbsence,
    notify,
    getFilteredAdvisors,
    addToReconQueue, approveRecon, suppressRecon, ignoreRecon,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ----------------------------
// PERSISTENCE (localStorage)
// ----------------------------
const PERSIST_KEY = 'emeritus_app_state';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return INITIAL_STATE;
    const saved = JSON.parse(raw);
    return {
      ...INITIAL_STATE,
      bscData:          saved.bscData    || null,
      effortData:       saved.effortData || null,
      absenceOverrides: saved.absenceOverrides || {},
      uploadStatus:     saved.uploadStatus || INITIAL_STATE.uploadStatus,
    };
  } catch {
    return INITIAL_STATE;
  }
}

function persistState(partial) {
  try {
    const existing = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}');
    const next = { ...existing, ...partial };
    // Cap size
    const serialized = JSON.stringify(next);
    if (serialized.length < 4 * 1024 * 1024) {
      localStorage.setItem(PERSIST_KEY, serialized);
    }
  } catch (e) {
    console.warn('State persist failed', e);
  }
}
// Export attendance setter for UploadCenter

// Note: Additional reconciliation state is managed in ReconciliationCenter via localStorage
// appStore tracks reconciliation queue items that need approval
