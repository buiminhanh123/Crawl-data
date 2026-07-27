'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

import { LayoutDashboard, FileText, Users, Settings, LogOut, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────
// CUSTOMIZE: Update this array with your app's pages.
// Each `key` must match a permission string from the backend.
// ──────────────────────────────────────────────────────────────
const menuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { key: 'feature-1', label: '{Feature 1}', icon: <FileText size={20} />, path: '/feature-1' },
    { key: 'accounts', label: 'Accounts', icon: <Users size={20} />, path: '/accounts' },
    { key: 'config', label: 'Settings', icon: <Settings size={20} />, path: '/config' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout, hasPermission } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('sidebar_collapsed');
        if (saved === 'true') {
            setIsCollapsed(true);
        }
    }, []);

    useEffect(() => {
        if (isCollapsed) {
            document.body.classList.add('sidebar-collapsed');
            localStorage.setItem('sidebar_collapsed', 'true');
        } else {
            document.body.classList.remove('sidebar-collapsed');
            localStorage.setItem('sidebar_collapsed', 'false');
        }
    }, [isCollapsed]);

    if (!user) return null;

    const getInitials = (name) => {
        return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    };

    const visibleItems = menuItems.filter(item => hasPermission(item.key));

    return (
        <aside className="sidebar">
            <button className="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            <div className="sidebar-logo">
                <div className="sidebar-logo-icon"><Briefcase size={22} /></div>
                <div className="sidebar-logo-text">
                    <h1>{'{APP_NAME}'}</h1>
                    <span>{'{APP_SUBTITLE}'}</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {visibleItems.map(item => (
                    <Link
                        key={item.key}
                        href={item.path}
                        className={`sidebar-nav-item ${pathname === item.path ? 'active' : ''}`}
                        title={isCollapsed ? item.label : ''}
                    >
                        <span className="icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </Link>
                ))}
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
    );
}
