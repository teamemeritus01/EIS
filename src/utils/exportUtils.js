// ============================================================
// EXPORT ENGINE — ExcelJS-based professional exports
// BSC Export: matches Image 1 (colored rows, merged headers)
// Effort Export: matches Image 2 (Team Effort Summary format)
// ============================================================
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Color constants ───────────────────────────────────────
const COLORS = {
  green:     { bg:'C6EFCE', font:'276221' },   // BSC ≥ 71
  yellow:    { bg:'FFFF00', font:'3D3D00' },   // BSC 60-70
  red:       { bg:'FF0000', font:'FFFFFF' },   // BSC < 60
  navyBg:    '1F3864',
  navyFont:  'FFFFFF',
  headerBg1: 'D9D9D9',  // group header
  headerBg2: 'F2F2F2',  // target row
  border:    { style:'thin', color:{ argb:'FF000000' } },
};

function bscRowColor(bsc) {
  if (bsc >= 71) return COLORS.green;
  if (bsc >= 60) return COLORS.yellow;
  return COLORS.red;
}

function styleCell(cell, { bg, font, bold=false, italic=false, size=10, align='center', wrapText=false } = {}) {
  if (bg)   cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+bg } };
  cell.font   = { bold, italic, size, color:{ argb:'FF'+(font||'000000') }, name:'Calibri' };
  cell.alignment = { horizontal:align, vertical:'middle', wrapText };
  cell.border = {
    top:COLORS.border, left:COLORS.border, bottom:COLORS.border, right:COLORS.border
  };
}

function inrFormat(n) {
  if (!n && n!==0) return '₹ 0';
  const abs = Math.abs(n);
  if (abs >= 100000) return `₹ ${(abs/100000).toFixed(0)},${Math.round((abs%100000)/1000).toString().padStart(2,'0')},000`;
  return `₹ ${abs.toLocaleString('en-IN')}`;
}

function pctFmt(val) {
  if (val===null||val===undefined) return '—';
  const v = val > 1 ? val : val * 100;
  return Math.round(v) + '%';
}

function bscFmt(val) {
  if (val===null||val===undefined) return '—';
  return parseFloat(val).toFixed(2);
}

