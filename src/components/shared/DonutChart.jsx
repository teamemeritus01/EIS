export default function DonutChart({ data, total, label, size = 180 }) {
  const radius = size * 0.38, cx = size/2, cy = size/2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data.map(d => {
    const pct = total > 0 ? d.value / total : 0;
    const seg = { ...d, pct, dasharray: circumference, dashoffset: circumference * (1 - pct), rotation: offset * 360 };
    offset += pct;
    return seg;
  });

  return (
    <div style={{ display:'flex', justifyContent:'center' }}>
      <svg width={size} height={size} style={{ overflow:'visible' }}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={size*0.13} />
        {segments.map((seg, i) => (
          <circle key={i} cx={cx} cy={cy} r={radius} fill="none"
            stroke={seg.color} strokeWidth={size*0.13}
            strokeDasharray={`${circumference * seg.pct} ${circumference * (1 - seg.pct)}`}
            strokeDashoffset={circumference * 0.25}
            transform={`rotate(${seg.rotation * 360 / total * (total/total)} ${cx} ${cy})`}
            style={{ transformOrigin:`${cx}px ${cy}px`, transform:`rotate(${(offset - seg.pct) * 360 - 90}deg)` }}
          />
        ))}
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={size*0.18} fontWeight="800" fill="#0f172a">{total}</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize={size*0.07} fill="#94a3b8">{label}</text>
      </svg>
    </div>
  );
}
