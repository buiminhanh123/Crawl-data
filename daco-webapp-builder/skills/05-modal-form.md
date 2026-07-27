# 05 — Modal & Form

Patterns for modal dialogs, form inputs, upload zones, and checkboxes.

## Modal Pattern

```jsx
{showModal && (
  <div className="modal-overlay" onClick={() => setShowModal(false)}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3 className="modal-title">
          <IconComponent size={20} style={{ marginRight: 8 }} />
          {MODAL_TITLE}
        </h3>
        <button className="modal-close" onClick={() => setShowModal(false)}>
          <X size={20} />
        </button>
      </div>

      {/* Modal body — form content */}
      <div className="form-group">
        <label className="form-label">{LABEL}</label>
        <input className="form-input" value={val} onChange={...} />
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
)}
```

**Key CSS**: Modal max-width `520px`, padding `28px`, max-height `85vh`.
Override with `style={{ maxWidth: 700, width: '95%' }}` for wide modals.

## Form Elements

### Text Input
```jsx
<div className="form-group">
  <label className="form-label">{LABEL}</label>
  <input className="form-input" placeholder="..." value={val} onChange={...} />
  <div className="form-helper">{HELPER_TEXT}</div>
</div>
```

### Select
```jsx
<select className="form-select" value={val} onChange={...}>
  <option value="">-- Select --</option>
  <option value="a">Option A</option>
</select>
```

### Two-Column Form Row
```jsx
<div className="form-row">
  <div className="form-group">...</div>
  <div className="form-group">...</div>
</div>
```

### Read-Only Input
```jsx
<input className="form-input" readOnly value={val} />
```

## Upload Drop Zone

```jsx
const fileRef = useRef(null);
const [file, setFile] = useState(null);

<div className="form-group">
  <label className="form-label">Select file</label>
  <div className="debt-upload-zone"
    onClick={() => fileRef.current?.click()}
    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
    onDragLeave={e => e.currentTarget.classList.remove('dragover')}
    onDrop={e => {
      e.preventDefault();
      e.currentTarget.classList.remove('dragover');
      if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    }}
  >
    <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
    <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
      {file ? file.name : 'Drag & drop or click to select'}
    </p>
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
      style={{ display: 'none' }}
      onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }}
    />
  </div>
</div>
```

## Checkbox Group

```jsx
<div className="checkbox-group">
  <div className="checkbox-item">
    <input type="checkbox" id="opt1" checked={val} onChange={...} />
    <label htmlFor="opt1">{LABEL}</label>
  </div>
</div>
```

## Confirmation Dialog

For destructive actions, use native `confirm()`:
```jsx
const handleDelete = async (id) => {
  if (!confirm('Are you sure you want to delete this item?')) return;
  // proceed with delete...
};
```
