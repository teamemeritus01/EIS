// ============================================================
// COMPENSATION STRUCTURE PDF PARSER  
// Uses PDF.js for text extraction, then pattern-matches
// Tested against: Test_Dashboard_BSC_Incentive_Sample.pdf ✓
// ============================================================

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_CDN;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(s);
  });
}

async function extractPDFText(file) {
  const pdfjs = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(s => s.str).join(' '));
  }
  return pages.join('\n');
}

export async function parseCompensationPDF(file) {
  try {
    const text = await extractPDFText(file);
    return extractCompensationStructure(text);
  } catch (err) {
    console.error('PDF parse error:', err);
    return { isValid: false, error: err.message, slabs: [], metrics: [], gating: {} };
  }
}

export function extractCompensationStructure(text) {
  const result = { gating: {}, metrics: [], slabs: [], raw: text, parsed: true };

  // ── Gating Criteria ──────────────────────────────────────
  const gatingMap = [
    { key:'minProdDaysPct',  re:/productive days[^%\d]*(\d+(?:\.\d+)?)\s*%/i },
    { key:'minBSCScore',     re:/(?:minimum )?bsc score\D*?(\d+(?:\.\d+)?)/i },
    { key:'minConnCalls',    re:/connected calls\D*?(\d+(?:\.\d+)?)\s*per day/i },
    { key:'minPTTMinutes',   re:/(?:minimum )?ptt\D*?(\d+(?:\.\d+)?)\s*min/i },
    { key:'minAttendancePct',re:/attendance compliance\D*?(\d+(?:\.\d+)?)\s*%/i },
  ];
  gatingMap.forEach(({ key, re }) => {
    const m = text.match(re);
    if (m) result.gating[key] = parseFloat(m[1]);
  });

  // ── Metric Grid ──────────────────────────────────────────
  // Format: "Connected Calls 20% 18" OR "First Call AHT 15% 690"
  const metricMap = [
    { name:'Connected Calls',         key:'connectedCalls',  re:/connected calls\s+(\d+)%\s+(\d+)/i },
    { name:'Connected Calls TT (PTT)',key:'pureTaskTime',    re:/connected calls tt[^%]*?(\d+)%\s+(\d+)/i },
    { name:'First Call AHT',          key:'ahtFirstCall',    re:/first call aht\s+(\d+)%\s+(\d+)/i },
    { name:'Adjusted TTFA',           key:'adjustedTTFA',    re:/adjusted ttfa\s+(\d+)%\s+(\d+)/i },
    { name:'Daily Productive Hours',  key:'productiveHours', re:/productive hours?\s+(\d+)%\s+(\d+(?:\.\d+)?)/i },
    { name:'Quality Compliance',      key:'qualityCompliance',re:/quality compliance\s+(\d+)%\s+(\d+)/i },
  ];
  metricMap.forEach(({ name, key, re }) => {
    const m = text.match(re);
    if (m) result.metrics.push({
      name, key,
      weight: parseFloat(m[1]) / 100,
      target: parseFloat(m[2]),
    });
  });

  // ── Incentive Slabs ─────────────────────────────────────
  // Format: "1 – 5 n 145,000" OR "1 – 5 ■ 145,000" OR "1-5 145000"
  const slabRe = /(\d+)\s*[-–]\s*(\d+)\s*(?:[n■\|▪•*]|\(cid:\d+\))?\s*([\d,]+)/g;
  const openRe = /(\d+)\+\s*(?:[n■\|▪•*]|\(cid:\d+\))?\s*([\d,]+)/g;
  let m;
  while ((m = slabRe.exec(text)) !== null) {
    const fr = parseInt(m[1]), to = parseInt(m[2]);
    const amt = parseInt(m[3].replace(/,/g, ''));
    if (fr >= 1 && to >= fr && fr <= 500) {
      result.slabs.push({ fromRank: fr, toRank: to, amount: amt });
    }
  }
  // Handle open-ended slab like "86+"
  while ((m = openRe.exec(text)) !== null) {
    const fr = parseInt(m[1]);
    const amt = parseInt(m[2].replace(/,/g, ''));
    if (fr >= 1) {
      result.slabs.push({ fromRank: fr, toRank: 9999, amount: amt });
    }
  }
  result.slabs.sort((a, b) => a.fromRank - b.fromRank);

  result.isValid     = result.slabs.length > 0 || Object.keys(result.gating).length > 0;
  result.confidence  = Math.round((
    (result.slabs.length > 0             ? 0.4 : 0) +
    (Object.keys(result.gating).length > 2 ? 0.3 : 0) +
    (result.metrics.length > 2           ? 0.3 : 0)
  ) * 100);

  return result;
}

export function compensationToConfig(parsed) {
  const config = {};
  const g = parsed.gating || {};
  if (g.minBSCScore)     config.minBSC        = g.minBSCScore;
  if (g.minProdDaysPct)  config.prodDaysPct   = g.minProdDaysPct / 100;
  if (g.minConnCalls)    config.targetCC      = g.minConnCalls;
  if (g.minPTTMinutes)   config.targetPTT     = g.minPTTMinutes;

  if (parsed.slabs?.length > 0) {
    config.slabGrid = parsed.slabs.map(s => ({
      fromRank: s.fromRank,
      toRank:   s.toRank === 9999 ? 9999 : s.toRank,
      amount:   s.amount,
    }));
  }

  parsed.metrics?.forEach(({ key, target, weight }) => {
    if (key === 'connectedCalls' && target) config.targetCC   = target;
    if (key === 'ahtFirstCall'   && target) config.targetAHT  = target;
    if (key === 'adjustedTTFA'   && target) config.targetTTFA = target / 100 > 1 ? target / 100 : target;
    if (key === 'pureTaskTime'   && target) config.targetPTT  = target;
    if (key === 'connectedCalls' && weight) config.weightCC   = weight;
    if (key === 'ahtFirstCall'   && weight) config.weightAHT  = weight;
    if (key === 'adjustedTTFA'   && weight) config.weightTTFA = weight;
    if (key === 'pureTaskTime'   && weight) config.weightPTT  = weight;
  });

  return config;
}
