import { useMemo } from 'react';
import PageExportButton from '../shared/PageExportButton.jsx';
import { useApp } from '../../store/appStore.jsx';
import { formatINR, getMinProductiveDays, WORKING_DAYS } from '../../constants/businessRules.js';

function CompareBar({ label, rowVal, usVal, rowColor='#166534', usColor='#1e40af', format=v=>v }) {
  const max = Math.max(rowVal, usVal, 1);
  const allData = bscData?.advisors || [];
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {[['ROW', rowVal, rowColor], ['US', usVal, usColor]].map(([label, val, color]) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, fontSize:11, fontWeight:700, color, textAlign:'right' }}>{label}</div>
            <div style={{ flex:1, height:18, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
              <div style={{ width:`${(val/max)*100}%`, height:'100%', background:color, borderRadius:4, transition:'width .4s', display:'flex', alignItems:'center', paddingLeft:6 }}>
                {(val/max) > 0.3 && <span style={{ fontSize:10, fontWeight:700, color:'white' }}>{format(val)}</span>}
              </div>
            </div>
            {(val/max) <= 0.3 && <span style={{ fontSize:11, fontWeight:700, color, minWidth:50 }}>{format(val)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShiftSplitAnalytics() {
  const { state } = useApp();
  const { bscData, effortData, absenceOverrides } = state;
  if (!bscData) return <div className="empty-state"><div className="empty-icon">📊</div><h3>No Data Loaded</h3><p>Upload BSC data to view shift split analytics.</p></div>;

  const allAdvisors = bscData.advisors || [];
  const absentNames = new Set(Object.keys(absenceOverrides).filter(n => absenceOverrides[n]?.length > 0));
  const activeAdvisors = allAdvisors.filter(a => !absentNames.has(a.name));
  const row = activeAdvisors.filter(a => a.region === 'ROW');
  const us  = activeAdvisors.filter(a => a.region === 'US');

  const avg = (arr, key) => arr.length ? arr.reduce((s,a)=>s+(a[key]||0),0)/arr.length : 0;
  const pct = (arr, key) => arr.length ? arr.reduce((s,a)=>s+(a[key]||0),0)/arr.length*100 : 0;

  const rowStats = {
    count:          row.length,
    avgBSC:         avg(row, 'bscScore'),
    avgProdDays:    avg(row, 'productiveDays'),
    qualified:      row.filter(a=>a.qualification?.qualified).length,
    atRisk:         row.filter(a=>a.qualification?.pdStatus==='At Risk').length,
    totalPayout:    row.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0),
    avgConnects:    avg(row, 'connectedCalls'),
    avgAHT:         avg(row, 'ahtFirstCall'),
    avgPTT:         avg(row, 'pureTaskTime'),
    avgTTFA:        avg(row, 'adjustedTTFA'),
    green:          row.filter(a=>a.bscScore>=71).length,
    yellow:         row.filter(a=>a.bscScore>=60&&a.bscScore<71).length,
    red:            row.filter(a=>a.bscScore<60).length,
    workingDays:    WORKING_DAYS.ROW.total,
    minProdDays:    getMinProductiveDays('ROW'),
  };
  const usStats = {
    count:          us.length,
    avgBSC:         avg(us, 'bscScore'),
    avgProdDays:    avg(us, 'productiveDays'),
    qualified:      us.filter(a=>a.qualification?.qualified).length,
    atRisk:         us.filter(a=>a.qualification?.pdStatus==='At Risk').length,
    totalPayout:    us.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0),
    avgConnects:    avg(us, 'connectedCalls'),
    avgAHT:         avg(us, 'ahtFirstCall'),
    avgPTT:         avg(us, 'pureTaskTime'),
    avgTTFA:        avg(us, 'adjustedTTFA'),
    green:          us.filter(a=>a.bscScore>=71).length,
    yellow:         us.filter(a=>a.bscScore>=60&&a.bscScore<71).length,
    red:            us.filter(a=>a.bscScore<60).length,
    workingDays:    WORKING_DAYS.US.total,
    minProdDays:    getMinProductiveDays('US'),
  };

  // TL-wise split
  const tlSplit = useMemo(() => {
    const m = {};
    activeAdvisors.forEach(a => {
      const tl = a.tl || 'Unknown';
      if (!m[tl]) m[tl] = { tl, row:[], us:[] };
      if (a.region === 'ROW') m[tl].row.push(a);
      else m[tl].us.push(a);
    });
    return Object.values(m).sort((a,b) => (b.row.length+b.us.length)-(a.row.length+a.us.length));
  }, [activeAdvisors]);

  const StatCol = ({ stats, region, color }) => (
    <div style={{ flex:1, padding:'0 16px' }}>
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <div style={{ fontSize:28, fontWeight:900, color }}>{stats.count}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>advisors</div>
        <div style={{ fontSize:12, fontWeight:700, color, marginTop:4 }}>{region} Shift</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{stats.workingDays} working days · {stats.minProdDays} PD needed</div>
      </div>
      {[
        ['Avg BSC Score', stats.avgBSC.toFixed(1), <span className={`bsc-badge ${stats.avgBSC>=71?'bsc-green':stats.avgBSC>=60?'bsc-yellow':'bsc-red'}`}>{stats.avgBSC.toFixed(1)}</span>],
        ['Qualified', stats.qualified, <span className="badge badge-green">{stats.qualified} ({(stats.qualified/Math.max(stats.count,1)*100).toFixed(0)}%)</span>],
        ['At Risk', stats.atRisk, <span className="badge badge-yellow">{stats.atRisk}</span>],
        ['Avg Productive Days', stats.avgProdDays.toFixed(1), <span style={{fontWeight:700}}>{stats.avgProdDays.toFixed(1)}/{stats.minProdDays}</span>],
        ['Avg Connects/Day', stats.avgConnects.toFixed(1), null],
        ['Avg AHT (sec)', stats.avgAHT.toFixed(0), null],
        ['Avg PTT (min)', stats.avgPTT.toFixed(1), null],
        ['Avg Adj TTFA', (stats.avgTTFA*100).toFixed(1)+'%', null],
        ['Total Payout', formatINR(stats.totalPayout), <span style={{fontWeight:800,color:'#166534'}}>{formatINR(stats.totalPayout)}</span>],
      ].map(([label, val, badge]) => (
        <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
          <span style={{ color:'var(--text-secondary)' }}>{label}</span>
          {badge || <span style={{ fontWeight:700 }}>{val}</span>}
        </div>
      ))}
      {/* BSC distribution */}
      <div style={{ marginTop:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8 }}>BSC DISTRIBUTION</div>
        {[['Green (71+)', stats.green, '#16a34a'], ['Yellow (60-70)', stats.yellow, '#ca8a04'], ['Red (<60)', stats.red, '#dc2626']].map(([l,v,c]) => (
          <div key={l} style={{ marginBottom:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
              <span style={{ color:c, fontWeight:600 }}>{l}</span>
              <span>{v} ({(v/Math.max(stats.count,1)*100).toFixed(0)}%)</span>
            </div>
            <div className="progress-bar"><div className="fill" style={{ width:`${v/Math.max(stats.count,1)*100}%`, background:c }} /></div>
          </div>
        ))}
      </div>
    </div>
  );

  const allData = bscData?.advisors || [];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Head-to-head comparison */}
      <div className="card">
        <div className="card-title">ROW vs US Shift — Head-to-Head Comparison</div>
        <div style={{ display:'flex' }}>
          <StatCol stats={rowStats} region="ROW" color="#166534" />
          <div style={{ width:2, background:'var(--border)', margin:'0 8px' }} />
          <StatCol stats={usStats}  region="US"  color="#1e40af" />
        </div>
      </div>

      {/* Visual comparisons */}
      <div className="card">
        <div className="card-title">Metric Comparison — ROW vs US</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <CompareBar label="Average BSC Score" rowVal={rowStats.avgBSC} usVal={usStats.avgBSC} format={v=>v.toFixed(1)} />
          <CompareBar label="Average Connected Calls" rowVal={rowStats.avgConnects} usVal={usStats.avgConnects} format={v=>v.toFixed(1)} />
          <CompareBar label="Average AHT (seconds)" rowVal={rowStats.avgAHT} usVal={usStats.avgAHT} format={v=>v.toFixed(0)+'s'} />
          <CompareBar label="Average PTT (minutes)" rowVal={rowStats.avgPTT} usVal={usStats.avgPTT} format={v=>v.toFixed(0)+'m'} />
          <CompareBar label="Qualification Rate (%)" rowVal={rowStats.qualified/Math.max(rowStats.count,1)*100} usVal={usStats.qualified/Math.max(usStats.count,1)*100} format={v=>v.toFixed(0)+'%'} />
          <CompareBar label="Total Payout Pool (₹000s)" rowVal={rowStats.totalPayout/1000} usVal={usStats.totalPayout/1000} format={v=>'₹'+(v).toFixed(0)+'K'} />
        </div>
      </div>

      {/* TL-wise split */}
      <div className="card">
        <div className="card-title">TL-wise Shift Distribution</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th style={{ textAlign:'left' }}>Team Lead</th>
              <th>Total PAs</th>
              <th>ROW PAs</th><th>ROW Avg BSC</th>
              <th>US PAs</th><th>US Avg BSC</th>
              <th>Team Avg BSC</th>
            </tr></thead>
            <tbody>
              {tlSplit.map(({ tl, row, us }) => {
                const total = row.length + us.length;
                const rowBSC = row.length ? row.reduce((s,a)=>s+(a.bscScore||0),0)/row.length : 0;
                const usBSC  = us.length  ? us.reduce((s,a)=>s+(a.bscScore||0),0)/us.length   : 0;
                const allBSC = total ? [...row,...us].reduce((s,a)=>s+(a.bscScore||0),0)/total : 0;
                return (
                  <tr key={tl}>
                    <td style={{ textAlign:'left', fontWeight:700 }}>{tl}</td>
                    <td>{total}</td>
                    <td><span className="badge badge-green">{row.length}</span></td>
                    <td>{row.length?<span className={`bsc-badge ${rowBSC>=71?'bsc-green':rowBSC>=60?'bsc-yellow':'bsc-red'}`}>{rowBSC.toFixed(1)}</span>:'—'}</td>
                    <td><span className="badge badge-blue">{us.length}</span></td>
                    <td>{us.length?<span className={`bsc-badge ${usBSC>=71?'bsc-green':usBSC>=60?'bsc-yellow':'bsc-red'}`}>{usBSC.toFixed(1)}</span>:'—'}</td>
                    <td><span className={`bsc-badge ${allBSC>=71?'bsc-green':allBSC>=60?'bsc-yellow':'bsc-red'}`}>{allBSC.toFixed(1)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
