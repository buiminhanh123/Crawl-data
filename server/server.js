const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./auth');
const { initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
//  ROUTES
// ============================================================

// Public health & diagnostic check
app.get('/api/health', (req, res) => {
    let ports = '';
    let procs = '';
    let pm2List = '';
    try {
        const { execSync } = require('child_process');
        try { ports = execSync('ss -lptn "sport = :5104 or sport = :5105" 2>/dev/null || netstat -tlpn 2>/dev/null || true').toString(); } catch (e) { ports = e.message; }
        try { procs = execSync('ps -ef | grep -E "node|next|5104|5105" | grep -v grep || true').toString(); } catch (e) { procs = e.message; }
        try { pm2List = execSync('pm2 list 2>/dev/null || true').toString(); } catch (e) { pm2List = e.message; }
    } catch (e) {}

    res.json({
        status: 'ok',
        uptime: process.uptime(),
        node: process.version,
        pid: process.pid,
        time: new Date().toISOString(),
        ports,
        procs,
        pm2List
    });
});

// Auth routes — login is public, others require auth
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', (req, res, next) => {
    if (req.path === '/login' && req.method === 'POST') {
        return next();
    }
    requireAuth(req, res, next);
}, authRoutes);

// ──────────────────────────────────────────────────────────────
// CUSTOMIZE: Add your own routes below
const productsRoutes = require('./routes/products.routes');
const sheetsRoutes = require('./routes/google-sheets.routes');
const aiRoutes = require('./routes/ai-assistant.routes');
const localSheetsRoutes = require('./routes/local-sheets.routes');
const googleDriveRoutes = require('./routes/google-drive.routes');
const imgDownloaderRoutes = require('./routes/img-downloader.routes');
const pdfDownloaderRoutes = require('./routes/pdf-downloader.routes');
app.use('/api/products', requireAuth, productsRoutes);
app.use('/api/sheets', requireAuth, sheetsRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/local-sheets', requireAuth, localSheetsRoutes);
app.use('/api/google-drive', requireAuth, googleDriveRoutes);
app.use('/api/img-downloader', requireAuth, imgDownloaderRoutes);
app.use('/api/pdf-downloader', requireAuth, pdfDownloaderRoutes);
// ──────────────────────────────────────────────────────────────

// ============================================================
//  API 404
// ============================================================
app.all('/api/*splat', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// ============================================================
//  ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
//  START SERVER
// ============================================================
async function start() {
    try {
        await initDatabase();
        const server = app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════╗
║   Newland Portal — Backend Server            ║
║   🚀 Running on http://localhost:${PORT}        ║
║   🗄️  Database: ./data/app.db               ║
║                                              ║
║   Default admin: admin / admin123            ║
╚══════════════════════════════════════════════╝
            `);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n⚠️  PORT ${PORT} ĐÃ ĐƯỢC MỞ SẴN BỞI TIẾN TRÌNH KHÁC (Server backend đang chạy ngầm trên http://localhost:${PORT}).`);
            } else {
                console.error('Lỗi khởi động Server:', err.message);
            }
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception caught to prevent crash:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('CRITICAL: Unhandled Rejection caught to prevent crash:', reason);
});

start();

module.exports = app;
