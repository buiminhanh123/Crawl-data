import './globals.css';
import ClientLayout from '@/components/ClientLayout';

export const metadata = {
    title: 'Newland Portal — Newland Product Scraper and Explorer',
    description: 'Newland Product Scraper and Explorer',
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
