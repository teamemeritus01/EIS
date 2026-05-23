export default function BSCTrendChart({ trendData, advisors }) {
  if (!trendData || trendData.length === 0) {
    if (!advisors || advisors.length === 0) return <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>No L7D trend data available</div>;
    return <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>Upload BSC file with L7D Trend PA sheet for trend data</div>;
  }

  // Compute avg BSC per day across all advisors in trendData
  const days = trendData[0]?.dates || [];
  const dayAvgs = days.map((day, di) => {
    const vals = trendData.map(a => a.bscTrend[di]?.bsc || 0).filter(v => v > 0);
    return { day, avg: vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0 };
  });

  const W = 500, H = 160, PAD = { t:10, r:20, b:30, l:40 };
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const maxVal = Math.max(...dayAvgs.map(d => d.avg), 80);
  const minVal = Math.min(...dayAvgs.map(d => d.avg), 40);
  const range = maxVal - minVal || 1;

  const toX = (i) => PAD.l + (i / Math.max(dayAvgs.length-1, 1)) * innerW;
  const toY = (v) => PAD.t + (1 - (v - minVal) / range) * innerH;

  const pts = dayAvgs.map((d, i) => `${toX(i)},${toY(d.avg)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:180 }}>
      {/* Grid */}
      {[0,0.25,0.5,0.75,1].map((f,i) => {
        const y = PAD.t + f * innerH;
        const v = maxVal - f * range;
        return <g key={i}>
          <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#f1f5f9" strokeWidth={1} />
          <text x={PAD.l-4} y={y+4} textAnchor="end" fontSize={9} fill="#94a3b8">{v.toFixed(0)}</text>
        </g>;
      })}
      {/* BSC line */}
      <polyline fill="none" stroke="#166534" strokeWidth={2.5} strokeLinejoin="round" points={pts} />
      {dayAvgs.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(d.avg)} r={4} fill="#166534" stroke="white" strokeWidth={1.5} />
          <text x={toX(i)} y={H-8} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.day}</text>
        </g>
      ))}
      <text x={PAD.l} y={12} fontSize={10} fill="#166534" fontWeight="600">Avg BSC</text>
    </svg>
  );
}
