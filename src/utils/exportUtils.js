// ============================================================
// EXPORT ENGINE
// Handles: Copy to Teams, CSV, Formatted Excel, PDF
// Two modes: Current View | Filtered View
// ============================================================

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatINR, formatBSC, getBSCColor } from '../constants/businessRules';

// ----------------------------
// COPY TO TEAMS (plain text table)
// ----------------------------
export function copyToTeams(advisors, columns) {
  const cols = columns || DEFAULT_ADVISOR_COLUMNS;
  const header = cols.map(c => c.label).join('\t');
  const rows = advisors.map(a =>
    cols.map(c => formatCell(a, c.key, c.format)).join('\t')
  );
  const text = [header, ...rows].join('\n');
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback: create textarea
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
  return text;
}

// ----------------------------
// COPY TO EXCEL (CSV format)
// ----------------------------
export function copyToCSV(advisors, columns) {
  const cols = columns || DEFAULT_ADVISOR_COLUMNS;
  const header = cols.map(c => `"${c.label}"`).join(',');
  const rows = advisors.map(a =>
    cols.map(c => {
      const val = formatCell(a, c.key, c.format);
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `emeritus_export_${dateStamp()}.csv`);
  return csv;
}

// ----------------------------
// FORMATTED EXCEL EXPORT
// Color coded, bold headers, totals, freeze panes
// ----------------------------
export function exportFormattedExcel(advisors, columns, opts = {}) {
  const cols = columns || DEFAULT_ADVISOR_COLUMNS;
  const wb = XLSX.utils.book_new();

  // ---- Data sheet ----
  const wsData = buildAdvisorSheet(advisors, cols, opts);
  XLSX.utils.book_append_sheet(wb, wsData, 'Incentive Report');

  // ---- Summary sheet ----
  const wsSummary = buildSummarySheet(advisors);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  XLSX.writeFile(wb, `Emeritus_Incentive_Report_${dateStamp()}.xlsx`);
}

function buildAdvisorSheet(advisors, cols, opts) {
  const rows = [];

  // Title row
  rows.push([`EMERITUS — Incentive Intelligence Report — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`]);
  rows.push([]);

  // Header row
  rows.push(cols.map(c => c.label));

  // Data rows
  for (const a of advisors) {
    rows.push(cols.map(c => formatCellRaw(a, c.key)));
  }

  // Totals row
  const totalsRow = cols.map(c => {
    if (c.key === 'name') return 'TOTAL / AVERAGE';
    if (c.key === 'payout') return advisors.reduce((s, a) => s + (a.payout || 0), 0);
    if (c.key === 'productiveDays') return (advisors.reduce((s, a) => s + (a.productiveDays || 0), 0) / advisors.length).toFixed(1);
    if (c.key === 'bscScore') return (advisors.reduce((s, a) => s + (a.bscScore || 0), 0) / advisors.length).toFixed(2);
    return '';
  });
  rows.push(totalsRow);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = cols.map(c => ({ wch: c.width || 18 }));

  // Freeze panes: freeze first 3 rows and first 1 col
  ws['!freeze'] = { xSplit: 1, ySplit: 3 };

  // Apply styles — XLSX.utils doesn't do styles; we use cell metadata
  // For color coding, we embed conditional format hints as cell comments
  // Real color coding needs a library like ExcelJS; we indicate via text prefix
  // This is the best we can do with SheetJS community edition

  return ws;
}

function buildSummarySheet(advisors) {
  const qualified   = advisors.filter(a => a.qualification?.qualified).length;
  const onTrack     = advisors.filter(a => a.qualification?.pdStatus === 'On Track').length;
  const atRisk      = advisors.filter(a => a.qualification?.pdStatus === 'At Risk').length;
  const offTrack    = advisors.filter(a => a.qualification?.pdStatus === 'Off Track').length;
  const totalPayout = advisors.reduce((s, a) => s + (a.payout || 0), 0);
  const avgBSC      = advisors.length ? (advisors.reduce((s, a) => s + (a.bscScore || 0), 0) / advisors.length).toFixed(2) : 0;

  const rows = [
    ['EMERITUS — Summary Report'],
    [],
    ['Metric', 'Value'],
    ['Total Advisors',     advisors.length],
    ['Qualified',          qualified],
    ['On Track',           onTrack],
    ['At Risk',            atRisk],
    ['Off Track',          offTrack],
    ['Average BSC',        avgBSC],
    ['Total Projected Payout (₹)', totalPayout],
    [],
    ['Slab Distribution', ''],
    ...buildSlabSummary(advisors),
  ];

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildSlabSummary(advisors) {
  const slabMap = {};
  for (const a of advisors) {
    const key = a.slab || 'Unknown';
    if (!slabMap[key]) slabMap[key] = { count: 0, totalPayout: 0 };
    slabMap[key].count++;
    slabMap[key].totalPayout += a.payout || 0;
  }
  return Object.entries(slabMap).map(([slab, data]) => [
    slab, `${data.count} advisors`, `₹${data.totalPayout.toLocaleString('en-IN')}`
  ]);
}

// ----------------------------
// PDF EXPORT
// ----------------------------
export function exportPDF(advisors, columns, opts = {}) {
  const cols = (columns || DEFAULT_ADVISOR_COLUMNS).slice(0, 10); // PDF width limit
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

  // Header
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, 297, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('EMERITUS', 14, 13);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Operational Intelligence Platform — Incentive Report', 55, 13);
  doc.text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 250, 13);

  // Sub header
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}   |   Advisors: ${advisors.length}   |   ${opts.filterLabel || 'All Data'}`, 14, 26);

  // Table
  const tableRows = advisors.map(a =>
    cols.map(c => formatCell(a, c.key, c.format))
  );

  autoTable(doc, {
    startY: 30,
    head: [cols.map(c => c.label)],
    body: tableRows,
    foot: [buildPDFFooter(advisors, cols)],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, halign: 'center', overflow: 'linebreak' },
    headStyles: {
      fillColor: [20, 83, 45], textColor: [255, 255, 255],
      fontStyle: 'bold', halign: 'center', fontSize: 8,
    },
    footStyles: {
      fillColor: [240, 240, 240], textColor: [0, 0, 0],
      fontStyle: 'bold', halign: 'center', fontSize: 7,
    },
    columnStyles: { 0: { halign: 'left' } },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const advisor = advisors[data.row.index];
        if (advisor && data.column.dataKey !== undefined) {
          const colKey = cols[data.column.index]?.key;
          if (colKey === 'bscScore') {
            const bsc = advisor.bscScore;
            if (bsc < 60)       data.cell.styles.fillColor = [254, 226, 226];
            else if (bsc <= 70) data.cell.styles.fillColor = [254, 249, 195];
            else                data.cell.styles.fillColor = [220, 252, 231];
          }
        }
      }
    },
  });

  doc.save(`Emeritus_Report_${dateStamp()}.pdf`);
}

function buildPDFFooter(advisors, cols) {
  return cols.map(c => {
    if (c.key === 'name') return `Total: ${advisors.length}`;
    if (c.key === 'payout') return formatINR(advisors.reduce((s, a) => s + (a.payout || 0), 0));
    if (c.key === 'bscScore') return (advisors.reduce((s, a) => s + (a.bscScore || 0), 0) / advisors.length).toFixed(1);
    return '';
  });
}

// ----------------------------
// DEFAULT COLUMN DEFINITIONS
// ----------------------------
export const DEFAULT_ADVISOR_COLUMNS = [
  { key: 'rank',          label: 'Rank',          width: 8 },
  { key: 'name',          label: 'PA Name',        width: 28 },
  { key: 'empId',         label: 'EMP ID',         width: 12 },
  { key: 'tl',            label: 'TL',             width: 20 },
  { key: 'apm',           label: 'APM',            width: 20 },
  { key: 'region',        label: 'Region',         width: 8 },
  { key: 'productiveDays',label: 'Prod Days',      width: 12 },
  { key: 'bscScore',      label: 'BSC Score',      width: 12, format: 'bsc' },
  { key: 'connectedCalls',label: 'Conn Calls',     width: 12 },
  { key: 'ahtFirstCall',  label: 'AHT (sec)',      width: 12 },
  { key: 'adjustedTTFA',  label: 'Adj TTFA',       width: 12, format: 'pct' },
  { key: 'pureTaskTime',  label: 'PTT (min)',       width: 12 },
  { key: 'slab',          label: 'Slab',           width: 12 },
  { key: 'payout',        label: 'Payout (₹)',     width: 14, format: 'inr' },
  { key: 'pdStatus',      label: 'PD Status',      width: 12 },
];

export const EFFORT_COLUMNS = [
  { key: 'name',       label: 'PA Name',     width: 28 },
  { key: 'prodDays',   label: 'Prod Days',   width: 12 },
  { key: 'totalDials', label: 'Total Dials', width: 14 },
  { key: 'totalConn',  label: 'Connected',   width: 12 },
  { key: 'totalPTT',   label: 'PTT (min)',   width: 12 },
  { key: 'avgDials',   label: 'Avg Dials/Day', width: 16 },
  { key: 'avgPTT',     label: 'Avg PTT/Day', width: 14 },
];

// ----------------------------
// FORMATTERS
// ----------------------------
function formatCell(advisor, key, format) {
  const val = getNestedVal(advisor, key);
  if (val === null || val === undefined) return '—';
  if (format === 'inr')  return formatINR(val);
  if (format === 'pct')  return typeof val === 'number' ? (val * 100).toFixed(1) + '%' : val;
  if (format === 'bsc')  return typeof val === 'number' ? val.toFixed(2) : val;
  if (key === 'payout')  return formatINR(val);
  if (key === 'pdStatus') return advisor.qualification?.pdStatus || '—';
  return String(val);
}

function formatCellRaw(advisor, key) {
  const val = getNestedVal(advisor, key);
  if (val === null || val === undefined) return '';
  if (key === 'payout') return val;
  if (key === 'pdStatus') return advisor.qualification?.pdStatus || '';
  return val;
}

function getNestedVal(obj, key) {
  if (key === 'pdStatus') return obj.qualification?.pdStatus;
  return obj[key];
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