// ============================================================
// BSC EXCEL EXPORT — Matches Image 1
// ============================================================
export async function exportBSCExcel(advisors, opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Emeritus OI Platform';
  wb.created = new Date();

  const ws = wb.addWorksheet('Incentive Report', {
    pageSetup: { fitToPage:true, fitToWidth:1, orientation:'landscape' }
  });

  // Column widths
  ws.columns = [
    { width: 26 }, // PA
    { width: 16 }, // Prod Days
    { width: 10 }, // CC Actuals
    { width: 8  }, // CC %Ach
    { width: 10 }, // AHT Actuals
    { width: 8  }, // AHT %Ach
    { width: 10 }, // TTFA Actuals
    { width: 8  }, // TTFA %Ach
    { width: 10 }, // PTT Actuals
    { width: 8  }, // PTT %Ach
    { width: 16 }, // BSC
    { width: 8  }, // Calls
    { width: 8  }, // Rank
    { width: 14 }, // Amount
  ];

  // ── ROW 1: Group headers (merged) ──────────────────────
  ws.mergeCells('A1:B1');  // blank
  ws.mergeCells('C1:D1');  // Connected Calls
  ws.mergeCells('E1:F1');  // First Connected Call AHT
  ws.mergeCells('G1:H1');  // Adjusted TTFA
  ws.mergeCells('I1:J1');  // Pure Talk Time
  ws.mergeCells('K1:N1');  // blank right

  const r1 = ws.getRow(1);
  r1.height = 22;
  [['C1','Connected Calls'],['E1','First connected call AHT'],['G1','Adjusted TTFA'],['I1','Pure Talk Time']].forEach(([addr, label]) => {
    const cell = ws.getCell(addr);
    cell.value = label;
    styleCell(cell, { bg:'1F3864', font:'FFFFFF', bold:true, italic:true, size:11, align:'center' });
  });
  ['A1','B1','K1','L1','M1','N1'].forEach(addr => {
    styleCell(ws.getCell(addr), { bg:'1F3864', font:'FFFFFF' });
  });

  // ── ROW 2: Targets ─────────────────────────────────────
  const r2 = ws.getRow(2);
  r2.height = 18;
  const targets = [null, null, 'Target', 21, 'Target', 780, 'Target', '95%', 'Target', 145, null, null, null, null];
  targets.forEach((val, i) => {
    const cell = ws.getCell(2, i+1);
    cell.value = val ?? '';
    styleCell(cell, { bg:'D9D9D9', bold:true, italic:true, size:10, align: i%2===0||val==='Target'?'left':'center' });
  });

  // ── ROW 3: Column headers ───────────────────────────────
  const r3 = ws.getRow(3);
  r3.height = 20;
  const headers = ['PA','# Productive Days','Actuals','% Ach','Actuals','% Ach','Actuals','% Ach','Actuals','% Ach','Balance Scorecard','Calls','RANK','AMOUNT'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i+1);
    cell.value = h;
    styleCell(cell, { bg:'808080', font:'FFFFFF', bold:true, italic:true, size:10, align: i===0?'left':'center' });
  });

  // ── DATA ROWS ───────────────────────────────────────────
  const filtered = advisors.filter(a => opts.includeAbsent || !opts.absentNames?.has(a.name));
  
  filtered.forEach((a, idx) => {
    const bsc   = a.bscScore || 0;
    const col   = bscRowColor(bsc);
    const row   = ws.getRow(4 + idx);
    row.height  = 18;

    const ttfaActual = a.adjustedTTFA ? (a.adjustedTTFA > 1 ? a.adjustedTTFA : a.adjustedTTFA * 100) : 0;
    const ttfaPctVal = a.ttfaPct ? (a.ttfaPct > 1 ? a.ttfaPct : a.ttfaPct * 100) : 0;

    const values = [
      a.name || '—',
      a.productiveDays || 0,
      a.connectedCalls?.toFixed(1) || 0,
      pctFmt(a.ccPct),
      a.ahtFirstCall?.toFixed(0) || 0,
      pctFmt(a.ahtPct),
      ttfaActual.toFixed(0) + '%',
      Math.round(ttfaPctVal) + '%',
      a.pureTaskTime?.toFixed(1) || 0,
      pctFmt(a.pttPct),
      bscFmt(bsc),
      a.totalCalls || 0,
      a.rank || '—',
      inrFormat(a.payout || 0),
    ];

    values.forEach((val, i) => {
      const cell  = ws.getCell(4 + idx, i + 1);
      cell.value  = val;
      styleCell(cell, {
        bg: col.bg, font: col.font,
        bold:true, italic:true, size:10,
        align: i===0 ? 'left' : 'center',
      });
    });
  });

  // ── Totals row ──────────────────────────────────────────
  const totRow = ws.getRow(4 + filtered.length);
  totRow.height = 20;
  const qualPayout = filtered.filter(a=>a.qualification?.qualified).reduce((s,a)=>s+(a.payout||0),0);
  const totVals = ['TOTAL / AVERAGE', (filtered.reduce((s,a)=>s+(a.productiveDays||0),0)/Math.max(filtered.length,1)).toFixed(1),
    '','','','','','','','', (filtered.reduce((s,a)=>s+(a.bscScore||0),0)/Math.max(filtered.length,1)).toFixed(2), '', '', inrFormat(qualPayout)];
  totVals.forEach((v,i) => {
    const cell = ws.getCell(4+filtered.length, i+1);
    cell.value = v;
    styleCell(cell, { bg:'1F3864', font:'FFFFFF', bold:true, size:10, align: i===0?'left':'center' });
  });

  // ── Download ────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `Emeritus_BSC_Incentive_${dateStamp()}.xlsx`);
}

