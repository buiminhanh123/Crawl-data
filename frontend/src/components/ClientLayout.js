'use client';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from './AuthProvider';
import Sidebar from './Sidebar';

function LayoutInner({ children }) {
    const pathname = usePathname();
    const { user, loading } = useAuth();

    // Show nothing while loading auth state
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading...</div>
            </div>
        );
    }

    // Login page has no sidebar
    if (pathname === '/login') {
        return <>{children}</>;
    }

    // Redirect to login if not authenticated
    if (!user) {
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        return null;
    }

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}

export default function ClientLayout({ children }) {
    return (
        <AuthProvider>
            <LayoutInner>{children}</LayoutInner>
        </AuthProvider>
    );
}
