import './globals.css';
import ClientLayout from '@/components/ClientLayout';

export const metadata = {
    title: '{APP_NAME} — {APP_DESCRIPTION}',
    description: '{APP_DESCRIPTION}',
};

export default function RootLayout({ children }) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
