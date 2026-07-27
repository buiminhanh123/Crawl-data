# 04 — Page Template

Standard page structure used across all DACO webapps. Every page follows the
same pattern: header → stat cards → filter bar → data table.

## Page Skeleton

```jsx
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import { Search, Download, Plus, Trash2, Edit } from 'lucide-react';

export default function FeaturePage() {
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [toasts, setToasts] = useState([]);

  // Permission check — ALWAYS first
  if (!hasPermission('feature-key')) {
    return (
      <div className="page-content">
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          Access denied
        </div>
      </div>
    );
  }

  // Toast helper
  const toast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message: msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  };

  // Format currency (Vietnamese)
  const fmt = (v) => {
    if (!v && v !== 0) return '-';
    return Math.round(v).toLocaleString('vi-VN') + ' đ';
  };

  return (
    <div className="page-content">
      {/* Inline Toasts */}
      {/* Page Header */}
      {/* Stat Cards */}
      {/* Filter Bar + Table inside a Card */}
    </div>
  );
}
```

## Page Header Pattern

```jsx
<div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
  <div>
    <h2>{PAGE_TITLE}</h2>
  </div>
  <div style={{ display: 'flex', gap: 10 }}>
    <button className="btn btn-secondary">...</button>
    <button className="btn btn-primary">...</button>
  </div>
</div>
```

## Stat Cards Grid

```jsx
<div className="debt-stats-grid" style={{ marginBottom: 20 }}>
  <div className="debt-stat-card">
    <div className="debt-stat-icon primary">{/* icon */}</div>
    <div className="debt-stat-content">
      <div className="debt-stat-label">{LABEL}</div>
      <div className="debt-stat-value">{VALUE}</div>
    </div>
  </div>
  {/* More cards... icon variants: primary, danger, info, warning, success */}
</div>
```

**Icon variants**: `.debt-stat-icon.primary` (orange), `.danger` (red),
`.info` (blue), `.warning` (yellow), `.success` (green).

Custom icon color: `style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}`

## Filter Bar Pattern

```jsx
<div className="card" style={{ padding: 20 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
    {/* Left: filters */}
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <select className="form-select" style={{ width: 200 }}>...</select>
      <input type="date" className="form-input" style={{ width: 150 }} />
    </div>
    {/* Right: search */}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
        <input className="form-input" style={{ paddingLeft: 32, width: 250 }} placeholder="Search..." />
      </div>
      <button className="btn btn-secondary btn-sm">Search</button>
    </div>
  </div>
  {/* Table goes here */}
</div>
```

## Basic Data Table

```jsx
<div className="table-wrapper">
  <table className="table">
    <thead>
      <tr>
        <th>#</th>
        <th>Column A</th>
        <th style={{ textAlign: 'right' }}>Amount</th>
        <th style={{ textAlign: 'center' }}>Actions</th>
      </tr>
    </thead>
    <tbody>
      {data.map((item, i) => (
        <tr key={item.id}>
          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
          <td style={{ fontWeight: 600 }}>{item.name}</td>
          <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(item.amount)}</td>
          <td>
            <div className="actions">
              <button className="btn btn-secondary btn-sm"><Edit size={14} /></button>
              <button className="btn btn-danger btn-sm"><Trash2 size={14} /></button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Loading & Empty States

```jsx
// Loading
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
  <div style={{ textAlign: 'center' }}>
    <div style={{ width: 48, height: 48, border: '4px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
  </div>
</div>

// Empty
<tr><td colSpan={N} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data</td></tr>
```

See `templates/frontend/page-template.js` for a complete working example.
