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
app.use('/api/products', requireAuth, productsRoutes);
app.use('/api/sheets', requireAuth, sheetsRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/local-sheets', requireAuth, localSheetsRoutes);
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
