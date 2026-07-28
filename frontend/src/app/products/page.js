'use client';
import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import ImportSheetModal from '@/components/ImportSheetModal';
import AiAssistantModal from '@/components/AiAssistantModal';
import { 
    Search, 
    Download, 
    ExternalLink, 
    Eye, 
    Package, 
    X, 
    Filter,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Play,
    Bot,
    FileSpreadsheet,
    Pin,
    Edit3,
    Merge,
    Copy,
    Check,
    CheckCircle2
} from 'lucide-react';

function ProductsContent() {
    const { user, hasPermission } = useAuth();
    const searchParams = useSearchParams();
    const profileSlug = searchParams?.get('profile') || 'newland';
    const [currentProfile, setCurrentProfile] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);

    // Gating permissions
    if (!hasPermission('products')) {
        return (
            <div className="page-content">
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                    Access denied
                </div>
            </div>
        );
    }

    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
    const limit = 10;
    
    // Modal & Toast
    const [showModal, setShowModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [toasts, setToasts] = useState([]);

    const toast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    const fetchCategories = async () => {
        try {
            const data = await fetchApi('/api/products/categories');
            if (data) setCategories(data);
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const data = await fetchApi(`/api/products?search=${searchTerm}&category=${selectedCategory}&limit=${limit}&page=${currentPage}`);
            if (data) {
                setProducts(data.items);
                setTotalProducts(data.total);
                setTotalPages(Math.ceil(data.total / limit) || 1);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
            toast('Failed to load products list.', 'danger');
        } finally {
            setLoading(false);
        }
    };

    // Profile Sheet Data State
    const [profileSheets, setProfileSheets] = useState([]);
    const [activeSheetTabName, setActiveSheetTabName] = useState('');
    const [viewMode, setViewMode] = useState('sheet'); // 'sheet' | 'products'
    const [pageRowLimit, setPageRowLimit] = useState(100);

    useEffect(() => {
        setPageRowLimit(100);
    }, [activeSheetTabName]);

    const activePageSheetData = useMemo(() => {
        return profileSheets.find(s => s.name === activeSheetTabName)?.data || [];
    }, [profileSheets, activeSheetTabName]);

    const maxPageCols = useMemo(() => {
        if (!activePageSheetData.length) return 0;
        const sample = activePageSheetData.slice(0, 200);
        return sample.reduce((max, r) => Math.max(max, Array.isArray(r) ? r.length : 0), 0);
    }, [activePageSheetData]);

    const renderedPageRows = useMemo(() => {
        return activePageSheetData.slice(0, pageRowLimit);
    }, [activePageSheetData, pageRowLimit]);

    // AI Assistant modal & background task state
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiTaskState, setAiTaskState] = useState({
        isRunning: false,
        tabName: '',
        targetColIdx: 3,
        startRow: 1,
        endRow: 100,
        totalRows: 0,
        completedRows: 0,
        errorCount: 0,
        statusText: '',
        logs: []
    });

    // Active selected cell state (Google Sheets style border highlight)
    const [selectedPageCell, setSelectedPageCell] = useState(null); // { rIdx, cIdx }

    // Feature 1: Freeze rows (Ghim hàng)
    const [pageFreezeRows, setPageFreezeRows] = useState(1);

    // Feature 2: Double Click cell viewer / editor modal
    const [pageCellDetailModal, setPageCellDetailModal] = useState(null);
    const [copiedPageCell, setCopiedPageCell] = useState(false);

    // Feature 3: Ghép Cột Hàng (Batch Merge Columns)
    const [showPageMergeColsModal, setShowPageMergeColsModal] = useState(false);
    const [pageMergeTemplate, setPageMergeTemplate] = useState('');
    const [pageMergeTargetColIndex, setPageMergeTargetColIndex] = useState(0);
    const [pageMergeStartRow, setPageMergeStartRow] = useState(1);
    const [pageMergeEndRow, setPageMergeEndRow] = useState('');

    const evaluatePageTemplate = (template, rowArray) => {
        if (!template || !Array.isArray(rowArray)) return '';
        return template.replace(/\{\{([A-Z]+)\}\}/g, (match, p1) => {
            let colIndex = 0;
            for (let i = 0; i < p1.length; i++) {
                colIndex = colIndex * 26 + (p1.charCodeAt(i) - 64);
            }
            colIndex = colIndex - 1;
            return rowArray[colIndex] !== undefined && rowArray[colIndex] !== null ? String(rowArray[colIndex]) : '';
        });
    };

    const handleSavePageCellDetail = async (newVal) => {
        if (!pageCellDetailModal) return;
        const { rIdx, cIdx } = pageCellDetailModal;
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = [...s.data];
            if (!newData[rIdx]) newData[rIdx] = [];
            const newRow = [...newData[rIdx]];
            newRow[cIdx] = newVal;
            newData[rIdx] = newRow;
            return { ...s, data: newData };
        });
        setProfileSheets(updatedSheets);
        setPageCellDetailModal(null);
        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (e) {
            console.error('Failed to auto-save sheet edit:', e);
        }
    };

    const handleExecutePageMergeCols = async () => {
        if (!pageMergeTemplate.trim()) return;
        const start = Math.max(1, parseInt(pageMergeStartRow) || 1) - 1;
        
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const end = pageMergeEndRow ? Math.min(s.data.length, parseInt(pageMergeEndRow)) : s.data.length;
            const newData = s.data.map((row, idx) => {
                if (idx < start || idx >= end) return row;
                const mergedVal = evaluatePageTemplate(pageMergeTemplate, row);
                const newRow = Array.isArray(row) ? [...row] : [];
                newRow[pageMergeTargetColIndex] = mergedVal;
                return newRow;
            });
            return { ...s, data: newData };
        });
        setProfileSheets(updatedSheets);
        setShowPageMergeColsModal(false);
        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
            toast('Ghép cột dữ liệu thành công!', 'success');
        } catch (e) {
            console.error('Failed to auto-save merged sheet:', e);
        }
    };

    const fetchProfileSheetData = async () => {
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${profileSlug}`);
            if (data?.sheets && data.sheets.length > 0) {
                setProfileSheets(data.sheets);
                setActiveSheetTabName(data.sheets[0].name);
                setViewMode('sheet');
            } else {
                setProfileSheets([]);
                setViewMode('products');
            }
        } catch (err) {
            console.error('Failed to fetch profile sheet:', err);
        }
    };

    useEffect(() => {
        fetchProfileSheetData();
    }, [profileSlug]);

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        const fetchProfileInfo = async () => {
            try {
                const data = await fetchApi('/api/products/profiles');
                if (data?.profiles) {
                    const match = data.profiles.find(p => p.slug === profileSlug);
                    if (match) setCurrentProfile(match);
                    else setCurrentProfile({ name: profileSlug.charAt(0).toUpperCase() + profileSlug.slice(1), slug: profileSlug });
                }
            } catch (err) {}
        };
        fetchProfileInfo();
    }, [profileSlug]);

    useEffect(() => {
        fetchProducts();
    }, [searchTerm, selectedCategory, currentPage, profileSlug]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearchTerm(searchInput);
        setCurrentPage(1);
    };

    const handleCategoryChange = (e) => {
        setSelectedCategory(e.target.value);
        setCurrentPage(1);
    };

    const openProductDetails = (product) => {
        let specs = {};
        try { specs = JSON.parse(product.specifications); } catch (e) { specs = {}; }
        let downloads = [];
        try { downloads = JSON.parse(product.download_links) || []; } catch (e) { downloads = []; }
        setSelectedProduct({ ...product, parsedSpecs: specs, parsedDownloads: downloads });
        setShowModal(true);
    };

    const handleExport = async () => {
        try {
            const token = localStorage.getItem('token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
            
            toast('Generating Excel file...', 'info');
            
            const res = await fetch(`${apiUrl}/api/products/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ search: searchTerm, category: selectedCategory })
            });
            
            if (!res.ok) throw new Error('Failed to download Excel export');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Newland_Products_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast('Export completed successfully!', 'success');
        } catch (err) {
            console.error(err);
            toast(err.message || 'Excel export failed', 'danger');
        }
    };

    const formatCategory = (cat) => {
        return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    return (
        <div className="page-content">
            {/* Inline Toasts */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Package style={{ color: 'var(--accent)' }} /> Products — {currentProfile?.name?.startsWith('Profile') ? currentProfile.name : `Profile ${currentProfile?.name || 'Newland'}`}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Quản lý dữ liệu sản phẩm, thông số kỹ thuật và tài liệu của {currentProfile?.brand_name || currentProfile?.name || 'Profile'}.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button 
                        type="button"
                        className="btn"
                        onClick={() => toast(`Sẵn sàng kích hoạt Crawl cho ${currentProfile?.name || 'Profile'}`, 'info')}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 500, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <Play size={14} style={{ color: '#16a34a' }} /> Bắt đầu Crawl
                    </button>

                    <button 
                        type="button"
                        className="btn"
                        onClick={() => setShowAiModal(true)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 500, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <Bot size={14} style={{ color: '#2563eb' }} /> Mở AI Assistant
                    </button>

                    <button 
                        type="button"
                        className="btn"
                        onClick={() => setShowImportModal(true)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 500, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <FileSpreadsheet size={14} style={{ color: '#0284c7' }} /> Nhập file excel/link ggsheet
                    </button>

                    <button 
                        className="btn btn-primary" 
                        onClick={handleExport}
                        disabled={products.length === 0}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8,
                            background: 'var(--gradient-primary)',
                            border: 'none',
                            color: 'white',
                            padding: '9px 16px',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontSize: 13
                        }}
                    >
                        <Download size={14} /> Export to Excel
                    </button>
                </div>
            </div>

            {/* View Mode Switcher Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button
                    type="button"
                    className={`btn ${viewMode === 'sheet' ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('sheet')}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '8px 16px', fontWeight: viewMode === 'sheet' ? 600 : 500 }}
                >
                    <FileSpreadsheet size={16} style={{ color: viewMode === 'sheet' ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span>Bảng Dữ Liệu Sheet {profileSheets.length > 0 ? `(${profileSheets.length} tab)` : ''}</span>
                </button>

                <button
                    type="button"
                    className={`btn ${viewMode === 'products' ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('products')}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '8px 16px', fontWeight: viewMode === 'products' ? 600 : 500 }}
                >
                    <Package size={16} style={{ color: viewMode === 'products' ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span>Danh Sách Sản Phẩm Crawler ({totalProducts})</span>
                </button>
            </div>

            {/* View Mode 1: Bảng Dữ Liệu Sheet (Google Sheets Style) */}
            {viewMode === 'sheet' && (
                <div className="card" style={{ padding: 0, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginBottom: 24 }}>
                    {profileSheets.length > 0 ? (
                        <>
                            {/* Active Tab Header Bar */}
                            <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileSpreadsheet size={16} style={{ color: 'var(--accent)' }} /> 
                                    Đang xem: {activeSheetTabName} ({profileSheets.find(s => s.name === activeSheetTabName)?.data?.length || 0} hàng)
                                </span>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => setShowImportModal(true)}
                                        style={{ fontSize: 12.5, padding: '6px 12px', background: 'var(--bg-card)' }}
                                    >
                                        + Cập nhật / Nạp lại Sheet
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => setShowAiModal(true)}
                                        style={{
                                            background: 'var(--gradient-primary)',
                                            color: 'white',
                                            border: 'none',
                                            fontSize: 12.5,
                                            padding: '6px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontWeight: 600
                                        }}
                                    >
                                        <Bot size={15} /> 🤖 AI Trợ Lý (Tự động hóa)
                                    </button>
                                </div>
                            </div>

                            {/* Sheet View Tool Bar: Ghim hàng, Ghép cột, Mẹo click đúp */}
                            <div style={{ padding: '8px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                    {/* Freeze Rows selector */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                                        <Pin size={14} style={{ color: 'var(--accent)' }} />
                                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Ghim hàng:</span>
                                        <select
                                            value={pageFreezeRows}
                                            onChange={e => setPageFreezeRows(parseInt(e.target.value) || 0)}
                                            style={{ padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                        >
                                            <option value={0}>Không ghim</option>
                                            <option value={1}>Ghim Hàng 1 (Header)</option>
                                            <option value={2}>Ghim 2 hàng đầu</option>
                                            <option value={3}>Ghim 3 hàng đầu</option>
                                            <option value={5}>Ghim 5 hàng đầu</option>
                                        </select>
                                    </div>

                                    {/* Batch Merge Columns Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPageMergeTemplate('');
                                            setPageMergeTargetColIndex(0);
                                            setPageMergeStartRow(1);
                                            setPageMergeEndRow('');
                                            setShowPageMergeColsModal(true);
                                        }}
                                        style={{
                                            padding: '4px 12px',
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 12.5,
                                            fontWeight: 600,
                                            color: 'var(--accent)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6
                                        }}
                                    >
                                        <Merge size={14} /> 🔗 Ghép Cột / Hàng
                                    </button>
                                </div>

                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    💡 Click đúp (Double-click) vào bất kỳ ô nào để xem chi tiết & sửa nội dung
                                </span>
                            </div>

                            {/* Main Interactive Grid Table */}
                            <div className="sheet-table-container" style={{ maxHeight: 540 }}>
                                {(() => {
                                    const getColLetter = (idx) => {
                                        let temp, letter = '';
                                        while (idx >= 0) {
                                            temp = idx % 26;
                                            letter = String.fromCharCode(temp + 65) + letter;
                                            idx = Math.floor(idx / 26) - 1;
                                        }
                                        return letter;
                                    };

                                    if (activePageSheetData.length === 0) {
                                        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Tab này chưa có dữ liệu.</div>;
                                    }

                                    return (
                                        <table className="sheet-grid-table">
                                            <thead>
                                                <tr style={pageFreezeRows > 0 ? { position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' } : {}}>
                                                    <th className="row-index-header">#</th>
                                                    {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => (
                                                        <th key={cIdx}>{getColLetter(cIdx)}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {renderedPageRows.map((row, rIdx) => {
                                                    const isRowPinned = rIdx < pageFreezeRows;
                                                    const isLastPinnedRow = pageFreezeRows > 0 && rIdx === pageFreezeRows - 1;
                                                    return (
                                                        <tr
                                                            key={rIdx}
                                                            className={isLastPinnedRow ? 'pinned-row-last' : ''}
                                                            style={isRowPinned ? { position: 'sticky', top: (rIdx + 1) * 32, zIndex: 9, background: '#fffbeb' } : {}}
                                                        >
                                                            <td className="row-index-cell" style={isRowPinned ? { background: '#fef3c7', fontWeight: 700, color: '#b45309' } : {}}>
                                                                {rIdx + 1} {isRowPinned && '📌'}
                                                            </td>
                                                            {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => {
                                                                const cellVal = Array.isArray(row) ? row[cIdx] : '';
                                                                const valStr = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
                                                                const trimmedVal = valStr.trim();
                                                                const isUrl = trimmedVal.startsWith('http://') || trimmedVal.startsWith('https://') || trimmedVal.startsWith('www.');
                                                                const targetUrl = trimmedVal.startsWith('www.') ? `https://${trimmedVal}` : trimmedVal;

                                                                const isSelected = selectedPageCell?.rIdx === rIdx && selectedPageCell?.cIdx === cIdx;
                                                                return (
                                                                    <td
                                                                        key={cIdx}
                                                                        className={`${isSelected ? 'selected-cell' : ''} ${isUrl ? 'has-url-cell' : ''}`}
                                                                        title="Click đúp để xem & sửa ô này"
                                                                        onClick={() => setSelectedPageCell({ rIdx, cIdx })}
                                                                        onDoubleClick={() => {
                                                                            setSelectedPageCell({ rIdx, cIdx });
                                                                            setPageCellDetailModal({
                                                                                rIdx,
                                                                                cIdx,
                                                                                val: valStr,
                                                                                newVal: valStr,
                                                                                colLetter: getColLetter(cIdx)
                                                                            });
                                                                        }}
                                                                        style={{ cursor: 'pointer' }}
                                                                    >
                                                                        {isUrl ? (
                                                                            <div className="sheet-url-cell">
                                                                                <span className="sheet-url-link">{valStr}</span>
                                                                                {/* Google Sheets Hover Note Popup */}
                                                                                <div className="sheet-url-tooltip">
                                                                                    <span className="url-text">🌐 {valStr}</span>
                                                                                    <a
                                                                                        href={targetUrl}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="btn-open-link"
                                                                                        onClick={e => e.stopPropagation()}
                                                                                    >
                                                                                        <ExternalLink size={12} /> Mở liên kết
                                                                                    </a>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            valStr
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    );
                                })()}
                            </div>

                            {activePageSheetData.length > pageRowLimit && (
                                <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        Đang hiển thị <strong>{renderedPageRows.length}</strong> / <strong>{activePageSheetData.length.toLocaleString()}</strong> hàng (Tối ưu phản hồi mượt 60fps)
                                    </span>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            onClick={() => setPageRowLimit(prev => prev + 200)}
                                            style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-card)' }}
                                        >
                                            + Xem thêm 200 hàng
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setPageRowLimit(activePageSheetData.length)}
                                            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--accent)', fontWeight: 600 }}
                                        >
                                            Xem tất cả ({activePageSheetData.length.toLocaleString()} hàng)
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Google Sheets Bottom Tab Bar */}
                            <div className="sheet-bottom-bar">
                                {profileSheets.map(s => (
                                    <div
                                        key={s.name}
                                        className={`sheet-bottom-tab ${activeSheetTabName === s.name ? 'active' : ''}`}
                                        onClick={() => setActiveSheetTabName(s.name)}
                                    >
                                        <FileSpreadsheet size={14} />
                                        <span>{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <FileSpreadsheet size={42} style={{ color: 'var(--accent)', marginBottom: 12, opacity: 0.8 }} />
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Chưa có Bảng dữ liệu Sheet cho {currentProfile?.name || 'Profile này'}</h4>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
                                Vui lòng bấm nút "Nhập file excel/link ggsheet" ở trên để nạp dữ liệu vào Profile.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setShowImportModal(true)}
                                style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '10px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FileSpreadsheet size={16} /> + Nhập file Excel / Link Google Sheets ngay
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* View Mode 2: Filter Bar & Data Table Card (Products List) */}
            {viewMode === 'products' && (
                <div className="card" style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                
                {/* Search & Filters */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <Filter size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                            <select 
                                className="form-select" 
                                value={selectedCategory} 
                                onChange={handleCategoryChange}
                                style={{ 
                                    paddingLeft: 34, 
                                    height: 40, 
                                    width: 220, 
                                    borderRadius: 'var(--radius-md)', 
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-secondary)',
                                    fontSize: 13
                                }}
                            >
                                <option value="">All Categories</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{formatCategory(cat)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                            <input 
                                className="form-input" 
                                style={{ 
                                    paddingLeft: 36, 
                                    width: 280, 
                                    height: 40,
                                    borderRadius: 'var(--radius-md)', 
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: 13
                                }} 
                                placeholder="Search by name, spec, part number..." 
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>
                        <button 
                            type="submit" 
                            className="btn btn-secondary"
                            style={{ 
                                height: 40,
                                padding: '0 16px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                background: 'var(--bg-primary)',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            Search
                        </button>
                    </form>
                </div>

                {/* Table Wrapper */}
                <div className="table-wrapper" style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                <th style={{ padding: '12px 16px', width: 60 }}>#</th>
                                <th style={{ padding: '12px 16px', width: 90 }}>Thumbnail</th>
                                <th style={{ padding: '12px 16px' }}>Product Name</th>
                                <th style={{ padding: '12px 16px', width: 220 }}>Category</th>
                                <th style={{ padding: '12px 16px', width: 180 }}>Part Number</th>
                                <th style={{ padding: '12px 16px', width: 140, textAlign: 'center' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                                        Fetching products list...
                                    </td>
                                </tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        No products found. Start the crawler engine on the Dashboard to populate the database.
                                    </td>
                                </tr>
                            ) : (
                                products.map((prod, i) => (
                                    <tr key={prod.id} style={{ borderBottom: '1px solid var(--border-color)', height: 72 }}>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            {(currentPage - 1) * limit + i + 1}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {prod.image_url ? (
                                                <img 
                                                    src={prod.image_url} 
                                                    alt={prod.name} 
                                                    style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', padding: 4, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                                />
                                            ) : (
                                                <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                                    <Package size={24} style={{ color: 'var(--text-muted)' }} />
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {prod.name}
                                                <a href={prod.url} target="_blank" rel="noopener noreferrer" title="View original site" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                                                    <ExternalLink size={12} />
                                                </a>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                                            {formatCategory(prod.category)}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                                            {prod.part_number || '-'}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button 
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => openProductDetails(prod)}
                                                style={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    gap: 6,
                                                    padding: '6px 12px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    cursor: 'pointer',
                                                    fontSize: 12
                                                }}
                                            >
                                                <Eye size={14} /> View Specs
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {products.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            Showing <strong>{(currentPage - 1) * limit + 1}</strong> to <strong>{Math.min(currentPage * limit, totalProducts)}</strong> of <strong>{totalProducts}</strong> products
                        </span>
                        
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button 
                                className="btn btn-secondary btn-sm" 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            
                            <button 
                                className="btn btn-secondary btn-sm" 
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* Specifications Modal Overlay */}
            {showModal && selectedProduct && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Package size={20} style={{ color: 'var(--accent)' }} /> 
                                {selectedProduct.name} Specs
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="modal-body" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            
                            {/* Product Header Card */}
                            <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                                {selectedProduct.image_url ? (
                                    <img 
                                        src={selectedProduct.image_url} 
                                        alt={selectedProduct.name} 
                                        style={{ width: 100, height: 100, objectFit: 'contain', padding: 6, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#fff' }}
                                    />
                                ) : (
                                    <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                        <Package size={36} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 250 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>
                                        {formatCategory(selectedProduct.category)}
                                    </div>
                                    <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProduct.name}</h4>
                                    
                                    {selectedProduct.part_number && (
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            Part Number: <strong style={{ fontFamily: 'monospace' }}>{selectedProduct.part_number}</strong>
                                        </p>
                                    )}
                                    
                                    <a 
                                        href={selectedProduct.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ fontSize: 12, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontWeight: 500 }}
                                    >
                                        View original product page <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>

                            {/* Description block */}
                            {selectedProduct.description && (
                                <div style={{ marginBottom: 24 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Overview Description</h5>
                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        {selectedProduct.description}
                                    </p>
                                </div>
                            )}

                            {/* Specifications Grid */}
                            <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Technical Specifications</h5>
                            {Object.keys(selectedProduct.parsedSpecs).length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                                    {Object.entries(selectedProduct.parsedSpecs).map(([key, val]) => (
                                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 13, alignItems: 'start' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{key}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                                    No technical specifications parsed for this item.
                                </p>
                            )}

                            {/* Download Links */}
                            {selectedProduct.parsedDownloads && selectedProduct.parsedDownloads.length > 0 && (
                                <div style={{ marginTop: 28 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={15} style={{ color: 'var(--accent)' }} /> Downloads ({selectedProduct.parsedDownloads.length} files)
                                    </h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedProduct.parsedDownloads.map((dl, idx) => {
                                            const ext = dl.url.split('?')[0].split('.').pop().toLowerCase();
                                            const extColors = { pdf: '#ef4444', zip: '#f59e0b', exe: '#8b5cf6', apk: '#10b981', fw: '#0ea5e9', bin: '#64748b' };
                                            const color = extColors[ext] || '#64748b';
                                            return (
                                                <a
                                                    key={idx}
                                                    href={dl.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        padding: '10px 14px',
                                                        background: 'var(--bg-primary)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: 'var(--radius-md)',
                                                        textDecoration: 'none',
                                                        transition: 'border-color 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                                >
                                                    <span style={{
                                                        background: color + '22',
                                                        color,
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        padding: '3px 7px',
                                                        borderRadius: 4,
                                                        textTransform: 'uppercase',
                                                        minWidth: 36,
                                                        textAlign: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        {ext}
                                                    </span>
                                                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {dl.name}
                                                    </span>
                                                    <ExternalLink size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedProduct.parsedDownloads !== undefined && selectedProduct.parsedDownloads.length === 0 && (
                                <div style={{ marginTop: 28 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={15} style={{ color: 'var(--text-muted)' }} /> Downloads
                                    </h5>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No download files found for this product.</p>
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-primary)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Sub-Modal 1: Cell Detail Viewer & Editor (Products Page) */}
            {pageCellDetailModal && (
                <div className="modal-backdrop" onClick={() => setPageCellDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Edit3 size={18} style={{ color: 'var(--accent)' }} /> 
                                Chi Tiết Ô [{pageCellDetailModal.colLetter}{pageCellDetailModal.rIdx + 1}] — Hàng {pageCellDetailModal.rIdx + 1}
                            </span>
                            <button type="button" onClick={() => setPageCellDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ marginBottom: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Nội dung ô:
                            </label>
                            <textarea
                                value={pageCellDetailModal.newVal}
                                onChange={e => setPageCellDetailModal(p => ({ ...p, newVal: e.target.value }))}
                                style={{
                                    width: '100%',
                                    minHeight: 220,
                                    maxHeight: '55vh',
                                    padding: '12px 14px',
                                    fontSize: 13,
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'monospace',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.5
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                    navigator.clipboard.writeText(pageCellDetailModal.newVal);
                                    setCopiedPageCell(true);
                                    setTimeout(() => setCopiedPageCell(false), 2000);
                                }}
                                style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {copiedPageCell ? <Check size={15} style={{ color: '#16a34a' }} /> : <Copy size={15} />}
                                {copiedPageCell ? 'Đã sao chép!' : 'Sao chép nội dung'}
                            </button>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setPageCellDetailModal(null)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleSavePageCellDetail(pageCellDetailModal.newVal)}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <CheckCircle2 size={15} /> Lưu chỉnh sửa ô
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Modal 2: Batch Merge Columns Modal (Products Page) */}
            {showPageMergeColsModal && (
                <div className="modal-backdrop" onClick={() => setShowPageMergeColsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 540, maxWidth: '95%', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Merge size={18} style={{ color: 'var(--accent)' }} /> 🔗 Ghép Cột Hàng (Batch Merge Columns)
                            </span>
                            <button type="button" onClick={() => setShowPageMergeColsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    1. Chọn Cột Đích (Nơi lưu kết quả ghép):
                                </label>
                                <select
                                    value={pageMergeTargetColIndex}
                                    onChange={e => setPageMergeTargetColIndex(parseInt(e.target.value))}
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                >
                                    {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => (
                                        <option key={cIdx} value={cIdx}>
                                            Cột {(() => {
                                                let temp, letter = '';
                                                let colIndex = cIdx;
                                                while (colIndex >= 0) {
                                                    temp = colIndex % 26;
                                                    letter = String.fromCharCode(temp + 65) + letter;
                                                    colIndex = Math.floor(colIndex / 26) - 1;
                                                }
                                                return letter;
                                            })()} ({activePageSheetData[0]?.[cIdx] || `Cột`})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    2. Cấu trúc Ghép (Template):
                                </label>
                                <input
                                    type="text"
                                    value={pageMergeTemplate}
                                    onChange={e => setPageMergeTemplate(e.target.value)}
                                    placeholder="Ví dụ: {{A}} - {{B}} (Model: {{D}})"
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Chèn nhanh tag cột:</span>
                                    {Array.from({ length: Math.min(maxPageCols, 12) }).map((_, cIdx) => {
                                        let temp, letter = '';
                                        let colIndex = cIdx;
                                        while (colIndex >= 0) {
                                            temp = colIndex % 26;
                                            letter = String.fromCharCode(temp + 65) + letter;
                                            colIndex = Math.floor(colIndex / 26) - 1;
                                        }
                                        return (
                                            <button
                                                key={letter}
                                                type="button"
                                                onClick={() => setPageMergeTemplate(prev => prev + `{{${letter}}}`)}
                                                style={{ padding: '2px 7px', fontSize: 11.5, background: '#fff7ed', border: '1px solid #ffedd5', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                + {`{{${letter}}}`}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Từ hàng số:
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={pageMergeStartRow}
                                        onChange={e => setPageMergeStartRow(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Đến hàng số:
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="Mặc định: Hàng cuối"
                                        value={pageMergeEndRow}
                                        onChange={e => setPageMergeEndRow(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                            </div>

                            {/* Live Preview Box */}
                            {pageMergeTemplate.trim() && (
                                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
                                    <strong style={{ color: '#16a34a', display: 'block', marginBottom: 2 }}>
                                        🔍 Xem trước kết quả mẫu (Hàng 1):
                                    </strong>
                                    <span style={{ color: '#15803d', fontFamily: 'monospace' }}>
                                        {evaluatePageTemplate(pageMergeTemplate, activePageSheetData[0] || []) || '(Rỗng)'}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPageMergeColsModal(false)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleExecutePageMergeCols}
                                    disabled={!pageMergeTemplate.trim()}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <Merge size={15} /> Bắt đầu Ghép Cột
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Sheet & Excel Modal */}
            <ImportSheetModal 
                isOpen={showImportModal} 
                onClose={() => setShowImportModal(false)} 
                profileName={currentProfile?.name || 'Profile'} 
                profileSlug={profileSlug}
                onImportSuccess={fetchProfileSheetData}
            />

            {/* AI Assistant Integrated Modal */}
            <AiAssistantModal
                isOpen={showAiModal}
                onClose={() => setShowAiModal(false)}
                profileName={currentProfile?.name || 'Profile'}
                profileSlug={profileSlug}
                sheets={profileSheets}
                activeTabName={activeSheetTabName}
                onUpdateSheets={(newSheets) => setProfileSheets(newSheets)}
                aiState={aiTaskState}
                setAiState={setAiTaskState}
            />

            {/* Floating Background AI Task Running Notification */}
            {aiTaskState.isRunning && !showAiModal && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, background: '#0f172a', color: 'white', padding: '12px 18px', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 14, animation: 'fadeIn 0.3s ease' }}>
                    <Loader2 className="spin" size={20} style={{ color: '#38bdf8' }} />
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                            🤖 AI Trợ Lý đang chạy ngầm... ({aiTaskState.completedRows}/{aiTaskState.totalRows} hàng)
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                            {aiTaskState.statusText}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAiModal(true)}
                        style={{ padding: '6px 14px', fontSize: 12, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Bot size={14} /> Mở AI
                    </button>
                </div>
            )}
        </div>
    );
}

export default function ProductsPage() {
    return (
        <Suspense fallback={
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
                <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />
            </div>
        }>
            <ProductsContent />
        </Suspense>
    );
}
