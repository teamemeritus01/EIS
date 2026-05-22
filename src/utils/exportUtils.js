// ============================================================
// EXPORT ENGINE — Matches exact formats from provided samples
// ============================================================
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toDDMonYYYY, toDDMMYYYY } from './dateUtils.js';

// ── Number formatters (exact spec) ───────────────────────────────
const rInt   = v => v == null ? '—' : Math.round(+v);          // Integer: 15
const rPct   = v => v == null ? '—' : Math.round(v > 1 ? v : v * 100) + '%'; // %: 72%
const rBSC   = v => v == null ? '—' : (+v).toFixed(2);          // BSC: 90.04
const rTTFA  = v => v == null ? '—' : Math.round(v > 1 ? v : v * 100) + '%'; // 93%
const rINR   = v => { if (!v && v!==0) return '₹ 0'; const n=Math.abs(+v); if(n===0)return'₹ 0'; const s=n.toLocaleString('en-IN'); return `₹ ${s}`; };
const rConn  = v => v == null ? '—' : (v > 1 ? v.toFixed(2) : (v*100).toFixed(2)) + '%'; // 19.54%
const r2dp   = v => v == null ? '—' : (+v).toFixed(2);

// ── ExcelJS cell styler ──────────────────────────────────────────
function sc(cell, { bg, font='000000', bold=false, italic=false, size=10, align='center', border=true } = {}) {
  if (bg) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+bg } };
  cell.font      = { bold, italic, size, color:{ argb:'FF'+font }, name:'Calibri' };
  cell.alignment = { horizontal:align, vertical:'middle' };
  if (border) cell.border = {
    top:   { style:'thin', color:{ argb:'FF000000' } },
    left:  { style:'thin', color:{ argb:'FF000000' } },
    bottom:{ style:'thin', color:{ argb:'FF000000' } },
    right: { style:'thin', color:{ argb:'FF000000' } },
  };
}

// Row color by BSC
function rowBg(bsc) {
  if (bsc >= 71) return { bg:'C6EFCE', font:'276221' };  // green
  if (bsc >= 60) return { bg:'FFFF00', font:'3D3D00' };  // yellow
  return            { bg:'FF0000', font:'FFFFFF' };       // red
}

