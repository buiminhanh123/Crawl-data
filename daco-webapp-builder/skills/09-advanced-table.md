# 09 — Advanced Table

Sortable, resizable, sticky-column tables with dual scrollbar sync.

## Full Advanced Table Setup

Use the `debt-table` CSS classes for advanced tables. For basic tables, use
the simpler `.table-wrapper` + `.table` pattern from `04-page-template.md`.

## Column Resize

### State Setup
```jsx
const defaultColWidths = [50, 150, 120, 200, 130, 80]; // widths per column
const [colWidths, setColWidths] = useState(defaultColWidths);
```

### Resize Handler
```jsx
const onResizeStart = useCallback((colIdx, e) => {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startWidth = colWidths[colIdx];

  const onMouseMove = (ev) => {
    const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
    setColWidths(prev => { const next = [...prev]; next[colIdx] = newWidth; return next; });
  };
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}, [colWidths]);
```

### Table with Fixed Layout
```jsx
<table className="table debt-table" style={{ tableLayout: 'fixed', width: colWidths.reduce((a, b) => a + b, 0) + 'px' }}>
  <colgroup>
    {colWidths.map((w, i) => <col key={i} style={{ width: w + 'px' }} />)}
  </colgroup>
  <thead><tr>
    {headers.map((h, i) => (
      <th key={i}>
        <div className="th-content">{h.label}</div>
        <div className="col-resize-handle" onMouseDown={(e) => onResizeStart(i, e)} />
      </th>
    ))}
  </tr></thead>
</table>
```

## Sorting

```jsx
const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

const handleSort = (key) => {
  if (!key) return;
  let direction = 'asc';
  if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
  setSortConfig({ key, direction });
};

// Apply sort to data
const sorted = useMemo(() => {
  const list = [...data];
  if (!sortConfig.key) return list;
  list.sort((a, b) => {
    const aV = a[sortConfig.key], bV = b[sortConfig.key];
    if (aV === bV) return 0;
    if (aV == null) return 1;
    if (bV == null) return -1;
    if (typeof aV === 'string') return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
    return sortConfig.direction === 'asc' ? (aV < bV ? -1 : 1) : (aV > bV ? -1 : 1);
  });
  return list;
}, [data, sortConfig]);
```

### Sort Header UI
```jsx
<div className="th-content" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
  onClick={() => handleSort(sortKey)}>
  <span>{label}</span>
  <span style={{ color: sortConfig.key === sortKey ? 'var(--accent)' : 'var(--text-muted)' }}>
    {sortConfig.key === sortKey
      ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)
      : <ArrowUpDown size={14} />}
  </span>
</div>
```

## Sticky Columns

Add `debt-table-sticky` class to the table. First N columns can be sticky:

```jsx
const STICKY_COUNT = 3;
const getStickyLeft = (ci) => {
  let left = 0;
  for (let i = 0; i < ci; i++) left += colWidths[i];
  return left;
};

// In header/cells:
<th className={ci < STICKY_COUNT ? `sticky-col${ci === STICKY_COUNT - 1 ? ' sticky-col-last' : ''}` : ''}
  style={ci < STICKY_COUNT ? { left: getStickyLeft(ci) + 'px' } : {}}>
```

### CSS Classes
- `.sticky-col` — `position: sticky; z-index: 5`
- `thead .sticky-col` — `z-index: 15; background: #f8fafc`
- `tbody .sticky-col` — `background: white`
- `.sticky-col-last` — right shadow to show freeze boundary

## Dual Scrollbar Sync

For wide tables, show a scroll bar on top as well:

```jsx
const topScrollRef = useRef(null);
const tableContainerRef = useRef(null);
const scrollSyncing = useRef(false);

useEffect(() => {
  const topEl = topScrollRef.current, tableEl = tableContainerRef.current;
  if (!topEl || !tableEl) return;
  // Sync inner width
  const inner = topEl.querySelector('.debt-table-top-scroll-inner');
  if (inner) inner.style.width = tableEl.scrollWidth + 'px';
  const ro = new ResizeObserver(() => { if (inner) inner.style.width = tableEl.scrollWidth + 'px'; });
  ro.observe(tableEl);
  // Bidirectional scroll sync
  const syncA = () => { if (!scrollSyncing.current) { scrollSyncing.current = true; tableEl.scrollLeft = topEl.scrollLeft; requestAnimationFrame(() => scrollSyncing.current = false); }};
  const syncB = () => { if (!scrollSyncing.current) { scrollSyncing.current = true; topEl.scrollLeft = tableEl.scrollLeft; requestAnimationFrame(() => scrollSyncing.current = false); }};
  topEl.addEventListener('scroll', syncA);
  tableEl.addEventListener('scroll', syncB);
  return () => { topEl.removeEventListener('scroll', syncA); tableEl.removeEventListener('scroll', syncB); ro.disconnect(); };
}, [data]);

// JSX
<div className="debt-table-outer">
  <div className="debt-table-top-scroll" ref={topScrollRef}>
    <div className="debt-table-top-scroll-inner" />
  </div>
  <div className="debt-table-container" ref={tableContainerRef} style={{ maxHeight: 'calc(100vh - 310px)' }}>
    <table>...</table>
  </div>
</div>
```

## Column Visibility Toggle

```jsx
const [colVisibility, setColVisibility] = useState(() => {
  try { return JSON.parse(localStorage.getItem('col-vis-key') || '{}'); } catch { return {}; }
});
const isColVisible = (id) => colVisibility[id] !== false;
const toggleCol = (id) => {
  setColVisibility(prev => {
    const next = { ...prev, [id]: !isColVisible(id) };
    localStorage.setItem('col-vis-key', JSON.stringify(next));
    return next;
  });
};
```

## Text Truncation

- `th`: Use `.th-content` — `-webkit-line-clamp: 2`, `word-break: break-word`
- `td`: Use `.td-ellipsis` — `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
