'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import { 
    LayoutDashboard, 
    Play, 
    RefreshCw, 
    Layers, 
    Database, 
    Loader2, 
    CheckCircle2, 
    AlertTriangle, 
    Clock,
    Square,
    RotateCcw,
    XCircle,
    ChevronDown,
    ChevronUp,
    Trash2,
    Pause
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
    const { user, hasPermission } = useAuth();
    const [activeDashboardTab, setActiveDashboardTab] = useState('overview');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('tab') === 'monitor') {
                setActiveDashboardTab('monitor');
            }
        }
    }, []);
    const [profiles, setProfiles] = useState([]);
    const [selectedProfiles, setSelectedProfiles] = useState(new Set());

    const fetchProfiles = async () => {
        try {
            const data = await fetchApi('/api/products/profiles');
            if (data?.profiles) setProfiles(data.profiles);
        } catch (e) {}
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const [stats, setStats] = useState({ totalProducts: 0, categoryCounts: [] });
    const [crawlerStatus, setCrawlerStatus] = useState({
        status: 'Idle',
        progress: 0,
        total_items: 0,
        current_item: 0,
        last_message: 'Ready'
    });
    const [logs, setLogs] = useState([]);
    const [concurrency, setConcurrency] = useState(3);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [fillingDownloads, setFillingDownloads] = useState(false);
    const [failedUrls, setFailedUrls] = useState({ count: 0, items: [] });
    const [showFailed, setShowFailed] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [urlSource, setUrlSource] = useState('local');
    const [customUrls, setCustomUrls] = useState('');
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [triggeringReScrape, setTriggeringReScrape] = useState(false);
    
    const intervalRef = useRef(null);
    const fileInputRef = useRef(null);

    const toast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    const fetchStatsAndStatus = async () => {
        try {
            const [statsData, statusData] = await Promise.all([
                fetchApi('/api/products/stats'),
                fetchApi('/api/products/crawler/status')
            ]);
            if (statsData) setStats(statsData);
            if (statusData) setCrawlerStatus(statusData);
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const logsData = await fetchApi('/api/products/crawler/logs');
            if (logsData) setLogs(logsData);
        } catch (err) {
            console.error('Error fetching logs:', err);
        }
    };

    const fetchFailed = async () => {
        try {
            const data = await fetchApi('/api/products/crawler/failed');
            if (data) setFailedUrls(data);
        } catch (err) {
            console.error('Error fetching failed URLs:', err);
        }
    };

    useEffect(() => {
        fetchStatsAndStatus();
        fetchLogs();
        fetchFailed();
        
        // Poll status and logs every 2 seconds
        intervalRef.current = setInterval(async () => {
            try {
                const statusData = await fetchApi('/api/products/crawler/status');
                if (statusData) {
                    setCrawlerStatus(statusData);
                    if (statusData.status === 'Running' || statusData.status === 'Starting') {
                        const statsData = await fetchApi('/api/products/stats');
                        if (statsData) setStats(statsData);
                    }
                    fetchLogs();
                    // Refresh failed list after crawler finishes
                    if (statusData.status === 'Completed' || statusData.status === 'Error') {
                        fetchFailed();
                    }
                }
            } catch (err) {
                console.error(err);
            }
        }, 2000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const triggerCrawler = async () => {
        if (crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') {
            toast('Crawler is already running!', 'warning');
            return;
        }
        
        setTriggering(true);
        try {
            await fetchApi('/api/products/crawler/trigger', { 
                method: 'POST',
                body: JSON.stringify({ concurrency })
            });
            toast('Crawler triggered successfully!', 'success');
            fetchStatsAndStatus();
            fetchLogs();
        } catch (err) {
            toast(err.message || 'Failed to trigger crawler', 'danger');
        } finally {
            setTriggering(false);
        }
    };

    const stopCrawler = async () => {
        setStopping(true);
        try {
            await fetchApi('/api/products/crawler/stop', { method: 'POST' });
            toast('Crawler stopped by user.', 'warning');
            fetchStatsAndStatus();
            fetchLogs();
        } catch (err) {
            toast(err.message || 'Failed to stop crawler', 'danger');
        } finally {
            setStopping(false);
        }
    };

    const retryFailed = async () => {
        if (crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') {
            toast('Crawler is already running!', 'warning');
            return;
        }
        setRetrying(true);
        try {
            const res = await fetchApi('/api/products/crawler/retry-failed', {
                method: 'POST',
                body: JSON.stringify({ concurrency: Math.min(concurrency, 2) })
            });
            toast(res.message || 'Retry triggered!', 'success');
            fetchStatsAndStatus();
            fetchLogs();
        } catch (err) {
            toast(err.message || 'Failed to trigger retry', 'danger');
        } finally {
            setRetrying(false);
        }
    };

    const handleClearFailed = async () => {
        if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử URL cào lỗi?')) return;
        try {
            await fetchApi('/api/products/crawler/failed', { method: 'DELETE' });
            toast('Đã xóa lịch sử lỗi thành công.', 'success');
            fetchFailed();
        } catch (err) {
            console.error('Failed to clear logs:', err);
            toast('Lỗi xóa lịch sử.', 'danger');
        }
    };

    const fillDownloads = async () => {
        if (crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') {
            toast('Crawler is already running!', 'warning');
            return;
        }
        setFillingDownloads(true);
        try {
            const res = await fetchApi('/api/products/crawler/fill-downloads', {
                method: 'POST',
                body: JSON.stringify({ concurrency })
            });
            toast(res.message || 'Fill Downloads triggered!', 'success');
            fetchStatsAndStatus();
            fetchLogs();
        } catch (err) {
            toast(err.message || 'Failed to trigger fill-downloads', 'danger');
        } finally {
            setFillingDownloads(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadedFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            setCustomUrls(event.target.result);
        };
        reader.readAsText(file);
    };

    const triggerReScrape = async () => {
        if (crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') {
            toast('Crawler is already running!', 'warning');
            return;
        }
        
        setTriggeringReScrape(true);
        try {
            let payload = { concurrency };
            if (urlSource === 'local') {
                payload.useLocalFile = true;
            } else {
                const urls = customUrls
                    .split('\n')
                    .map(u => u.trim())
                    .filter(u => u.startsWith('http'));
                
                if (urls.length === 0) {
                    toast('Không tìm thấy link hợp lệ nào trong danh sách!', 'warning');
                    setTriggeringReScrape(false);
                    return;
                }
                payload.urls = urls;
            }

            const res = await fetchApi('/api/products/crawler/trigger-from-file', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            toast(res.message || 'Bắt đầu cào lại thông tin sản phẩm!', 'success');
            fetchStatsAndStatus();
            fetchLogs();
        } catch (err) {
            toast(err.message || 'Lỗi khi kích hoạt cào lại thông tin', 'danger');
        } finally {
            setTriggeringReScrape(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, border: '4px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    // Chart formatting
    const chartData = stats.categoryCounts.map(cat => ({
        name: cat.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        count: cat.count
    }));

    // Status icon mapping
    const getStatusIcon = () => {
        switch (crawlerStatus.status) {
            case 'Running':
                return <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />;
            case 'Starting':
                return <Clock size={24} style={{ color: '#eab308' }} />;
            case 'Completed':
                return <CheckCircle2 size={24} style={{ color: '#10b981' }} />;
            case 'Error':
                return <AlertTriangle size={24} style={{ color: '#ef4444' }} />;
            default:
                return <Database size={24} style={{ color: 'var(--text-muted)' }} />;
        }
    };

    return (
        <div className="page-content">
            {/* Toasts */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LayoutDashboard style={{ color: 'var(--accent)' }} /> Dashboard
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Quản lý và theo dõi tiến trình crawl dữ liệu sản phẩm.
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={() => { fetchStatsAndStatus(); fetchLogs(); fetchProfiles(); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={14} /> Làm mới
                </button>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(249,115,22,0.1)', color: 'var(--accent)', flexShrink: 0 }}><Database size={22} /></div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Tổng Sản Phẩm</div>
                        <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.totalProducts}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', flexShrink: 0 }}><Layers size={22} /></div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Danh Mục</div>
                        <div style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.categoryCounts.length}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(234,179,8,0.1)', color: '#eab308', flexShrink: 0 }}>{getStatusIcon()}</div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Crawler Status</div>
                        <div style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {crawlerStatus.status}
                            {(crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') && (
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>({crawlerStatus.progress}%)</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* 1. CRAWLER MONITOR */}
                <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: 16, color: 'white', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 22 }}>🚀</span>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Crawler Monitor</h3>
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span><strong>Profile đang crawl:</strong></span>
                                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{profiles.find(p => p.slug === crawlerStatus?.profile_slug)?.name || crawlerStatus?.profile_slug || '—'}</span>
                            </div>
                        </div>
                        <div>
                            {crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontSize: 13, fontWeight: 700, border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 0 12px rgba(74,222,128,0.3)' }}>
                                    <Loader2 size={14} /> 🟢 Crawling
                                </span>
                            ) : crawlerStatus?.status === 'Completed' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(16,185,129,0.2)', color: '#10b981', fontSize: 13, fontWeight: 700, border: '1px solid rgba(16,185,129,0.4)' }}>✅ Hoàn thành</span>
                            ) : crawlerStatus?.status === 'Paused' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontSize: 13, fontWeight: 700, border: '1px solid rgba(245,158,11,0.4)' }}>🟡 Tạm dừng</span>
                            ) : crawlerStatus?.status === 'Error' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 13, fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)' }}>🔴 Lỗi</span>
                            ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(148,163,184,0.2)', color: '#cbd5e1', fontSize: 13, fontWeight: 700, border: '1px solid rgba(148,163,184,0.4)' }}>⚪ Idle</span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span style={{ color: '#94a3b8' }}>{crawlerStatus?.last_message || 'Sẵn sàng khởi chạy...'}</span>
                            <span style={{ color: '#38bdf8', fontWeight: 800 }}>{crawlerStatus?.current_item || 0}/{crawlerStatus?.total_items || 0} &nbsp; {crawlerStatus?.progress || 0}%</span>
                        </div>
                        <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.max(2, crawlerStatus?.progress || 0))}%`, height: '100%', background: crawlerStatus?.status === 'Paused' ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : crawlerStatus?.status === 'Completed' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#0284c7,#38bdf8)', borderRadius: 6, transition: 'width 0.4s' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.2)', color: '#34d399', fontSize: 12, fontWeight: 700, border: '1px solid rgba(16,185,129,0.3)' }}>✓ {crawlerStatus?.current_item || 0} Xong</span>
                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(148,163,184,0.15)', color: '#94a3b8', fontSize: 12, fontWeight: 700, border: '1px solid rgba(148,163,184,0.3)' }}>⏳ {Math.max(0, (crawlerStatus?.total_items || 0) - (crawlerStatus?.current_item || 0))} Chờ</span>
                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }}>⚠ {failedUrls?.count || 0} Lỗi</span>
                    </div>

                    <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #334155', paddingTop: 16, flexWrap: 'wrap' }}>
                        {crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting' ? (
                            <>
                                <button type="button" onClick={async () => { try { await fetchApi('/api/products/crawler/pause', { method: 'POST' }); toast('⏸️ Đã tạm dừng!', 'warning'); fetchStatsAndStatus(); } catch (err) { toast('❌ ' + err.message, 'danger'); } }}
                                    style={{ padding: '8px 18px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⏸️ Tạm Dừng</button>
                                <button type="button" onClick={async () => { if (!confirm('Dừng crawler?')) return; try { await fetchApi('/api/products/crawler/stop', { method: 'POST' }); toast('🛑 Đã dừng!', 'warning'); fetchStatsAndStatus(); } catch (err) { toast('❌ ' + err.message, 'danger'); } }}
                                    style={{ padding: '8px 18px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⏹️ Dừng Hẳn</button>
                            </>
                        ) : crawlerStatus?.status === 'Paused' ? (
                            <>
                                <button type="button" onClick={async () => { try { await fetchApi('/api/products/crawler/resume', { method: 'POST' }); toast('▶️ Đã tiếp tục!', 'success'); fetchStatsAndStatus(); } catch (err) { toast('❌ ' + err.message, 'danger'); } }}
                                    style={{ padding: '8px 18px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>▶️ Tiếp Tục</button>
                                <button type="button" onClick={async () => { try { await fetchApi('/api/products/crawler/stop', { method: 'POST' }); toast('🛑 Đã hủy!', 'warning'); fetchStatsAndStatus(); } catch (err) { toast('❌ ' + err.message, 'danger'); } }}
                                    style={{ padding: '8px 18px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⏹️ Hủy</button>
                            </>
                        ) : null}
                    </div>
                </div>

                {/* 2. CHỌN PROFILE ĐỂ CRAWL */}
                <div className="card" style={{ padding: 20, borderRadius: 16, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layers size={16} style={{ color: 'var(--accent)' }} /> Chọn Profile để Crawl
                        </h4>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setSelectedProfiles(new Set(profiles.map(p => p.slug)))}
                                style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(14,165,233,0.1)', color: 'var(--accent)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Chọn tất cả</button>
                            <button type="button" onClick={() => setSelectedProfiles(new Set())}
                                style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Bỏ chọn</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {profiles.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Chưa có Profile. Hãy thêm ở trang Crawl.</div>
                        ) : profiles.map(profile => {
                            const isSelected = selectedProfiles.has(profile.slug);
                            const isRunning = crawlerStatus?.profile_slug === profile.slug && (crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting');
                            const isCompleted = crawlerStatus?.profile_slug === profile.slug && crawlerStatus?.status === 'Completed';
                            const prog = isRunning ? (crawlerStatus?.progress || 0) : isCompleted ? 100 : 0;
                            const isBusy = crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting';
                            return (
                                <div key={profile.slug}
                                    onClick={() => { if (isBusy) return; setSelectedProfiles(prev => { const n = new Set(prev); if (n.has(profile.slug)) n.delete(profile.slug); else n.add(profile.slug); return n; }); }}
                                    style={{ padding: '14px 16px', borderRadius: 12, border: `2px solid ${isRunning || isCompleted ? '#10b981' : isSelected ? 'var(--accent)' : 'var(--border-color)'}`, background: isRunning ? 'rgba(16,185,129,0.05)' : isCompleted ? 'rgba(16,185,129,0.03)' : isSelected ? 'rgba(14,165,233,0.05)' : 'var(--bg-primary)', cursor: isBusy ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 8, background: isRunning || isCompleted ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🕷️</div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{profile.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Profile: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{profile.slug}</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            {isRunning && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)' }}>✓ Đang chạy</span>}
                                            {isCompleted && !isRunning && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)' }}>✓ Hoàn thành</span>}
                                            {!isRunning && !isCompleted && (
                                                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-color)'}`, background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {isSelected && <span style={{ color: 'white', fontSize: 12 }}>✓</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {(isRunning || isCompleted) && (
                                        <div style={{ marginTop: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                                <span>{crawlerStatus?.current_item || 0}/{crawlerStatus?.total_items || 0} hoàn thành</span>
                                                <span style={{ fontWeight: 700, color: '#10b981' }}>{prog}%</span>
                                            </div>
                                            <div style={{ height: 6, background: 'rgba(16,185,129,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ width: `${prog}%`, height: '100%', background: 'linear-gradient(90deg,#10b981,#34d399)', borderRadius: 4, transition: 'width 0.4s' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. SỐ LUỒNG + NÚT CRAWL */}
                {selectedProfiles.size > 0 && !(crawlerStatus?.status === 'Running' || crawlerStatus?.status === 'Starting') && (
                    <div className="card" style={{ padding: 20, borderRadius: 16, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            ⚡ Cấu hình & Khởi chạy
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>Số luồng xử lý song song (Concurrency):</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button type="button" onClick={() => setConcurrency(c => Math.max(1, c - 1))}
                                    style={{ width: 30, height: 30, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                <input type="number" min="1" max="15" value={concurrency}
                                    onChange={(e) => setConcurrency(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                                    style={{ width: 54, padding: '6px 8px', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'center', outline: 'none', color: 'var(--accent)', background: 'rgba(14,165,233,0.05)' }} />
                                <button type="button" onClick={() => setConcurrency(c => Math.min(15, c + 1))}
                                    style={{ width: 30, height: 30, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                        </div>
                        <button type="button" disabled={triggering}
                            onClick={async () => {
                                const slugs = Array.from(selectedProfiles);
                                setTriggering(true);
                                try {
                                    for (const slug of slugs) {
                                        await fetchApi('/api/products/crawler/trigger', { method: 'POST', body: JSON.stringify({ concurrency, profile: slug }) });
                                    }
                                    toast(`🚀 Đã khởi chạy ${slugs.length} profile!`, 'success');
                                    fetchStatsAndStatus();
                                    fetchLogs();
                                } catch (err) { toast('❌ ' + (err.message || 'Lỗi khi khởi chạy'), 'danger'); }
                                finally { setTriggering(false); }
                            }}
                            style={{ width: '100%', padding: '13px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: triggering ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: triggering ? 0.7 : 1 }}>
                            {triggering ? <><Loader2 size={16} /> Đang khởi chạy...</> : <><Play size={16} fill="white" /> Bắt đầu Crawl {selectedProfiles.size} Profile đã chọn</>}
                        </button>
                    </div>
                )}

                {/* 4. BIỂU ĐỒ PHÂN PHỐI */}
                <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Phân Phối Sản Phẩm theo Danh Mục</h3>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval={0} angle={-30} textAnchor="end" />
                                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }} labelStyle={{ fontWeight: 600, color: 'var(--text-primary)' }} />
                                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', minHeight: 200 }}>
                            Chưa có dữ liệu. Hãy chạy crawler để thu thập sản phẩm.
                        </div>
                    )}
                </div>

                {/* 5. CRAWL LOG */}
                <div className="card" style={{ padding: 20, background: '#0f172a', color: '#f8fafc', borderRadius: 16, border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>📟 Crawl Log (Realtime) <span style={{ fontSize: 11, color: '#475569', fontWeight: 400 }}>{logs.length} dòng</span></span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={fetchLogs} style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, color: '#64748b', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>↻ Làm mới</button>
                            <button type="button" onClick={() => setLogs([])} style={{ background: 'none', border: '1px solid #ef444440', borderRadius: 6, color: '#f87171', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>🗑 Xóa log</button>
                        </div>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {logs.length === 0 ? (
                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>Chưa có log. Bắt đầu crawl để xem nhật ký trực tiếp.</span>
                        ) : (
                            [...logs].reverse().slice(0, 100).map((log, idx) => (
                                <div key={idx} style={{ color: log.message?.includes('Error') || log.message?.includes('Lỗi') || log.message?.includes('fail') ? '#fca5a5' : log.message?.includes('OK') || log.message?.includes('success') || log.message?.includes('Thành công') ? '#86efac' : '#e2e8f0' }}>
                                    <span style={{ color: '#475569', marginRight: 8 }}>[{new Date(log.created_at || Date.now()).toLocaleTimeString('vi-VN')}]</span>{log.message}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 6. FAILED URLs & RETRY */}
                <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: `1px solid ${failedUrls.count > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border-color)'}`, boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFailed && failedUrls.count > 0 ? 16 : 0 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: failedUrls.count > 0 ? '#ef4444' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <XCircle size={18} style={{ color: failedUrls.count > 0 ? '#ef4444' : 'var(--text-muted)' }} />
                            Failed URLs & Retry
                            {failedUrls.count > 0 && (
                                <span style={{ background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{failedUrls.count}</span>
                            )}
                        </h3>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {failedUrls.count > 0 && crawlerStatus.status !== 'Running' && crawlerStatus.status !== 'Starting' && (
                                <button onClick={handleClearFailed} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '7px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                                    <Trash2 size={13} /> Xóa lịch sử lỗi
                                </button>
                            )}
                            {failedUrls.count > 0 && crawlerStatus.status !== 'Running' && crawlerStatus.status !== 'Starting' && (
                                <button onClick={retryFailed} disabled={retrying} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444', padding: '7px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                    {retrying ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />} Retry Failed ({failedUrls.count})
                                </button>
                            )}
                            {failedUrls.count > 0 && (
                                <button onClick={() => setShowFailed(p => !p)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                    {showFailed ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showFailed ? 'Ẩn' : 'Xem danh sách'}
                                </button>
                            )}
                        </div>
                    </div>
                    {failedUrls.count === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 size={15} style={{ color: '#10b981' }} /> Không có URL lỗi — tất cả đã crawl thành công.
                        </div>
                    ) : showFailed ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                            {failedUrls.items.map((item) => (
                                <div key={item.id} style={{ background: 'var(--bg-primary)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.slug}</div>
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.url}</a>
                                            {item.error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.error}</div>}
                                        </div>
                                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>{item.category}</span>
                                            <span style={{ fontSize: 10, color: '#f87171' }}>{item.attempts}x failed</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

            </div>
        </div>
    );
}
