'use client';
import { useState, useEffect, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import {
    X, Play, Square, Save, Trash2, RefreshCw,
    Loader2, Download, Database, FileSpreadsheet,
    Eye, Zap, Settings, ChevronDown, FolderOpen, AlertCircle, FileText, Cloud, CheckCircle2, ShieldCheck, Link2
} from 'lucide-react';

const SHEET_DEFAULTS = {
    sheetInput: '', sheetName: '', headerRow: 2, dataStartRow: 3,
    colBrand: 'C', colMainCategory: 'B', colSubCategory: 'NONE', colSeries: 'NONE', colModel: 'F', colPdfUrl: 'J', colResult: 'K',
    filenamePattern: '{model}.pdf',
    batchStart: 1, batchEnd: 0,
};

const PROFILE_MAPPING_DEFAULTS = {
    profBrand: 'profile_slug',
    profMainCategory: 'main_category',
    profSubCategory: 'NONE',
    profSeries: 'NONE',
    profModel: 'part_number',
    profPdfUrl: 'download_links',
    resultCol: 'drive_link',
    pdfFilterMode: 'datasheet_only', // 'datasheet_only' | 'all_pdfs' | 'keywords'
    keywords: 'datasheet, manual, guide, brochure',
    filenamePattern: '{model}.pdf'
};

export default function PdfDownloaderModal({ isOpen, onClose, onSuccess, onConvertSuccess }) {
    // ── Tabs & Mode ──
    const [activeTab, setActiveTab]   = useState('config');   // 'config' | 'inspect' | 'progress'
    const [mode, setMode]             = useState('profile');   // 'profile' | 'sheet'

    // ── Profile mode state ──
    const [profileStats, setProfileStats]   = useState([]);   // [{profile_slug, total_products, with_pdf}]
    const [selectedProfile, setSelectedProfile] = useState('');
    const [profileColumns, setProfileColumns]   = useState([]);   // header columns from profile sheet
    const [categories, setCategories]       = useState([]);
    const [seriesList, setSeriesList]       = useState([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [seriesFilter, setSeriesFilter]   = useState('');
    const [profMapping, setProfMapping]     = useState({ ...PROFILE_MAPPING_DEFAULTS });
    const [profilePreview, setProfilePreview] = useState(null); // {totalTasks, modelCount, seriesCount, preview[]}
    const [loadingStats, setLoadingStats]   = useState(false);
    const [loadingCats, setLoadingCats]     = useState(false);
    const [previewing, setPreviewing]       = useState(false);

    // ── Sheet mode state ──
    const [sheetCfg, setSheetCfg] = useState({ ...SHEET_DEFAULTS });

    // ── General Config state (Drive Folder & Deduplication) ──
    const [driveFolderId, setDriveFolderId] = useState('');
    const [deduplicate, setDeduplicate]     = useState(true);
    const [concurrency, setConcurrency]     = useState(10);
    const [configs, setConfigs]           = useState({});
    const [selectedConfig, setSelectedConfig] = useState('');
    const [saveName, setSaveName]         = useState('');
    const [driveConnected, setDriveConnected] = useState(false);

    // ── Execution state ──
    const [isRunning, setIsRunning]   = useState(false);
    const [starting, setStarting]     = useState(false);
    const [status, setStatus]         = useState(null);
    const [msg, setMsg]               = useState({ text: '', type: '' });

    const pollTimerRef = useRef(null);

    // ── Fetch Profile Stats, Drive Config & Saved Configs on open ──
    useEffect(() => {
        if (isOpen) {
            loadProfileStats();
            loadConfigs();
            loadDriveConfig();
            fetchStatus();
        }
    }, [isOpen]);

    // ── Fetch Categories & Column Headers when selectedProfile changes ──
    useEffect(() => {
        if (selectedProfile) {
            fetchCategoriesAndSeries(selectedProfile);
            fetchProfileColumns(selectedProfile);
            setCategoryFilter('');
            setSeriesFilter('');
            setProfilePreview(null);
        }
    }, [selectedProfile]);

    // ── Polling status when running ──
    useEffect(() => {
        if (isOpen && isRunning) {
            pollTimerRef.current = setInterval(fetchStatus, 2000);
        } else {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
        return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
    }, [isOpen, isRunning]);

    const showMsg = (text, type = 'info') => {
        setMsg({ text, type });
        setTimeout(() => setMsg({ text: '', type: '' }), 5000);
    };

    const loadDriveConfig = async () => {
        try {
            const cfg = await fetchApi('/api/google-drive/config', { silent: true });
            if (cfg) {
                setDriveConnected(!!cfg.isConnected);
                if (cfg.parentFolderId && !driveFolderId) {
                    setDriveFolderId(cfg.parentFolderId);
                }
            }
        } catch (e) {}
    };

    const loadProfileStats = async () => {
        setLoadingStats(true);
        try {
            const data = await fetchApi('/api/pdf-downloader/profile-stats', { silent: true });
            if (data?.stats) {
                setProfileStats(data.stats);
                if (data.stats.length > 0 && !selectedProfile) {
                    setSelectedProfile(data.stats[0].profile_slug);
                }
            }
        } catch (e) {}
        finally { setLoadingStats(false); }
    };

    const loadConfigs = async () => {
        try {
            const data = await fetchApi('/api/pdf-downloader/configs', { silent: true });
            if (data) setConfigs(data);
        } catch (e) {}
    };

    const fetchCategoriesAndSeries = async (slug) => {
        setLoadingCats(true);
        try {
            const data = await fetchApi(`/api/products/categories?profile=${encodeURIComponent(slug)}`, { silent: true });
            setCategories(data?.categories || []);
            setSeriesList(data?.series || []);
        } catch (e) {}
        finally { setLoadingCats(false); }
    };

    const fetchProfileColumns = async (slug) => {
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${encodeURIComponent(slug)}`, { silent: true });
            const allHeaders = new Set();

            const isCssOrInvalid = (s) => {
                if (!s || typeof s !== 'string') return true;
                const str = String(s).trim();
                if (!str || str.length > 100) return true;
                if (/^\d+$/.test(str)) return true;                              // pure numbers
                if (/:nth-child|:nth-of-type|:first-child|:last-child/i.test(str)) return true; // CSS pseudo
                if (str.includes(' > ') || str.startsWith('//') || str.startsWith('/html')) return true; // CSS combinator / XPath
                if (/^[.#]/.test(str) || /<[a-z]/i.test(str)) return true;     // CSS class/id / HTML tag
                return false;
            };

            for (const sheet of (data?.sheets || [])) {
                if (!sheet.data || sheet.data.length === 0) continue;
                // Try rows 0, 1, 2 — find first row with at least 2 valid (non-CSS) headers
                for (let i = 0; i < Math.min(3, sheet.data.length); i++) {
                    const row = sheet.data[i];
                    const valid = row.filter(h => h && !isCssOrInvalid(String(h)));
                    if (valid.length >= 2) {
                        valid.forEach(h => allHeaders.add(String(h).trim()));
                        break; // use this row, skip others
                    }
                }
            }

            setProfileColumns(allHeaders.size > 0 ? [...allHeaders] : []);
        } catch (e) {
            setProfileColumns([]);
        }
    };

    const fetchStatus = async () => {
        try {
            const s = await fetchApi('/api/pdf-downloader/status', { silent: true });
            if (s) {
                setStatus(s);
                const running = s.status === 'running' || s.status === 'loading';
                setIsRunning(running);
            }
        } catch (e) {}
    };

    const handleProfilePreview = async () => {
        if (!selectedProfile) return;
        setPreviewing(true);
        setProfilePreview(null);
        try {
            const data = await fetchApi('/api/pdf-downloader/preview-profile', {
                method: 'POST',
                body: JSON.stringify({ profileSlug: selectedProfile, categoryFilter, seriesFilter, driveFolderId, ...profMapping })
            });
            setProfilePreview(data);
            setActiveTab('inspect');
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
        } finally { setPreviewing(false); }
    };

    const handleStart = async () => {
        setMsg({ text: '', type: '' });
        if (!driveFolderId?.trim()) return showMsg('⚠️ Nhập Google Drive Target Folder ID trước khi chạy', 'warn');
        if (mode === 'profile' && !selectedProfile) return showMsg('⚠️ Chọn Profile trước', 'warn');
        if (mode === 'sheet' && (!sheetCfg.sheetInput || !sheetCfg.sheetName)) return showMsg('⚠️ Nhập URL Sheet và tên Sheet', 'warn');

        setStarting(true);
        try {
            const body = { mode, driveFolderId, concurrency, deduplicate, ...(mode === 'profile'
                ? { profileSlug: selectedProfile, categoryFilter, seriesFilter, ...profMapping }
                : { ...sheetCfg }) };

            await fetchApi('/api/pdf-downloader/start', { method: 'POST', body: JSON.stringify(body) });
            onClose();
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
        } finally { setStarting(false); }
    };

    const handleStop  = async () => { try { await fetchApi('/api/pdf-downloader/stop', { method: 'POST' }); await fetchStatus(); } catch (e) {} };
    const handleReset = async () => { try { await fetchApi('/api/pdf-downloader/reset', { method: 'POST' }); setStatus(null); setIsRunning(false); setActiveTab('config'); } catch (e) {} };

    const applyConfig = (name) => {
        if (!name || !configs[name]) return;
        setSelectedConfig(name);
        setSaveName(name);
        const c = configs[name];
        if (c.mode) setMode(c.mode);
        if (c.driveFolderId) setDriveFolderId(c.driveFolderId);
        if (c.concurrency) setConcurrency(c.concurrency);
        if (c.deduplicate !== undefined) setDeduplicate(c.deduplicate);
        if (c.selectedProfile) setSelectedProfile(c.selectedProfile);
        if (c.categoryFilter !== undefined) setCategoryFilter(c.categoryFilter);
        if (c.seriesFilter !== undefined) setSeriesFilter(c.seriesFilter);
        if (c.profMapping) setProfMapping({ ...PROFILE_MAPPING_DEFAULTS, ...c.profMapping });
        if (c.sheetCfg) setSheetCfg({ ...SHEET_DEFAULTS, ...c.sheetCfg });
        showMsg(`✅ Đã tải cấu hình: "${name}"`, 'success');
    };

    const handleSaveConfig = async () => {
        const name = saveName.trim();
        if (!name) return showMsg('⚠️ Nhập tên cấu hình', 'warn');
        try {
            await fetchApi(`/api/pdf-downloader/configs/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify({ mode, driveFolderId, concurrency, deduplicate, selectedProfile, categoryFilter, seriesFilter, profMapping, sheetCfg })
            });
            setSelectedConfig(name);
            await loadConfigs();
            showMsg(`✅ Đã lưu cấu hình mới: "${name}"`, 'success');
        } catch (e) { showMsg('❌ Lỗi lưu cấu hình', 'error'); }
    };

    const handleUpdateActiveConfig = async () => {
        const name = (selectedConfig || saveName).trim();
        if (!name) return showMsg('⚠️ Vui lòng chọn một cấu hình để cập nhật', 'warn');
        try {
            await fetchApi(`/api/pdf-downloader/configs/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify({ mode, driveFolderId, concurrency, deduplicate, selectedProfile, categoryFilter, seriesFilter, profMapping, sheetCfg })
            });
            await loadConfigs();
            showMsg(`✅ Đã cập nhật thành công cấu hình: "${name}"`, 'success');
        } catch (e) { showMsg('❌ Lỗi cập nhật cấu hình', 'error'); }
    };

    const handleAutoFillLinks = async () => {
        if (!selectedProfile) return showMsg('⚠️ Chọn Profile trước', 'warn');
        if (!driveFolderId?.trim()) return showMsg('⚠️ Nhập Google Drive Target Folder ID trước khi điền link', 'warn');
        if (!profMapping.resultCol || profMapping.resultCol.toUpperCase() === 'NONE') {
            return showMsg('⚠️ Chọn Cột Link Kết Quả trước khi điền link', 'warn');
        }

        setStarting(true);
        showMsg('⏳ Đang quét Google Drive & điền link tự động vào Sheet...', 'warn');
        try {
            const body = {
                profileSlug: selectedProfile,
                driveFolderId,
                resultCol: profMapping.resultCol,
                categoryFilter,
                seriesFilter,
                ...profMapping
            };

            const res = await fetchApi('/api/pdf-downloader/auto-fill-links', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const successText = `🎉 Đã tự động điền thành công ${res.updatedCount}/${res.totalTasks} link PDF Drive vào cột "${profMapping.resultCol}"!`;
            showMsg(successText, 'success');
            alert(successText);

            try {
                window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug: selectedProfile } }));
            } catch (e) {}

            if (typeof onSuccess === 'function') onSuccess();
            else if (typeof onConvertSuccess === 'function') onConvertSuccess();
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
            alert(`❌ Lỗi điền link: ${e.message}`);
        } finally {
            setStarting(false);
        }
    };

    const handleDeleteConfig = async (name) => {
        if (!name || !window.confirm(`Xóa cấu hình "${name}"?`)) return;
        try { await fetchApi(`/api/pdf-downloader/configs/${encodeURIComponent(name)}`, { method: 'DELETE' }); setSelectedConfig(''); setSaveName(''); await loadConfigs(); }
        catch (e) { showMsg('❌ Lỗi xóa', 'error'); }
    };

    const setSheet = (key, val) => setSheetCfg(prev => ({ ...prev, [key]: val }));

    if (!isOpen) return null;

    // Styles
    const mOverlayS = {
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    };
    const mCardS = {
        width: '100%', maxWidth: 880, maxHeight: '90vh',
        background: 'var(--bg-card, #ffffff)', borderRadius: 16,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--border-color, #e2e8f0)'
    };
    const mHeadS = {
        padding: '16px 24px', background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    };
    const sS = { padding: 16, borderRadius: 12, border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-muted, #f8fafc)', marginBottom: 12 };
    const sT = { fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-main, #1e293b)', display: 'flex', alignItems: 'center', gap: 6 };
    const lS = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 };
    const iS = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--bg-card, #fff)', color: 'var(--text-main, #0f172a)', fontSize: 13 };

    return (
        <div style={mOverlayS} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={mCardS}>
                {/* Header */}
                <div style={mHeadS}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ padding: 8, borderRadius: 10, background: 'rgba(255,255,255,0.2)' }}>
                            <Cloud size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>PDF & Datasheet Downloader (Google Drive Direct Upload)</h3>
                            <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Tải PDF từ Profile/Sheet ➔ Upload lên Drive ➔ Tự động ghi lại Link Drive vào Cột chỉ định</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8 }} hover={{ opacity: 1 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: '#f1f5f9' }}>
                    <button onClick={() => setActiveTab('config')} style={{
                        flex: 1, padding: '12px 16px', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        background: activeTab === 'config' ? '#fff' : 'transparent',
                        color: activeTab === 'config' ? '#1d4ed8' : '#64748b',
                        borderBottom: activeTab === 'config' ? '2.5px solid #2563eb' : 'none'
                    }}>
                        ⚙️ 1. Cấu hình Drive & Cột Ghi Kết Quả
                    </button>
                    <button onClick={() => setActiveTab('inspect')} style={{
                        flex: 1, padding: '12px 16px', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        background: activeTab === 'inspect' ? '#fff' : 'transparent',
                        color: activeTab === 'inspect' ? '#1d4ed8' : '#64748b',
                        borderBottom: activeTab === 'inspect' ? '2.5px solid #2563eb' : 'none'
                    }}>
                        🔍 2. Kiểm tra & Scope Tài liệu
                    </button>
                    <button onClick={() => setActiveTab('progress')} style={{
                        flex: 1, padding: '12px 16px', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        background: activeTab === 'progress' ? '#fff' : 'transparent',
                        color: activeTab === 'progress' ? '#1d4ed8' : '#64748b',
                        borderBottom: activeTab === 'progress' ? '2.5px solid #2563eb' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}>
                        📊 3. Tiến trình Upload {isRunning && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />}
                    </button>
                </div>

                {/* Content Body */}
                <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                    {msg.text && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
                            background: msg.type === 'error' ? '#fef2f2' : msg.type === 'warn' ? '#fffbebf' : '#f0fdf4',
                            color: msg.type === 'error' ? '#dc2626' : msg.type === 'warn' ? '#d97706' : '#16a34a',
                            border: `1px solid ${msg.type === 'error' ? '#fca5a5' : msg.type === 'warn' ? '#fde68a' : '#bbf7d0'}`
                        }}>
                            {msg.text}
                        </div>
                    )}

                    {activeTab === 'config' && (
                        <>
                            {/* Target Drive Folder Section */}
                            <section style={{ ...sS, background: '#eff6ff', borderColor: '#bfdbfe' }}>
                                <div style={{ ...sT, color: '#1e40af' }}>
                                    <Cloud size={18} /> Cấu hình Google Drive Target Folder
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div>
                                        <label style={lS}>Google Drive Target Folder ID (nơi lưu file PDF trực tiếp)</label>
                                        <input
                                            style={{ ...iS, fontFamily: 'monospace', fontWeight: 600 }}
                                            placeholder="Ví dụ: 1a2b3c4d5e6f7g8h9i0j..."
                                            value={driveFolderId}
                                            onChange={e => setDriveFolderId(e.target.value)}
                                            disabled={isRunning}
                                        />
                                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                            💡 Tất cả file PDF sẽ được upload thẳng vào Folder này trên Google Drive (không tạo folder con). Sau khi upload sẽ tự sinh link <strong>webViewLink</strong> công khai để ghi vào cột kết quả bên dưới.
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Mode Selector */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                <button onClick={() => setMode('profile')} disabled={isRunning} style={{
                                    padding: '12px 16px', borderRadius: 10, border: '2px solid',
                                    borderColor: mode === 'profile' ? '#2563eb' : 'var(--border-color, #e2e8f0)',
                                    background: mode === 'profile' ? '#eff6ff' : 'var(--bg-card, #fff)',
                                    color: mode === 'profile' ? '#1d4ed8' : 'var(--text-secondary, #64748b)',
                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10
                                }}>
                                    <Database size={20} />
                                    <div>
                                        <div>📦 Từ Profile (DB)</div>
                                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>Tải PDF của sản phẩm đã crawl trong DB</div>
                                    </div>
                                </button>
                                <button onClick={() => setMode('sheet')} disabled={isRunning} style={{
                                    padding: '12px 16px', borderRadius: 10, border: '2px solid',
                                    borderColor: mode === 'sheet' ? '#2563eb' : 'var(--border-color, #e2e8f0)',
                                    background: mode === 'sheet' ? '#eff6ff' : 'var(--bg-card, #fff)',
                                    color: mode === 'sheet' ? '#1d4ed8' : 'var(--text-secondary, #64748b)',
                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10
                                }}>
                                    <FileSpreadsheet size={20} />
                                    <div>
                                        <div>📊 Từ Google Sheet</div>
                                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>Tải PDF từ danh sách URL trong Sheet</div>
                                    </div>
                                </button>
                            </div>

                            {/* ── PROFILE MODE ── */}
                            {mode === 'profile' && (
                                <section style={sS}>
                                    <div style={sT}>📦 Chọn Profile & Cấu hình Mapping Dữ liệu</div>

                                    {loadingStats ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}><Loader2 size={24} className="animate-spin" /> Đang tải dữ liệu...</div>
                                    ) : (
                                        <>
                                            {/* Profile Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
                                                {profileStats.map(p => (
                                                    <button key={p.profile_slug} onClick={() => setSelectedProfile(p.profile_slug)} disabled={isRunning} style={{
                                                        padding: '10px 12px', borderRadius: 8, border: '1.5px solid',
                                                        borderColor: selectedProfile === p.profile_slug ? '#2563eb' : 'var(--border-color, #cbd5e1)',
                                                        background: selectedProfile === p.profile_slug ? '#eff6ff' : '#fff',
                                                        textAlign: 'left', cursor: 'pointer'
                                                    }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{p.profile_slug}</div>
                                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                            📄 <span style={{ color: '#15803d', fontWeight: 700 }}>{(p.with_pdf || 0).toLocaleString('vi-VN')}</span> PDF
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{(p.total_products || 0).toLocaleString('vi-VN')} sp</div>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* 6 Customizable Mapping Boxes for Profile Mode */}
                                            {selectedProfile && (
                                                <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                                                        Mapping trường dữ liệu (chọn <strong>NONE</strong> để bỏ qua):
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                                                        {[  
                                                            { label: 'Hãng', key: 'profBrand' },
                                                            { label: 'DM chính', key: 'profMainCategory' },
                                                            { label: 'DM con', key: 'profSubCategory' },
                                                            { label: 'Series', key: 'profSeries' },
                                                            { label: 'Mã SP', key: 'profModel' },
                                                            { label: '📄 Cột URL PDF', key: 'profPdfUrl' },
                                                        ].map(({ label, key }) => (
                                                            <div key={key}>
                                                                <label style={{ ...lS, fontSize: 10 }}>{label}</label>
                                                                <select
                                                                    style={{ ...iS, padding: '6px 4px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                                                    value={profMapping[key]}
                                                                    onChange={e => setProfMapping(p => ({ ...p, [key]: e.target.value }))}
                                                                    disabled={isRunning}
                                                                >
                                                                    <option value="NONE">NONE</option>
                                                                    {profileColumns.map((col, idx) => (
                                                                        <option key={`${key}-${idx}`} value={col}>{col}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ))}
                                                        <div style={{ background: '#f0fdf4', borderRadius: 6, padding: '2px 4px', border: '1.5px solid #22c55e' }}>
                                                            <label style={{ ...lS, fontSize: 10, color: '#15803d', fontWeight: 800 }}>🔗 Cột Link Kết Quả</label>
                                                            <select
                                                                style={{ ...iS, padding: '6px 4px', fontWeight: 800, fontSize: 11, color: '#15803d', background: '#fff', cursor: 'pointer' }}
                                                                value={profMapping.resultCol || 'drive_link'}
                                                                onChange={e => setProfMapping(p => ({ ...p, resultCol: e.target.value }))}
                                                                disabled={isRunning}
                                                            >
                                                                <option value="NONE">NONE</option>
                                                                {profileColumns.map((col, idx) => (
                                                                    <option key={`result-${idx}`} value={col}>{col}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Filter & Options */}
                                            {selectedProfile && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                                                    <div>
                                                        <label style={lS}>Lọc theo Danh mục (tùy chọn)</label>
                                                        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setProfilePreview(null); }} style={iS} disabled={loadingCats}>
                                                            <option value="">— Tất cả danh mục —</option>
                                                            {categories.map((c, idx) => (
                                                                <option key={`cat-${c.cat || idx}-${idx}`} value={c.cat}>{c.cat}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={lS}>Bộ lọc loại PDF</label>
                                                        <select value={profMapping.pdfFilterMode || 'datasheet_only'} onChange={e => { setProfMapping(p => ({...p, pdfFilterMode: e.target.value})); setProfilePreview(null); }} style={iS}>
                                                            <option value="datasheet_only">📌 Chỉ lấy Datasheet (Khuyên dùng)</option>
                                                            <option value="all_pdfs">📑 Tải tất cả tài liệu PDF (Manual, User Guide...)</option>
                                                            <option value="keywords">🔍 Khớp từ khóa tùy chọn bên dưới</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {profMapping.pdfFilterMode === 'keywords' && (
                                                <div style={{ marginBottom: 10 }}>
                                                    <label style={lS}>Từ khóa phân loại PDF (phân cách bằng dấu phẩy)</label>
                                                    <input
                                                        style={iS}
                                                        placeholder="datasheet, user manual, guide, brochure"
                                                        value={profMapping.keywords || ''}
                                                        onChange={e => { setProfMapping(p => ({ ...p, keywords: e.target.value })); setProfilePreview(null); }}
                                                        disabled={isRunning}
                                                    />
                                                </div>
                                            )}

                                            {/* Template Tên File & De-duplication Checkbox */}
                                            {selectedProfile && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-color, #e2e8f0)' }}>
                                                    <div>
                                                        <label style={lS}>Mẫu tên file lưu (Filename Template)</label>
                                                        <input
                                                            style={{ ...iS, fontFamily: 'monospace' }}
                                                            placeholder="{model}.pdf"
                                                            value={profMapping.filenamePattern || '{model}.pdf'}
                                                            onChange={e => { setProfMapping(p => ({ ...p, filenamePattern: e.target.value })); setProfilePreview(null); }}
                                                            disabled={isRunning}
                                                        />
                                                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                                            Biến khả dụng: <code>{'{model}'}</code>, <code>{'{series}'}</code>, <code>{'{main_category}'}</code>, <code>{'{sub_category}'}</code>, <code>{'{doc_type}'}</code>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#15803d', cursor: 'pointer' }}>
                                                            <input type="checkbox" checked={deduplicate} onChange={e => setDeduplicate(e.target.checked)} />
                                                            🛡️ Lọc trùng lặp link/file
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </section>
                            )}

                            {/* ── SHEET MODE ── */}
                            {mode === 'sheet' && (
                                <section style={sS}>
                                    <div style={sT}>📊 Google Sheet Mapping & Cột Ghi Link Kết Quả</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <input style={iS} placeholder="https://docs.google.com/spreadsheets/d/XXXX" value={sheetCfg.sheetInput} onChange={e => setSheet('sheetInput', e.target.value)} disabled={isRunning} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                                            <div><label style={lS}>Tên Sheet (tab)</label><input style={iS} placeholder="Sheet1" value={sheetCfg.sheetName} onChange={e => setSheet('sheetName', e.target.value)} disabled={isRunning} /></div>
                                            <div><label style={lS}>Hàng tiêu đề</label><input style={iS} type="number" min={1} value={sheetCfg.headerRow} onChange={e => setSheet('headerRow', +e.target.value || 2)} disabled={isRunning} /></div>
                                            <div><label style={lS}>Hàng dữ liệu</label><input style={iS} type="number" min={2} value={sheetCfg.dataStartRow} onChange={e => setSheet('dataStartRow', +e.target.value || 3)} disabled={isRunning} /></div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Mapping cột (nhập chữ cái A, B, C... hoặc gõ <strong>NONE</strong> để bỏ qua):</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                                                {[
                                                    {k:'colBrand',l:'Hãng'},
                                                    {k:'colMainCategory',l:'DM chính'},
                                                    {k:'colSubCategory',l:'DM con'},
                                                    {k:'colSeries',l:'Series'},
                                                    {k:'colModel',l:'Mã SP'},
                                                    {k:'colPdfUrl',l:'URL PDF'},
                                                    {k:'colResult',l:'🔗 Cột Ghi Link Kết Quả', highlight: true}
                                                ].map(f => (
                                                    <div key={f.k} style={f.highlight ? { background: '#f0fdf4', borderRadius: 6, padding: '2px 4px', border: '1.5px solid #22c55e' } : {}}>
                                                        <label style={{...lS, fontSize: 10, color: f.highlight ? '#15803d' : '#64748b', fontWeight: f.highlight ? 800 : 600}}>{f.l}</label>
                                                        <input style={{...iS,padding:'6px 4px',textAlign:'center',fontWeight:800,textTransform:'uppercase',fontSize:12, color: f.highlight ? '#15803d' : '#0f172a'}} maxLength={6} value={sheetCfg[f.k] || ''} onChange={e=>setSheet(f.k,e.target.value)} disabled={isRunning} />
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                                                🎯 <strong>Cột Ghi Link Kết Quả:</strong> Sau khi upload file PDF lên Google Drive, link <code>webViewLink</code> sẽ được ghi trực tiếp vào cột này trong Google Sheet (ví dụ Cột K, L, M...).
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                                            <div>
                                                <label style={lS}>Mẫu tên file lưu (Filename Pattern)</label>
                                                <input style={{...iS, fontFamily:'monospace'}} placeholder="{model}.pdf" value={sheetCfg.filenamePattern || '{model}.pdf'} onChange={e=>setSheet('filenamePattern', e.target.value)} disabled={isRunning} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#15803d', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={deduplicate} onChange={e => setDeduplicate(e.target.checked)} />
                                                    🛡️ Lọc trùng lặp link
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Concurrency & Saved Configs */}
                            <section style={sS}>
                                <div style={sT}>💾 Cấu hình & Luồng tải</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={lS}>Luồng song song (Concurrency)</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[5, 10, 20, 30].map(n => (
                                                <button key={n} onClick={() => setConcurrency(n)} style={{
                                                    padding: '5px 12px', borderRadius: 6, border: '1.5px solid',
                                                    borderColor: concurrency === n ? '#2563eb' : 'var(--border-color,#e2e8f0)',
                                                    background: concurrency === n ? '#eff6ff' : 'var(--bg-card,#fff)',
                                                    color: concurrency === n ? '#1d4ed8' : 'var(--text-secondary,#64748b)',
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer'
                                                }}>{n}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label style={lS}>Cấu hình đã lưu</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <select value={selectedConfig} onChange={e => { setSelectedConfig(e.target.value); applyConfig(e.target.value); }} style={{...iS, flex: 1}}>
                                                <option value="">-- Chọn cấu hình --</option>
                                                {Object.keys(configs).map(k => <option key={k} value={k}>{k}</option>)}
                                            </select>
                                            {selectedConfig && (
                                                <button onClick={() => handleDeleteConfig(selectedConfig)} style={{ padding: '8px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {/* Lưu cấu hình mới & Cập nhật cấu hình hiện tại */}
                                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        style={{ ...iS, flex: 1, minWidth: 200 }}
                                        placeholder="Tên cấu hình..."
                                        value={saveName}
                                        onChange={e => setSaveName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSaveConfig()}
                                    />
                                    <button
                                        onClick={handleSaveConfig}
                                        disabled={!saveName.trim()}
                                        style={{
                                            padding: '8px 14px', borderRadius: 8, border: 'none',
                                            background: saveName.trim() ? 'linear-gradient(135deg, #10b981, #059669)' : '#cbd5e1',
                                            color: '#fff', fontWeight: 700, fontSize: 13,
                                            cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                                            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <Save size={15} /> Lưu Cấu Hình Mới
                                    </button>
                                    {selectedConfig && (
                                        <button
                                            onClick={handleUpdateActiveConfig}
                                            style={{
                                                padding: '8px 14px', borderRadius: 8, border: 'none',
                                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
                                            }}
                                            title="Lưu ghi đè lên cấu hình đang chọn"
                                        >
                                            <CheckCircle2 size={15} /> Cập Nhật Cấu Hình Đang Chọn
                                        </button>
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    {/* Tab 2: Document Scope Inspection & Preview */}
                    {activeTab === 'inspect' && (
                        <div>
                            {profilePreview ? (
                                <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                                        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: '#1d4ed8' }}>{profilePreview.totalTasks}</div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>Tổng file PDF sẽ tải</div>
                                        </div>
                                        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>{profilePreview.modelCount || 0}</div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>🏷️ File độc lập theo Mã SP</div>
                                        </div>
                                        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fffbe3', border: '1px solid #fef08a', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 800, color: '#b45309' }}>{profilePreview.seriesCount || 0}</div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>📁 File dùng chung Series/Danh mục</div>
                                        </div>
                                    </div>

                                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                                        👁️ Preview 10 file tài liệu đầu tiên:
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {profilePreview.preview?.map((t, i) => (
                                            <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12 }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                                                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Drive File: <code>{t.fileName}</code></div>
                                                <div style={{ color: '#2563eb', fontSize: 11, marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>URL: {t.url}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Bấm <strong>"Preview PDF & Scope"</strong> bên dưới để xem trước danh sách file</div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: Progress & Realtime Logs */}
                    {activeTab === 'progress' && (
                        <div>
                            {status ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 32, fontWeight: 800, color: status.status === 'completed' ? '#16a34a' : status.status === 'stopped' ? '#dc2626' : '#2563eb' }}>
                                        {status.done} / {status.total}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                                        Tốc độ: <strong>{status.speed || 0} file/s</strong> | Còn lại: <strong>{status.etaSec || 0}s</strong>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                                        <span style={{ padding: '4px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>✓ Upload: {status.ok}</span>
                                        <span style={{ padding: '4px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 700 }}>⊘ Trùng lặp (Skip): {status.skip}</span>
                                        <span style={{ padding: '4px 10px', borderRadius: 20, background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>✗ Lỗi: {status.fail}</span>
                                    </div>

                                    {/* Upload Log */}
                                    <div style={{ marginTop: 20, textAlign: 'left', maxHeight: 200, overflowY: 'auto', background: '#0f172a', color: '#38bdf8', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}>
                                        {status.failLog?.slice(-20).map((log, i) => (
                                            <div key={i}>{log}</div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chưa có tiến trình upload nào đang chạy</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div style={{ padding: '14px 20px', background: 'var(--bg-muted, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        {mode === 'profile' && (
                            <button onClick={handleProfilePreview} disabled={previewing || !selectedProfile} style={{
                                padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
                                color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center'
                            }}>
                                {previewing ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Preview PDF & Scope
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Đóng</button>

                        <button
                            onClick={handleAutoFillLinks}
                            disabled={starting || isRunning}
                            style={{
                                padding: '9px 18px', borderRadius: 8, border: 'none',
                                background: 'linear-gradient(135deg, #059669, #10b981)',
                                color: '#fff', fontWeight: 700, fontSize: 13, cursor: starting || isRunning ? 'not-allowed' : 'pointer',
                                display: 'flex', gap: 6, alignItems: 'center'
                            }}
                            title="Quét Google Drive & điền link tự động ngay vào cột chỉ định"
                        >
                            {starting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                            {starting ? 'Đang điền link...' : '⚡ Điền Link Tự Động'}
                        </button>

                        {isRunning ? (
                            <button onClick={handleStop} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Dừng lại</button>
                        ) : (
                            <button onClick={handleStart} disabled={starting} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
                                {starting ? <Loader2 size={18} className="animate-spin" /> : <Cloud size={18} />} Bắt đầu Upload Drive
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