// ============================================================
// EFFORT EXCEL EXPORT — Matches Image 2
// ============================================================
export async function exportEffortExcel(advisorRows, shiftDate, opts = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Team Effort Summary');

  ws.columns = [
    { width: 28 }, // Advisor
    { width: 12 }, // Total Calls
    { width: 15 }, // Connected Calls
    { width: 16 }, // Talk Time (min)
    { width: 13 }, // Conn Rate %
    { width: 18 }, // Avg Talk/Connect
  ];

  // ── Title rows ───────────────────────────────────────────
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '📋 Team Effort Summary';
  titleCell.font  = { bold:true, size:13, name:'Calibri', color:{ argb:'FF1F3864' } };
  titleCell.alignment = { horizontal:'left', vertical:'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells('A2:F2');
  const dateCell = ws.getCell('A2');
  const fmtDate  = shiftDate ? new Date(shiftDate).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) : 'QTD';
  dateCell.value = `📅 Shift Date: ${fmtDate}`;
  dateCell.font  = { bold:true, size:11, name:'Calibri', color:{ argb:'FF1F3864' } };
  dateCell.alignment = { horizontal:'left', vertical:'middle' };
  ws.getRow(2).height = 18;

  // ── Header row ───────────────────────────────────────────
  const headers = ['Advisor','Total Calls','Connected Calls','Talk Time (min)','Conn Rate %','Avg Talk/Connect'];
  const hRow    = ws.getRow(3);
  hRow.height   = 20;
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i+1);
    cell.value = h;
    styleCell(cell, { bg:COLORS.navyBg, font:COLORS.navyFont, bold:true, size:11, align: i===0?'left':'center' });
  });

  // ── Data rows ────────────────────────────────────────────
  const sorted = [...advisorRows].sort((a,b) => b.totalTT - a.totalTT);
  sorted.forEach((r, idx) => {
    const row    = ws.getRow(4 + idx);
    row.height   = 17;
    const isEven = idx % 2 === 0;
    const vals   = [
      r.name,
      r.totalDials,
      r.totalConn,
      r.totalTT?.toFixed(2) || '0.00',
      (r.connRate * 100).toFixed(2) + '%',
      r.avgTalkPerConnect?.toFixed(2) || '0.00',
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(4+idx, i+1);
      cell.value = v;
      cell.font  = { size:10, name:'Calibri' };
      cell.alignment = { horizontal: i===0?'left':'center', vertical:'middle' };
      cell.border = { top:{ style:'thin', color:{argb:'FFD9D9D9'} }, bottom:{ style:'thin', color:{argb:'FFD9D9D9'} }, left:{ style:'thin', color:{argb:'FFD9D9D9'} }, right:{ style:'thin', color:{argb:'FFD9D9D9'} } };
      if (isEven) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF5F8FF' } };
    });
  });

  // ── Grand Total row ───────────────────────────────────────
  const totIdx = 4 + sorted.length;
  const totRow = ws.getRow(totIdx);
  totRow.height = 20;
  const totDials = sorted.reduce((s,r)=>s+r.totalDials,0);
  const totConn  = sorted.reduce((s,r)=>s+r.totalConn,0);
  const totTT    = sorted.reduce((s,r)=>s+r.totalTT,0);
  const totConnRate = totDials > 0 ? totConn/totDials : 0;
  const totAvg   = totConn > 0 ? totTT/totConn : 0;
  const totVals  = ['Grand Total', totDials, totConn, totTT.toFixed(2), totConnRate.toFixed(3), totAvg.toFixed(2)];
  totVals.forEach((v, i) => {
    const cell = ws.getCell(totIdx, i+1);
    cell.value = v;
    styleCell(cell, { bg:COLORS.navyBg, font:COLORS.navyFont, bold:true, size:11, align: i===0?'left':'center' });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `Emeritus_Effort_${shiftDate||'QTD'}_${dateStamp()}.xlsx`);
}

