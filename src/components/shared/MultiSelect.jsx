import { useState, useRef, useEffect } from 'react';

export default function MultiSelect({ label, options, value, onChange, placeholder, searchable }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = searchable && search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };

  const allSelected = value.length === options.length;

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        className="filter-select"
        style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', minWidth:120 }}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        {value.length > 0 && <span style={{ background:'var(--em-green)', color:'white', borderRadius:10, fontSize:10, padding:'1px 6px', fontWeight:700 }}>{value.length}</span>}
        <span style={{ marginLeft:'auto', fontSize:10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:100, background:'white', border:'1px solid var(--border)', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,.1)', minWidth:200, maxHeight:280, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {searchable && (
            <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
              <input autoFocus className="search-input" style={{ width:'100%', fontSize:12 }} placeholder={placeholder||'Search...'} value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          )}
          <div style={{ overflow:'auto', flex:1 }}>
            <div style={{ padding:'6px 10px', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #f1f5f9' }}>
              <button style={{ fontSize:11, color:'var(--em-green)', cursor:'pointer', background:'none', border:'none', fontWeight:600 }} onClick={() => onChange(allSelected ? [] : [...options])}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
              {value.length > 0 && <button style={{ fontSize:11, color:'#6b7280', cursor:'pointer', background:'none', border:'none' }} onClick={() => onChange([])}>Clear</button>}
            </div>
            {filtered.map(opt => (
              <div key={opt}
                onClick={() => toggle(opt)}
                style={{ padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, background: value.includes(opt)?'#f0fdf4':'white' }}>
                <div style={{ width:14, height:14, borderRadius:3, border:`2px solid ${value.includes(opt)?'var(--em-green)':'#d1d5db'}`, background: value.includes(opt)?'var(--em-green)':'white', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {value.includes(opt) && <span style={{ color:'white', fontSize:9, fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opt}</span>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding:'16px 12px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}
