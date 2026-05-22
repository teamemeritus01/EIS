import { useState, useEffect } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { saveQuarterlyConfig, loadQuarterlyConfig, resetQuarterlyConfig, SLAB_GRID, METRIC_TARGETS, WORKING_DAYS, GATING } from '../../constants/businessRules.js';

const DEFAULT_CONFIG = {
  quarter: 'FY26 Q4',
  quarterStart: '2026-04-01',
  quarterEnd:   '2026-06-30',
  gating: { minBSC: 60, minProductiveDaysPct: 75 },
  metricTargets: { connectedCalls: 21, ahtFirstCall: 780, adjustedTTFA: 95, pureTaskTime: 145 },
  workingDays: { ROW: { April:20, May:19, June:19 }, US: { April:22, May:19, June:21 } },
  slabGrid: [
    { rankMin:1,  rankMax:7,        payout:120000, label:'Slab 1' },
    { rankMin:8,  rankMax:14,       payout:100000, label:'Slab 2' },
    { rankMin:15, rankMax:23,       payout:80000,  label:'Slab 3' },
    { rankMin:24, rankMax:33,       payout:70000,  label:'Slab 4' },
    { rankMin:34, rankMax:44,       payout:60000,  label:'Slab 5' },
    { rankMin:45, rankMax:56,       payout:40000,  label:'Slab 6' },
    { rankMin:57, rankMax:69,       payout:30000,  label:'Slab 7' },
    { rankMin:70, rankMax:77,       payout:15000,  label:'Slab 8' },
    { rankMin:78, rankMax:999,      payout:0,      label:'No Payout' },
  ],
};

