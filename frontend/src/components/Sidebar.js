'use client';
import { useState, useEffect } from 'react';
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
    Loader2
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

    const fetchProfiles = async () => {
        try {
            const data = await fetchApi('/api/products/profiles');
            if (data?.profiles && data.profiles.length > 0) {
                setProfiles(data.profiles);
            }
        } catch (err) {
            console.error('Failed to fetch profiles:', err);
        }
    };

    useEffect(() => {
        const saved = localStorage.getItem('sidebar_collapsed');
        if (saved === 'true') {
            setIsCollapsed(true);
        }
        fetchProfiles();
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
                        <Link
                            href="/"
                            className={`sidebar-nav-item ${pathname === '/' ? 'active' : ''}`}
                            title={isCollapsed ? 'Dashboard' : ''}
                        >
                            <span className="icon"><LayoutDashboard size={20} /></span>
                            <span className="nav-label">Dashboard</span>
                        </Link>
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

                            {/* Sub-menu for profiles */}
                            {!isCollapsed && productsExpanded && (
                                <div className="sidebar-submenu">
                                    {profiles.map(p => {
                                        const isProfileActive = pathname === '/products' && (activeProfileSlug === p.slug || (!activeProfileSlug && p.slug === 'newland'));
                                        return (
                                            <Link
                                                key={p.id}
                                                href={`/products?profile=${p.slug}`}
                                                onClick={() => setActiveProfileSlug(p.slug)}
                                                className={`sidebar-submenu-item ${isProfileActive ? 'active' : ''}`}
                                            >
                                                <Package size={16} style={{ color: isProfileActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                                                <span>{p.name.startsWith('Profile') ? p.name : `Profile ${p.name}`}</span>
                                            </Link>
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


                </nav>

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
        </>
    );
}
