import { useState } from 'react';
import { useApp } from '../../store/appStore.jsx';

const CREDENTIALS = {
  'TLemeritus@2026':   { role: 'TL',     label: 'Team Lead' },
  'APMemeritus@2026':  { role: 'APM',    label: 'Asst. Performance Manager' },
  'Emeritus@20261912': { role: 'MASTER', label: 'Master Admin' },
};

export default function LoginScreen() {
  const { login } = useApp();
  const [pass, setPass] = useState('');
  const [user, setUser] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const cred = CREDENTIALS[pass];
    if (cred) { login(cred.role, user || cred.label); }
    else { setError('Invalid credentials. Please try again.'); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="em-badge">E</div>
          <h2 style={{fontSize:20,fontWeight:800,color:'#0f172a'}}>Emeritus OI Platform</h2>
          <p style={{fontSize:12,color:'#64748b',marginTop:4}}>Operational Intelligence — FY26 Q4</p>
        </div>
        <div className="login-form">
          <input type="text" placeholder="Your name (optional)" value={user} onChange={e=>setUser(e.target.value)} />
          <input type="password" placeholder="Access password" value={pass}
            onChange={e=>{setPass(e.target.value);setError('');}}
            onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
          {error && <p style={{color:'#dc2626',fontSize:12,marginBottom:12}}>{error}</p>}
          <button className="btn btn-primary" onClick={handleLogin}>Sign In →</button>
        </div>
        <p style={{textAlign:'center',fontSize:11,color:'#94a3b8',marginTop:24}}>
          Erulearning Solutions Pvt Ltd · Confidential
        </p>
      </div>
    </div>
  );
}