function ConfigSection({ title, children, accent='var(--em-green)' }) {
  return (
    <div className="card" style={{ borderLeft:`3px solid ${accent}` }}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

export default function QuarterlyConfig() {
  const { notify } = useApp();
  const [cfg, setCfg] = useState(() => loadQuarterlyConfig() || DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const update = (path, value) => {
    setHasChanges(true);
    setCfg(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const updateSlab = (idx, key, value) => {
    setHasChanges(true);
    setCfg(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.slabGrid[idx][key] = key === 'payout' ? parseInt(value) || 0 : parseInt(value) || 0;
      return next;
    });
  };

  const handleSave = () => {
    saveQuarterlyConfig(cfg);
    setSaved(true);
    setHasChanges(false);
    notify('Quarterly configuration saved. Changes will apply on next BSC upload.', 'success');
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (!window.confirm('Reset to FY26 Q4 defaults? This cannot be undone.')) return;
    resetQuarterlyConfig();
    setCfg(DEFAULT_CONFIG);
    setHasChanges(false);
    notify('Configuration reset to FY26 Q4 defaults', 'info');
  };

  const rowTotal = Object.values(cfg.workingDays.ROW).reduce((s,v)=>s+v,0);
  const usTotal  = Object.values(cfg.workingDays.US).reduce((s,v)=>s+v,0);

  const NUM = (val, path, min=0, max=9999) => (
    <input type="number" value={val} min={min} max={max}
      onChange={e => update(path, parseFloat(e.target.value))}
      style={{ width:80, padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, textAlign:'center' }} />
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div className="card" style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', color:'white', border:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>Quarterly Configuration</div>
            <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>
              Update business rules for each new quarter without any code changes. Changes apply on next BSC upload.
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-outline" onClick={handleReset} style={{ borderColor:'rgba(255,255,255,.3)', color:'white' }}>
              ↺ Reset to Defaults
            </button>
            <button className="btn btn-primary" onClick={handleSave} style={{ background: saved?'#166534':'#3b82f6' }}>
              {saved ? '✓ Saved!' : hasChanges ? '💾 Save Changes*' : '💾 Save'}
            </button>
          </div>
        </div>
        {hasChanges && (
          <div style={{ marginTop:10, background:'rgba(234,179,8,.2)', borderRadius:6, padding:'6px 12px', fontSize:12, color:'#fef9c3' }}>
            ⚠ You have unsaved changes. Click "Save Changes" to apply.
          </div>
        )}
      </div>

      {/* Quarter info */}
      <ConfigSection title="📅 Quarter Information" accent="#6366f1">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {[['Quarter Label','quarter'],['Start Date','quarterStart'],['End Date','quarterEnd']].map(([label, path])=>(
            <div key={path}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', marginBottom:6 }}>{label.toUpperCase()}</div>
              <input value={cfg[path.split('.').pop()]} onChange={e=>update(path,e.target.value)}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13 }} />
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* Gating criteria */}
      <ConfigSection title="🔒 Gating Criteria" accent="#dc2626">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:20 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Minimum BSC Score (for eligibility)</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {NUM(cfg.gating.minBSC, 'gating.minBSC', 0, 100)}
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>BSC score must be ≥ this value</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Minimum Productive Day % (of working days)</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {NUM(cfg.gating.minProductiveDaysPct, 'gating.minProductiveDaysPct', 0, 100)}
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>% of total working days</span>
            </div>
          </div>
        </div>
      </ConfigSection>

      {/* Working days */}
      <ConfigSection title="📆 Working Days per Month" accent="#f59e0b">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {[['ROW','#166534'],['US','#1e40af']].map(([region, color])=>(
            <div key={region}>
              <div style={{ fontSize:12, fontWeight:700, color, marginBottom:10 }}>{region} Working Days</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {['April','May','June'].map(month=>(
                  <div key={month}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>{month}</div>
                    {NUM(cfg.workingDays[region][month], `workingDays.${region}.${month}`, 0, 31)}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8, fontSize:12, color:'var(--text-muted)' }}>
                Total: <strong style={{ color }}>{region==='ROW'?rowTotal:usTotal} days</strong> · 
                Min productive days: <strong style={{ color }}>{Math.ceil((region==='ROW'?rowTotal:usTotal)*cfg.gating.minProductiveDaysPct/100)}</strong>
              </div>
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* Metric targets */}
      <ConfigSection title="🎯 BSC Metric Targets (Equal 25% Weight Each)" accent="#3b82f6">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {[
            ['Connected Calls / Prod Day', 'metricTargets.connectedCalls', 'calls/day', 1, 50],
            ['AHT First Call (seconds)',    'metricTargets.ahtFirstCall',   'seconds',   60, 1800],
            ['Adjusted TTFA (%)',           'metricTargets.adjustedTTFA',   '%',         50, 100],
            ['Pure Talk Time (min/day)',    'metricTargets.pureTaskTime',   'min/day',   10, 500],
          ].map(([label, path, unit, min, max])=>(
            <div key={path} style={{ background:'#f8fafc', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>{label}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {NUM(path.includes('TTFA')?cfg.metricTargets.adjustedTTFA:path.includes('connect')?cfg.metricTargets.connectedCalls:path.includes('aht')?cfg.metricTargets.ahtFirstCall:cfg.metricTargets.pureTaskTime, path, min, max)}
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>{unit}</span>
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>25% of BSC score</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, padding:'10px 14px', background:'#dbeafe', borderRadius:8, fontSize:12, color:'#1e40af' }}>
          BSC = (CC/target × 0.25) + (AHT/target × 0.25) + (TTFA/target × 0.25) + (PTT/target × 0.25) × 100 — each metric capped at 100%
        </div>
      </ConfigSection>

      {/* Slab grid */}
      <ConfigSection title="💰 Incentive Slab Grid (Rank-Based Payouts)" accent="#8b5cf6">
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
          Edit rank ranges and payout amounts for the current quarter. Ensure rank ranges are contiguous and non-overlapping.
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Slab</th><th>Rank From</th><th>Rank To</th><th>Payout (₹ INR)</th><th>Preview</th>
            </tr></thead>
            <tbody>
              {cfg.slabGrid.map((slab, idx)=>(
                <tr key={idx}>
                  <td style={{ fontWeight:700 }}>{slab.label}</td>
                  <td>
                    <input type="number" value={slab.rankMin} min={1} max={999}
                      onChange={e=>updateSlab(idx,'rankMin',e.target.value)}
                      style={{ width:70, padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, textAlign:'center' }} />
                  </td>
                  <td>
                    <input type="number" value={slab.rankMax} min={1} max={999}
                      onChange={e=>updateSlab(idx,'rankMax',e.target.value)}
                      style={{ width:70, padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, textAlign:'center' }} />
                  </td>
                  <td>
                    <input type="number" value={slab.payout} min={0} step={5000}
                      onChange={e=>updateSlab(idx,'payout',e.target.value)}
                      style={{ width:110, padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, textAlign:'center' }} />
                  </td>
                  <td>
                    <span style={{ fontWeight:800, color:slab.payout>=80000?'#166534':slab.payout>=40000?'#1e40af':slab.payout>0?'#6b7280':'#94a3b8' }}>
                      {slab.payout>0?`₹${slab.payout.toLocaleString('en-IN')}`:'₹0 (No Payout)'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop:12, padding:'10px 14px', background:'#f5f3ff', borderRadius:8, fontSize:12, color:'#5b21b6' }}>
          Total slab payout range: ₹0 — ₹{Math.max(...cfg.slabGrid.map(s=>s.payout)).toLocaleString('en-IN')} · 
          Ranks {Math.min(...cfg.slabGrid.map(s=>s.rankMin))} to {Math.max(...cfg.slabGrid.filter(s=>s.payout>0).map(s=>s.rankMax))} receive incentive
        </div>
      </ConfigSection>

      {/* Save reminder */}
      {hasChanges && (
        <div style={{ position:'sticky', bottom:24, display:'flex', justifyContent:'center' }}>
          <div style={{ background:'#0f172a', color:'white', borderRadius:12, padding:'12px 24px', display:'flex', gap:16, alignItems:'center', boxShadow:'0 8px 24px rgba(0,0,0,.3)' }}>
            <span style={{ fontSize:13 }}>⚠ Unsaved changes</span>
            <button className="btn btn-primary" onClick={handleSave}>Save Configuration</button>
            <button className="btn btn-outline" style={{ borderColor:'rgba(255,255,255,.3)', color:'white' }} onClick={()=>{ setCfg(loadQuarterlyConfig()||DEFAULT_CONFIG); setHasChanges(false); }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
