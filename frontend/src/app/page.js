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
    Trash2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
    const { user, hasPermission } = useAuth();
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
                        <LayoutDashboard style={{ color: 'var(--accent)' }} /> Dashboard Overview
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Monitor web scraping progress and analyze gathered product metrics.
                    </p>
                </div>
                <button 
                    className="btn btn-secondary" 
                    onClick={fetchStatsAndStatus}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Stat Cards Grid */}
            <div className="debt-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div className="debt-stat-card" style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <div className="debt-stat-icon primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(249,115,22,0.1)', color: 'var(--accent)', marginRight: 16 }}>
                        <Database size={22} />
                    </div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Total Products Crawled</div>
                        <div className="debt-stat-value" style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.totalProducts}</div>
                    </div>
                </div>

                <div className="debt-stat-card" style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <div className="debt-stat-icon info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', marginRight: 16 }}>
                        <Layers size={22} />
                    </div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Product Categories</div>
                        <div className="debt-stat-value" style={{ color: 'var(--text-primary)', fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.categoryCounts.length}</div>
                    </div>
                </div>

                <div className="debt-stat-card" style={{ display: 'flex', alignItems: 'center', padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <div className="debt-stat-icon warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(234,179,8,0.1)', color: '#eab308', marginRight: 16 }}>
                        {getStatusIcon()}
                    </div>
                    <div className="debt-stat-content">
                        <div className="debt-stat-label" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Crawler Engine Status</div>
                        <div className="debt-stat-value" style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {crawlerStatus.status} 
                            {(crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting') && (
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                                    ({crawlerStatus.progress}%)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Dashboard Layout (Split) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
                
                {/* Left Column: Crawler Management */}
                <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Crawler Engine Control</h3>
                    
                    <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)' }}>Scraping Progress</span>
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)' }}>
                                {crawlerStatus.current_item} / {crawlerStatus.total_items || 246} pages
                            </span>
                        </div>
                        
                        {/* Progress Bar Container */}
                        <div style={{ width: '100%', height: 10, background: 'var(--border-color)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
                            <div 
                                style={{ 
                                    width: `${crawlerStatus.progress}%`, 
                                    height: '100%', 
                                    background: 'var(--gradient-primary)', 
                                    transition: 'width 0.5s ease-out' 
                                }} 
                            />
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status Message:</span>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{crawlerStatus.last_message}</span>
                        </div>
                    </div>

                    {/* Concurrency Selector */}
                    {crawlerStatus.status !== 'Running' && crawlerStatus.status !== 'Starting' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                                Số luồng xử lý song song (Concurrency):
                            </span>
                            <input 
                                type="number" 
                                min="1" 
                                max="15" 
                                value={concurrency}
                                onChange={(e) => setConcurrency(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                                style={{
                                    width: 70,
                                    padding: '6px 10px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting' ? (
                            <>
                                <button 
                                    className="btn" 
                                    disabled
                                    style={{ 
                                        flex: 1, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: 10,
                                        background: 'rgba(249,115,22,0.1)',
                                        border: '1px solid var(--accent)',
                                        color: 'var(--accent)',
                                        padding: '12px',
                                        borderRadius: 'var(--radius-md)',
                                        fontWeight: 500
                                    }}
                                >
                                    <Loader2 className="spin" size={16} /> Crawling in Progress...
                                </button>
                                <button 
                                    className="btn" 
                                    onClick={stopCrawler}
                                    disabled={stopping}
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: 8,
                                        background: '#ef4444',
                                        border: 'none',
                                        color: 'white',
                                        padding: '12px 20px',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    {stopping ? <Loader2 className="spin" size={16} /> : <Square size={16} fill="white" />} Stop
                                </button>
                            </>
                        ) : (
                            <button 
                                className="btn btn-primary" 
                                onClick={triggerCrawler}
                                disabled={triggering}
                                style={{ 
                                    flex: 1, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: 10,
                                    background: 'var(--gradient-primary)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                }}
                            >
                                <Play size={16} fill="white" /> Start Headless Crawling Task
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Category Distribution Chart */}
                <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Products Distribution by Category</h3>
                    
                    {chartData.length > 0 ? (
                        <div style={{ flex: 1, minHeight: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis 
                                        dataKey="name" 
                                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                                        interval={0}
                                        angle={-30}
                                        textAnchor="end"
                                    />
                                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                        labelStyle={{ fontWeight: 600, color: 'var(--text-primary)' }}
                                    />
                                    <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', minHeight: 250 }}>
                            No charts data. Run the crawler to gather products.
                        </div>
                    )}
                </div>
            </div>

            {/* Re-scrape Custom list */}
            <div className="card" style={{ marginTop: 24, padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={18} style={{ color: 'var(--accent)' }} /> Lấy lại thông tin sản phẩm (Re-scrape)
                </h3>
                
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                    Nhập danh sách link sản phẩm bị thiếu thông tin để tiến hành cào lại và cập nhật/bổ sung vào cơ sở dữ liệu.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                    {/* Source Selection */}
                    <div style={{ display: 'flex', gap: 20 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', userSelect: 'none' }}>
                            <input 
                                type="radio" 
                                name="urlSource" 
                                checked={urlSource === 'local'} 
                                onChange={() => setUrlSource('local')}
                            />
                            Dùng file list-link.txt trên server
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', userSelect: 'none' }}>
                            <input 
                                type="radio" 
                                name="urlSource" 
                                checked={urlSource === 'custom'} 
                                onChange={() => setUrlSource('custom')}
                            />
                            Tải file .txt / Dán danh sách link
                        </label>
                    </div>

                    {urlSource === 'local' ? (
                        <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-muted)' }}>
                            Sẽ tự động đọc danh sách link từ file <code>list-link.txt</code> trong thư mục dự án trên server.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* File Upload Zone */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => fileInputRef.current.click()}
                                    style={{ fontSize: 12, padding: '6px 12px' }}
                                >
                                    Chọn file .txt
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    accept=".txt" 
                                    onChange={handleFileUpload} 
                                    style={{ display: 'none' }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {uploadedFileName || 'Chưa chọn file nào'}
                                </span>
                            </div>

                            {/* Textarea for links */}
                            <textarea
                                rows={6}
                                value={customUrls}
                                onChange={(e) => setCustomUrls(e.target.value)}
                                placeholder="Dán các link sản phẩm vào đây, mỗi link một dòng..."
                                style={{
                                    width: '100%',
                                    padding: 12,
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: 13,
                                    fontFamily: 'Consolas, Monaco, monospace',
                                    outline: 'none',
                                    resize: 'vertical'
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Trigger Button */}
                <button
                    onClick={triggerReScrape}
                    disabled={crawlerStatus.status === 'Running' || crawlerStatus.status === 'Starting' || triggeringReScrape}
                    className="btn btn-primary"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: 'var(--gradient-primary)',
                        border: 'none',
                        color: 'white',
                        padding: '10px 20px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: 13,
                        width: 'fit-content'
                    }}
                >
                    {triggeringReScrape ? <Loader2 className="spin" size={14} /> : <Play size={14} fill="white" />}
                    Bắt đầu lấy lại thông tin
                </button>
            </div>

            {/* Log Panel */}
            <div className="card" style={{ marginTop: 24, padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={18} style={{ color: 'var(--accent)' }} /> Live Crawler Logs
                </h3>
                <div 
                    style={{ 
                        background: '#0f172a', 
                        color: '#38bdf8', 
                        fontFamily: 'Consolas, Monaco, monospace', 
                        fontSize: 12.5, 
                        padding: 16, 
                        borderRadius: 'var(--radius-md)', 
                        height: 250, 
                        overflowY: 'auto',
                        border: '1px solid #1e293b',
                    }}
                >
                    {logs.length > 0 ? (
                        [...logs].reverse().map((log, idx) => (
                            <div key={idx} style={{ marginBottom: 4, lineHeight: 1.5, display: 'flex', gap: 12 }}>
                                <span style={{ color: '#64748b', userSelect: 'none' }}>[{log.time ? log.time.split(' ')[1] : ''}]</span>
                                <span style={{ color: log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('failed') ? '#f43f5e' : log.message.toLowerCase().includes('ok') ? '#4ade80' : '#f8fafc' }}>{log.message}</span>
                            </div>
                        ))
                    ) : (
                        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No log entries found. Start the crawler to stream logs.</div>
                    )}
                </div>
            </div>

            {/* Failed URLs Panel */}
            <div className="card" style={{ marginTop: 24, padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: `1px solid ${failedUrls.count > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border-color)'}`, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFailed && failedUrls.count > 0 ? 16 : 0 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: failedUrls.count > 0 ? '#ef4444' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <XCircle size={18} style={{ color: failedUrls.count > 0 ? '#ef4444' : 'var(--text-muted)' }} />
                        Failed URLs
                        {failedUrls.count > 0 && (
                            <span style={{ background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, marginLeft: 4 }}>
                                {failedUrls.count}
                            </span>
                        )}
                    </h3>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {failedUrls.count > 0 && crawlerStatus.status !== 'Running' && crawlerStatus.status !== 'Starting' && (
                            <button
                                onClick={handleClearFailed}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-secondary)',
                                    padding: '7px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 500
                                }}
                            >
                                <Trash2 size={13} />
                                Xóa lịch sử lỗi
                            </button>
                        )}
                        {failedUrls.count > 0 && crawlerStatus.status !== 'Running' && crawlerStatus.status !== 'Starting' && (
                            <button
                                onClick={retryFailed}
                                disabled={retrying}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.5)',
                                    color: '#ef4444',
                                    padding: '7px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600
                                }}
                            >
                                {retrying ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />}
                                Retry Failed ({failedUrls.count})
                            </button>
                        )}
                        {failedUrls.count > 0 && (
                            <button
                                onClick={() => setShowFailed(p => !p)}
                                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                            >
                                {showFailed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showFailed ? 'Hide' : 'Show list'}
                            </button>
                        )}
                    </div>
                </div>

                {failedUrls.count === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle2 size={15} style={{ color: '#10b981' }} /> No failed URLs — all crawled successfully.
                    </div>
                ) : showFailed ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                        {failedUrls.items.map((item) => (
                            <div key={item.id} style={{ background: 'var(--bg-primary)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.slug}
                                        </div>
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                            {item.url}
                                        </a>
                                        {item.error && (
                                            <div style={{ fontSize: 11, color: '#f87171', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.error}
                                            </div>
                                        )}
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
    );
}
