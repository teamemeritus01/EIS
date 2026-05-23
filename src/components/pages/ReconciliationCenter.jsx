// ============================================================
// RECONCILIATION CENTER
// Enterprise-grade future-timestamp anomaly management
// Implements: Detection → Queue → Manual Approval → Memory → Suppression
// ============================================================
import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { getReconciliationStats, clearReconciliationMemory } from '../../parsers/effortParser.js';

const STATUS_COLORS = { approved:'badge-green', suppressed:'badge-gray', ignored:'badge-yellow', pending:'badge-orange' };

function AnomalyRow({ item, onApprove, onIgnore, onSuppress }) {
  const [expanded, setExpanded] = useState(false);
  const suspected = item.shiftDate || 'Previous operational day';
  return (
    <div style={{ border:'1px solid #fdba74', borderRadius:10, marginBottom:10, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff7ed', cursor:'pointer' }} onClick={()=>setExpanded(!expanded)}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#f97316', flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>{item.advisor}</div>
          <div style={{ fontSize:11, color:'#9a3412' }}>
            Created: {item.date} · Hour: {item.hour}:00 · Duration: {item.duration?.toFixed(2)} min · {item.connected?'Connected':'Not Connected'}
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:11 }}>
          <div style={{ fontWeight:600, color:'#9a3412' }}>Future timestamp detected</div>
          <div style={{ color:'var(--text-muted)' }}>Suspected day: {suspected}</div>
        </div>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>{expanded?'▲':'▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding:'14px 16px', background:'white', borderTop:'1px solid #fdba74' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {[
              { label:'Advisor', value:item.advisor },
              { label:'Call Date (Raw)', value:item.date },
              { label:'Hour of Day', value:`${item.hour}:00` },
              { label:'Duration', value:`${item.duration?.toFixed(2)} min` },
              { label:'Connected', value:item.connected?'Yes':'No' },
              { label:'Call Type', value:item.callType||'Calls' },
              { label:'Detected At', value:new Date(item.detectedAt).toLocaleString('en-IN') },
              { label:'Suspected Shift Date', value:suspected },
            ].map(f=>(
              <div key={f.label} style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:2 }}>{f.label}</div>
                <div style={{ fontWeight:700, fontSize:12 }}>{f.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background:'#fef9c3', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:14, border:'1px solid #fde047' }}>
            <strong>What happened:</strong> This call was logged at {item.hour}:00 on {item.date}, which falls after midnight and before 10 AM.
            Under the operational-day rule (10 AM → 10 AM), it belongs to the <strong>previous shift's</strong> window.
            Due to Salesforce/RingDNA sync delays, it appeared in a later upload — creating a future-timestamp anomaly.
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary" onClick={()=>onApprove(item)} style={{ background:'#166534' }}>
              ✓ Approve Reassignment to {suspected}
            </button>
            <button className="btn btn-outline" onClick={()=>onIgnore(item)} style={{ borderColor:'#eab308', color:'#854d0e' }}>
              ~ Ignore (keep original timestamp)
            </button>
            <button className="btn btn-danger" onClick={()=>onSuppress(item)}>
              ✕ Suppress Row (exclude from calculations)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReconciliationCenter() {
  const { state, approveRecon, ignoreRecon, suppressRecon, notify, dispatch } = useApp();
  const { reconciliationQueue = [], reconciliationApproved = [] } = state;
  const [memStats, setMemStats] = useState(() => { try { return getReconciliationStats(); } catch { return { count:0, sizeKB:0 }; } });
  const [activeTab, setActiveTab] = useState('queue');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'approved' | 'suppressed' | 'ignored'

  const handleApprove = (item) => {
    approveRecon(item.sig, item);
    notify(`✓ Reassigned: ${item.advisor}'s call on ${item.date} → ${item.shiftDate||'prev shift'}`, 'success');
  };
  const handleIgnore  = (item) => { ignoreRecon(item.sig, item); notify(`Ignored anomaly for ${item.advisor}`, 'info'); };
  const handleSuppress= (item) => { suppressRecon(item.sig, item); notify(`Suppressed row for ${item.advisor} — excluded from calculations`, 'info'); };

  const handleClearMemory = () => {
    clearReconciliationMemory();
    setMemStats({ count:0, sizeKB:0 });
    notify('Reconciliation memory cleared. Next upload will reprocess all rows.', 'info');
  };

  const approveAll = () => {
    reconciliationQueue.forEach(item => approveRecon(item.sig, item));
    notify(`✓ All ${reconciliationQueue.length} anomalies approved and reassigned`, 'success');
  };
  const suppressAll = () => {
    reconciliationQueue.forEach(item => suppressRecon(item.sig, item));
    notify(`Suppressed all ${reconciliationQueue.length} anomalies`, 'info');
  };

  const filteredResolved = useMemo(() => {
    let list = reconciliationApproved;
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search) list = list.filter(r => r.advisor?.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [reconciliationApproved, filter, search]);

  const stats = useMemo(() => ({
    pending:   reconciliationQueue.length,
    approved:  reconciliationApproved.filter(r=>r.status==='approved').length,
    suppressed:reconciliationApproved.filter(r=>r.status==='suppressed').length,
    ignored:   reconciliationApproved.filter(r=>r.status==='ignored').length,
  }), [reconciliationQueue, reconciliationApproved]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Architecture explanation card */}
      <div className="card" style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', color:'white', border:'none' }}>
        <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
          <div style={{ fontSize:40 }}>🔄</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>Reconciliation Engine — Enterprise Telemetry Integrity</div>
            <div style={{ fontSize:12, opacity:.85, lineHeight:1.8 }}>
              Raw effort telemetry from Salesforce/RingDNA contains real-world timing inconsistencies — calls made at 11 PM appear in next-day uploads due to sync delays.
              This engine detects future-timestamp anomalies, queues them for manual review, and maintains reconciliation memory to prevent double-counting across cumulative uploads.
              <strong style={{ color:'#4ade80' }}> Raw telemetry is never modified — only interpreted.</strong>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, minWidth:160 }}>
            {[
              ['Detect', 'Timestamp drift detection'],
              ['Queue', 'Manual review required'],
              ['Approve', 'Reassign to correct shift'],
              ['Memory', 'Suppress future duplicates'],
            ].map(([step,desc],i)=>(
              <div key={step} style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.08)', borderRadius:6, padding:'6px 10px' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:'#166534', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>{i+1}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:11 }}>{step}</div>
                  <div style={{ fontSize:10, opacity:.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Pending Review', value:stats.pending,    accent:'#f97316', alert:stats.pending>0 },
          { label:'Approved',       value:stats.approved,   accent:'#166534' },
          { label:'Suppressed',     value:stats.suppressed, accent:'#6b7280' },
          { label:'Ignored',        value:stats.ignored,    accent:'#eab308' },
          { label:'Memory Records', value:memStats.count+` (${memStats.sizeKB}KB)`, accent:'#6366f1' },
        ].map(s=>(
          <div key={s.label} className="stat-card" style={{ border:s.alert?'2px solid #fdba74':undefined }}>
            <div className="stat-accent" style={{ background:s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:s.alert?28:22, color:s.alert?'#9a3412':undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tab strip */}
      <div className="tab-strip">
        <div className={`tab-pill ${activeTab==='queue'?'active':''}`} onClick={()=>setActiveTab('queue')}>
          Pending Queue {stats.pending>0&&<span className="badge badge-orange" style={{ marginLeft:6 }}>{stats.pending}</span>}
        </div>
        <div className={`tab-pill ${activeTab==='resolved'?'active':''}`} onClick={()=>setActiveTab('resolved')}>
          Resolved History ({reconciliationApproved.length})
        </div>
        <div className={`tab-pill ${activeTab==='memory'?'active':''}`} onClick={()=>setActiveTab('memory')}>
          Reconciliation Memory
        </div>
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <div>
          {reconciliationQueue.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'60px 24px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
              <h3 style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No Pending Anomalies</h3>
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>
                All uploaded effort data has clean timestamps. No future-timestamp anomalies detected.<br/>
                Upload a Raw Effort CSV to check for anomalies.
              </p>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
                <div style={{ flex:1, fontSize:13, color:'#9a3412', fontWeight:600 }}>
                  ⚠ {reconciliationQueue.length} row(s) require your review before operational data is considered stable
                </div>
                <button className="btn btn-primary" onClick={approveAll} style={{ background:'#166534' }}>
                  ✓ Approve All ({reconciliationQueue.length})
                </button>
                <button className="btn btn-danger" onClick={suppressAll}>
                  ✕ Suppress All
                </button>
              </div>
              {reconciliationQueue.map(item => (
                <AnomalyRow key={item.sig} item={item} onApprove={handleApprove} onIgnore={handleIgnore} onSuppress={handleSuppress} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Resolved tab */}
      {activeTab === 'resolved' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
            <input className="search-input" placeholder="Search advisor..." value={search} onChange={e=>setSearch(e.target.value)} />
            <select className="filter-select" value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="suppressed">Suppressed</option>
              <option value="ignored">Ignored</option>
            </select>
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>{filteredResolved.length} records</span>
          </div>
          {filteredResolved.length === 0 ? (
            <div className="empty-state"><div>📋</div><h3>No Resolved Records</h3><p>Resolved anomalies appear here after review.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr>
                  <th style={{ textAlign:'left' }}>Advisor</th>
                  <th>Raw Date</th><th>Hour</th><th>Duration (min)</th><th>Connected</th>
                  <th>Reassigned To</th><th>Action Taken</th><th>Resolved At</th>
                </tr></thead>
                <tbody>
                  {filteredResolved.map((item,i)=>(
                    <tr key={i}>
                      <td style={{ textAlign:'left', fontWeight:700 }}>{item.advisor}</td>
                      <td>{item.date}</td>
                      <td>{item.hour}:00</td>
                      <td>{item.duration?.toFixed(2)}</td>
                      <td>{item.connected?'Yes':'No'}</td>
                      <td style={{ fontSize:11 }}>{item.shiftDate||'Original'}</td>
                      <td><span className={`badge ${STATUS_COLORS[item.status]||'badge-gray'}`}>{item.status}</span></td>
                      <td style={{ fontSize:11, color:'var(--text-muted)' }}>{item.resolvedAt ? new Date(item.resolvedAt).toLocaleString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Memory tab */}
      {activeTab === 'memory' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div className="card-title">Reconciliation Memory — Duplicate Suppression Store</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16, lineHeight:1.8 }}>
              Every processed row receives a unique signature <code style={{ background:'#f1f5f9', padding:'1px 6px', borderRadius:4, fontSize:11 }}>advisor|date|hour|duration|connected</code>.
              Future uploads are checked against this memory — already-processed rows are silently suppressed, preventing double-counting across cumulative uploads.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { label:'Stored Signatures', value:memStats.count, desc:'Unique rows in memory' },
                { label:'Memory Size', value:`${memStats.sizeKB} KB`, desc:'Max: 1,024 KB' },
                { label:'Auto-Reset', value:'7 days', desc:'Entries expire after 7 days' },
              ].map(s=>(
                <div key={s.label} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ fontSize:24 }}>{s.value}</div>
                  <div className="stat-sub">{s.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:11, marginBottom:8, color:'var(--text-muted)' }}>Memory usage</div>
              <div className="progress-bar" style={{ height:10 }}>
                <div className="fill fill-green" style={{ width:`${Math.min((memStats.sizeKB/1024)*100,100)}%` }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
                <span>{memStats.sizeKB} KB used</span><span>1,024 KB max</span>
              </div>
            </div>

            <div style={{ marginTop:20, padding:'14px 16px', background:'#fef9c3', borderRadius:8, border:'1px solid #fde047', fontSize:12 }}>
              <strong>⚠ Clear Memory Warning:</strong> Clearing reconciliation memory means the next effort upload will reprocess all rows from scratch.
              This can cause previously suppressed anomalies to re-appear. Only clear if you are starting a fresh quarter or debugging.
            </div>
            <div style={{ marginTop:12 }}>
              <button className="btn btn-danger" onClick={handleClearMemory}>
                🗑 Clear Reconciliation Memory
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">How Duplicate Suppression Works</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { step:1, title:'Cumulative Upload Arrives', desc:'Each new effort CSV contains all rows from 10 AM until upload time — including rows from previous uploads.' },
                { step:2, title:'Signature Generation', desc:'Every row gets a unique fingerprint: advisor + date + hour + duration + connected status.' },
                { step:3, title:'Memory Comparison', desc:'System checks each signature against stored reconciliation memory.' },
                { step:4, title:'Duplicate Detected → Suppress', desc:'If signature already exists in memory, row is silently excluded from calculations.' },
                { step:5, title:'New Row → Process + Store', desc:'New signatures are processed normally and added to memory for future suppression.' },
              ].map(s=>(
                <div key={s.step} style={{ display:'flex', gap:12, padding:'10px 14px', background:'#f8fafc', borderRadius:8, alignItems:'flex-start' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--em-green)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>{s.step}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>{s.title}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
