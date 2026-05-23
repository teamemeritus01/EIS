// ============================================================
// RECONCILIATION CENTER
// Future-timestamp anomaly management with manual shift override
// Admin can reassign any call to any shift date of their choice
// ============================================================
import { useState, useMemo } from 'react';
import { useApp } from '../../store/appStore.jsx';
import { exportCSV } from '../../utils/exportUtils.js';
import { getShiftDates } from '../../parsers/effortParser.js';
import { formatShiftDate, toDDMMYYYY } from '../../utils/dateUtils.js';

const STATUS_COLORS = {
  approved:  { bg:'#dcfce7', color:'#166534' },
  suppressed:{ bg:'#f1f5f9', color:'#475569' },
  ignored:   { bg:'#fef9c3', color:'#854d0e' },
};

function AnomalyCard({ item, effortRows, onApprove, onIgnore, onSuppress }) {
  const [expanded, setExpanded]         = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [targetShift, setTargetShift]   = useState(item.shiftDate || '');

  // Available shift dates from effort data + allow typing a custom date
  const availableShifts = useMemo(() => getShiftDates(effortRows || []), [effortRows]);

  const calculatedShift = item.shiftDate || '—';
  const isOverriding    = targetShift && targetShift !== calculatedShift;
  const hour            = parseInt(item.hour, 10);

  const explanation = hour < 10
    ? `This call was logged at ${hour}:00 on ${item.date} (cross-midnight, before 10 AM cutoff). Under the 10 AM operational-day rule, it belongs to the previous day's shift. Due to a Salesforce/RingDNA sync delay, it appeared in a later upload — creating a future-timestamp anomaly.`
    : `This call was logged at ${hour}:00 on ${item.date}. Since Hour ${hour} ≥ 10 AM, the 10 AM rule maps it to the same day (shift ${calculatedShift}). However, at the time of upload, this timestamp was ahead of the current system time — indicating a Salesforce/RingDNA sync anomaly. You can approve it to the calculated shift (${calculatedShift}) or override it to any other shift date.`;

  return (
    <div style={{ border:`1.5px solid ${isOverriding ? '#3b82f6' : '#fdba74'}`, borderRadius:10, marginBottom:10, overflow:'hidden',
      transition:'border-color 0.2s' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
        background: isOverriding ? '#eff6ff' : '#fff7ed', cursor:'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: isOverriding ? '#3b82f6' : '#f97316', flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>{item.advisor}</div>
          <div style={{ fontSize:11, color:'#9a3412' }}>
            Created: {item.date} · Hour: {hour}:00 · Duration: {item.duration?.toFixed(2)} min · {item.connected ? 'Connected' : 'Not Connected'}
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:11 }}>
          <div style={{ fontWeight:600, color: isOverriding ? '#1e40af' : '#9a3412' }}>
            {isOverriding ? `⚡ Override → ${targetShift}` : 'Future timestamp detected'}
          </div>
          <div style={{ color:'var(--txt3)' }}>Calculated shift: {calculatedShift}</div>
        </div>
        <span style={{ fontSize:12, color:'var(--txt3)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding:'16px', background:'white', borderTop:`1px solid ${isOverriding ? '#bfdbfe' : '#fdba74'}` }}>

          {/* Call detail grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {[
              { label:'Advisor',           value: item.advisor },
              { label:'Call Date (Raw)',    value: item.date },
              { label:'Hour of Day',        value: `${hour}:00` },
              { label:'Duration',           value: `${item.duration?.toFixed(2)} min` },
              { label:'Connected',          value: item.connected ? 'Yes' : 'No' },
              { label:'Call Type',          value: item.callType || 'Calls' },
              { label:'Detected At',        value: item.detectedAt ? new Date(item.detectedAt).toLocaleString('en-IN') : '—' },
              { label:'Calculated Shift',   value: calculatedShift },
            ].map(f => (
              <div key={f.label} style={{ background:'#f8fafc', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'var(--txt3)', textTransform:'uppercase', marginBottom:2 }}>{f.label}</div>
                <div style={{ fontWeight:700, fontSize:12 }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Explanation */}
          <div style={{ background:'#fef9c3', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:14, border:'1px solid #fde047', lineHeight:1.6 }}>
            <strong>What happened:</strong> {explanation}
          </div>

          {/* Manual shift override section */}
          <div style={{ background: isOverriding ? '#eff6ff' : '#f8fafc', borderRadius:8, padding:'12px 14px',
            marginBottom:14, border:`1px solid ${isOverriding ? '#bfdbfe' : 'var(--border)'}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--txt2)' }}>📅 Target Shift Date:</span>

              {/* Quick select from available shifts */}
              <select
                className="filter-select"
                value={targetShift}
                onChange={e => setTargetShift(e.target.value)}
                style={{ fontSize:12 }}>
                <option value={calculatedShift}>
                  {formatShiftDate(calculatedShift)} — Calculated (default)
                </option>
                {availableShifts.filter(d => d !== calculatedShift).reverse().map(d => (
                  <option key={d} value={d}>{formatShiftDate(d)}</option>
                ))}
              </select>

              {isOverriding && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, color:'#1e40af', fontWeight:600 }}>
                    ⚡ Will be moved to: <strong>{targetShift}</strong> (not {calculatedShift})
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize:10 }}
                    onClick={() => setTargetShift(calculatedShift)}>
                    ↩ Reset to calculated
                  </button>
                </div>
              )}
            </div>

            {isOverriding && (
              <div style={{ marginTop:8, fontSize:11, color:'#1e40af', background:'#dbeafe', borderRadius:6, padding:'6px 10px' }}>
                ℹ This call will be <strong>added to {targetShift} shift</strong> calculations and <strong>excluded from {calculatedShift} shift</strong>. Audit trail will record the override.
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => onApprove(item, targetShift)}
              style={{ background: isOverriding ? '#1d4ed8' : '#166534' }}>
              ✓ {isOverriding
                ? `Approve & Move to ${targetShift}`
                : `Approve Reassignment to ${calculatedShift}`}
            </button>
            <button className="btn btn-outline" onClick={() => onIgnore(item)}
              style={{ borderColor:'#eab308', color:'#854d0e' }}>
              ~ Ignore (keep original timestamp)
            </button>
            <button className="btn btn-danger" onClick={() => onSuppress(item)}>
              ✕ Suppress Row (exclude from all calculations)
            </button>
          </div>

          {/* PTT impact note */}
          {item.connected && item.duration > 1.5 && (
            <div style={{ marginTop:10, fontSize:11, color:'#166534', background:'#f0fdf4', padding:'6px 10px', borderRadius:6 }}>
              ✓ This call qualifies for PTT ({item.duration?.toFixed(2)} min, connected). Will contribute to PTT in the target shift.
            </div>
          )}
          {!item.connected && (
            <div style={{ marginTop:10, fontSize:11, color:'#475569', background:'#f8fafc', padding:'6px 10px', borderRadius:6 }}>
              ℹ Not connected — will count as a dial only (no PTT impact regardless of shift).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReconciliationCenter() {
  const { state, approveRecon, ignoreRecon, suppressRecon, notify } = useApp();
  const { reconciliationQueue = [], reconciliationApproved = [], effortData, auth } = state;
  const [activeTab, setActiveTab] = useState('queue');
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('all');

  const effortRows = effortData?.rows || [];

  const handleApprove = (item, targetShiftDate) => {
    approveRecon(item.sig, item, targetShiftDate);
    const moved = targetShiftDate && targetShiftDate !== item.shiftDate;
    notify(
      moved
        ? `✓ ${item.advisor}'s call moved to ${targetShiftDate} (overridden from ${item.shiftDate})`
        : `✓ ${item.advisor}'s call approved → ${targetShiftDate || item.shiftDate}`,
      'success'
    );
  };

  const handleIgnore   = (item) => { ignoreRecon(item.sig, item);   notify(`Ignored anomaly for ${item.advisor}`, 'info'); };
  const handleSuppress = (item) => { suppressRecon(item.sig, item); notify(`Suppressed row for ${item.advisor} — excluded from all calculations`, 'info'); };

  const approveAll = () => {
    reconciliationQueue.forEach(item => handleApprove(item, item.shiftDate));
  };
  const suppressAll = () => {
    reconciliationQueue.forEach(item => suppressRecon(item.sig, item));
    notify(`Suppressed all ${reconciliationQueue.length} anomalies`, 'info');
  };

  const filteredResolved = useMemo(() => {
    let list = [...reconciliationApproved].reverse();
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search) list = list.filter(r => r.advisor?.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [reconciliationApproved, filter, search]);

  const stats = {
    pending:    reconciliationQueue.length,
    approved:   reconciliationApproved.filter(r => r.status === 'approved').length,
    suppressed: reconciliationApproved.filter(r => r.status === 'suppressed').length,
    ignored:    reconciliationApproved.filter(r => r.status === 'ignored').length,
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Pending Review', value:stats.pending,    accent:'#f97316', bg:'#fff7ed' },
          { label:'Approved',       value:stats.approved,   accent:'#16a34a', bg:'#f0fdf4' },
          { label:'Suppressed',     value:stats.suppressed, accent:'#64748b', bg:'#f8fafc' },
          { label:'Ignored',        value:stats.ignored,    accent:'#eab308', bg:'#fefce8' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ background:s.bg }}>
            <div className="stat-accent" style={{ background:s.accent }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:28, color:s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-strip">
        <div className={`tab-pill ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
          🔄 Pending Queue {stats.pending > 0 && <span style={{ background:'#f97316', color:'white', borderRadius:10, padding:'1px 6px', fontSize:10, marginLeft:6 }}>{stats.pending}</span>}
        </div>
        <div className={`tab-pill ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📋 Audit History ({stats.approved + stats.suppressed + stats.ignored})
        </div>
      </div>

      {/* QUEUE TAB */}
      {activeTab === 'queue' && (
        <div>
          {reconciliationQueue.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, padding:'10px 14px',
              background:'#fff7ed', borderRadius:8, border:'1px solid #fdba74' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'#9a3412', flex:1 }}>
                ⚠ {reconciliationQueue.length} row(s) require your review before operational data is considered stable
              </span>
              <button className="btn btn-primary btn-sm" onClick={approveAll} style={{ background:'#166534', fontSize:11 }}>
                ✓ Approve All ({stats.pending}) to calculated shifts
              </button>
              <button className="btn btn-danger btn-sm" onClick={suppressAll} style={{ fontSize:11 }}>
                ✕ Suppress All
              </button>
            </div>
          )}

          {reconciliationQueue.length === 0 ? (
            <div className="empty-state card">
              <div style={{ fontSize:48 }}>✅</div>
              <h3>Queue is clear</h3>
              <p>No anomalies pending review. All operational data is stable.</p>
            </div>
          ) : (
            reconciliationQueue.map(item => (
              <AnomalyCard
                key={item.sig}
                item={item}
                effortRows={effortRows}
                onApprove={handleApprove}
                onIgnore={handleIgnore}
                onSuppress={handleSuppress}
              />
            ))
          )}
        </div>
      )}

      {/* AUDIT HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="card" style={{ padding:0 }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <input className="search-input" placeholder="Search advisor..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ width:180 }} />
            {['all','approved','suppressed','ignored'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter(f)} style={{ fontSize:11, textTransform:'capitalize' }}>
                {f}
              </button>
            ))}
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--txt3)' }}>
              {filteredResolved.length} records
            </span>
            <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>exportCSV(filteredResolved)}>📤 Export Audit CSV</button>
          </div>

          {filteredResolved.length === 0 ? (
            <div className="empty-state" style={{ padding:40 }}>
              <div>📋</div><h3>No audit records</h3>
            </div>
          ) : (
            <div className="table-wrap" style={{ border:'none', borderRadius:0 }}>
              <table className="data-table">
                <thead><tr>
                  <th style={{ textAlign:'left' }}>Advisor</th>
                  <th>Date</th><th>Hour</th><th>Duration</th><th>Connected</th>
                  <th>Original Shift</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Overridden</th>
                  <th>By</th>
                  <th>Resolved At</th>
                </tr></thead>
                <tbody>
                  {filteredResolved.map((r, i) => {
                    const wasOverridden = r.targetShiftDate && r.targetShiftDate !== r.originalShiftDate && r.originalShiftDate;
                    const sc = STATUS_COLORS[r.status] || STATUS_COLORS.ignored;
                    return (
                      <tr key={i}>
                        <td style={{ textAlign:'left', fontWeight:700 }}>{r.advisor}</td>
                        <td style={{ fontSize:11 }}>{r.date}</td>
                        <td>{r.hour}:00</td>
                        <td>{r.duration?.toFixed(2)}m</td>
                        <td>{r.connected ? '✓' : '—'}</td>
                        <td style={{ fontSize:11, color:'var(--txt3)' }}>{r.originalShiftDate || r.shiftDate}</td>
                        <td style={{ fontWeight:700, color: wasOverridden ? '#1e40af' : 'var(--txt)' }}>
                          {r.targetShiftDate || r.shiftDate}
                        </td>
                        <td>
                          <span className="badge" style={{ background:sc.bg, color:sc.color }}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          {wasOverridden
                            ? <span className="badge badge-blue" style={{ fontSize:9 }}>⚡ Override</span>
                            : <span style={{ fontSize:11, color:'var(--txt3)' }}>—</span>}
                        </td>
                        <td style={{ fontSize:11 }}>{r.modifiedBy || '—'}</td>
                        <td style={{ fontSize:11, color:'var(--txt3)' }}>
                          {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