// ════════════════════════════════════════════════════════════════
// BSC INCENTIVE EXCEL — Exact format from image
// ════════════════════════════════════════════════════════════════
export async function exportBSCExcel(advisors, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Emeritus OI Platform';
  const ws = wb.addWorksheet('Incentive Report', {
    pageSetup:{ fitToPage:true, fitToWidth:1, orientation:'landscape' }
  });

  // Column widths (A-N = 14 cols)
  ws.columns = [
    { width:26 },{ width:15 },{ width:10 },{ width:8 },
    { width:10 },{ width:8 },{ width:10 },{ width:8 },
    { width:10 },{ width:8 },{ width:16 },{ width:8 },
    { width:8 },{ width:14 },
  ];

  // ── ROW 1: Metric group headers (merged) ─────────────────────
  ws.mergeCells('A1:B1'); ws.mergeCells('C1:D1'); ws.mergeCells('E1:F1');
  ws.mergeCells('G1:H1'); ws.mergeCells('I1:J1'); ws.mergeCells('K1:N1');
  ws.getRow(1).height = 22;
  [['A1',''], ['C1','Connected Calls'], ['E1','First connected call AHT'],
   ['G1','Adjusted TTFA'], ['I1','Pure Talk Time'], ['K1','']].forEach(([addr, label]) => {
    const cell = ws.getCell(addr);
    cell.value = label;
    sc(cell, { bg: label ? '1F3864' : '000000', font:'FFFFFF', bold:true, italic:true, size:11, align:'center' });
  });

  // ── ROW 2: Targets ──────────────────────────────────────────
  ws.getRow(2).height = 18;
  const tgtRow = ['','','Target','21','Target','780','Target','95%','Target','145','','','',''];
  tgtRow.forEach((v,i) => {
    const cell = ws.getCell(2, i+1);
    cell.value = v;
    sc(cell, { bg:'D9D9D9', bold:true, italic:true, size:10, align: i===2||i===4||i===6||i===8?'left':'center' });
  });

  // ── ROW 3: Column headers ───────────────────────────────────
  ws.getRow(3).height = 20;
  ['PA','# Productive Days','Actuals','% Ach','Actuals','% Ach',
   'Actuals','% Ach','Actuals','% Ach','Balance Scorecard','Calls','RANK','AMOUNT'].forEach((h,i) => {
    const cell = ws.getCell(3, i+1);
    cell.value = h;
    sc(cell, { bg:'808080', font:'FFFFFF', bold:true, italic:true, size:10, align:i===0?'left':'center' });
  });

  // ── Data rows ────────────────────────────────────────────────
  const list = advisors.filter(a => opts.includeAbsent || !opts.absentNames?.has(a.name));
  list.forEach((a, idx) => {
    const bscVal = a.bscScore || 0;
    const color  = rowBg(bscVal);
    const row    = ws.getRow(4 + idx);
    row.height   = 18;

    // TTFA: stored as fraction (0.93) → display as "93%"
    const ttfaActual = a.adjustedTTFA != null ? (a.adjustedTTFA > 1 ? a.adjustedTTFA : a.adjustedTTFA * 100) : null;
    // % Ach values stored as 0-100 range after parser fix
    const ccPctVal   = a.ccPct   != null ? (a.ccPct   > 1 ? a.ccPct   : a.ccPct   * 100) : null;
    const ahtPctVal  = a.ahtPct  != null ? (a.ahtPct  > 1 ? a.ahtPct  : a.ahtPct  * 100) : null;
    const ttfaPctVal = a.ttfaPct != null ? (a.ttfaPct > 1 ? a.ttfaPct : a.ttfaPct * 100) : null;
    const pttPctVal  = a.pttPct  != null ? (a.pttPct  > 1 ? a.pttPct  : a.pttPct  * 100) : null;

    // Fallback: calculate % Ach from actuals if not stored
    const ccPct_disp   = ccPctVal   != null ? ccPctVal   : (a.connectedCalls && a.connectedCalls/21*100);
    const ahtPct_disp  = ahtPctVal  != null ? ahtPctVal  : (a.ahtFirstCall && a.ahtFirstCall/780*100);
    const ttfaPct_disp = ttfaPctVal != null ? ttfaPctVal : (ttfaActual && ttfaActual/95*100);
    const pttPct_disp  = pttPctVal  != null ? pttPctVal  : (a.pureTaskTime && a.pureTaskTime/145*100);

    const vals = [
      a.name || '—',
      a.productiveDays != null ? (a.productiveDays % 1 === 0 ? a.productiveDays : a.productiveDays) : '—', // keep .5 for fractional days
      a.connectedCalls != null ? rInt(a.connectedCalls) : '—',
      ccPct_disp   != null ? Math.round(ccPct_disp)+'%'   : '—',
      a.ahtFirstCall != null ? rInt(a.ahtFirstCall) : '—',
      ahtPct_disp  != null ? Math.round(ahtPct_disp)+'%'  : '—',
      ttfaActual   != null ? Math.round(ttfaActual)+'%'   : '—',
      ttfaPct_disp != null ? Math.round(ttfaPct_disp)+'%' : '—',
      a.pureTaskTime != null ? rInt(a.pureTaskTime) : '—',
      pttPct_disp  != null ? Math.round(pttPct_disp)+'%'  : '—',
      bscVal ? bscVal.toFixed(2) : '—',
      a.totalCalls != null ? rInt(a.totalCalls) : '—',
      a.rank || '—',
      rINR(a.payout || 0),
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(4+idx, i+1);
      cell.value = v;
      sc(cell, { bg:color.bg, font:color.font, bold:true, italic:true, size:10, align:i===0?'left':'center' });
    });
  });

  // ── Totals row ───────────────────────────────────────────────
  const qr = list.filter(a=>a.qualification?.qualified);
  ws.getRow(4+list.length).height = 20;
  const avgBSC = list.length ? list.reduce((s,a)=>s+(a.bscScore||0),0)/list.length : 0;
  ['TOTAL / AVERAGE','','','','','','','','','',avgBSC.toFixed(2),'','',rINR(qr.reduce((s,a)=>s+(a.payout||0),0))].forEach((v,i)=>{
    const cell = ws.getCell(4+list.length, i+1);
    cell.value = v;
    sc(cell, { bg:'1F3864', font:'FFFFFF', bold:true, size:10, align:i===0?'left':'center' });
  });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
    `Emeritus_BSC_${dateStamp()}.xlsx`);
}

