const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db;
const DB_PATH = path.join(__dirname, 'data', 'app.db');

/**
 * Initialize the SQLite database.
 * Creates the data directory, loads or creates the DB file,
 * and runs initial schema setup.
 */
async function initDatabase() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Enable WAL mode for better concurrency
    db.run('PRAGMA journal_mode = WAL;');

    // ──────────────────────────────────────────────────────────
    //  SCHEMA: Users & Permissions (standard for all DACO apps)
    // ──────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            feature TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, feature)
        )
    `);

    // ──────────────────────────────────────────────────────────
    //  CUSTOMIZE: Add your own tables below
    //  Example:
    //    db.run(`
    //        CREATE TABLE IF NOT EXISTS items (
    //            id INTEGER PRIMARY KEY AUTOINCREMENT,
    //            code TEXT NOT NULL,
    //            name TEXT NOT NULL,
    //            amount REAL DEFAULT 0,
    //            status TEXT DEFAULT 'active',
    //            created_by INTEGER REFERENCES users(id),
    //            created_at TEXT DEFAULT (datetime('now'))
    //        )
    //    `);
    // ──────────────────────────────────────────────────────────

    // Seed default admin user if none exists
    const adminExists = db.exec("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
    const count = adminExists[0]?.values[0]?.[0] || 0;
    if (count === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.run(
            `INSERT INTO users (username, email, password_hash, display_name, role)
             VALUES (?, ?, ?, ?, ?)`,
            ['admin', 'admin@example.com', hash, 'Administrator', 'admin']
        );
    }

    saveDatabase();
    console.log('Database initialized successfully');
}

/**
 * Save database to disk (call after any write operation)
 */
function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// ============================================================
//  QUERY HELPERS — Users
// ============================================================
const userQueries = {
    findById: (id) => {
        const results = db.exec('SELECT id, username, email, display_name, role, is_active FROM users WHERE id = ?', [id]);
        if (!results[0]?.values[0]) return null;
        const cols = results[0].columns;
        const vals = results[0].values[0];
        return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    },

    findByEmail: (email) => {
        const results = db.exec('SELECT * FROM users WHERE email = ?', [email]);
        if (!results[0]?.values[0]) return null;
        const cols = results[0].columns;
        const vals = results[0].values[0];
        return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    },

    findByUsername: (username) => {
        const results = db.exec('SELECT * FROM users WHERE username = ?', [username]);
        if (!results[0]?.values[0]) return null;
        const cols = results[0].columns;
        const vals = results[0].values[0];
        return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    },

    updatePassword: (id, hash) => {
        db.run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [hash, id]);
        saveDatabase();
    },
};

// ============================================================
//  QUERY HELPERS — Permissions
// ============================================================
const permissionQueries = {
    getByUserId: (userId) => {
        const results = db.exec('SELECT feature FROM permissions WHERE user_id = ?', [userId]);
        if (!results[0]) return [];
        return results[0].values.map(v => v[0]);
    },

    hasPermission: (userId, feature) => {
        const results = db.exec('SELECT COUNT(*) FROM permissions WHERE user_id = ? AND feature = ?', [userId, feature]);
        return (results[0]?.values[0]?.[0] || 0) > 0;
    },
};

module.exports = {
    initDatabase,
    saveDatabase,
    getDb: () => db,
    userQueries,
    permissionQueries,
};
