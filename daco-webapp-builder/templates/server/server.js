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
app.use(express.json({ limit: '10mb' }));
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
// Example:
//   const featureRoutes = require('./routes/feature.routes');
//   app.use('/api/feature', requireAuth, featureRoutes);
// ──────────────────────────────────────────────────────────────

// ============================================================
//  API 404
// ============================================================
app.all('/api/*', (req, res) => {
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
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════╗
║   {APP_NAME} — Backend Server                ║
║   🚀 Running on http://localhost:${PORT}        ║
║   🗄️  Database: ./data/app.db               ║
║                                              ║
║   Default admin: admin / admin123            ║
╚══════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();

module.exports = app;
