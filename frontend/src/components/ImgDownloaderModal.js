'use client';
import { useState, useEffect, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import {
    X, Play, Square, Save, Trash2, RefreshCw,
    Loader2, Download, Database, FileSpreadsheet,
    Eye, Zap, Settings, ChevronDown, FolderOpen, AlertCircle, CheckCircle2
} from 'lucide-react';

const SHEET_DEFAULTS = {
    sheetInput: '', sheetName: '', headerRow: 2, dataStartRow: 3,
    colBrand: 'C', colMainCategory: 'B', colSubCategory: 'NONE', colSeries: 'NONE', colModel: 'F', colUrl: 'I', colResult: 'NONE',
    batchStart: 1, batchEnd: 0,
};

const PROFILE_MAPPING_DEFAULTS = {
    profBrand: 'profile_slug',
    profMainCategory: 'main_category',
    profSubCategory: 'NONE',
    profSeries: 'NONE',
    profModel: 'part_number',
    profUrl: 'image_url',
    resultCol: 'image_drive_link'
};

export default function ImgDownloaderModal({ isOpen, onClose, onSuccess, onConvertSuccess }) {
    // ── Tabs & Mode ──
    const [activeTab, setActiveTab]   = useState('config');   // 'config' | 'progress'
    const [mode, setMode]             = useState('profile');   // 'profile' | 'sheet'

    // ── Profile mode state ──
    const [profileStats, setProfileStats]   = useState([]);   // [{profile_slug, total_products, with_image}]
    const [selectedProfile, setSelectedProfile] = useState('');
    const [profileColumns, setProfileColumns]   = useState([]);   // header columns from profile sheet
    const [categories, setCategories]       = useState([]);
    const [seriesList, setSeriesList]       = useState([]);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [seriesFilter, setSeriesFilter]   = useState('');
    const [profMapping, setProfMapping]     = useState({ ...PROFILE_MAPPING_DEFAULTS });
    const [profilePreview, setProfilePreview] = useState(null); // {totalTasks, preview[]}
    const [loadingStats, setLoadingStats]   = useState(false);
    const [loadingCats, setLoadingCats]     = useState(false);
    const [previewing, setPreviewing]       = useState(false);

    // ── Sheet mode state ──
    const [sheetCfg, setSheetCfg] = useState({ ...SHEET_DEFAULTS });
    const [sheetPreview, setSheetPreview] = useState(null);
    const [sheetPreviewing, setSheetPreviewing] = useState(false);

    // ── Shared ──
    const [outputDir, setOutputDir]   = useState('D:\\Downloads\\images');
    const [concurrency, setConcurrency] = useState(10);
    const [linkPattern, setLinkPattern] = useState('');
    const [configs, setConfigs]       = useState({});
    const [selectedConfig, setSelectedConfig] = useState('');
    const [saveName, setSaveName]     = useState('');
    const [msg, setMsg]               = useState({ text: '', type: '' });

    // ── Job state ──
    const [status, setStatus]   = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [starting, setStarting] = useState(false);

    const pollRef = useRef(null);

    // ── Load on open ──
    useEffect(() => {
        if (isOpen) {
            loadConfigs();
            fetchStatus();
            loadProfileStats();
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [isOpen]);

    // ── Load categories & columns when profile changes ──
    useEffect(() => {
        if (selectedProfile) {
            setCategoryFilter('');
            setSeriesFilter('');
            setCategories([]);
            setSeriesList([]);
            setProfilePreview(null);
            loadProfileCategories(selectedProfile);
            fetchProfileColumns(selectedProfile);
        }
    }, [selectedProfile]);

    const fetchProfileColumns = async (slug) => {
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${encodeURIComponent(slug)}`, { silent: true });
            const allHeaders = new Set();

            const isCssOrInvalid = (s) => {
                if (!s || typeof s !== 'string') return true;
                const str = String(s).trim();
                if (!str || str.length > 100) return true;
                if (/^\d+$/.test(str)) return true;
                if (/:nth-child|:nth-of-type|:first-child|:last-child/i.test(str)) return true;
                if (str.includes(' > ') || str.startsWith('//') || str.startsWith('/html')) return true;
                if (/^[.#]/.test(str) || /<[a-z]/i.test(str)) return true;
                return false;
            };

            for (const sheet of (data?.sheets || [])) {
                if (!sheet.data || sheet.data.length === 0) continue;
                for (let i = 0; i < Math.min(3, sheet.data.length); i++) {
                    const row = sheet.data[i];
                    const valid = row.filter(h => h && !isCssOrInvalid(String(h)));
                    if (valid.length >= 2) {
                        valid.forEach(h => allHeaders.add(String(h).trim()));
                        break;
                    }
                }
            }

            setProfileColumns(allHeaders.size > 0 ? [...allHeaders] : []);
        } catch (e) {
            setProfileColumns([]);
        }
    };

    // ── Polling ──
    useEffect(() => {
        if (isRunning) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(fetchStatus, 1000);
        } else {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [isRunning]);

    // ── API helpers ──
    const loadConfigs = async () => {
        try { setConfigs(await fetchApi('/api/img-downloader/configs') || {}); } catch (e) {}
    };

    const fetchStatus = async () => {
        try {
            const s = await fetchApi('/api/img-downloader/status');
            if (s) {
                setStatus(s);
                const running = s.status === 'running' || s.status === 'loading';
                setIsRunning(running);
                if (running && activeTab !== 'progress') setActiveTab('progress');
            }
        } catch (e) {}
    };

    const loadProfileStats = async () => {
        setLoadingStats(true);
        try {
            const data = await fetchApi('/api/img-downloader/profile-stats');
            setProfileStats(data?.profiles || []);
            if (data?.profiles?.length > 0 && !selectedProfile) {
                setSelectedProfile(data.profiles[0].profile_slug);
            }
        } catch (e) {}
        finally { setLoadingStats(false); }
    };

    const loadProfileCategories = async (profile) => {
        setLoadingCats(true);
        try {
            const data = await fetchApi(`/api/img-downloader/profile-categories?profile=${encodeURIComponent(profile)}`);
            setCategories(data?.categories || []);
            setSeriesList(data?.series || []);
        } catch (e) {}
        finally { setLoadingCats(false); }
    };

    const handleProfilePreview = async () => {
        if (!selectedProfile) return;
        setPreviewing(true);
        setProfilePreview(null);
        try {
            const data = await fetchApi('/api/img-downloader/preview-profile', {
                method: 'POST',
                body: JSON.stringify({ profileSlug: selectedProfile, categoryFilter, seriesFilter, ...profMapping })
            });
            setProfilePreview(data);
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
        } finally { setPreviewing(false); }
    };

    const handleSheetPreview = async () => {
        setSheetPreviewing(true);
        setSheetPreview(null);
        try {
            const data = await fetchApi('/api/img-downloader/preview', {
                method: 'POST',
                body: JSON.stringify(sheetCfg)
            });
            setSheetPreview(data);
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
        } finally { setSheetPreviewing(false); }
    };

    const handleStart = async () => {
        setMsg({ text: '', type: '' });
        if (!outputDir?.trim()) return showMsg('⚠️ Nhập thư mục lưu ảnh', 'warn');
        if (mode === 'profile' && !selectedProfile) return showMsg('⚠️ Chọn Profile trước', 'warn');
        if (mode === 'sheet' && (!sheetCfg.sheetInput || !sheetCfg.sheetName)) return showMsg('⚠️ Nhập URL Sheet và tên Sheet', 'warn');

        setStarting(true);
        try {
            const body = { mode, outputDir, concurrency, linkPattern, ...(mode === 'profile'
                ? { profileSlug: selectedProfile, categoryFilter, seriesFilter, ...profMapping }
                : { ...sheetCfg }) };

            await fetchApi('/api/img-downloader/start', { method: 'POST', body: JSON.stringify(body) });
            // Auto-close modal — progress visible in sidebar accordion
            onClose();
        } catch (e) {
            showMsg(`❌ ${e.message}`, 'error');
        } finally { setStarting(false); }
    };


    const handleStop  = async () => { try { await fetchApi('/api/img-downloader/stop', { method: 'POST' }); await fetchStatus(); } catch (e) {} };
    const handleReset = async () => { try { await fetchApi('/api/img-downloader/reset', { method: 'POST' }); setStatus(null); setIsRunning(false); setActiveTab('config'); } catch (e) {} };

    const applyConfig = (name) => {
        if (!name || !configs[name]) return;
        setSelectedConfig(name);
        setSaveName(name);
        const c = configs[name];
        if (c.mode) setMode(c.mode);
        if (c.outputDir) setOutputDir(c.outputDir);
        if (c.concurrency) setConcurrency(c.concurrency);
        if (c.linkPattern !== undefined) setLinkPattern(c.linkPattern);
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
            await fetchApi(`/api/img-downloader/configs/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify({ mode, outputDir, concurrency, linkPattern, selectedProfile, categoryFilter, seriesFilter, profMapping, sheetCfg })
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
            await fetchApi(`/api/img-downloader/configs/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify({ mode, outputDir, concurrency, linkPattern, selectedProfile, categoryFilter, seriesFilter, profMapping, sheetCfg })
            });
            await loadConfigs();
            showMsg(`✅ Đã cập nhật thành công cấu hình: "${name}"`, 'success');
        } catch (e) { showMsg('❌ Lỗi cập nhật cấu hình', 'error'); }
    };

    const handleAutoFillLinks = async () => {
        if (!selectedProfile) return showMsg('⚠️ Chọn Profile trước', 'warn');
        if (!profMapping.resultCol || profMapping.resultCol.toUpperCase() === 'NONE') {
            return showMsg('⚠️ Chọn Cột Link Kết Quả trước khi điền link', 'warn');
        }

        setStarting(true);
        showMsg('⏳ Đang điền link ảnh tự động vào Sheet...', 'warn');
        try {
            const body = {
                profileSlug: selectedProfile,
                outputDir,
                resultCol: profMapping.resultCol,
                linkPattern,
                categoryFilter,
                seriesFilter,
                ...profMapping
            };

            const res = await fetchApi('/api/img-downloader/auto-fill-links', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const successText = `🎉 Đã tự động điền thành công ${res.updatedCount}/${res.totalTasks} link ảnh vào cột "${profMapping.resultCol}"!`;
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
        try { await fetchApi(`/api/img-downloader/configs/${encodeURIComponent(name)}`, { method: 'DELETE' }); setSelectedConfig(''); setSaveName(''); await loadConfigs(); }
        catch (e) {}
    };

    const showMsg = (text, type) => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 3000); };
    const setSheet = (k, v) => setSheetCfg(prev => ({ ...prev, [k]: v }));

    if (!isOpen) return null;

    const isDone   = status && ['completed', 'stopped', 'error'].includes(status.status);
    const progress = status?.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
    const currentProfileStat = profileStats.find(p => p.profile_slug === selectedProfile);

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        >
            <div onClick={e => e.stopPropagation()} style={{
                width: 800, maxWidth: '96vw', maxHeight: '90vh',
                background: 'var(--bg-card, #fff)', borderRadius: 18,
                boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: '1px solid var(--border-color, #e2e8f0)'
            }}>

                {/* Header */}
                <div style={{
                    padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, #0f4c81 0%, #1e40af 100%)',
                    color: '#fff', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Download size={18} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>🖼️ Image Batch Downloader</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Tải ảnh hàng loạt về máy local</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-secondary, #f8fafc)', flexShrink: 0 }}>
                    {[
                        { key: 'config', label: '⚙️ Cấu hình' },
                        { key: 'progress', label: '📊 Tiến trình' }
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                            padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
                            fontWeight: activeTab === tab.key ? 700 : 500, fontSize: 13,
                            color: activeTab === tab.key ? '#0f4c81' : 'var(--text-secondary, #64748b)',
                            borderBottom: activeTab === tab.key ? '2px solid #0f4c81' : '2px solid transparent',
                            transition: 'all 0.15s'
                        }}>
                            {tab.label}
                            {tab.key === 'progress' && isRunning && (
                                <span style={{ marginLeft: 6, width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                            )}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

                    {/* ══ CONFIG TAB ══ */}
                    {activeTab === 'config' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                            {/* Saved Configs */}
                            {Object.keys(configs).length > 0 && (
                                <section style={sS}>
                                    <div style={sT}>📁 Cấu hình đã lưu</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <select value={selectedConfig} onChange={e => setSelectedConfig(e.target.value)} style={{ ...iS, flex: 1 }}>
                                            <option value="">— Chọn —</option>
                                            {Object.keys(configs).map(k => <option key={k} value={k}>{k}</option>)}
                                        </select>
                                        <button onClick={() => applyConfig(selectedConfig)} disabled={!selectedConfig} style={{ ...bS, background: '#0f4c81', color: '#fff', opacity: !selectedConfig ? 0.5 : 1 }}>⬇️ Tải</button>
                                        <button onClick={() => handleDeleteConfig(selectedConfig)} disabled={!selectedConfig} style={{ ...bS, background: '#fee2e2', color: '#b91c1c', opacity: !selectedConfig ? 0.5 : 1 }}><Trash2 size={13} /></button>
                                    </div>
                                </section>
                            )}

                            {/* Mode Switcher */}
                            <div style={{ display: 'flex', gap: 0, borderRadius: 12, border: '1.5px solid var(--border-color, #e2e8f0)', overflow: 'hidden', flexShrink: 0 }}>
                                {[
                                    { key: 'profile', icon: Database, label: '📦 Từ Profile (DB)', desc: 'Tải ảnh của sản phẩm đã crawl trong app' },
                                    { key: 'sheet', icon: FileSpreadsheet, label: '📊 Từ Google Sheet', desc: 'Tải ảnh từ danh sách URL trong Sheet' }
                                ].map(m => (
                                    <button key={m.key} onClick={() => { setMode(m.key); setMsg({ text: '', type: '' }); }} style={{
                                        flex: 1, padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                                        background: mode === m.key ? (m.key === 'profile' ? '#eff6ff' : '#f0fdf4') : 'var(--bg-secondary, #f8fafc)',
                                        borderRight: m.key === 'profile' ? '1.5px solid var(--border-color, #e2e8f0)' : 'none',
                                        transition: 'all 0.15s'
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: mode === m.key ? (m.key === 'profile' ? '#1d4ed8' : '#15803d') : 'var(--text-secondary, #64748b)', marginBottom: 2 }}>
                                            {m.label}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>{m.desc}</div>
                                    </button>
                                ))}
                            </div>

                            {/* ── PROFILE MODE ── */}
                            {mode === 'profile' && (
                                <section style={sS}>
                                    <div style={sT}>📦 Chọn Profile</div>

                                    {loadingStats ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
                                            <Loader2 size={14} className="spin" /> Đang tải danh sách profile...
                                        </div>
                                    ) : profileStats.length === 0 ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c', fontSize: 13, background: '#fee2e2', padding: '10px 14px', borderRadius: 8 }}>
                                            <AlertCircle size={14} /> Chưa có sản phẩm nào trong DB. Hãy crawl trước.
                                        </div>
                                    ) : (
                                        <>
                                            {/* Profile cards */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                                                {profileStats.map(p => (
                                                    <button key={p.profile_slug} onClick={() => setSelectedProfile(p.profile_slug)} style={{
                                                        padding: '10px 12px', borderRadius: 10, border: '2px solid',
                                                        borderColor: selectedProfile === p.profile_slug ? '#2563eb' : 'var(--border-color, #e2e8f0)',
                                                        background: selectedProfile === p.profile_slug ? '#eff6ff' : 'var(--bg-card, #fff)',
                                                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
                                                    }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: selectedProfile === p.profile_slug ? '#1d4ed8' : 'var(--text-primary, #0f172a)', marginBottom: 4, textTransform: 'capitalize' }}>
                                                            {p.profile_slug}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#64748b' }}>
                                                            <span style={{ color: '#15803d', fontWeight: 700 }}>{(p.with_image || 0).toLocaleString('vi-VN')}</span> ảnh
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{(p.total_products || 0).toLocaleString('vi-VN')} sp</div>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Filters */}
                                            {selectedProfile && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                    <div>
                                                        <label style={lS}>Lọc theo Danh mục (tùy chọn)</label>
                                                        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setProfilePreview(null); }} style={iS} disabled={loadingCats}>
                                                            <option value="">— Tất cả danh mục —</option>
                                                            {categories.map(c => (
                                                                <option key={c.cat} value={c.cat}>
                                                                    {c.cat} ({c.with_image || 0} ảnh)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={lS}>Lọc theo Series (tùy chọn)</label>
                                                        <select value={seriesFilter} onChange={e => { setSeriesFilter(e.target.value); setProfilePreview(null); }} style={iS} disabled={loadingCats}>
                                                            <option value="">— Tất cả series —</option>
                                                            {seriesList.map(s => (
                                                                <option key={s.series} value={s.series}>
                                                                    {s.series} ({s.with_image || 0} ảnh)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Mapping grid for Profile Mode */}
                                            {selectedProfile && (
                                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border-color, #e2e8f0)' }}>
                                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                                        Mapping trường dữ liệu (chọn <strong>NONE</strong> để bỏ qua):
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                                                        {[  
                                                            { label: 'Hãng', key: 'profBrand' },
                                                            { label: 'DM chính', key: 'profMainCategory' },
                                                            { label: 'DM con', key: 'profSubCategory' },
                                                            { label: 'Series', key: 'profSeries' },
                                                            { label: 'Mã SP', key: 'profModel' },
                                                            { label: '🖼️ URL Ảnh', key: 'profUrl' },
                                                        ].map(({ label, key }) => (
                                                            <div key={key}>
                                                                <label style={{ ...lS, fontSize: 10 }}>{label}</label>
                                                                <select
                                                                    style={{ ...iS, padding: '6px 4px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                                                    value={profMapping[key] || 'NONE'}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        setProfMapping(p => ({ ...p, [key]: val }));
                                                                        setProfilePreview(null);
                                                                    }}
                                                                    disabled={isRunning}
                                                                >
                                                                    <option value="NONE">NONE</option>
                                                                    {profileColumns.map((col, idx) => (
                                                                        <option key={`${key}-${idx}`} value={col}>{col}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ marginTop: 8, background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', border: '1.5px solid #22c55e' }}>
                                                        <label style={{ ...lS, fontSize: 10, color: '#15803d', fontWeight: 800 }}>🔗 Cột Link Kết Quả (Ghi đường dẫn/link vào CSDL khi tải xong)</label>
                                                        <select
                                                            style={{ ...iS, padding: '6px 4px', fontWeight: 800, fontSize: 11, color: '#15803d', background: '#fff', cursor: 'pointer' }}
                                                            value={profMapping.resultCol || 'NONE'}
                                                            onChange={e => setProfMapping(p => ({ ...p, resultCol: e.target.value }))}
                                                            disabled={isRunning}
                                                        >
                                                            <option value="NONE">NONE (Không ghi)</option>
                                                            {profileColumns.map((col, idx) => (
                                                                <option key={`result-${idx}`} value={col}>{col}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Profile Preview Result */}
                                            {profilePreview && (
                                                <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 8 }}>
                                                        👁️ Preview — <span style={{ fontSize: 16 }}>{profilePreview.totalTasks.toLocaleString('vi-VN')}</span> ảnh sẽ được tải
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        {profilePreview.preview?.slice(0, 6).map((t, i) => (
                                                            <div key={i} style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, color: '#166534', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                                                                <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.savePath}</span>
                                                            </div>
                                                        ))}
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
                                    <div style={sT}>📊 Google Sheet Mapping</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <input style={iS} placeholder="https://docs.google.com/spreadsheets/d/XXXX" value={sheetCfg.sheetInput} onChange={e => setSheet('sheetInput', e.target.value)} disabled={isRunning} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                                            <div><label style={lS}>Tên Sheet (tab)</label><input style={iS} placeholder="Sheet1" value={sheetCfg.sheetName} onChange={e => setSheet('sheetName', e.target.value)} disabled={isRunning} /></div>
                                            <div><label style={lS}>Hàng tiêu đề</label><input style={iS} type="number" min={1} value={sheetCfg.headerRow} onChange={e => setSheet('headerRow', +e.target.value || 2)} disabled={isRunning} /></div>
                                            <div><label style={lS}>Hàng dữ liệu</label><input style={iS} type="number" min={2} value={sheetCfg.dataStartRow} onChange={e => setSheet('dataStartRow', +e.target.value || 3)} disabled={isRunning} /></div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Mapping cột (nhập chữ cái A, B, C... hoặc gõ <strong>NONE</strong> để bỏ qua cấp folder đó):</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
                                                {[{k:'colBrand',l:'Hãng'},{k:'colMainCategory',l:'DM chính'},{k:'colSubCategory',l:'DM con'},{k:'colSeries',l:'Series'},{k:'colModel',l:'Mã SP'},{k:'colUrl',l:'URL ảnh'}].map(f => (
                                                    <div key={f.k}><label style={{...lS, fontSize: 10}}>{f.l}</label><input style={{...iS,padding:'6px 4px',textAlign:'center',fontWeight:700,textTransform:'uppercase',fontSize:12}} maxLength={4} value={sheetCfg[f.k] || ''} onChange={e=>setSheet(f.k,e.target.value.toUpperCase())} disabled={isRunning} /></div>
                                                ))}
                                            </div>
                                            <div style={{ marginTop: 6, background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', border: '1.5px solid #22c55e' }}>
                                                <label style={{ ...lS, fontSize: 10, color: '#15803d', fontWeight: 800 }}>🔗 Cột Link Kết Quả (Ghi đường dẫn/link vào Sheet khi tải xong)</label>
                                                <input
                                                    style={{ ...iS, padding: '6px 8px', fontWeight: 800, fontSize: 11, color: '#15803d', background: '#fff', textTransform: 'uppercase' }}
                                                    placeholder="Gõ chữ cái cột (ví dụ K hoặc NONE)"
                                                    value={sheetCfg.colResult || 'NONE'}
                                                    onChange={e => setSheet('colResult', e.target.value.toUpperCase())}
                                                    disabled={isRunning}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <div><label style={lS}>Từ dòng</label><input style={iS} type="number" min={1} value={sheetCfg.batchStart} onChange={e=>setSheet('batchStart',+e.target.value||1)} disabled={isRunning} /></div>
                                            <div><label style={lS}>Đến dòng (0=hết)</label><input style={iS} type="number" min={0} value={sheetCfg.batchEnd} onChange={e=>setSheet('batchEnd',+e.target.value||0)} disabled={isRunning} /></div>
                                        </div>

                                        {sheetPreview && (
                                            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                                <span style={{ fontWeight: 700, fontSize: 13, color: '#15803d' }}>
                                                    ✅ {sheetPreview.totalValid.toLocaleString('vi-VN')} / {sheetPreview.totalRows.toLocaleString('vi-VN')} dòng có URL ảnh
                                                </span>
                                                {sheetPreview.skippedNoUrl > 0 && <span style={{ marginLeft: 10, fontSize: 12, color: '#b45309' }}>⚠️ {sheetPreview.skippedNoUrl} bỏ qua</span>}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Output & Concurrency */}
                            <section style={sS}>
                                <div style={sT}>📂 Thư mục lưu & Cấu hình tải</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div>
                                        <label style={lS}>Thư mục lưu ảnh (đường dẫn trên máy server)</label>
                                        <input style={{...iS, fontFamily:'monospace', fontSize:12}} placeholder="D:\Downloads\images" value={outputDir} onChange={e=>setOutputDir(e.target.value)} disabled={isRunning} />
                                        {mode === 'profile' && selectedProfile && outputDir && (
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>
                                                → {outputDir}\\{profMapping.profBrand && profMapping.profBrand.toUpperCase() !== 'NONE' ? selectedProfile + '\\' : ''}{profMapping.profMainCategory && profMapping.profMainCategory.toUpperCase() !== 'NONE' ? '{dm_chính}\\' : ''}{profMapping.profSubCategory && profMapping.profSubCategory.toUpperCase() !== 'NONE' ? '{dm_con}\\' : ''}{profMapping.profSeries && profMapping.profSeries.toUpperCase() !== 'NONE' ? '{series}\\' : ''}{'{mã_sp}'}.webp
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label style={lS}>Luồng song song</label>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {[5, 10, 20, 30, 50].map(n => (
                                                <button key={n} onClick={() => setConcurrency(n)} style={{
                                                    padding: '5px 12px', borderRadius: 6, border: '1.5px solid',
                                                    borderColor: concurrency === n ? '#2563eb' : 'var(--border-color,#e2e8f0)',
                                                    background: concurrency === n ? '#eff6ff' : 'var(--bg-card,#fff)',
                                                    color: concurrency === n ? '#1d4ed8' : 'var(--text-secondary,#64748b)',
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer'
                                                }}>{n}</button>
                                            ))}
                                            <input type="number" min={1} max={100} value={concurrency} onChange={e=>setConcurrency(+e.target.value||10)} style={{...iS, width:70}} />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 4, background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #cbd5e1' }}>
                                        <label style={{ ...lS, fontSize: 11, color: '#0f172a', fontWeight: 800 }}>
                                            🔗 Cấu hình Link mẫu (URL Template) để ghép và ghi vào CSDL / Sheet
                                        </label>
                                        <input
                                            style={{ ...iS, fontFamily: 'monospace', fontSize: 12, marginTop: 4, background: '#fff' }}
                                            placeholder="Ví dụ: https://my-domain.com/images/{model}.webp (Để trống = ghi đường dẫn file máy)"
                                            value={linkPattern}
                                            onChange={e => setLinkPattern(e.target.value)}
                                            disabled={isRunning}
                                        />
                                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span>💡 <strong>Biến hỗ trợ:</strong></span>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{model}"}</code>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{brand}"}</code>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{main_category}"}</code>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{sub_category}"}</code>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{series}"}</code>
                                            <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#0f172a' }}>{"{filename}"}</code>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Message */}
                            {msg.text && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    background: msg.type==='error'?'#fee2e2':msg.type==='warn'?'#fffbeb':'#f0fdf4',
                                    color: msg.type==='error'?'#b91c1c':msg.type==='warn'?'#92400e':'#15803d',
                                    border: `1px solid ${msg.type==='error'?'#fecaca':msg.type==='warn'?'#fde68a':'#bbf7d0'}`
                                }}>{msg.text}</div>
                            )}

                            {/* Lưu cấu hình mới & Cập nhật cấu hình hiện tại */}
                            <section style={{ ...sS, background: 'var(--bg-secondary,#f8fafc)' }}>
                                <div style={sT}>💾 Lưu & Cập nhật Cấu hình</div>
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
                        </div>
                    )}

                    {/* ══ PROGRESS TAB ══ */}
                    {activeTab === 'progress' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {!status || status.status === 'idle' ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted,#94a3b8)' }}>
                                    <Download size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                                    <p style={{ fontWeight: 600 }}>Chưa có job nào đang chạy</p>
                                    <p style={{ fontSize: 13 }}>Chuyển sang tab Cấu hình và nhấn Bắt đầu tải</p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <StatusBadge status={status.status} />
                                            {status.mode && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: status.mode === 'profile' ? '#dbeafe' : '#dcfce7', color: status.mode === 'profile' ? '#1d4ed8' : '#15803d', fontWeight: 700 }}>{status.mode === 'profile' ? '📦 Profile' : '📊 Sheet'}</span>}
                                            {(status.status === 'running' || status.status === 'loading') && <Loader2 size={15} className="spin" style={{ color: '#0f4c81' }} />}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted,#94a3b8)', textAlign: 'right' }}>
                                            {status.elapsed !== undefined && `${status.elapsed}s`}
                                            {status.eta > 0 && ` • ETA ${status.eta}s`}
                                            {status.speed > 0 && ` • ${status.speed} ảnh/s`}
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary,#475569)' }}>
                                            <span>{(status.done||0).toLocaleString('vi-VN')} / {(status.total||0).toLocaleString('vi-VN')} ảnh</span>
                                            <span style={{ color: '#0f4c81' }}>{progress}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: 12, background: 'var(--bg-secondary,#f1f5f9)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color,#e2e8f0)' }}>
                                            <div style={{ width: `${progress}%`, height: '100%', background: isDone ? (status.status==='stopped'?'#f59e0b':'#22c55e') : 'linear-gradient(90deg,#0f4c81,#2563eb)', transition: 'width 0.4s ease', borderRadius: 6 }} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                                        <StatCard label="✅ Tải xong" value={status.ok||0} color="#15803d" bg="#f0fdf4" border="#bbf7d0" />
                                        <StatCard label="⏭️ Đã có" value={status.skip||0} color="#475569" bg="#f8fafc" border="#e2e8f0" />
                                        <StatCard label="❌ Lỗi" value={status.fail||0} color="#b91c1c" bg="#fef2f2" border="#fecaca" />
                                        <StatCard label="⏳ Còn lại" value={Math.max(0,(status.total||0)-(status.done||0))} color="#92400e" bg="#fffbeb" border="#fde68a" />
                                    </div>

                                    {status.failLog?.length > 0 && (
                                        <details style={{ borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '10px 14px' }}>
                                            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#b91c1c' }}>❌ {status.failLog.length} lỗi gần nhất</summary>
                                            <pre style={{ fontSize: 11, marginTop: 8, maxHeight: 120, overflow: 'auto', color: '#7f1d1d', lineHeight: 1.5 }}>{status.failLog.join('\n')}</pre>
                                        </details>
                                    )}

                                    {status.failLogPath && (
                                        <div style={{ fontSize: 12, padding: '6px 10px', background: '#fffbeb', borderRadius: 6, color: '#92400e', border: '1px solid #fde68a' }}>
                                            📄 Log lỗi: <code style={{ fontFamily: 'monospace' }}>{status.failLogPath}</code>
                                        </div>
                                    )}

                                    {isDone && (
                                        <div style={{ padding: '12px 16px', borderRadius: 10, background: status.status==='completed'?'#f0fdf4':'#fffbeb', border: `1px solid ${status.status==='completed'?'#bbf7d0':'#fde68a'}`, color: status.status==='completed'?'#15803d':'#92400e', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
                                            {status.status==='completed' ? `🏁 Hoàn thành! ${(status.ok||0).toLocaleString('vi-VN')} ảnh đã tải trong ${status.elapsed}s` : `⛔ Đã dừng tại ${(status.done||0).toLocaleString('vi-VN')}/${(status.total||0).toLocaleString('vi-VN')} ảnh`}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-color,#e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary,#f8fafc)', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {activeTab === 'config' && mode === 'profile' && selectedProfile && (
                            <button onClick={handleProfilePreview} disabled={previewing || isRunning} style={{ ...bS, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', opacity: previewing||isRunning ? 0.5 : 1 }}>
                                {previewing ? <Loader2 size={13} className="spin" /> : <Eye size={13} />}
                                {previewing ? 'Đang đọc...' : 'Preview'}
                            </button>
                        )}
                        {activeTab === 'config' && mode === 'sheet' && (
                            <button onClick={handleSheetPreview} disabled={sheetPreviewing || isRunning || !sheetCfg.sheetInput} style={{ ...bS, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', opacity: sheetPreviewing||isRunning||!sheetCfg.sheetInput ? 0.5 : 1 }}>
                                {sheetPreviewing ? <Loader2 size={13} className="spin" /> : <Eye size={13} />}
                                {sheetPreviewing ? 'Đang đọc...' : 'Preview Sheet'}
                            </button>
                        )}
                        {isDone && (
                            <button onClick={handleReset} style={{ ...bS, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                                <RefreshCw size={13} /> Đặt lại
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ ...bS, background: 'var(--bg-secondary,#f1f5f9)', color: 'var(--text-secondary,#64748b)', border: '1px solid var(--border-color,#e2e8f0)' }}>Đóng</button>

                        <button
                            onClick={handleAutoFillLinks}
                            disabled={starting || isRunning}
                            style={{
                                padding: '8px 16px', borderRadius: 8, border: 'none',
                                background: 'linear-gradient(135deg, #059669, #10b981)',
                                color: '#fff', fontWeight: 700, fontSize: 13, cursor: starting || isRunning ? 'not-allowed' : 'pointer',
                                display: 'flex', gap: 6, alignItems: 'center'
                            }}
                            title="Tự động điền link ảnh theo mẫu cấu hình vào cột chỉ định"
                        >
                            {starting ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                            {starting ? 'Đang điền link...' : '⚡ Điền Link Tự Động'}
                        </button>

                        {isRunning ? (
                            <button onClick={handleStop} style={{ ...bS, background: '#ef4444', color: '#fff', fontWeight: 700 }}>
                                <Square size={13} fill="white" /> Dừng lại
                            </button>
                        ) : (
                            <button onClick={handleStart} disabled={starting || isRunning || isDone} style={{ ...bS, background: 'linear-gradient(135deg,#0f4c81,#2563eb)', color: '#fff', fontWeight: 700, opacity: starting||isRunning||isDone ? 0.5 : 1 }}>
                                {starting ? <Loader2 size={13} className="spin" /> : <Play size={13} fill="white" />}
                                {starting ? 'Đang khởi động...' : '🚀 Bắt đầu tải'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            `}</style>
        </div>
    );
}

function StatCard({ label, value, color, bg, border }) {
    return (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: bg, border: `1px solid ${border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{(value||0).toLocaleString('vi-VN')}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</div>
        </div>
    );
}

function StatusBadge({ status }) {
    const map = {
        idle:      { label: 'Chờ',             bg: '#f1f5f9', color: '#64748b' },
        loading:   { label: 'Đang chuẩn bị...', bg: '#dbeafe', color: '#1d4ed8' },
        running:   { label: '⚡ Đang tải',      bg: '#dcfce7', color: '#15803d' },
        completed: { label: '✅ Hoàn thành',    bg: '#f0fdf4', color: '#15803d' },
        stopped:   { label: '⛔ Đã dừng',      bg: '#fffbeb', color: '#b45309' },
        error:     { label: '❌ Lỗi',          bg: '#fee2e2', color: '#b91c1c' }
    };
    const s = map[status] || map.idle;
    return <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

const sS = { padding: '14px 16px', background: 'var(--bg-secondary,#f8fafc)', borderRadius: 12, border: '1px solid var(--border-color,#e2e8f0)' };
const sT = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary,#0f172a)', marginBottom: 10 };
const iS = { width: '100%', padding: '8px 11px', background: 'var(--bg-card,#fff)', border: '1px solid var(--border-color,#e2e8f0)', borderRadius: 8, color: 'var(--text-primary,#0f172a)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const lS = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary,#64748b)', marginBottom: 4 };
const bS = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' };