// ════════════════════════════════════════════════════════════════
// EFFORT EXCEL — Exactly matches the provided sample file format
// ════════════════════════════════════════════════════════════════
export async function exportEffortExcel(advisorRows, shiftDate, opts = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Team Effort Summary');

  ws.columns = [
    { width:30 },{ width:13 },{ width:16 },{ width:16 },{ width:13 },{ width:17 }
  ];

  const NAVY = '1F3864'; const WHITE = 'FFFFFF';
  const dateLabel = shiftDate ? toDDMonYYYY(shiftDate) : 'QTD';

  // Title rows (no border, no fill — just text like sample)
  ws.mergeCells('A1:F1');
  const t1 = ws.getCell('A1');
  t1.value = '📋 Team Effort Summary';
  t1.font  = { bold:true, size:13, name:'Calibri', color:{ argb:'FF'+NAVY } };
  t1.alignment = { horizontal:'left', vertical:'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells('A2:F2');
  const t2 = ws.getCell('A2');
  t2.value = `📅 Shift Date: ${dateLabel}`;
  t2.font  = { bold:true, size:11, name:'Calibri', color:{ argb:'FF'+NAVY } };
  t2.alignment = { horizontal:'left', vertical:'middle' };
  ws.getRow(2).height = 18;

  // Header row — navy background like sample
  const headers = ['Advisor','Total Calls','Connected Calls','Talk Time (min)','Conn Rate %','Avg Talk/Connect'];
  ws.getRow(3).height = 20;
  headers.forEach((h,i) => {
    const cell = ws.getCell(3, i+1);
    cell.value = h;
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+NAVY } };
    cell.font  = { bold:true, size:11, color:{ argb:'FF'+WHITE }, name:'Calibri' };
    cell.alignment = { horizontal:i===0?'left':'center', vertical:'middle' };
    cell.border = {
      top:{ style:'thin', color:{argb:'FFCCCCCC'} }, bottom:{ style:'thin', color:{argb:'FFCCCCCC'} },
      left:{ style:'thin', color:{argb:'FFCCCCCC'} }, right:{ style:'thin', color:{argb:'FFCCCCCC'} },
    };
  });

  // Sort by Talk Time desc (matches sample)
  const sorted = [...advisorRows].sort((a,b) => b.totalTT - a.totalTT);

  sorted.forEach((r, idx) => {
    const row = ws.getRow(4+idx);
    row.height = 17;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'F5F8FF' : 'FFFFFF';
    const vals = [
      r.name,
      rInt(r.totalDials),
      rInt(r.totalConn),
      r2dp(r.totalTT),
      rConn(r.connRate),
      r2dp(r.avgTalkPerConnect),
    ];
    vals.forEach((v,i) => {
      const cell = ws.getCell(4+idx, i+1);
      cell.value = v;
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+bgColor } };
      cell.font  = { size:10, name:'Calibri' };
      cell.alignment = { horizontal:i===0?'left':'center', vertical:'middle' };
      cell.border = {
        top:{ style:'thin', color:{argb:'FFD9D9D9'} }, bottom:{ style:'thin', color:{argb:'FFD9D9D9'} },
        left:{ style:'thin', color:{argb:'FFD9D9D9'} }, right:{ style:'thin', color:{argb:'FFD9D9D9'} },
      };
    });
  });

  // Grand Total — navy like sample
  const tot = sorted.reduce((s,r)=>({
    dials:s.dials+r.totalDials, conn:s.conn+r.totalConn,
    tt:s.tt+r.totalTT,
  }), {dials:0,conn:0,tt:0});
  const totRow = ws.getRow(4+sorted.length);
  totRow.height = 20;
  const totConn = tot.dials > 0 ? tot.conn/tot.dials : 0;
  const totAvg  = tot.conn  > 0 ? tot.tt/tot.conn    : 0;
  ['Grand Total', rInt(tot.dials), rInt(tot.conn), r2dp(tot.tt), rConn(totConn), r2dp(totAvg)].forEach((v,i)=>{
    const cell = ws.getCell(4+sorted.length, i+1);
    cell.value = v;
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+NAVY } };
    cell.font  = { bold:true, size:11, color:{ argb:'FF'+WHITE }, name:'Calibri' };
    cell.alignment = { horizontal:i===0?'left':'center', vertical:'middle' };
  });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
    `Emeritus_Effort_${dateLabel.replace(/-/g,'')}_${dateStamp()}.xlsx`);
}

