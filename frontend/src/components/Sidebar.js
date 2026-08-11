'use client';
import ImgDownloaderModal from './ImgDownloaderModal';
import PdfDownloaderModal from './PdfDownloaderModal';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { fetchApi } from '@/lib/api';
import { 
    LayoutDashboard, 
    Package, 
    LogOut, 
    Briefcase, 
    ChevronLeft, 
    ChevronRight, 
    Plus, 
    ChevronDown, 
    ChevronUp,
    Bot,
    X,
    Loader2,
    Pencil,
    Link as LinkIcon,
    Upload,
    Trash2,
    CheckCircle2,
    Pause,
    Play,
    Square,
    ImageDown,
    FileText
} from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout, hasPermission } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // Profiles state
    const [profiles, setProfiles] = useState([
        { id: 1, name: 'Profile Newland', slug: 'newland', brand_name: 'Newland' },
        { id: 2, name: 'Profile Zebra', slug: 'zebra', brand_name: 'Zebra' }
    ]);
    const [productsExpanded, setProductsExpanded] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [newBrandName, setNewBrandName] = useState('');
    const [newTargetUrl, setNewTargetUrl] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeProfileSlug, setActiveProfileSlug] = useState('');
    const [showCrawlSideview, setShowCrawlSideview] = useState(false);
    const [showAiSideview, setShowAiSideview] = useState(false);
    const [showImgDownloader, setShowImgDownloader] = useState(false);
    const [showImgAccordion, setShowImgAccordion] = useState(false);
    const [imgDownloadStatus, setImgDownloadStatus] = useState(null);
    const [showPdfDownloader, setShowPdfDownloader] = useState(false);
    const [showPdfAccordion, setShowPdfAccordion] = useState(false);
    const [pdfDownloadStatus, setPdfDownloadStatus] = useState(null);

    const aiAccordionRef = useRef(null);
    const crawlAccordionRef = useRef(null);
    const imgAccordionRef = useRef(null);
    const pdfAccordionRef = useRef(null);
    const prevImgRunningRef = useRef(false);
    const prevPdfRunningRef = useRef(false);
    const prevImgStatusRef = useRef('idle');
    const prevImgStepRef = useRef('');
    const prevPdfStatusRef = useRef('idle');
    const prevPdfStepRef = useRef('');

    const toggleAiAccordion = () => {
        const nextState = !showAiSideview;
        setShowAiSideview(nextState);
        if (nextState) {
            setTimeout(() => {
                if (showCrawlSideview) {
                    // Crawl is open underneath -> scroll to bottom so BOTH AI Assit and Crawl are fully visible
                    crawlAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                } else {
                    aiAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 100);
        }
    };

    const toggleCrawlAccordion = () => {
        const nextState = !showCrawlSideview;
        setShowCrawlSideview(nextState);
        if (nextState) {
            setTimeout(() => {
                crawlAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        }
    };

    const formatCount = (num) => {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return Number(num).toLocaleString('vi-VN');
    };

    const completedTimerRef = useRef(null);

    useEffect(() => {
        const showPushToast = (msg, type = 'info') => {
            try { window.dispatchEvent(new CustomEvent('app_toast_notification', { detail: { message: msg, type } })); } catch (e) {}
        };

        const fetchStatus = async () => {
            try {
                const s = await fetchApi('/api/products/crawler/status', { silent: true });
                if (s) {
                    setCrawlerStatus(s);

                    // If Completed, schedule auto-reset after 15 seconds
                    if (s.status === 'Completed') {
                        if (!completedTimerRef.current) {
                            completedTimerRef.current = setTimeout(async () => {
                                try {
                                    await fetchApi('/api/products/crawler/reset', { method: 'POST', silent: true });
                                    setCrawlerStatus({
                                        status: 'Idle',
                                        progress: 0,
                                        total_items: 0,
                                        current_item: 0,
                                        failed_items: 0,
                                        skipped_items: 0,
                                        last_message: 'Ready',
                                        profile_slug: ''
                                    });
                                } catch (e) {}
                                completedTimerRef.current = null;
                            }, 15000);
                        }
                    } else {
                        if (completedTimerRef.current) {
                            clearTimeout(completedTimerRef.current);
                            completedTimerRef.current = null;
                        }
                    }
                }
            } catch (e) {}
        };
        fetchStatus();
        const timer = setInterval(fetchStatus, 2500);

        // ── Poll Image Downloader status ──
        const fetchImgStatus = async () => {
            try {
                const s = await fetchApi('/api/img-downloader/status', { silent: true });
                if (s) {
                    setImgDownloadStatus(s);
                    const running = s.status === 'running' || s.status === 'loading' || s.status === 'autofilling';
                    
                    if (running && !prevImgRunningRef.current) {
                        setShowImgAccordion(true);
                        setTimeout(() => imgAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
                        showPushToast(`🚀 Bắt đầu tiến trình tải ảnh...`, 'info');
                    }

                    if (s.step === 'autofilling' && prevImgStepRef.current !== 'autofilling') {
                        showPushToast('📥 Tải ảnh hoàn tất! 🔗 Đang tự động điền link vào Sheet & CSDL...', 'info');
                    }

                    if (s.status === 'completed' && prevImgStatusRef.current !== 'completed') {
                        showPushToast(`🎉 Hoàn tất! Đã tải & điền link ảnh thành công (${s.ok || 0}/${s.total || 0})!`, 'success');
                        if (s.fail > 0) {
                            showPushToast(`⚠️ Có ${s.fail} file ảnh không tải được (xem _failed_downloads.txt)`, 'warning');
                        }
                        try { window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug: activeProfileSlug } })); } catch (e) {}
                    }

                    if (s.step === 'autofilling' || (!running && prevImgRunningRef.current)) {
                        try { window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug: activeProfileSlug } })); } catch (e) {}
                    }

                    prevImgRunningRef.current = running;
                    prevImgStatusRef.current = s.status;
                    prevImgStepRef.current = s.step;
                }
            } catch (e) {}
        };
        fetchImgStatus();
        const imgTimer = setInterval(fetchImgStatus, 2500);

        // ── Poll PDF Downloader status ──
        const fetchPdfStatus = async () => {
            try {
                const s = await fetchApi('/api/pdf-downloader/status', { silent: true });
                if (s) {
                    setPdfDownloadStatus(s);
                    const running = s.status === 'running' || s.status === 'loading' || s.status === 'autofilling';
                    
                    if (running && !prevPdfRunningRef.current) {
                        setShowPdfAccordion(true);
                        setTimeout(() => pdfAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
                        showPushToast(`🚀 Bắt đầu quét & tải PDF...`, 'info');
                    }

                    if (s.step === 'autofilling' && prevPdfStepRef.current !== 'autofilling') {
                        showPushToast('📥 Tải PDF xong! 🔗 Đang tự động điền link Google Drive vào Sheet & CSDL...', 'info');
                    }

                    if (s.status === 'completed' && prevPdfStatusRef.current !== 'completed') {
                        showPushToast(`🎉 Hoàn tất! Đã tải & điền link PDF thành công (${s.ok || 0}/${s.total || 0})!`, 'success');
                        if (s.fail > 0) {
                            showPushToast(`⚠️ Có ${s.fail} file PDF không tìm thấy / lỗi`, 'warning');
                        }
                        try { window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug: activeProfileSlug } })); } catch (e) {}
                    }

                    if (s.step === 'autofilling' || (!running && prevPdfRunningRef.current)) {
                        try { window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug: activeProfileSlug } })); } catch (e) {}
                    }

                    prevPdfRunningRef.current = running;
                    prevPdfStatusRef.current = s.status;
                    prevPdfStepRef.current = s.step;
                }
            } catch (e) {}
        };
        fetchPdfStatus();
        const pdfTimer = setInterval(fetchPdfStatus, 2500);

        const handleOpenImgDownloader = () => setShowImgDownloader(true);
        const handleOpenPdfDownloader = () => setShowPdfDownloader(true);
        window.addEventListener('open_img_downloader', handleOpenImgDownloader);
        window.addEventListener('open_pdf_downloader', handleOpenPdfDownloader);

        return () => {
            clearInterval(timer);
            clearInterval(imgTimer);
            clearInterval(pdfTimer);
            if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
            window.removeEventListener('open_img_downloader', handleOpenImgDownloader);
            window.removeEventListener('open_pdf_downloader', handleOpenPdfDownloader);
        };
    }, []);


    // ── Right-click context menu state ──
    const [ctxMenu, setCtxMenu] = useState(null); // { x, y, profile }
    const ctxRef = useRef(null);

    // ── Edit profile modal state ──
    const [editModal, setEditModal] = useState(null); // profile object being edited
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editSitemapUrl, setEditSitemapUrl] = useState('');
    const [editSitemapFile, setEditSitemapFile] = useState(null);
    const [editHarFile, setEditHarFile] = useState(null);
    const [editSaving, setEditSaving] = useState(false);
    const [crawlerStatus, setCrawlerStatus] = useState(null);
    const [editMsg, setEditMsg] = useState('');

    // Realtime AI Runner State for Sidebar Card (Hand-Sketch Widget)
    const [aiRunnerState, setAiRunnerState] = useState({
        isRunning: false,
        activeProfileName: 'Profile Newland',
        activeTabName: 'Sheet1',
        activeTaskName: 'Viết SAPO',
        totalRows: 0,
        completedCount: 0,
        pendingCount: 0,
        errorCount: 0,
        skipCount: 0,
        currentProgressPercent: 0
    });

    const fetchProfiles = async () => {
        try {
            const data = await fetchApi('/api/products/profiles', { silent: true });
            if (data?.profiles && data.profiles.length > 0) {
                setProfiles(data.profiles);
            }
        } catch (err) {}
    };

    const prevIsRunningRef = useRef(false);

    useEffect(() => {
        const saved = localStorage.getItem('sidebar_collapsed');
        if (saved === 'true') {
            setIsCollapsed(true);
        }
        fetchProfiles();

        const resetAiRunnerState = () => {
            const resetState = {
                isRunning: false,
                isPaused: false,
                activeProfileName: 'Profile Newland',
                activeTabName: 'Sheet1',
                activeTaskName: 'Chưa có tác vụ',
                totalRows: 0,
                completedCount: 0,
                pendingCount: 0,
                errorCount: 0,
                skipCount: 0,
                currentProgressPercent: 0
            };
            try {
                localStorage.setItem('ai_runner_state', JSON.stringify(resetState));
            } catch (e) {}
            setAiRunnerState(resetState);
            window.dispatchEvent(new Event('ai_runner_update'));
        };

        const syncRunnerState = () => {
            try {
                const savedState = localStorage.getItem('ai_runner_state');
                if (savedState) {
                    const parsed = JSON.parse(savedState);
                    const totalProcessed = (parsed.completedCount || 0) + (parsed.skipCount || 0) + (parsed.errorCount || 0);
                    if (parsed.totalRows > 0 && (totalProcessed >= parsed.totalRows || parsed.currentProgressPercent === 100)) {
                        parsed.isRunning = false;
                        parsed.currentProgressPercent = 100;
                        try {
                            localStorage.setItem('ai_runner_state', JSON.stringify(parsed));
                        } catch (e) {}
                    }
                    setAiRunnerState(parsed);

                    // Auto-expand AI Assistant card in sidebar when task starts
                    if (parsed.isRunning && !prevIsRunningRef.current) {
                        setShowAiSideview(true);
                    }
                    prevIsRunningRef.current = !!parsed.isRunning;
                }
            } catch (e) {}
        };
        syncRunnerState();
        window.addEventListener('ai_runner_update', syncRunnerState);
        window.addEventListener('storage', syncRunnerState);

        // Close context menu on outside click
        const handleGlobalClick = () => setCtxMenu(null);
        window.addEventListener('click', handleGlobalClick);
        window.addEventListener('contextmenu', () => {}, true); // capture phase
        return () => {
            window.removeEventListener('ai_runner_update', syncRunnerState);
            window.removeEventListener('storage', syncRunnerState);
            window.removeEventListener('click', handleGlobalClick);
        };
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            setActiveProfileSlug(params.get('profile') || '');
        }
    }, [pathname]);

    useEffect(() => {
        if (isCollapsed) {
            document.body.classList.add('sidebar-collapsed');
            localStorage.setItem('sidebar_collapsed', 'true');
        } else {
            document.body.classList.remove('sidebar-collapsed');
            localStorage.setItem('sidebar_collapsed', 'false');
        }
    }, [isCollapsed]);

    const handleCreateProfile = async (e) => {
        if (e) e.preventDefault();
        if (!newProfileName.trim()) return;
        setCreating(true);
        try {
            const res = await fetchApi('/api/products/profiles', {
                method: 'POST',
                body: JSON.stringify({
                    name: newProfileName.trim(),
                    brand_name: newBrandName.trim() || newProfileName.trim(),
                    target_url: newTargetUrl.trim()
                })
            });
            setNewProfileName('');
            setNewBrandName('');
            setNewTargetUrl('');
            setShowAddModal(false);
            await fetchProfiles();
            if (res?.profile?.slug) {
                router.push(`/products?profile=${res.profile.slug}`);
            }
        } catch (err) {
            alert(err.message || 'Lỗi khi tạo Profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteProfile = async (profile) => {
        if (!profile) return;
        setCtxMenu(null);
        if (profile.slug === 'newland') {
            alert('Không thể xóa Profile Newland mặc định.');
            return;
        }
        if (!confirm(`Bạn có chắc chắn muốn xóa Profile "${profile.name}"?\n\nTất cả sản phẩm đã crawl và dữ liệu sheet thuộc Profile này sẽ bị xóa.`)) {
            return;
        }
        try {
            await fetchApi(`/api/products/profiles/${profile.slug}`, {
                method: 'DELETE'
            });
            await fetchProfiles();
            router.push('/products');
        } catch (err) {
            alert(err.message || 'Lỗi khi xóa Profile.');
        }
    };

    // ── Open edit modal ──
    const openEditModal = async (profile) => {
        setEditModal(profile);
        setEditName(profile.name || '');
        setEditUrl(profile.target_url || '');
        setEditSitemapUrl(profile.sitemap_url || '');
        setEditSitemapFile(null);
        setEditHarFile(null);
        setEditMsg('');
        setCtxMenu(null);
        try {
            const sm = await fetchApi(`/api/products/profiles/${profile.slug}/sitemap`);
            if (sm?.sitemapUrl) setEditSitemapUrl(sm.sitemapUrl);
        } catch (e) {}
    };

    // ── Save profile edits (name + url + sitemap + HAR) ──
    const handleSaveEdit = async () => {
        if (!editModal) return;
        setEditSaving(true);
        setEditMsg('');
        try {
            await fetchApi(`/api/products/profiles/${editModal.slug}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: editName.trim(), target_url: editUrl.trim(), sitemap_url: editSitemapUrl.trim() })
            });
            if (editSitemapFile) {
                const text = await editSitemapFile.text();
                await fetchApi(`/api/products/profiles/${editModal.slug}/sitemap`, {
                    method: 'POST',
                    body: JSON.stringify({ sitemapXml: text, sitemapUrl: editSitemapUrl.trim() })
                });
            }
            if (editHarFile) {
                const form = new FormData();
                form.append('har', editHarFile);
                form.append('profile', editModal.slug);
                const result = await fetchApi(`/api/products/profiles/${editModal.slug}/har`, {
                    method: 'POST',
                    body: form,
                    headers: {}
                });
                window.dispatchEvent(new CustomEvent('har_analysis_ready', {
                    detail: { profile: editModal.slug, report: result?.report }
                }));
            }
            await fetchProfiles();
            setEditMsg('✅ Đã lưu thay đổi Profile, Sitemap & HAR!');
        } catch (err) {
            setEditMsg('❌ ' + (err.message || 'Lỗi khi lưu'));
        } finally {
            setEditSaving(false);
        }
    };

    // ── Upload HAR (also saves any pending profile/sitemap changes) ──
    const handleHarUpload = async () => {
        if (!editHarFile || !editModal) return;
        setEditSaving(true);
        setEditMsg('');
        try {
            // Save profile metadata (name, target_url, sitemap_url)
            await fetchApi(`/api/products/profiles/${editModal.slug}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: editName.trim(), target_url: editUrl.trim(), sitemap_url: editSitemapUrl.trim() })
            });

            // Save sitemap XML file if selected
            if (editSitemapFile) {
                const text = await editSitemapFile.text();
                await fetchApi(`/api/products/profiles/${editModal.slug}/sitemap`, {
                    method: 'POST',
                    body: JSON.stringify({ sitemapXml: text, sitemapUrl: editSitemapUrl.trim() })
                });
            }

            // Upload HAR file
            const form = new FormData();
            form.append('har', editHarFile);
            form.append('profile', editModal.slug);
            const result = await fetchApi(`/api/products/profiles/${editModal.slug}/har`, {
                method: 'POST',
                body: form,
                headers: {}
            });
            const summary = result?.report?.summary;
            const fieldCount = summary?.highConfidenceFieldsCount || 0;
            const totalFields = summary?.detectableFieldsCount || 0;
            setEditMsg(`✅ Phân tích HAR hoàn tất! Phát hiện ${totalFields} trường (${fieldCount} độ tin cao).`);
            setEditHarFile(null);

            await fetchProfiles();

            // Dispatch event so Products page auto-refreshes the HAR report & profile metadata
            window.dispatchEvent(new CustomEvent('har_analysis_ready', {
                detail: { profile: editModal.slug, report: result?.report }
            }));

            // Navigate to Products page of this profile, opening HAR tab
            setTimeout(() => {
                router.push(`/products?profile=${editModal.slug}`);
                setEditModal(null);
                try {
                    localStorage.setItem('open_har_tab_for', editModal.slug);
                } catch (e) {}
            }, 1200);
        } catch (err) {
            setEditMsg('❌ ' + (err.message || 'Lỗi upload HAR'));
        } finally {
            setEditSaving(false);
        }
    };

    if (!user) return null;

    const getInitials = (name) => {
        return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    };

    return (
        <>
            <aside className="sidebar">
                <button className="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon"><Briefcase size={22} /></div>
                    <div className="sidebar-logo-text">
                        <h1>{'Newland Portal'}</h1>
                        <span>{'Crawler & Manager'}</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {/* Dashboard */}
                    {hasPermission('dashboard') && (
                        <div>
                            <Link
                                href="/"
                                className={`sidebar-nav-item ${pathname === '/' ? 'active' : ''}`}
                                title={isCollapsed ? 'Dashboard' : ''}
                            >
                                <span className="icon"><LayoutDashboard size={20} /></span>
                                <span className="nav-label">Dashboard</span>
                            </Link>
                        </div>
                    )}

                    {/* Products (with Sub-menu) */}
                    {hasPermission('products') && (
                        <div>
                            <div
                                className={`sidebar-nav-item ${pathname.startsWith('/products') ? 'active' : ''}`}
                                onClick={() => setProductsExpanded(!productsExpanded)}
                                style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                                title={isCollapsed ? 'Products' : ''}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span className="icon"><Package size={20} /></span>
                                    <span className="nav-label">Products</span>
                                </div>
                                {!isCollapsed && (
                                    <span style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                                        {productsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </span>
                                )}
                            </div>

                            {/* Sub-menu for profiles & 2 Pill Buttons */}
                            {!isCollapsed && productsExpanded && (
                                <div className="sidebar-submenu">
                                    {profiles.map(p => {
                                         const isProfileActive = pathname === '/products' && (activeProfileSlug === p.slug || (!activeProfileSlug && p.slug === 'newland'));
                                         const isProfileCrawling = crawlerStatus && (crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') && crawlerStatus.profile_slug === p.slug;
                                         return (
                                             <div
                                                 key={p.id}
                                                 style={{ position: 'relative' }}
                                                 onContextMenu={e => {
                                                     e.preventDefault();
                                                     e.stopPropagation();
                                                     setCtxMenu({ x: e.clientX, y: e.clientY, profile: p });
                                                 }}
                                             >
                                                 <Link
                                                     href={`/products?profile=${p.slug}`}
                                                     onClick={() => setActiveProfileSlug(p.slug)}
                                                     className={`sidebar-submenu-item ${isProfileActive ? 'active' : ''}`}
                                                     style={isProfileCrawling ? { borderLeft: '3px solid #16a34a', background: 'rgba(22,163,74,0.1)' } : {}}
                                                 >
                                                     <Package size={16} style={{ color: isProfileCrawling ? '#16a34a' : isProfileActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                                                     <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                         {p.name.startsWith('Profile') ? p.name : `Profile ${p.name}`}
                                                     </span>
                                                     {isProfileCrawling && (
                                                         <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 8, background: '#16a34a', color: 'white' }}>
                                                             CRAWL
                                                         </span>
                                                     )}
                                                 </Link>
                                             </div>
                                         );
                                     })}

                                    {/* + Thêm Profile Button */}
                                    <button
                                        type="button"
                                        className="btn-add-profile"
                                        onClick={() => setShowAddModal(true)}
                                    >
                                        <Plus size={15} />
                                        <span>Thêm Profile</span>
                                    </button>

                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Assistant Menu Link */}
                    <Link
                        href="/ai-assistant"
                        className={`sidebar-nav-item ${pathname.startsWith('/ai-assistant') ? 'active' : ''}`}
                        title={isCollapsed ? 'AI Assistant' : ''}
                    >
                        <span className="icon"><Bot size={20} /></span>
                        <span className="nav-label">AI Assistant</span>
                    </Link>

                    {/* Image Downloader Button */}
                    <button
                        type="button"
                        onClick={() => setShowImgDownloader(true)}
                        className="sidebar-nav-item"
                        title={isCollapsed ? 'Image Downloader' : ''}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        <span className="icon"><ImageDown size={20} /></span>
                        <span className="nav-label">Image Downloader</span>
                    </button>

                    {/* PDF Downloader Button */}
                    <button
                        type="button"
                        onClick={() => setShowPdfDownloader(true)}
                        className="sidebar-nav-item"
                        title={isCollapsed ? 'PDF Downloader' : ''}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        <span className="icon"><FileText size={20} /></span>
                        <span className="nav-label">PDF Downloader</span>
                    </button>

                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* 2 ACCORDION ITEMS: AI ASSIT & CRAWL (INSIDE SCROLLABLE NAV)  */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {!isCollapsed && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* ── 1. AI Assit Accordion Item ── */}
                            <div ref={aiAccordionRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={toggleAiAccordion}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justify: 'space-between',
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '16px',
                                        background: showAiSideview ? '#f0abfc' : '#fae8ff',
                                        border: '1.5px solid #e879f9',
                                        color: '#701a75',
                                        fontWeight: 800,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        boxShadow: showAiSideview ? '0 0 0 2px rgba(232, 121, 249, 0.4)' : 'none',
                                        transition: 'all 0.2s ease',
                                        boxSizing: 'border-box'
                                    }}
                                    title="Click để mở/đóng Tiến trình AI Assistant"
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                        <Bot size={16} /> AI Assit
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: '12px', whiteSpace: 'nowrap', fontWeight: 800 }}>
                                        {formatCount((aiRunnerState.completedCount || 0) + (aiRunnerState.skipCount || 0) + (aiRunnerState.errorCount || 0))} / {formatCount(aiRunnerState.totalRows || 0)}
                                        {showAiSideview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </span>
                                </button>

                                {/* Accordion Expanded Content: AI Assistant Card */}
                                {showAiSideview && (
                                    <div style={{
                                        padding: '12px',
                                        background: '#ffffff',
                                        borderRadius: '14px',
                                        border: '2px solid #0f4c81',
                                        boxShadow: '0 4px 16px rgba(15, 76, 129, 0.08)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        fontSize: '12px'
                                    }}>
                                        {/* Header */}
                                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Bot size={16} style={{ color: '#0f4c81' }} /> AI Assistant
                                            </span>
                                            {(() => {
                                                const totalDone = (aiRunnerState.completedCount || 0) + (aiRunnerState.skipCount || 0) + (aiRunnerState.errorCount || 0);
                                                const isDone = (aiRunnerState.currentProgressPercent === 100 && aiRunnerState.totalRows > 0) ||
                                                               (aiRunnerState.totalRows > 0 && totalDone >= aiRunnerState.totalRows);
                                                
                                                const handleForceReset = (e) => {
                                                    e.stopPropagation();
                                                    const resetObj = {
                                                        isRunning: false,
                                                        isPaused: false,
                                                        activeProfileName: aiRunnerState.activeProfileName || 'Profile',
                                                        activeTabName: aiRunnerState.activeTabName || 'Sheet1',
                                                        activeTaskName: 'Chưa có tác vụ',
                                                        totalRows: 0,
                                                        completedCount: 0,
                                                        pendingCount: 0,
                                                        errorCount: 0,
                                                        skipCount: 0,
                                                        currentProgressPercent: 0
                                                    };
                                                    try {
                                                        localStorage.setItem('ai_runner_state', JSON.stringify(resetObj));
                                                    } catch (err) {}
                                                    setAiRunnerState(resetObj);
                                                    window.dispatchEvent(new Event('ai_runner_update'));
                                                };

                                                if (isDone) {
                                                    return (
                                                        <span 
                                                            title="Tác vụ đã xong. Click để đặt lại Sẵn sàng"
                                                            onClick={handleForceReset}
                                                            style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                                        >
                                                            ✓ Hoàn thành
                                                        </span>
                                                    );
                                                }
                                                if (aiRunnerState.isRunning && !aiRunnerState.isPaused) {
                                                    return (
                                                        <span 
                                                            title="Đang chạy. Click để buộc dừng / reset nếu bị kẹt"
                                                            onClick={handleForceReset}
                                                            style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                                        >
                                                            <Loader2 className="spin" size={10} /> Running
                                                        </span>
                                                    );
                                                }
                                                if (aiRunnerState.isPaused) {
                                                    return (
                                                        <span style={{ fontSize: '10px', background: '#fffbeb', color: '#b45309', padding: '2px 6px', borderRadius: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            ⏸️ Paused
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
                                                        Sẵn sàng
                                                    </span>
                                                );
                                            })()}
                                        </div>

                                        {/* Profile & Tab */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '11.5px', color: '#475569' }}>
                                            <div><strong>Profile:</strong> <span style={{ color: '#0f4c81', fontWeight: 700 }}>{aiRunnerState.activeProfileName || 'Profile Newland'}</span></div>
                                            <div><strong>Tab:</strong> <span style={{ color: '#2563eb', fontWeight: 700 }}>{aiRunnerState.activeTabName || 'Sheet1'}</span></div>
                                        </div>

                                        {/* Active Task */}
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', background: '#f8fafc', padding: '5px 8px', borderRadius: '6px', borderLeft: '3px solid #0f4c81' }}>
                                            {aiRunnerState.activeTaskName || 'Viết SAPO'}
                                        </div>

                                        {/* Progress Bar & Text */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                                                <span>{aiRunnerState.completedCount + aiRunnerState.skipCount + aiRunnerState.errorCount}/{aiRunnerState.totalRows || 0} hoàn thành</span>
                                                <span>{aiRunnerState.currentProgressPercent || 0}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${aiRunnerState.currentProgressPercent || 0}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(90deg, #0f4c81 0%, #16a34a 100%)',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>
                                        </div>

                                        {/* 4 Badges */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                            <div style={{ fontSize: '10.5px', padding: '3px 5px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', color: '#166534', fontWeight: 600 }}>✓ {aiRunnerState.completedCount || 0} Xong</div>
                                            <div style={{ fontSize: '10.5px', padding: '3px 5px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', color: '#475569', fontWeight: 600 }}>⏳ {aiRunnerState.pendingCount || 0} Chờ</div>
                                            <div style={{ fontSize: '10.5px', padding: '3px 5px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontWeight: 600 }}>⚠️ {aiRunnerState.errorCount || 0} Lỗi</div>
                                            <div style={{ fontSize: '10.5px', padding: '3px 5px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', color: '#92400e', fontWeight: 600 }}>⏭️ {aiRunnerState.skipCount || 0} Skip</div>
                                        </div>

                                        {/* Nút Cấu hình */}
                                        <button
                                            type="button"
                                            onClick={() => router.push('/ai-assistant')}
                                            style={{
                                                width: '100%',
                                                padding: '6px 10px',
                                                background: '#0f4c81',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontWeight: 700,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'center'
                                            }}
                                        >
                                            Cấu hình
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* ── 2. Crawl Accordion Item ── */}
                            <div ref={crawlAccordionRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={toggleCrawlAccordion}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justify: 'space-between',
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '16px',
                                        background: showCrawlSideview ? '#7dd3fc' : '#e0f2fe',
                                        border: '1.5px solid #38bdf8',
                                        color: '#0369a1',
                                        fontWeight: 800,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        boxShadow: showCrawlSideview ? '0 0 0 2px rgba(56, 189, 248, 0.4)' : 'none',
                                        transition: 'all 0.2s ease',
                                        boxSizing: 'border-box'
                                    }}
                                    title="Click để mở/đóng Tiến trình Crawl"
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                        🚀 Crawl
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: '12px', whiteSpace: 'nowrap', fontWeight: 800 }}>
                                        {formatCount(crawlerStatus?.current_item || 0)} / {formatCount(crawlerStatus?.total_items || 0)}
                                        {showCrawlSideview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </span>
                                </button>

                                {/* Accordion Expanded Content: Crawl Process Card */}
                                {showCrawlSideview && (
                                    <div style={{
                                        padding: '12px',
                                        background: '#ffffff',
                                        borderRadius: '14px',
                                        border: '2px solid #f97316',
                                        boxShadow: '0 4px 16px rgba(249, 115, 22, 0.08)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        fontSize: '12px'
                                    }}>
                                        {/* Header */}
                                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            🚀 Tiến trình Crawl
                                        </div>

                                        {/* Profile & Waiting Info */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '11.5px', color: '#475569' }}>
                                            <div>
                                                <strong>Profile:</strong> <span style={{ color: '#f97316', fontWeight: 700 }}>{profiles.find(p => p.slug === crawlerStatus?.profile_slug)?.name || crawlerStatus?.profile_slug || 'Chưa chọn'}</span>
                                            </div>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <strong>Waiting:</strong> <span style={{ color: '#94a3b8' }}>{profiles.filter(p => p.slug !== crawlerStatus?.profile_slug).map(p => p.name).join(', ') || 'Không có'}</span>
                                            </div>
                                        </div>

                                        {/* Status Box */}
                                        <div style={{
                                            padding: '5px 8px',
                                            borderRadius: '6px',
                                            textAlign: 'center',
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            border: '1px solid',
                                            background: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? 'rgba(34, 197, 94, 0.1)' :
                                                        crawlerStatus?.status === 'Paused' ? 'rgba(245, 158, 11, 0.1)' :
                                                        crawlerStatus?.status === 'Error' ? 'rgba(239, 68, 68, 0.1)' : '#f8fafc',
                                            borderColor: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? 'rgba(34, 197, 94, 0.3)' :
                                                         crawlerStatus?.status === 'Paused' ? 'rgba(245, 158, 11, 0.3)' :
                                                         crawlerStatus?.status === 'Error' ? 'rgba(239, 68, 68, 0.3)' : '#e2e8f0',
                                            color: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? '#16a34a' :
                                                   crawlerStatus?.status === 'Paused' ? '#d97706' :
                                                   crawlerStatus?.status === 'Error' ? '#dc2626' :
                                                   crawlerStatus?.status === 'Completed' ? '#059669' : '#64748b'
                                        }}>
                                            {crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? 'Crawling' :
                                             crawlerStatus?.status === 'Paused' ? 'Stop' :
                                             crawlerStatus?.status === 'Error' ? 'Error' :
                                             crawlerStatus?.status === 'Completed' ? 'Completed' : 'Idle'}
                                        </div>

                                        {/* Progress Bar & Text */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                                                <span>{crawlerStatus?.current_item || 0}/{crawlerStatus?.total_items || 0} hoàn thành</span>
                                                <span style={{ color: '#f97316' }}>{crawlerStatus?.progress || 0}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                <div style={{
                                                    width: `${Math.min(100, Math.max(0, crawlerStatus?.progress || 0))}%`,
                                                    height: '100%',
                                                    background: crawlerStatus?.status === 'Paused' ? '#f59e0b' : crawlerStatus?.status === 'Completed' ? '#10b981' : '#f97316',
                                                    transition: 'width 0.4s ease'
                                                }} />
                                            </div>
                                        </div>

                                        {/* 4 Badges */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                            <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(34, 197, 94, 0.1)', color: '#15803d', border: '1px solid rgba(34, 197, 94, 0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                ✓ {crawlerStatus?.current_item || 0} Xong
                                            </div>
                                            <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(148, 163, 184, 0.1)', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: '10.5px' }}>
                                                ⏳ {Math.max(0, (crawlerStatus?.total_items || 0) - (crawlerStatus?.current_item || 0))} Chờ
                                            </div>
                                            <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                ⚠ {crawlerStatus?.failed_items || 0} Lỗi
                                            </div>
                                            <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(249, 115, 22, 0.1)', color: '#c2410c', border: '1px solid rgba(249, 115, 22, 0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                ⏭️ {crawlerStatus?.skipped_items || 0} Skip
                                            </div>
                                        </div>

                                        {/* Controls Row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                                            <button
                                                type="button"
                                                title="Tạm dừng"
                                                disabled={crawlerStatus?.status !== 'Running' && crawlerStatus?.status !== 'Starting'}
                                                onClick={async () => {
                                                    try {
                                                        await fetchApi('/api/products/crawler/pause', { method: 'POST' });
                                                        const s = await fetchApi('/api/products/crawler/status');
                                                        if (s) setCrawlerStatus(s);
                                                    } catch (e) {}
                                                }}
                                                style={{
                                                    flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? '#f59e0b' : '#f1f5f9',
                                                    color: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? 'white' : '#94a3b8',
                                                    border: '1px solid #cbd5e1', borderRadius: '6px', cursor: crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? 'pointer' : 'not-allowed'
                                                }}
                                            >
                                                <Pause size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                title="Tiếp tục"
                                                disabled={crawlerStatus?.status !== 'Paused'}
                                                onClick={async () => {
                                                    try {
                                                        await fetchApi('/api/products/crawler/resume', { method: 'POST' });
                                                        const s = await fetchApi('/api/products/crawler/status');
                                                        if (s) setCrawlerStatus(s);
                                                    } catch (e) {}
                                                }}
                                                style={{
                                                    flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: crawlerStatus?.status === 'Paused' ? '#16a34a' : '#f1f5f9',
                                                    color: crawlerStatus?.status === 'Paused' ? 'white' : '#94a3b8',
                                                    border: '1px solid #cbd5e1', borderRadius: '6px', cursor: crawlerStatus?.status === 'Paused' ? 'pointer' : 'not-allowed'
                                                }}
                                            >
                                                <Play size={14} fill={crawlerStatus?.status === 'Paused' ? 'white' : '#94a3b8'} />
                                            </button>
                                            <button
                                                type="button"
                                                title="Dừng hẳn"
                                                disabled={crawlerStatus?.status !== 'Running' && crawlerStatus?.status !== 'Starting' && crawlerStatus?.status !== 'Paused'}
                                                onClick={async () => {
                                                    if (!window.confirm('Dừng crawler?')) return;
                                                    try {
                                                        await fetchApi('/api/products/crawler/stop', { method: 'POST' });
                                                        const s = await fetchApi('/api/products/crawler/status');
                                                        if (s) setCrawlerStatus(s);
                                                    } catch (e) {}
                                                }}
                                                style={{
                                                    flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: (crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' || crawlerStatus?.status === 'Paused') ? '#ef4444' : '#f1f5f9',
                                                    color: (crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' || crawlerStatus?.status === 'Paused') ? 'white' : '#94a3b8',
                                                    border: '1px solid #cbd5e1', borderRadius: '6px', cursor: (crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' || crawlerStatus?.status === 'Paused') ? 'pointer' : 'not-allowed'
                                                }}
                                            >
                                                <Square size={14} fill={(crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' || crawlerStatus?.status === 'Paused') ? 'white' : '#94a3b8'} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3. Image Downloader Accordion ── */}
                            {(() => {
                                const imgRunning = imgDownloadStatus?.status === 'running' || imgDownloadStatus?.status === 'loading';
                                const imgDone   = imgDownloadStatus?.status === 'completed' || imgDownloadStatus?.status === 'stopped';
                                const imgPct    = imgDownloadStatus?.total > 0
                                    ? Math.round((imgDownloadStatus.done / imgDownloadStatus.total) * 100) : 0;
                                const accentColor = imgRunning ? '#059669' : imgDone ? '#0369a1' : '#6b7280';
                                const bgColor     = showImgAccordion ? '#bbf7d0' : '#dcfce7';

                                return (
                                    <div ref={imgAccordionRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowImgAccordion(v => !v)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                width: '100%', padding: '10px 14px', borderRadius: '16px',
                                                background: bgColor, border: '1.5px solid #86efac',
                                                color: '#14532d', fontWeight: 800, fontSize: '13px',
                                                cursor: 'pointer',
                                                boxShadow: showImgAccordion ? '0 0 0 2px rgba(134,239,172,0.5)' : 'none',
                                                transition: 'all 0.2s ease', boxSizing: 'border-box'
                                            }}
                                            title="Click để mở/đóng Tiến trình Tải ảnh"
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                                <ImageDown size={15} /> Tải ảnh
                                                {imgRunning && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block', animation: 'imgPulse 1.2s infinite' }} />}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: '8px', whiteSpace: 'nowrap', fontWeight: 800 }}>
                                                {(imgDownloadStatus?.done || 0).toLocaleString('vi-VN')} / {(imgDownloadStatus?.total || 0).toLocaleString('vi-VN')}
                                                {showImgAccordion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </span>
                                        </button>

                                        {showImgAccordion && (
                                            <div style={{
                                                padding: '12px', background: '#ffffff', borderRadius: '14px',
                                                border: '2px solid #16a34a',
                                                boxShadow: '0 4px 16px rgba(22,163,74,0.08)',
                                                display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px'
                                            }}>
                                                {/* Header */}
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <ImageDown size={15} style={{ color: '#16a34a' }} /> Image Downloader
                                                    </span>
                                                    <span style={{
                                                        fontSize: '10px', padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                                                        background: imgRunning ? '#dcfce7' : imgDone ? '#dbeafe' : '#f1f5f9',
                                                        color: imgRunning ? '#15803d' : imgDone ? '#1d4ed8' : '#64748b'
                                                    }}>
                                                        {imgRunning ? '⚡ Đang tải' : imgDone ? (imgDownloadStatus?.status === 'completed' ? '✅ Xong' : '⛔ Dừng') : 'Chờ'}
                                                    </span>
                                                </div>

                                                {/* Progress */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                                                        <span>{(imgDownloadStatus?.done || 0).toLocaleString('vi-VN')}/{(imgDownloadStatus?.total || 0).toLocaleString('vi-VN')} ảnh</span>
                                                        <span style={{ color: '#16a34a' }}>{imgPct}%</span>
                                                    </div>
                                                    <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                        <div style={{
                                                            width: `${imgPct}%`, height: '100%', borderRadius: 4,
                                                            background: imgDone
                                                                ? (imgDownloadStatus?.status === 'completed' ? '#22c55e' : '#f59e0b')
                                                                : 'linear-gradient(90deg,#16a34a,#22c55e)',
                                                            transition: 'width 0.4s ease'
                                                        }} />
                                                    </div>
                                                </div>

                                                {/* Stats */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ✓ {(imgDownloadStatus?.ok || 0).toLocaleString('vi-VN')} Xong
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(148,163,184,0.1)', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ⏭️ {(imgDownloadStatus?.skip || 0).toLocaleString('vi-VN')} Đã có
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(239,68,68,0.1)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ⚠ {(imgDownloadStatus?.fail || 0).toLocaleString('vi-VN')} Lỗi
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        {imgDownloadStatus?.speed || 0} ảnh/s
                                                    </div>
                                                </div>

                                                {/* ETA */}
                                                {imgRunning && imgDownloadStatus?.eta > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                                                        ETA: <strong>{imgDownloadStatus.eta}s</strong>
                                                    </div>
                                                )}

                                                {/* Controls */}
                                                <div style={{ display: 'flex', gap: 5, borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                                                    {imgRunning && (
                                                        <button type="button" onClick={async () => { try { await fetchApi('/api/img-downloader/stop', { method: 'POST' }); } catch(e){} }}
                                                            style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                        >
                                                            <Square size={11} fill="white" /> Dừng
                                                        </button>
                                                    )}
                                                    {(imgDone || (!imgRunning && imgDownloadStatus?.status && imgDownloadStatus.status !== 'idle')) && (
                                                        <button type="button" onClick={async () => { try { await fetchApi('/api/img-downloader/reset', { method: 'POST' }); setImgDownloadStatus(null); } catch(e){} }}
                                                            style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                        >
                                                            ↺ Reset
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => setShowImgDownloader(true)}
                                                        style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                    >
                                                        ⚙ Cấu hình
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── 4. PDF Downloader Accordion ── */}
                            {(() => {
                                const pdfRunning = pdfDownloadStatus?.status === 'running' || pdfDownloadStatus?.status === 'loading';
                                const pdfDone   = pdfDownloadStatus?.status === 'completed' || pdfDownloadStatus?.status === 'stopped';
                                const pdfPct    = pdfDownloadStatus?.total > 0
                                    ? Math.round((pdfDownloadStatus.done / pdfDownloadStatus.total) * 100) : 0;
                                const bgColor   = showPdfAccordion ? '#bfdbfe' : '#dbeafe';

                                return (
                                    <div ref={pdfAccordionRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowPdfAccordion(v => !v)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                width: '100%', padding: '10px 14px', borderRadius: '16px',
                                                background: bgColor, border: '1.5px solid #93c5fd',
                                                color: '#1e40af', fontWeight: 800, fontSize: '13px',
                                                cursor: 'pointer',
                                                boxShadow: showPdfAccordion ? '0 0 0 2px rgba(147,197,253,0.5)' : 'none',
                                                transition: 'all 0.2s ease', boxSizing: 'border-box'
                                            }}
                                            title="Click để mở/đóng Tiến trình Tải PDF Drive"
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                                <FileText size={15} /> Tải PDF Drive
                                                {pdfRunning && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', display: 'inline-block', animation: 'imgPulse 1.2s infinite' }} />}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: '8px', whiteSpace: 'nowrap', fontWeight: 800 }}>
                                                {(pdfDownloadStatus?.done || 0).toLocaleString('vi-VN')} / {(pdfDownloadStatus?.total || 0).toLocaleString('vi-VN')}
                                                {showPdfAccordion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </span>
                                        </button>

                                        {showPdfAccordion && (
                                            <div style={{
                                                padding: '12px', background: '#ffffff', borderRadius: '14px',
                                                border: '2px solid #2563eb',
                                                boxShadow: '0 4px 16px rgba(37,99,235,0.08)',
                                                display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px'
                                            }}>
                                                {/* Header */}
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <FileText size={15} style={{ color: '#2563eb' }} /> PDF Downloader
                                                    </span>
                                                    <span style={{
                                                        fontSize: '10px', padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                                                        background: pdfRunning ? '#dcfce7' : pdfDone ? '#dbeafe' : '#f1f5f9',
                                                        color: pdfRunning ? '#15803d' : pdfDone ? '#1d4ed8' : '#64748b'
                                                    }}>
                                                        {pdfRunning ? '⚡ Đang tải' : pdfDone ? (pdfDownloadStatus?.status === 'completed' ? '✅ Xong' : '⛔ Dừng') : 'Chờ'}
                                                    </span>
                                                </div>

                                                {/* Progress */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                                                        <span>{(pdfDownloadStatus?.done || 0).toLocaleString('vi-VN')}/{(pdfDownloadStatus?.total || 0).toLocaleString('vi-VN')} file</span>
                                                        <span style={{ color: '#2563eb' }}>{pdfPct}%</span>
                                                    </div>
                                                    <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                        <div style={{
                                                            width: `${pdfPct}%`, height: '100%', borderRadius: 4,
                                                            background: pdfDone
                                                                ? (pdfDownloadStatus?.status === 'completed' ? '#22c55e' : '#f59e0b')
                                                                : 'linear-gradient(90deg,#2563eb,#3b82f6)',
                                                            transition: 'width 0.4s ease'
                                                        }} />
                                                    </div>
                                                </div>

                                                {/* Stats */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ✓ {(pdfDownloadStatus?.ok || 0).toLocaleString('vi-VN')} Upload
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(148,163,184,0.1)', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ⏭️ {(pdfDownloadStatus?.skip || 0).toLocaleString('vi-VN')} Đã có
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(239,68,68,0.1)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        ⚠ {(pdfDownloadStatus?.fail || 0).toLocaleString('vi-VN')} Lỗi
                                                    </div>
                                                    <div style={{ padding: '3px 5px', borderRadius: '5px', background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', fontWeight: 700, fontSize: '10.5px' }}>
                                                        {pdfDownloadStatus?.speed || 0} file/s
                                                    </div>
                                                </div>

                                                {/* ETA */}
                                                {pdfRunning && pdfDownloadStatus?.etaSec > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                                                        ETA: <strong>{pdfDownloadStatus.etaSec}s</strong>
                                                    </div>
                                                )}

                                                {/* Controls */}
                                                <div style={{ display: 'flex', gap: 5, borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                                                    {pdfRunning && (
                                                        <button type="button" onClick={async () => { try { await fetchApi('/api/pdf-downloader/stop', { method: 'POST' }); } catch(e){} }}
                                                            style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                        >
                                                            <Square size={11} fill="white" /> Dừng
                                                        </button>
                                                    )}
                                                    {(pdfDone || (!pdfRunning && pdfDownloadStatus?.status && pdfDownloadStatus.status !== 'idle')) && (
                                                        <button type="button" onClick={async () => { try { await fetchApi('/api/pdf-downloader/reset', { method: 'POST' }); setPdfDownloadStatus(null); } catch(e){} }}
                                                            style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                        >
                                                            ↺ Reset
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => setShowPdfDownloader(true)}
                                                        style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                                                    >
                                                        ⚙ Cấu hình
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </nav>
                <style>{`@keyframes imgPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">{getInitials(user.display_name)}</div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user.display_name}</div>
                        <div className="sidebar-user-role">{user.role === 'admin' ? 'Admin' : 'User'}</div>
                    </div>
                    <button className="sidebar-logout" onClick={logout} title="Logout"><LogOut size={18} /></button>
                </div>
            </aside>

            {/* ──────── Modal: Add Product Profile ──────── */}
            {showAddModal && (
                <div className="modal-backdrop" onClick={() => setShowAddModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 420, padding: 22, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={18} style={{ color: 'var(--accent)' }} /> Tạo Profile sản phẩm mới
                            </span>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Tên Profile (Ví dụ: Profile Honeywell, Profile Zebra)
                                </span>
                                <input
                                    type="text"
                                    value={newProfileName}
                                    onChange={e => setNewProfileName(e.target.value)}
                                    placeholder="Nhập tên Profile..."
                                    required
                                    autoFocus
                                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }}
                                />
                            </div>

                            <div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Tên thương hiệu / Hãng (Brand)
                                </span>
                                <input
                                    type="text"
                                    value={newBrandName}
                                    onChange={e => setNewBrandName(e.target.value)}
                                    placeholder="Ví dụ: Honeywell, Zebra, Datalogic"
                                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }}
                                />
                            </div>

                            <div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Link Website mẫu của hãng (Tùy chọn)
                                </span>
                                <input
                                    type="url"
                                    value={newTargetUrl}
                                    onChange={e => setNewTargetUrl(e.target.value)}
                                    placeholder="Ví dụ: https://www.honeywellaidc.com"
                                    style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={creating || !newProfileName.trim()}>
                                    {creating ? <Loader2 size={14} className="spin" /> : 'Tạo Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Image Downloader Modal ──────── */}
            <ImgDownloaderModal
                isOpen={showImgDownloader}
                onClose={() => setShowImgDownloader(false)}
            />

            {/* ──────── Context Menu (right-click on profile) ──────── */}
            {ctxMenu && (
                <div
                    ref={ctxRef}
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: ctxMenu.y,
                        left: ctxMenu.x,
                        zIndex: 999999,
                        background: 'var(--bg-card, #fff)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        minWidth: 200,
                        padding: '4px 0',
                        fontSize: 13
                    }}
                >
                    <div style={{ padding: '6px 14px 6px 14px', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, borderBottom: '1px solid var(--border-color)', marginBottom: 2 }}>
                        {ctxMenu.profile.name}
                    </div>
                    <button
                        type="button"
                        onClick={() => openEditModal(ctxMenu.profile)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Pencil size={14} /> Chỉnh sửa tên & link
                    </button>
                    <button
                        type="button"
                        onClick={() => { openEditModal(ctxMenu.profile); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Upload size={14} /> Nạp HAR để phân tích
                    </button>
                    {/* Separator */}
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                    <button
                        type="button"
                        onClick={() => handleDeleteProfile(ctxMenu.profile)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Trash2 size={14} /> Xóa Profile này
                    </button>
                </div>
            )}




            {/* ──────── Right-click Context Menu ──────── */}
            {editModal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setEditModal(null)}
                >
                    <div
                        className="card"
                        onClick={e => e.stopPropagation()}
                        style={{ width: 460, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Pencil size={16} style={{ color: 'var(--accent)' }} /> Chỉnh sửa Profile
                            </span>
                            <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        {/* Edit name */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Tên Profile</label>
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Tên Profile..."
                                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* Edit URL */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                                <LinkIcon size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                Link gốc / Website của hãng
                            </label>
                            <input
                                type="url"
                                value={editUrl}
                                onChange={e => setEditUrl(e.target.value)}
                                placeholder="https://..."
                                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* Edit Sitemap URL */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                                🗺️ Link Sitemap.xml của hãng (Tùy chọn)
                            </label>
                            <input
                                type="url"
                                value={editSitemapUrl}
                                onChange={e => setEditSitemapUrl(e.target.value)}
                                placeholder="https://www.example.com/sitemap.xml"
                                style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* Upload Sitemap XML File */}
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                                📄 Upload File sitemap.xml từ máy tính (Tùy chọn)
                            </label>
                            <input
                                type="file"
                                accept=".xml"
                                onChange={e => setEditSitemapFile(e.target.files?.[0] || null)}
                                style={{ width: '100%', fontSize: 12, padding: '7px 10px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-primary)' }}
                            />
                            {editSitemapFile && (
                                <div style={{ marginTop: 4, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                                    ✅ Đã chọn: {editSitemapFile.name} ({(editSitemapFile.size / 1024).toFixed(1)} KB)
                                </div>
                            )}
                        </div>

                        {/* Save name+url */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setEditModal(null)}>Hủy</button>
                            <button type="button" className="btn btn-secondary" onClick={handleSaveEdit} disabled={editSaving || !editName.trim()}>
                                {editSaving ? <Loader2 size={14} className="spin" /> : '💾 Lưu thay đổi'}
                            </button>
                        </div>

                        {/* Divider */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                                <Upload size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                Nạp file HAR để phân tích cấu trúc API
                            </label>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                                Export HAR từ DevTools (F12 → Network → chuột phải → Save all as HAR). File HAR sẽ được phân tích để trích xuất các API endpoint của profile này.
                            </p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="file"
                                    accept=".har,application/json"
                                    onChange={e => setEditHarFile(e.target.files?.[0] || null)}
                                    style={{ flex: 1, fontSize: 12, padding: '6px 8px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', cursor: 'pointer' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleHarUpload}
                                    disabled={!editHarFile || editSaving}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {editSaving ? <Loader2 size={14} className="spin" /> : <><Upload size={13} /> Upload</>}
                                </button>
                            </div>
                            {editHarFile && (
                                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                    📄 {editHarFile.name} ({(editHarFile.size / 1024).toFixed(0)} KB)
                                </div>
                            )}
                        </div>

                        {/* Status message */}
                        {editMsg && (
                            <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: editMsg.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: editMsg.startsWith('✅') ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                                {editMsg}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ImgDownloaderModal isOpen={showImgDownloader} onClose={() => setShowImgDownloader(false)} />
            <PdfDownloaderModal isOpen={showPdfDownloader} onClose={() => setShowPdfDownloader(false)} />
        </>
    );
}

