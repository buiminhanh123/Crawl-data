import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, X, Layers } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function ExportExcelModal({ isOpen, onClose, defaultProfileSlug = 'newland', profiles = [] }) {
    const [selectedProfile, setSelectedProfile] = useState(defaultProfileSlug);
    const [sheets, setSheets] = useState([]);
    const [selectedSheetNames, setSelectedSheetNames] = useState([]);
    const [exportMode, setExportMode] = useState('template'); // 'template' (31 cols) or 'raw'
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (defaultProfileSlug && isOpen) {
            setSelectedProfile(defaultProfileSlug);
            fetchProfileSheets(defaultProfileSlug);
        }
    }, [defaultProfileSlug, isOpen]);

    const fetchProfileSheets = async (slug) => {
        if (!slug) return;
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${slug}`);
            if (data?.sheets && data.sheets.length > 0) {
                setSheets(data.sheets);
                setSelectedSheetNames(data.sheets.map(s => s.name));
            } else {
                setSheets([]);
                setSelectedSheetNames([]);
            }
        } catch (e) {
            setSheets([]);
            setSelectedSheetNames([]);
        }
    };

    const handleProfileChange = (e) => {
        const slug = e.target.value;
        setSelectedProfile(slug);
        fetchProfileSheets(slug);
    };

    const handleToggleSheet = (name) => {
        setSelectedSheetNames(prev => 
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const handleSelectAll = () => {
        if (selectedSheetNames.length === sheets.length) {
            setSelectedSheetNames([]);
        } else {
            setSelectedSheetNames(sheets.map(s => s.name));
        }
    };

    const handleDownload = async () => {
        if (!selectedProfile) return alert('Vui lòng chọn Profile!');
        if (selectedSheetNames.length === 0) return alert('Vui lòng chọn ít nhất 1 Tab Sheet để xuất!');

        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/products/export-excel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    profile: selectedProfile,
                    sheetNames: selectedSheetNames,
                    mode: exportMode
                })
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `Export failed with status ${res.status}`);
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Export_${selectedProfile}_${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            onClose();
        } catch (err) {
            alert('Lỗi xuất file Excel: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div className="modal-content" style={{
                background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 540,
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden', border: '1px solid #e2e8f0'
            }}>
                <div style={{
                    padding: '20px 24px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                    color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileSpreadsheet style={{ color: '#10b981' }} size={24} />
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Xuất File Excel (.xlsx) Sản Phẩm</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Choose Profile */}
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                            1. Chọn Profile Sản Phẩm:
                        </label>
                        <select
                            value={selectedProfile}
                            onChange={handleProfileChange}
                            style={{
                                width: '100%', padding: '10px 14px', borderRadius: 8,
                                border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 14, fontWeight: 500
                            }}
                        >
                            {profiles.map(p => (
                                <option key={p.slug} value={p.slug}>
                                    {p.name.startsWith('Profile') ? p.name : `Profile ${p.name}`} ({p.slug})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Choose Sheets */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                                2. Chọn Tab Sheet Cần Xuất ({selectedSheetNames.length}/{sheets.length}):
                            </label>
                            {sheets.length > 0 && (
                                <button
                                    onClick={handleSelectAll}
                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {selectedSheetNames.length === sheets.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                </button>
                            )}
                        </div>

                        <div style={{
                            maxHeight: 160, overflowY: 'auto', border: '1px solid #e2e8f0',
                            borderRadius: 8, padding: 10, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6
                        }}>
                            {sheets.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>
                                    Không có Tab Sheet nào trong Profile này
                                </div>
                            ) : (
                                sheets.map(s => (
                                    <label key={s.name} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                                        borderRadius: 6, background: selectedSheetNames.includes(s.name) ? '#eff6ff' : '#ffffff',
                                        border: `1px solid ${selectedSheetNames.includes(s.name) ? '#bfdbfe' : '#e2e8f0'}`,
                                        cursor: 'pointer', fontSize: 13, fontWeight: 500
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedSheetNames.includes(s.name)}
                                            onChange={() => handleToggleSheet(s.name)}
                                        />
                                        <Layers size={14} style={{ color: '#64748b' }} />
                                        <span>{s.name}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                                            ({(s.data?.length || 1) - 1} hàng)
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Export Mode */}
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                            3. Định Dạng Cấu Trúc Xuất File:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div
                                onClick={() => setExportMode('template')}
                                style={{
                                    border: `2px solid ${exportMode === 'template' ? '#10b981' : '#e2e8f0'}`,
                                    borderRadius: 10, padding: 12, cursor: 'pointer', background: exportMode === 'template' ? '#f0fdf4' : '#ffffff'
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 700, color: exportMode === 'template' ? '#047857' : '#334155' }}>
                                    ✅ Mẫu Chuẩn (31 Cột)
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                    Khớp 100% mẫu mau-them-san-pham-17-07-2026.xlsx
                                </div>
                            </div>

                            <div
                                onClick={() => setExportMode('raw')}
                                style={{
                                    border: `2px solid ${exportMode === 'raw' ? '#3b82f6' : '#e2e8f0'}`,
                                    borderRadius: 10, padding: 12, cursor: 'pointer', background: exportMode === 'raw' ? '#eff6ff' : '#ffffff'
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 700, color: exportMode === 'raw' ? '#1d4ed8' : '#334155' }}>
                                    📑 Giữ Nguyên Cột Gốc
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                    Xuất từng Tab Sheet thành từng Sheet riêng biệt
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'flex-end', gap: 12
                }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={exporting || selectedSheetNames.length === 0}
                        style={{
                            padding: '10px 20px', borderRadius: 8, border: 'none',
                            background: exporting ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff', cursor: exporting ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <Download size={16} />
                        <span>{exporting ? 'Đang tạo file Excel...' : 'Tải File Excel Ngay'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
