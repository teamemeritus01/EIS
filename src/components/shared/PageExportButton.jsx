// ============================================================
// PAGE EXPORT BUTTON — Drop into any page for All/Filtered export
// Usage: <PageExportButton data={advisors} filteredData={filtered} type="bsc" shiftDate={date}/>
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { exportBSCExcel, exportEffortExcel, exportCSV, exportPDF, copyToTeams } from '../../utils/exportUtils.js';

const FORMATS = {
  bsc:    [{ id:'excel', label:'📊 Excel (.xlsx)' },{ id:'pdf', label:'📄 PDF Report' },{ id:'csv', label:'📋 CSV' },{ id:'teams', label:'💬 Copy to Teams' }],
  effort: [{ id:'effort_excel', label:'📊 Effort Excel' },{ id:'csv', label:'📋 CSV' },{ id:'teams', label:'💬 Copy to Teams' }],
  generic:[{ id:'csv', label:'📋 CSV' },{ id:'teams', label:'💬 Copy to Teams' }],
};

export default function PageExportButton({ data=[], filteredData=null, type='bsc', shiftDate='', label='Export' }) {
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState('filtered'); // 'filtered' | 'all'
  const [exporting,  setExporting]  = useState('');
  const ref = useRef();

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const exportSet  = mode === 'filtered' && filteredData ? filteredData : data;
  const formats    = FORMATS[type] || FORMATS.generic;
  const hasFilter  = filteredData && filteredData.length !== data.length;

  const doExport = async (fmt) => {
    setExporting(fmt); setOpen(false);
    try {
      if (fmt === 'excel')        await exportBSCExcel(exportSet);
      else if (fmt === 'effort_excel') await exportEffortExcel(exportSet, shiftDate);
      else if (fmt === 'pdf')     exportPDF(exportSet, shiftDate);
      else if (fmt === 'csv')     exportCSV(exportSet);
      else if (fmt === 'teams')   copyToTeams(exportSet, type === 'effort' ? 'effort' : 'bsc');
    } catch(e) { console.error('Export failed:', e); }
    setExporting('');
  };

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-flex', gap:0 }}>
      {/* Mode toggle pill */}
      {hasFilter && (
        <div style={{ display:'flex', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', overflow:'hidden', marginRight:4 }}>
          {['filtered','all'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding:'5px 10px', fontSize:11, fontWeight:600, border:'none', cursor:'pointer',
                background: mode===m ? 'var(--brand)' : 'white',
                color: mode===m ? 'white' : 'var(--txt2)' }}>
              {m==='filtered' ? `Filtered (${filteredData?.length})` : `All (${data.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Export button */}
      <button className="btn btn-primary btn-sm"
        onClick={() => setOpen(!open)}
        disabled={!!exporting || exportSet.length === 0}
        style={{ gap:5 }}>
        {exporting ? '⏳' : '📤'} {exporting ? 'Exporting…' : label} ▾
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:200,
          background:'white', border:'1px solid var(--border)', borderRadius:'var(--radius)',
          boxShadow:'var(--sh-lg)', zIndex:50, overflow:'hidden', animation:'fadeIn .15s ease' }}>
          <div style={{ padding:'7px 12px', fontSize:10, color:'var(--txt3)', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'.04em', borderBottom:'1px solid var(--border)' }}>
            Export {mode === 'filtered' ? `${exportSet.length} filtered` : `all ${data.length}`} rows
          </div>
          {formats.map(f => (
            <div key={f.id} onClick={() => doExport(f.id)}
              style={{ padding:'10px 14px', cursor:'pointer', fontSize:12.5,
                display:'flex', alignItems:'center', gap:10, transition:'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--s50)'}
              onMouseLeave={e => e.currentTarget.style.background='white'}>
              {f.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
