import React, { useState, useEffect } from 'react';
import {
    CheckCircle2, AlertCircle, Clock, ChevronRight, X, Sparkles,
    Database, FileSpreadsheet, FileText, Image, FileCode, Hash,
    ArrowRight, RefreshCw, AlertTriangle, Play, ShieldAlert, Layers, Search
} from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function ProfileChecklistModal({
    isOpen,
    onClose,
    profileSlug = 'newland',
    profileName = 'Newland',
    onOpenAiAssistant,
    onOpenImgDownloader,
    onOpenPdfDownloader,
    onOpenExportExcel,
    onOpenCrawlerToSheet,
    onOpenIncompleteRows
}) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'incomplete' | 'complete'
    const [expandedStepId, setExpandedStepId] = useState(null);

    useEffect(() => {
        if (isOpen && profileSlug) {
            loadChecklist();
        }
    }, [isOpen, profileSlug]);

    const loadChecklist = async () => {
        setLoading(true);
        try {
            const res = await fetchApi(`/api/products/profile-checklist?profile=${profileSlug}`);
            if (res) {
                setData(res);
            }
        } catch (err) {
            console.error('Failed to load profile checklist:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const steps = data?.steps || [];
    const overallPercent = data?.overallPercent || 0;
    const completedCount = data?.completedStepsCount || 0;
    const totalCount = data?.totalStepsCount || 9;

    const filteredSteps = steps.filter(s => {
        if (activeTab === 'incomplete') return s.percent < 100;
        if (activeTab === 'complete') return s.percent >= 100;
        return true;
    });

    const getStepIcon = (id) => {
        switch (id) {
            case 'mandatory': return <ShieldAlert size={18} style={{ color: '#ef4444' }} />;
            case 'crawl': return <Database size={18} className="text-blue-500" />;
            case 'sheet': return <FileSpreadsheet size={18} className="text-green-500" />;
            case 'sapo': return <Sparkles size={18} className="text-amber-500" />;
            case 'meta': return <FileText size={18} className="text-purple-500" />;
            case 'dich': return <FileCode size={18} className="text-indigo-500" />;
            case 'img': return <Image size={18} className="text-emerald-500" />;
            case 'pdf': return <FileText size={18} className="text-rose-500" />;
            case 'ids': return <Hash size={18} className="text-teal-500" />;
            default: return <Clock size={18} />;
        }
    };

    const handleActionClick = (stepId) => {
        onClose();
        switch (stepId) {
            case 'mandatory':
                if (onOpenIncompleteRows) onOpenIncompleteRows();
                break;
            case 'crawl':
            case 'sheet':
                if (onOpenCrawlerToSheet) onOpenCrawlerToSheet();
                break;
            case 'sapo':
            case 'meta':
            case 'dich':
                if (onOpenAiAssistant) onOpenAiAssistant(stepId);
                break;
            case 'img':
                if (onOpenImgDownloader) onOpenImgDownloader();
                break;
            case 'pdf':
                if (onOpenPdfDownloader) onOpenPdfDownloader();
                break;
            case 'ids':
                if (onOpenIncompleteRows) onOpenIncompleteRows();
                break;
            default:
                break;
        }
    };

    return (
        <div className="modal-backdrop" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16
        }}>
            <div style={{
                background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 760,
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '18px 24px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                    color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                            <Layers size={15} /> CHECKLIST TIẾN ĐỘ WORKFLOW
                        </div>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            Profile: <span style={{ color: '#38bdf8' }}>{profileName}</span>
                        </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            type="button"
                            onClick={loadChecklist}
                            disabled={loading}
                            style={{
                                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                                color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12,
                                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'transparent', border: 'none', color: '#94a3b8',
                                cursor: 'pointer', padding: 4, borderRadius: 6
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Overall Progress Banner */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                            Tổng thể hoàn thành: <span style={{ color: overallPercent === 100 ? '#16a34a' : '#0284c7' }}>{overallPercent}%</span> ({completedCount}/{totalCount} bước đạt 100%)
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                            Sản phẩm trong Sheet: <strong>{data?.totalSheetRows || 0}</strong> hàng
                        </span>
                    </div>

                    <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', width: `${overallPercent}%`,
                            background: overallPercent === 100 ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #3b82f6, #0284c7)',
                            transition: 'width 0.4s ease'
                        }} />
                    </div>

                    {/* Filter Tabs */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            style={{
                                padding: '4px 12px', fontSize: 12, borderRadius: 20, fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: activeTab === 'all' ? '#0f172a' : '#e2e8f0',
                                color: activeTab === 'all' ? '#ffffff' : '#475569'
                            }}
                        >
                            Tất cả 8 bước ({steps.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('incomplete')}
                            style={{
                                padding: '4px 12px', fontSize: 12, borderRadius: 20, fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: activeTab === 'incomplete' ? '#d97706' : '#e2e8f0',
                                color: activeTab === 'incomplete' ? '#ffffff' : '#475569'
                            }}
                        >
                            ⚠️ Cần làm ({steps.filter(s => s.percent < 100).length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('complete')}
                            style={{
                                padding: '4px 12px', fontSize: 12, borderRadius: 20, fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: activeTab === 'complete' ? '#16a34a' : '#e2e8f0',
                                color: activeTab === 'complete' ? '#ffffff' : '#475569'
                            }}
                        >
                            ✅ Hoàn thành ({steps.filter(s => s.percent >= 100).length})
                        </button>
                    </div>
                </div>

                {/* Steps List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                            Đang phân tích dữ liệu Profile {profileName}...
                        </div>
                    ) : filteredSteps.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                            Không tìm thấy bước nào phù hợp bộ lọc.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {filteredSteps.map((step, idx) => {
                                const isDone = step.percent >= 100;
                                const isExpanded = expandedStepId === step.id;

                                return (
                                    <div
                                        key={step.id}
                                        style={{
                                            border: '1px solid',
                                            borderColor: isDone ? '#bbf7d0' : (step.percent > 0 ? '#fde68a' : '#fecaca'),
                                            borderRadius: 12,
                                            background: isDone ? '#f0fdf4' : (step.percent > 0 ? '#fffbeb' : '#fef2f2'),
                                            padding: 14,
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                            {/* Icon & Title */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 10,
                                                    background: '#ffffff', border: '1px solid #e2e8f0',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {getStepIcon(step.id)}
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                                                            Bước {idx + 1}: {step.name}
                                                        </span>
                                                        {isDone ? (
                                                            <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <CheckCircle2 size={12} /> HOÀN THÀNH
                                                            </span>
                                                        ) : step.percent > 0 ? (
                                                            <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <AlertTriangle size={12} /> ĐANG LÀM ({step.percent}%)
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                                                CHƯA LÀM (0%)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                                        {step.desc}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats & Action Button */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                                        {step.done}/{step.total} sản phẩm
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>
                                                        {step.percent}% đạt chuẩn
                                                    </div>
                                                </div>

                                                {!isDone && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleActionClick(step.id)}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                                            color: '#ffffff', border: 'none', borderRadius: 8,
                                                            padding: '6px 14px', fontSize: 12, fontWeight: 700,
                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                            cursor: 'pointer', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                                                        }}
                                                    >
                                                        <Play size={13} /> Thực hiện ngay
                                                    </button>
                                                )}

                                                {step.missing && step.missing.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                                                        style={{
                                                            background: 'transparent', border: '1px solid #cbd5e1',
                                                            color: '#475569', borderRadius: 8, padding: '6px 10px',
                                                            fontSize: 12, cursor: 'pointer'
                                                        }}
                                                    >
                                                        {isExpanded ? 'Ẩn danh sách' : `Xem ${step.missing.length} hàng thiếu`}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Missing Items Details Accordion */}
                                        {isExpanded && step.missing && step.missing.length > 0 && (
                                            <div style={{
                                                marginTop: 12, paddingTop: 12, borderTop: '1px dashed #cbd5e1',
                                                background: '#ffffff', padding: 10, borderRadius: 8
                                            }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
                                                    ⚠️ Các hàng sản phẩm chưa điền đủ {step.name}:
                                                </div>
                                                <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11.5, color: '#334155' }}>
                                                    {step.missing.map((m, idx) => (
                                                        <div key={idx} style={{ padding: '3px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>📍 Tab: <strong>{m.sheet}</strong> - Dòng <strong>{m.row}</strong></span>
                                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{m.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div style={{
                    padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        💡 Mẹo: Nhấn nút <strong>"Thực hiện ngay"</strong> để tự động mở đúng tính năng cần bổ sung.
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        {onOpenIncompleteRows && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenIncompleteRows();
                                }}
                                style={{
                                    padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
                                    background: '#ffffff', color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                <Search size={14} /> Xem các dòng chưa hoàn thiện
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 18px', borderRadius: 8, border: '1px solid #cbd5e1',
                                background: '#ffffff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer'
                            }}
                        >
                            Đóng
                        </button>
                        {onOpenExportExcel && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenExportExcel();
                                }}
                                style={{
                                    padding: '8px 18px', borderRadius: 8, border: 'none',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                📥 Sang màn xuất Excel
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
