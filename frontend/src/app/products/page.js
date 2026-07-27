'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
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
    Loader2
} from 'lucide-react';

function ProductsContent() {
    const { user, hasPermission } = useAuth();
    const searchParams = useSearchParams();
    const profileSlug = searchParams?.get('profile') || 'newland';
    const [currentProfile, setCurrentProfile] = useState(null);

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
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Package style={{ color: 'var(--accent)' }} /> Products — {currentProfile?.name?.startsWith('Profile') ? currentProfile.name : `Profile ${currentProfile?.name || 'Newland'}`}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Quản lý dữ liệu sản phẩm, thông số kỹ thuật và tài liệu của {currentProfile?.brand_name || currentProfile?.name || 'Profile'}.
                    </p>
                </div>
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
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    <Download size={14} /> Export to Excel
                </button>
            </div>

            {/* Filter Bar & Data Table Card */}
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
