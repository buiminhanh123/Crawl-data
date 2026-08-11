import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, X, Layers, AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert, Search } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function ExportExcelModal({
    isOpen,
    onClose,
    defaultProfileSlug = 'newland',
    profiles = [],
    onOpenChecklist,
    onOpenIncompleteRows
}) {
    const [sheets, setSheets] = useState([]);
    const [selectedSheetNames, setSelectedSheetNames] = useState([]);
    const [exportMode, setExportMode] = useState('template'); // 'template' (31 cols) or 'raw'
    const [exporting, setExporting] = useState(false);
    const [checklistData, setChecklistData] = useState(null);
    const [loadingChecklist, setLoadingChecklist] = useState(false);

    const [showWarningModal, setShowWarningModal] = useState(false);
    const MIN_COMPLETENESS_THRESHOLD = 85;

    // Tìm tên hiển thị của profile hiện tại
    const currentProfile = profiles.find(p => p.slug === defaultProfileSlug);
    const currentProfileName = currentProfile
        ? (currentProfile.name.startsWith('Profile') ? currentProfile.name : `Profile ${currentProfile.name}`)
        : defaultProfileSlug;

    useEffect(() => {
        if (defaultProfileSlug && isOpen) {
            fetchProfileSheets(defaultProfileSlug);
            fetchChecklist(defaultProfileSlug);
        }
    }, [defaultProfileSlug, isOpen]);

    const fetchChecklist = async (slug) => {
        setLoadingChecklist(true);
        try {
            const data = await fetchApi(`/api/products/profile-checklist?profile=${slug}`);
            if (data) setChecklistData(data);
        } catch (e) {
            setChecklistData(null);
        } finally {
            setLoadingChecklist(false);
        }
    };

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

    const handleInitiateDownload = () => {
        if (!defaultProfileSlug) return alert('Không tìm thấy Profile hiện tại!');
        if (selectedSheetNames.length === 0) return alert('Vui lòng chọn ít nhất 1 Tab Sheet để xuất!');

        const isLockEnabled = (() => {
            try {
                const saved = typeof window !== 'undefined' ? localStorage.getItem('newland_lock_export_mandatory') : null;
                return saved !== null ? JSON.parse(saved) : true;
            } catch (e) {
                return true;
            }
        })();

        if (isLockEnabled && checklistData && checklistData.mandatoryMissingCount > 0) {
            alert(`🔴 CƯỠNG CHẾ KHÔNG CHO XUẤT FILE!\n\nCó ${checklistData.mandatoryMissingCount} hàng thiếu thông tin ở các trường bắt buộc.\n\nVui lòng bấm nút "Xem các dòng thiếu" để hoàn thiện dữ liệu hoặc tắt cài đặt Khóa cứng xuất file.`);
            return;
        }

        if (checklistData && checklistData.overallPercent < MIN_COMPLETENESS_THRESHOLD) {
            setShowWarningModal(true);
            return;
        }

        executeDownload();
    };

    const executeDownload = async () => {
        setShowWarningModal(false);
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
                    profile: defaultProfileSlug,
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
            a.download = `Export_${defaultProfileSlug}_${Date.now()}.xlsx`;
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

    const mandatoryMissingCount = checklistData?.mandatoryMissingCount || 0;
    const isMandatoryBlocked = mandatoryMissingCount > 0;
    const isBelowThreshold = checklistData && checklistData.overallPercent < MIN_COMPLETENESS_THRESHOLD;

    return (
        <div className="modal-backdrop" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div className="modal-content" style={{
                background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 560,
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden', border: '1px solid #e2e8f0',
                position: 'relative'
            }}>
                {/* Header */}
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

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Profile hiện tại */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8,
                        background: '#f0fdf4', border: '1px solid #bbf7d0'
                    }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>📂 Profile đang dùng:</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>
                            {currentProfileName} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({defaultProfileSlug})</span>
                        </span>
                    </div>

                    {/* STRICT MANDATORY FIELD ENFORCEMENT BANNER */}
                    {isMandatoryBlocked ? (
                        <div style={{
                            padding: '14px 16px', borderRadius: 10,
                            background: '#fff1f2', border: '1px solid #fecdd3',
                            display: 'flex', flexDirection: 'column', gap: 8
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#e11d48', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ShieldAlert size={18} /> CƯỠNG CHẾ KHÔNG CHO XUẤT FILE ({mandatoryMissingCount} HÀNG THIẾU)
                                </span>

                                {onOpenIncompleteRows && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenIncompleteRows();
                                        }}
                                        style={{
                                            background: '#e11d48', color: '#ffffff', border: 'none',
                                            borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                        }}
                                    >
                                        <Search size={13} /> Xem dòng thiếu
                                    </button>
                                )}
                            </div>

                            <div style={{ fontSize: 12, color: '#9f1239', lineHeight: 1.5 }}>
                                🔴 Phát hiện <strong>{mandatoryMissingCount} hàng</strong> thiếu 3 trường màu đỏ bắt buộc (<strong>Mã SP</strong>, <strong>Tên SP</strong>, <strong>ID Danh Mục</strong>). Hệ thống cưỡng chế chặn xuất file để đảm bảo chất lượng dữ liệu.
                            </div>
                        </div>
                    ) : checklistData && (
                        <div style={{
                            padding: '12px 14px', borderRadius: 8,
                            background: !isBelowThreshold ? '#f0fdf4' : '#fff1f2',
                            border: '1px solid',
                            borderColor: !isBelowThreshold ? '#bbf7d0' : '#fecdd3',
                            display: 'flex', flexDirection: 'column', gap: 6
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: !isBelowThreshold ? '#15803d' : '#e11d48', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {!isBelowThreshold ? (
                                        <><CheckCircle2 size={16} /> Checklist Đạt {checklistData.overallPercent}% Tiến Độ (Đủ điều kiện xuất ≥ 85%)</>
                                    ) : (
                                        <><AlertTriangle size={16} /> Cảnh Báo: Tiến Độ {checklistData.overallPercent}% (Dưới Ngưỡng Tối Thiểu 85%)</>
                                    )}
                                </span>

                                {onOpenChecklist && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenChecklist();
                                        }}
                                        style={{
                                            background: 'transparent', border: 'none', color: '#2563eb',
                                            fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                        }}
                                    >
                                        Xem Chi Tiết <ArrowRight size={13} />
                                    </button>
                                )}
                            </div>

                            {isBelowThreshold && (
                                <div style={{ fontSize: 12, color: '#9f1239' }}>
                                    ⚠️ Độ hoàn thiện chưa đạt <strong>85%</strong> (hiện tại: {checklistData.overallPercent}%). Còn {checklistData.totalStepsCount - checklistData.completedStepsCount} bước chưa xong. File xuất ra có thể thiếu dữ liệu quan trọng.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Choose Sheets */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                                1. Chọn Tab Sheet Cần Xuất ({selectedSheetNames.length}/{sheets.length}):
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
                            2. Định Dạng Cấu Trúc Xuất File:
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
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        {onOpenIncompleteRows && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenIncompleteRows();
                                }}
                                style={{
                                    background: 'transparent', border: '1px solid #cbd5e1',
                                    color: '#475569', borderRadius: 8, padding: '8px 14px',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                <Search size={14} /> Xem Các Dòng Chưa Hoàn Thiện
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={onClose}
                            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleInitiateDownload}
                            disabled={exporting || selectedSheetNames.length === 0 || isMandatoryBlocked}
                            style={{
                                padding: '10px 20px', borderRadius: 8, border: 'none',
                                background: exporting ? '#94a3b8' : (isMandatoryBlocked ? '#ef4444' : (isBelowThreshold ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)')),
                                color: '#ffffff', cursor: (exporting || isMandatoryBlocked) ? 'not-allowed' : 'pointer',
                                fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                                opacity: isMandatoryBlocked ? 0.8 : 1
                            }}
                        >
                            {isMandatoryBlocked ? <ShieldAlert size={16} /> : <Download size={16} />}
                            <span>
                                {exporting ? 'Đang tạo file Excel...' : (isMandatoryBlocked ? '🚫 Cưỡng Chế Chặn Xuất File' : (isBelowThreshold ? 'Xuất File (< 85%)' : 'Tải File Excel Ngay'))}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Confirm Warning Overlay when Completeness < 85% */}
                {showWarningModal && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(5px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 24, zIndex: 10
                    }}>
                        <div style={{
                            background: '#ffffff', borderRadius: 14, padding: 24,
                            maxWidth: 420, width: '100%', textAlign: 'center',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.37)'
                        }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: '50%', background: '#fee2e2',
                                color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px'
                            }}>
                                <AlertTriangle size={28} />
                            </div>

                            <h4 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                                Cảnh Báo: Độ Hoàn Thiện Dưới 85%
                            </h4>

                            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                                Profile <strong>{currentProfileName}</strong> mới đạt <strong>{checklistData?.overallPercent}%</strong> tiến độ. File xuất ra có thể thiếu các trường dữ liệu quan trọng như SAPO, ảnh, PDF hoặc danh mục.
                            </p>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button
                                    onClick={() => setShowWarningModal(false)}
                                    style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 8,
                                        border: '1px solid #cbd5e1', background: '#ffffff',
                                        color: '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 600
                                    }}
                                >
                                    Quay lại bổ sung
                                </button>
                                <button
                                    onClick={executeDownload}
                                    style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 8,
                                        border: 'none', background: '#e11d48',
                                        color: '#ffffff', cursor: 'pointer', fontSize: 13, fontWeight: 700
                                    }}
                                >
                                    Vẫn xuất file
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