// ════════════════════════════════════════════════════════════════
// COPY TO TEAMS — Professional HTML table (renders in Teams)
// ════════════════════════════════════════════════════════════════
export function copyToTeams(advisors, type = 'bsc') {
  const GREEN='#c6efce'; const YELLOW='#ffff00'; const RED='#ffcccc';
  const NAVY ='#1f3864'; const WHITE ='#ffffff'; const GRAY='#f5f5f5';

  let html = '';
  if (type === 'bsc') {
    const rows = advisors.map(a => {
      const bsc   = a.bscScore || 0;
      const bg    = bsc>=71?GREEN:bsc>=60?YELLOW:RED;
      const color = bsc<60?WHITE:'#000';
      const ttfa  = a.adjustedTTFA != null ? Math.round(a.adjustedTTFA>1?a.adjustedTTFA:a.adjustedTTFA*100)+'%' : '—';
      return `<tr style="background:${bg};color:${color}">
        <td style="padding:5px 10px;border:1px solid #999;font-style:italic;font-weight:bold;text-align:left">${a.name||'—'}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${a.productiveDays||'—'}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${rInt(a.connectedCalls)}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${rInt(a.ahtFirstCall)}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${ttfa}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${rInt(a.pureTaskTime)}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${rBSC(bsc)}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${a.rank||'—'}</td>
        <td style="padding:5px 8px;border:1px solid #999;text-align:center;font-style:italic;font-weight:bold">${rINR(a.payout||0)}</td>
      </tr>`;
    }).join('');
    const totalPay = advisors.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);
    html = `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px;width:100%">
      <thead>
        <tr style="background:${NAVY};color:${WHITE}">
          <th style="padding:8px 10px;border:1px solid #555;text-align:left">PA Name</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center"># Prod Days</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">Connects</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">AHT (s)</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">TTFA</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">PTT (min)</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">BSC Score</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">Rank</th>
          <th style="padding:8px 8px;border:1px solid #555;text-align:center">Payout</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:${NAVY};color:${WHITE};font-weight:bold">
          <td style="padding:7px 10px;border:1px solid #555;text-align:left">Total (${advisors.length} advisors)</td>
          <td style="padding:7px 8px;border:1px solid #555;text-align:center" colspan="7"></td>
          <td style="padding:7px 8px;border:1px solid #555;text-align:center">${rINR(totalPay)}</td>
        </tr>
      </tfoot>
    </table>`;
  } else {
    // Effort table
    html = `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px">
      <thead>
        <tr style="background:${NAVY};color:${WHITE}">
          <th style="padding:8px 12px;border:1px solid #555;text-align:left">Advisor</th>
          <th style="padding:8px 10px;border:1px solid #555;text-align:center">Total Calls</th>
          <th style="padding:8px 10px;border:1px solid #555;text-align:center">Connected</th>
          <th style="padding:8px 10px;border:1px solid #555;text-align:center">Talk Time (min)</th>
          <th style="padding:8px 10px;border:1px solid #555;text-align:center">Conn Rate %</th>
          <th style="padding:8px 10px;border:1px solid #555;text-align:center">Avg Talk/Connect</th>
        </tr>
      </thead>
      <tbody>
        ${[...advisors].sort((a,b)=>b.totalTT-a.totalTT).map((r,i)=>`
        <tr style="background:${i%2===0?GRAY:WHITE}">
          <td style="padding:5px 12px;border:1px solid #ddd">${r.name}</td>
          <td style="padding:5px 10px;border:1px solid #ddd;text-align:center">${rInt(r.totalDials)}</td>
          <td style="padding:5px 10px;border:1px solid #ddd;text-align:center">${rInt(r.totalConn)}</td>
          <td style="padding:5px 10px;border:1px solid #ddd;text-align:center">${r2dp(r.totalTT)}</td>
          <td style="padding:5px 10px;border:1px solid #ddd;text-align:center">${rConn(r.connRate)}</td>
          <td style="padding:5px 10px;border:1px solid #ddd;text-align:center">${r2dp(r.avgTalkPerConnect)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // Plain text fallback (TSV)
  const tsv = advisors.map(a => [a.name||'',rInt(a.connectedCalls||a.totalDials||0)].join('\t')).join('\n');
  try {
    const item = new ClipboardItem({
      'text/html':  new Blob([html],  { type:'text/html' }),
      'text/plain': new Blob([tsv],   { type:'text/plain' }),
    });
    navigator.clipboard.write([item]);
  } catch {
    navigator.clipboard.writeText(tsv);
  }
}

// ════════════════════════════════════════════════════════════════
// CSV EXPORT
// ════════════════════════════════════════════════════════════════
export function exportCSV(advisors) {
  const H = ['Rank','PA Name','EMP ID','TL','APM','Region','Prod Days','BSC','Connects','AHT(s)','TTFA','PTT(min)','Slab','Payout INR','Status'];
  const rows = advisors.map(a => {
    const ttfa = a.adjustedTTFA != null ? Math.round(a.adjustedTTFA>1?a.adjustedTTFA:a.adjustedTTFA*100)+'%' : '';
    return [a.rank,a.name,a.empId||'',a.tl||'',a.apm||'',a.region,
      a.productiveDays, rBSC(a.bscScore), rInt(a.connectedCalls), rInt(a.ahtFirstCall),
      ttfa, rInt(a.pureTaskTime), a.slab||'', a.payout||0, a.qualification?.pdStatus||''];
  });
  const csv = [H,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  download(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}), `Emeritus_BSC_${dateStamp()}.csv`);
}

