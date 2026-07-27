'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import {
    Search, Plus, Trash2, Edit, Download,
    DollarSign, TrendingUp, AlertCircle, CheckCircle,
    ArrowUpDown, ArrowUp, ArrowDown, X, Upload
} from 'lucide-react';

/**
 * DACO Page Template
 *
 * This is a complete example page demonstrating all common patterns:
 * - Permission check
 * - Page header with action buttons
 * - Stat cards (summary grid)
 * - Filter bar (search + select)
 * - Data table with sort and resize
 * - Modal for create/edit
 * - Toast notifications
 *
 * Replace {FEATURE_KEY}, {PAGE_TITLE}, and data structures with your own.
 */
export default function FeaturePage() {
    const { user, hasPermission } = useAuth();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);
    const [summary, setSummary] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [toasts, setToasts] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // ── Permission check ──
    if (!hasPermission('{FEATURE_KEY}')) {
        return (
            <div className="page-content">
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                    Access denied
                </div>
            </div>
        );
    }

    // ── Toast helper ──
    const toast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    // ── Format currency ──
    const fmt = (v) => {
        if (!v && v !== 0) return '-';
        return Math.round(v).toLocaleString('vi-VN') + ' đ';
    };

    // ── Load data ──
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchApi('/api/{FEATURE_KEY}');
            setRecords(data.records || []);
            setSummary(data.summary || {});
        } catch (err) {
            toast('Error loading data: ' + err.message, 'error');
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    // ── Sort ──
    const handleSort = (key) => {
        if (!key) return;
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedRecords = useMemo(() => {
        const list = [...records];
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return list.filter(r =>
                (r.name || '').toLowerCase().includes(term) ||
                (r.code || '').toLowerCase().includes(term)
            );
        }
        if (sortConfig.key) {
            list.sort((a, b) => {
                const aV = a[sortConfig.key], bV = b[sortConfig.key];
                if (aV === bV) return 0;
                if (aV == null) return 1;
                if (bV == null) return -1;
                if (typeof aV === 'string') return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
                return sortConfig.direction === 'asc' ? (aV < bV ? -1 : 1) : (aV > bV ? -1 : 1);
            });
        }
        return list;
    }, [records, searchTerm, sortConfig]);

    // ── Delete handler ──
    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            await fetchApi(`/api/{FEATURE_KEY}/${id}`, { method: 'DELETE' });
            toast('Deleted successfully');
            loadData();
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    // ── Table headers ──
    const headers = [
        { label: '#', align: 'left', sortKey: null },
        { label: 'Code', align: 'left', sortKey: 'code' },
        { label: 'Name', align: 'left', sortKey: 'name' },
        { label: 'Amount', align: 'right', sortKey: 'amount' },
        { label: 'Status', align: 'center', sortKey: 'status' },
        { label: 'Actions', align: 'center', sortKey: null },
    ];

    return (
        <div className="page-content">
            {/* ── Toasts ── */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {toasts.map(t => (
                    <div key={t.id} style={{
                        padding: '10px 16px', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500,
                        background: t.type === 'error' ? 'var(--danger)' : 'var(--success)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.3s ease'
                    }}>{t.message}</div>
                ))}
            </div>

            {/* ── Page Header ── */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>{'{PAGE_TITLE}'}</h2>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Download size={16} /> Export
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={16} /> Add New
                    </button>
                </div>
            </div>

            {/* ── Stat Cards ── */}
            <div className="debt-stats-grid" style={{ marginBottom: 20 }}>
                <div className="debt-stat-card">
                    <div className="debt-stat-icon primary"><DollarSign size={24} /></div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label">{'{Stat Label 1}'}</div>
                        <div className="debt-stat-value">{fmt(summary.total || 0)}</div>
                    </div>
                </div>
                <div className="debt-stat-card">
                    <div className="debt-stat-icon success"><TrendingUp size={24} /></div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label">{'{Stat Label 2}'}</div>
                        <div className="debt-stat-value">{summary.count || 0}</div>
                    </div>
                </div>
                <div className="debt-stat-card">
                    <div className="debt-stat-icon warning"><AlertCircle size={24} /></div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label">{'{Stat Label 3}'}</div>
                        <div className="debt-stat-value">{fmt(summary.pending || 0)}</div>
                    </div>
                </div>
                <div className="debt-stat-card">
                    <div className="debt-stat-icon danger"><CheckCircle size={24} /></div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label">{'{Stat Label 4}'}</div>
                        <div className="debt-stat-value">{fmt(summary.completed || 0)}</div>
                    </div>
                </div>
            </div>

            {/* ── Filter Bar + Table ── */}
            <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{sortedRecords.length} records</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                            <input className="form-input" style={{ paddingLeft: 32, width: 250 }}
                                placeholder="Search..." value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                {headers.map((h, i) => (
                                    <th key={i} style={{ textAlign: h.align }}>
                                        {h.sortKey ? (
                                            <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                onClick={() => handleSort(h.sortKey)}>
                                                <span>{h.label}</span>
                                                <span style={{ color: sortConfig.key === h.sortKey ? 'var(--accent)' : 'var(--text-muted)' }}>
                                                    {sortConfig.key === h.sortKey
                                                        ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)
                                                        : <ArrowUpDown size={14} />}
                                                </span>
                                            </div>
                                        ) : h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
                            ) : sortedRecords.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data</td></tr>
                            ) : sortedRecords.map((r, i) => (
                                <tr key={r.id || i}>
                                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{r.code}</td>
                                    <td>{r.name}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(r.amount)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className={`badge badge-${r.status === 'active' ? 'success' : 'warning'}`}>{r.status}</span>
                                    </td>
                                    <td>
                                        <div className="actions" style={{ justifyContent: 'center' }}>
                                            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}><Edit size={14} /></button>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)} style={{ padding: '4px 8px' }}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Modal ── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title"><Plus size={20} style={{ marginRight: 8 }} />Add New Item</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Name</label>
                            <input className="form-input" placeholder="Enter name..." />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Code</label>
                                <input className="form-input" placeholder="Code" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Amount</label>
                                <input className="form-input" type="number" placeholder="0" />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
