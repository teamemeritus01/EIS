import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';

const ROLES = [
  { id:'admin',    label:'Admin',    icon:'🔐', sub:'Full system access',      pass:'Admin@Emeritus26'     },
  { id:'director', label:'Director', icon:'🎯', sub:'Executive read access',   pass:'Director@Emeritus26'  },
  { id:'tl',       label:'Team Lead',icon:'👥', sub:'Team management view',    pass:'TLemeritus@2026'      },
  { id:'apm',      label:'APM',      icon:'📊', sub:'PA monitoring & planning',pass:'APMemeritus@2026'     },
];
// Legacy master credential
const MASTER = 'Emeritus@20261912';

export default function LoginScreen() {
  const { login } = useApp();
  const [selRole, setSelRole] = useState('admin');
  const [pass,   setPass]    = useState('');
  const [err,    setErr]     = useState('');
  const [loading,setLoading] = useState(false);

  const handleLogin = () => {
    if (!pass.trim()) { setErr('Please enter your password.'); return; }
    setLoading(true); setErr('');
    setTimeout(() => {
      const role = ROLES.find(r => r.id === selRole);
      const ok   = pass === role.pass || pass === MASTER;
      if (ok) {
        login(role.label, role.id);
      } else {
        setErr('Incorrect password. Please try again.');
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-em">E</div>
          <div>
            <div className="login-logo-text">Emeritus OI Platform</div>
            <div className="login-logo-sub">FY26 Q4 · India Online Certificates</div>
          </div>
        </div>

        <div className="login-title">Welcome back</div>
        <div className="login-sub">Select your role and enter your access password</div>

        <div className="role-grid">
          {ROLES.map(r => (
            <button key={r.id} className={`role-btn ${selRole===r.id?'active':''}`}
              onClick={() => { setSelRole(r.id); setPass(''); setErr(''); }}>
              <span className="role-btn-icon">{r.icon}</span>
              <div className="role-btn-name">{r.label}</div>
              <div className="role-btn-sub">{r.sub}</div>
            </button>
          ))}
        </div>

        <div className="login-input-wrap">
          <label className="login-label">Access Password</label>
          <input className="login-input" type="password" placeholder="Enter your password"
            value={pass} onChange={e=>{ setPass(e.target.value); setErr(''); }}
            onKeyDown={e=>e.key==='Enter'&&handleLogin()} autoFocus />
        </div>

        <button className="login-btn" onClick={handleLogin} disabled={loading}>
          {loading ? '⏳ Authenticating...' : `Sign in as ${ROLES.find(r=>r.id===selRole)?.label}`}
        </button>
        {err && <div className="login-err">{err}</div>}
        <div className="login-hint">Operational Intelligence Platform · FY26 Q4 · Confidential</div>
      </div>
    </div>
  );
}