// ════════════════════════════════════════════════════════════════
// PDF EXPORT
// ════════════════════════════════════════════════════════════════
export function exportPDF(advisors, shiftDate) {
  const doc = new jsPDF({ orientation:'landscape', format:'a4' });
  doc.setFillColor(31,56,100); doc.rect(0,0,297,18,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('EMERITUS', 14, 12);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Operational Intelligence — Incentive Report', 50, 12);
  doc.text(new Date().toLocaleDateString('en-GB'), 260, 12);

  autoTable(doc, {
    startY:22,
    head:[['Rank','PA Name','Region','Prod Days','BSC','Connects','AHT(s)','TTFA','PTT','Slab','Payout ₹','Status']],
    body: advisors.map(a => {
      const ttfa = a.adjustedTTFA != null ? Math.round(a.adjustedTTFA>1?a.adjustedTTFA:a.adjustedTTFA*100)+'%' : '—';
      return [a.rank, a.name, a.region, a.productiveDays, rBSC(a.bscScore),
        rInt(a.connectedCalls), rInt(a.ahtFirstCall), ttfa, rInt(a.pureTaskTime),
        a.slab||'—', a.payout>0?rINR(a.payout):'—', a.qualification?.pdStatus||'—'];
    }),
    styles:{ fontSize:7, cellPadding:2, halign:'center' },
    headStyles:{ fillColor:[31,56,100], textColor:255, fontStyle:'bold', fontSize:8 },
    columnStyles:{ 1:{ halign:'left' } },
    didParseCell: (d) => {
      if (d.section==='body') {
        const a = advisors[d.row.index];
        const bsc = a?.bscScore||0;
        if (bsc>=71)      d.cell.styles.fillColor=[198,239,206];
        else if (bsc>=60) d.cell.styles.fillColor=[255,255,0];
        else              d.cell.styles.fillColor=[255,0,0];
      }
    },
  });
  doc.save(`Emeritus_Report_${dateStamp()}.pdf`);
}

// ── Helpers ──────────────────────────────────────────────────────
function dateStamp() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export const DEFAULT_ADVISOR_COLUMNS = [];