// ============================================================
// PDF EXPORT
// ============================================================
export function exportPDF(advisors, opts = {}) {
  const doc = new jsPDF({ orientation:'landscape', format:'a4' });
  doc.setFillColor(31,56,100);
  doc.rect(0,0,297,18,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('EMERITUS',14,12);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Operational Intelligence Platform — Incentive Report', 50,12);
  doc.text(new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),255,12);

  const cols = ['Rank','PA Name','Region','Prod Days','BSC Score','Connects','AHT(s)','TTFA%','PTT(min)','Slab','Payout ₹','Status'];
  const rows = advisors.map(a => [
    a.rank, a.name, a.region, a.productiveDays,
    a.bscScore?.toFixed(2)||'—',
    a.connectedCalls?.toFixed(1)||'—',
    a.ahtFirstCall?.toFixed(0)||'—',
    pctFmt(a.adjustedTTFA),
    a.pureTaskTime?.toFixed(1)||'—',
    a.slab||'—',
    a.payout>0?`₹${a.payout.toLocaleString('en-IN')}`:'—',
    a.qualification?.pdStatus||'—',
  ]);

  autoTable(doc, {
    startY:22, head:[cols], body:rows,
    styles:{ fontSize:7, cellPadding:2, halign:'center' },
    headStyles:{ fillColor:[31,56,100], textColor:255, fontStyle:'bold', fontSize:8 },
    columnStyles:{ 1:{ halign:'left' }, 2:{ halign:'center' } },
    didParseCell: data => {
      if (data.section==='body') {
        const a = advisors[data.row.index];
        if (a) {
          const bsc = a.bscScore||0;
          if (bsc>=71)      data.cell.styles.fillColor=[198,239,206];
          else if (bsc>=60) data.cell.styles.fillColor=[255,255,0];
          else              data.cell.styles.fillColor=[255,0,0];
        }
      }
    },
  });

  doc.save(`Emeritus_Report_${dateStamp()}.pdf`);
}

// ============================================================
// COPY TO TEAMS
// ============================================================
export function copyToTeams(advisors) {
  const headers = ['Rank','PA Name','Region','Prod Days','BSC Score','Connects','AHT(s)','TTFA%','PTT(min)','Slab','Payout','Status'];
  const rows = advisors.map(a => [
    a.rank, a.name, a.region, a.productiveDays,
    a.bscScore?.toFixed(2)||'—',
    a.connectedCalls?.toFixed(1)||'—',
    a.ahtFirstCall?.toFixed(0)||'—',
    pctFmt(a.adjustedTTFA),
    a.pureTaskTime?.toFixed(1)||'—',
    a.slab||'—',
    a.payout>0?`₹${a.payout.toLocaleString('en-IN')}`:'—',
    a.qualification?.pdStatus||'—',
  ]);
  const text = [headers, ...rows].map(r => r.join('\t')).join('\n');
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
  });
}

// ============================================================
// CSV DOWNLOAD
// ============================================================
export function exportCSV(advisors) {
  const headers = ['Rank','PA Name','EMP ID','TL','APM','Region','Prod Days','BSC Score','Connects','AHT(s)','TTFA%','PTT(min)','Slab','Payout INR','Status'];
  const rows = advisors.map(a => [
    a.rank, a.name, a.empId||'', a.tl||'', a.apm||'', a.region,
    a.productiveDays, a.bscScore?.toFixed(2)||'',
    a.connectedCalls?.toFixed(1)||'', a.ahtFirstCall?.toFixed(0)||'',
    pctFmt(a.adjustedTTFA), a.pureTaskTime?.toFixed(1)||'',
    a.slab||'', a.payout||0, a.qualification?.pdStatus||'',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  downloadBlob(blob, `Emeritus_BSC_${dateStamp()}.csv`);
}

// ── Helpers ───────────────────────────────────────────────
function dateStamp() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export const DEFAULT_ADVISOR_COLUMNS = [];
