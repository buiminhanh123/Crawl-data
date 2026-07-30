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

    const SQL = await initSqlJs({
        locateFile: file => path.resolve(path.dirname(require.resolve('sql.js')), file)
    });

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
    //  CUSTOMIZE: Local Sheets Tables
    // ──────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS local_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            parent_id INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    try {
        db.run('ALTER TABLE local_sheets ADD COLUMN parent_id INTEGER DEFAULT NULL');
    } catch (e) {}

    // Auto-migrate orphan sub-tabs (sheets named "Tab..." or "Trang tính...") to primary parent table
    try {
        const parentRes = db.exec("SELECT id FROM local_sheets WHERE parent_id IS NULL AND name NOT LIKE 'Tab %' AND name NOT LIKE 'Trang tính %' ORDER BY id ASC LIMIT 1");
        if (parentRes[0]?.values[0]) {
            const firstParentId = parentRes[0].values[0][0];
            db.run("UPDATE local_sheets SET parent_id = ? WHERE parent_id IS NULL AND (name LIKE 'Tab %' OR name LIKE 'Trang tính %')", [firstParentId]);
            saveDatabase();
        }
    } catch (e) {}

    db.run(`
        CREATE TABLE IF NOT EXISTS local_sheet_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            header_label TEXT NOT NULL,
            data_type TEXT DEFAULT 'text',
            FOREIGN KEY (sheet_id) REFERENCES local_sheets(id) ON DELETE CASCADE,
            UNIQUE(sheet_id, name)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS local_sheet_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL,
            row_number INTEGER NOT NULL,
            cells_json TEXT NOT NULL,
            FOREIGN KEY (sheet_id) REFERENCES local_sheets(id) ON DELETE CASCADE,
            UNIQUE(sheet_id, row_number)
        )
    `);

    // Seed default sheet template if none exists
    const sheetCount = db.exec("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='local_sheets'");
    if (sheetCount[0]?.values[0]?.[0] > 0) {
        const scRes = db.exec("SELECT COUNT(*) as c FROM local_sheets");
        const sCount = scRes[0]?.values[0]?.[0] || 0;
        if (sCount === 0) {
            const defaultCols = [
                { name: 'A', header_label: 'Link', data_type: 'text' },
                { name: 'B', header_label: 'Danh mục', data_type: 'text' },
                { name: 'C', header_label: 'Hãng', data_type: 'text' },
                { name: 'D', header_label: 'Model', data_type: 'text' },
                { name: 'E', header_label: 'Tên sản phẩm', data_type: 'text' },
                { name: 'F', header_label: 'Đường dẫn ảnh', data_type: 'text' },
                { name: 'G', header_label: 'Mô tả ngắn', data_type: 'text' },
                { name: 'H', header_label: 'Đặc điểm', data_type: 'text' },
                { name: 'I', header_label: 'Thông số kỹ thuật', data_type: 'html' },
                { name: 'J', header_label: 'Sapo', data_type: 'text' },
                { name: 'K', header_label: 'Meta Title', data_type: 'text' },
                { name: 'L', header_label: 'Meta Description', data_type: 'text' },
            ];
            db.run("INSERT INTO local_sheets (name) VALUES (?)", ['Mẫu SEO & Sapo mặc định']);
            const sheetRes = db.exec('SELECT last_insert_rowid()');
            const sheetId = sheetRes[0].values[0][0];
            defaultCols.forEach(col => {
                db.run(
                    'INSERT INTO local_sheet_columns (sheet_id, name, header_label, data_type) VALUES (?, ?, ?, ?)',
                    [sheetId, col.name, col.header_label, col.data_type]
                );
            });
        }
    }
    // ──────────────────────────────────────────────────────────
    // SCHEMA: Product Profiles (hãng / brand profiles)
    // ──────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS product_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            brand_name TEXT DEFAULT '',
            target_url TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Migrate: add har_report_json column if not exists
    try {
        db.run('ALTER TABLE product_profiles ADD COLUMN har_report_json TEXT DEFAULT NULL');
    } catch (e) {}
    try {
        db.run('ALTER TABLE product_profiles ADD COLUMN sitemap_xml TEXT DEFAULT NULL');
    } catch (e) {}
    try {
        db.run('ALTER TABLE product_profiles ADD COLUMN sitemap_url TEXT DEFAULT NULL');
    } catch (e) {} // Column may already exist

    try {
        const profRes = db.exec("SELECT COUNT(*) FROM product_profiles");
        const pCount = profRes[0]?.values[0]?.[0] || 0;
        if (pCount === 0) {
            db.run("INSERT INTO product_profiles (name, slug, brand_name, target_url) VALUES (?, ?, ?, ?)", ['Profile Newland', 'newland', 'Newland', 'https://www.newland-id.com']);
            db.run("INSERT INTO product_profiles (name, slug, brand_name, target_url) VALUES (?, ?, ?, ?)", ['Profile Zebra', 'zebra', 'Zebra', '']);
        }
    } catch (e) {
        console.error('Error initializing product_profiles:', e);
    }
    // ──────────────────────────────────────────────────────────
    // SCHEMA: Profile Sheet Data (Lưu dữ liệu sheet theo profile)
    // ──────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS profile_sheet_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_slug TEXT NOT NULL UNIQUE,
            sheets_json TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    try {
        db.run('ALTER TABLE profile_sheet_data ADD COLUMN profile_slug TEXT DEFAULT NULL');
    } catch (e) {}
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
    
    // Reset products.db crawler status to 'Idle' on startup so it doesn't get stuck in 'Running' if it crashed/interrupted
    try {
        const pdb = await openProductsDb();
        pdb.run("UPDATE crawler_status SET status = 'Idle', last_message = 'Interrupted / Ready' WHERE status = 'Running' OR status = 'Starting'");
        saveProductsDb(pdb);
        pdb.close();
        console.log('Products crawler status reset to Idle successfully');
    } catch (e) {
        console.error('Failed to reset crawler status:', e);
    }
}

/**
 * Save database to disk (call after any write operation)
 */
function saveDatabase() {
    try {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
        console.error('Failed to save app database:', e);
    }
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

const PRODUCTS_DB_PATH = path.join(__dirname, 'data', 'products.db');

// Helper to open products DB
async function openProductsDb() {
    const SQL = await initSqlJs({
        locateFile: file => path.resolve(path.dirname(require.resolve('sql.js')), file)
    });
    let db;
    if (fs.existsSync(PRODUCTS_DB_PATH)) {
        const fileBuffer = fs.readFileSync(PRODUCTS_DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            slug TEXT,
            name TEXT,
            description TEXT,
            image_url TEXT,
            url TEXT UNIQUE,
            specifications TEXT,
            part_number TEXT,
            profile_slug TEXT,
            series TEXT,
            main_category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS crawler_status (
            id INTEGER PRIMARY KEY,
            status TEXT,
            progress INTEGER,
            total_items INTEGER,
            current_item INTEGER,
            last_message TEXT,
            profile_slug TEXT DEFAULT 'newland',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run("INSERT OR IGNORE INTO crawler_status (id, status, progress, total_items, current_item, last_message, profile_slug) VALUES (1, 'Idle', 0, 0, 0, 'Ready', 'newland')");

    let needsSave = false;
    const migrations = [
        'ALTER TABLE products ADD COLUMN profile_slug TEXT DEFAULT NULL',
        'ALTER TABLE products ADD COLUMN series TEXT DEFAULT NULL',
        'ALTER TABLE products ADD COLUMN main_category TEXT DEFAULT NULL',
        'ALTER TABLE products ADD COLUMN part_number TEXT DEFAULT NULL',
        "ALTER TABLE crawler_status ADD COLUMN profile_slug TEXT DEFAULT 'newland'",
        "ALTER TABLE crawler_failed ADD COLUMN profile_slug TEXT DEFAULT NULL"
    ];

    for (const stmt of migrations) {
        try {
            db.run(stmt);
            needsSave = true;
        } catch (e) {}
    }

    if (needsSave || !fs.existsSync(PRODUCTS_DB_PATH)) {
        try {
            const dir = path.dirname(PRODUCTS_DB_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const dbData = db.export();
            fs.writeFileSync(PRODUCTS_DB_PATH, Buffer.from(dbData));
        } catch (e) {
            console.error('Failed to write products DB in openProductsDb:', e);
        }
    }

    return db;
}

function saveProductsDb(productsDb) {
    try {
        const dir = path.dirname(PRODUCTS_DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = productsDb.export();
        fs.writeFileSync(PRODUCTS_DB_PATH, Buffer.from(data));
    } catch (e) {
        console.error('Failed to save products database:', e);
    }
}

// ============================================================
//  QUERY HELPERS — Products & Crawler
// ============================================================
const productQueries = {
    getAll: async (search = '', category = '', limit = 10, offset = 0, profileSlug = '') => {
        const pdb = await openProductsDb();
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        if (profileSlug) {
            try {
                pdb.exec('SELECT profile_slug FROM products LIMIT 1');
                query += ' AND profile_slug = ?';
                params.push(profileSlug);
            } catch (e) {}
        }
        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ? OR part_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        // Get total count first
        let countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countRes = pdb.exec(countQuery, params);
        const total = countRes[0]?.values[0]?.[0] || 0;
        
        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const res = pdb.exec(query, params);
        pdb.close();
        
        if (!res[0]) return { total, items: [] };
        
        const cols = res[0].columns;
        let profilesList = [];
        try { profilesList = profileQueries.getAll(); } catch (e) {}
        const profilesMap = {};
        profilesList.forEach(p => {
            profilesMap[p.slug] = p.brand_name || p.name;
        });

function extractModelFromName(name, slug) {
    if (!name) return slug ? slug.toUpperCase() : '';
    const m = name.match(/\b([A-Za-z]{1,4}[-_/]?[0-9]{2,5}[A-Za-z0-9]*)\b/);
    if (m) return m[1].toUpperCase();
    const words = name.split(/\s+/);
    for (const w of words) {
        const clean = w.replace(/[(),:;[\]{}]/g, '');
        if (/\d/.test(clean) && clean.length >= 2) return clean.toUpperCase();
    }
    return slug ? slug.toUpperCase() : '';
}

        const items = res[0].values.map(vals => {
            const item = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
            const pSlug = item.profile_slug || profileSlug || '';
            const resolvedBrand = profilesMap[pSlug] || (pSlug ? pSlug.replace(/^profile-?/i, '').toUpperCase() : 'Newland');
            item.brand = resolvedBrand;
            item.brand_name = resolvedBrand;
            const cleanModel = extractModelFromName(item.name, item.slug);
            item.model = (item.part_number && item.part_number.trim().toLowerCase() !== 'description') ? item.part_number : cleanModel;
            if (!item.part_number || item.part_number.trim().toLowerCase() === 'description') {
                item.part_number = item.model;
            }
            return item;
        });
        return { total, items };
    },
    
    getById: async (id) => {
        const pdb = await openProductsDb();
        const res = pdb.exec('SELECT * FROM products WHERE id = ?', [id]);
        pdb.close();
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        const vals = res[0].values[0];
        const item = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
        const pSlug = item.profile_slug || '';
        let profileObj = null;
        try { profileObj = profileQueries.getBySlug(pSlug); } catch (e) {}
        const resolvedBrand = profileObj?.brand_name || profileObj?.name || (pSlug ? pSlug.replace(/^profile-?/i, '').toUpperCase() : 'Newland');
        item.brand = resolvedBrand;
        item.brand_name = resolvedBrand;
        const cleanModel = extractModelFromName(item.name, item.slug);
        item.model = (item.part_number && item.part_number.trim().toLowerCase() !== 'description') ? item.part_number : cleanModel;
        if (!item.part_number || item.part_number.trim().toLowerCase() === 'description') {
            item.part_number = item.model;
        }
        return item;
    },
    
    getCategories: async (profileSlug = '') => {
        const pdb = await openProductsDb();
        let res;
        if (profileSlug) {
            try {
                res = pdb.exec('SELECT DISTINCT category FROM products WHERE profile_slug = ? ORDER BY category ASC', [profileSlug]);
            } catch (e) {
                res = pdb.exec('SELECT DISTINCT category FROM products ORDER BY category ASC');
            }
        } else {
            res = pdb.exec('SELECT DISTINCT category FROM products ORDER BY category ASC');
        }
        pdb.close();
        if (!res[0]) return [];
        return res[0].values.map(v => v[0]);
    },
    
    getStats: async (profileSlug = '') => {
        const pdb = await openProductsDb();
        const countRes = pdb.exec(countQuery, params);
        const totalProducts = countRes[0]?.values[0]?.[0] || 0;
        
        let catQuery = 'SELECT category, COUNT(*) as count FROM products WHERE 1=1';
        const catParams = [...params];
        if (profileSlug) {
            catQuery += ' AND profile_slug = ?';
            catParams.push(profileSlug);
        }
        catQuery += ' GROUP BY category ORDER BY count DESC';
        const catRes = pdb.exec(catQuery, catParams);
        pdb.close();
        
        const categoryCounts = [];
        if (catRes[0]) {
            const cols = catRes[0].columns;
            catRes[0].values.forEach(vals => {
                categoryCounts.push(Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
            });
        }
        
        return { totalProducts, categoryCounts };
    },

    deleteById: async (id) => {
        const pdb = await openProductsDb();
        pdb.run('DELETE FROM products WHERE id = ?', [id]);
        saveProductsDb(pdb);
        pdb.close();
    },

    deleteBatch: async (ids = []) => {
        if (!ids || ids.length === 0) return;
        const pdb = await openProductsDb();
        const placeholders = ids.map(() => '?').join(',');
        pdb.run(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
        saveProductsDb(pdb);
        pdb.close();
    },

    deleteByProfile: async (profileSlug) => {
        try {
            const pdb = await openProductsDb();
            pdb.run('DELETE FROM products WHERE profile_slug = ?', [profileSlug]);
            saveProductsDb(pdb);
            pdb.close();
        } catch (e) {
            console.error('Error deleting products by profile:', e);
        }
    },
    
    getCrawlerStatus: async () => {
        const pdb = await openProductsDb();
        const res = pdb.exec('SELECT * FROM crawler_status WHERE id = 1');
        pdb.close();
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        const vals = res[0].values[0];
        return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    },
    
    updateCrawlerStatus: async (status, progress, total_items, current_item, last_message, profile_slug = '') => {
        try {
            const pdb = await openProductsDb();
            let updated = false;
            if (profile_slug) {
                try {
                    pdb.run(`
                        UPDATE crawler_status 
                        SET status = ?, progress = ?, total_items = ?, current_item = ?, last_message = ?, profile_slug = ?, updated_at = datetime('now')
                        WHERE id = 1
                    `, [status, progress, total_items, current_item, last_message, profile_slug]);
                    updated = true;
                } catch (e) {}
            }
            if (!updated) {
                try {
                    pdb.run(`
                        UPDATE crawler_status 
                        SET status = ?, progress = ?, total_items = ?, current_item = ?, last_message = ?, updated_at = datetime('now')
                        WHERE id = 1
                    `, [status, progress, total_items, current_item, last_message]);
                } catch (e) {}
            }
            saveProductsDb(pdb);
            pdb.close();
        } catch (err) {
            console.error('Failed to update crawler status:', err);
        }
    },

    getCrawlerLogs: async () => {
        const pdb = await openProductsDb();
        const res = pdb.exec('SELECT message, datetime(created_at, "localtime") as time FROM crawler_logs ORDER BY id DESC LIMIT 50');
        pdb.close();
        if (!res[0]) return [];
        const cols = res[0].columns;
        return res[0].values.map(vals => 
            Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
        );
    },

    getFailedUrls: async () => {
        const pdb = await openProductsDb();
        // Table might not exist yet if crawler hasn't run — handle gracefully
        try {
            const res = pdb.exec('SELECT id, url, category, slug, error, attempts, datetime(failed_at, "localtime") as failed_at FROM crawler_failed ORDER BY failed_at DESC');
            pdb.close();
            if (!res[0]) return [];
            const cols = res[0].columns;
            return res[0].values.map(vals =>
                Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
            );
        } catch (e) {
            pdb.close();
            return [];
        }
    },

    getFailedCount: async () => {
        const pdb = await openProductsDb();
        try {
            const res = pdb.exec('SELECT COUNT(*) FROM crawler_failed');
            pdb.close();
            return res[0]?.values[0]?.[0] || 0;
        } catch (e) {
            pdb.close();
            return 0;
        }
    },

    clearFailedUrls: async () => {
        const pdb = await openProductsDb();
        try {
            pdb.run('DELETE FROM crawler_failed');
            saveProductsDb(pdb);
            pdb.close();
            return true;
        } catch (e) {
            pdb.close();
            return false;
        }
    }
};

const localSheetQueries = {
    getAll: () => {
        const res = db.exec('SELECT * FROM local_sheets ORDER BY id DESC');
        if (!res[0]) return [];
        const cols = res[0].columns;
        return res[0].values.map(vals => Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
    },

    getById: (id) => {
        const res = db.exec('SELECT * FROM local_sheets WHERE id = ?', [id]);
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        return Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    },

    getByName: (name) => {
        const res = db.exec('SELECT * FROM local_sheets WHERE name = ?', [name]);
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        return Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    },

    create: (name, columns = [], parent_id = null) => {
        db.run('INSERT INTO local_sheets (name, parent_id) VALUES (?, ?)', [name, parent_id || null]);
        const sheetRes = db.exec('SELECT last_insert_rowid()');
        const sheetId = sheetRes[0].values[0][0];

        // Insert columns
        columns.forEach((col, idx) => {
            db.run(
                'INSERT INTO local_sheet_columns (sheet_id, name, header_label, data_type) VALUES (?, ?, ?, ?)',
                [sheetId, col.name, col.header_label, col.data_type || 'text']
            );
        });

        saveDatabase();
        return sheetId;
    },

    delete: (id) => {
        db.run('DELETE FROM local_sheets WHERE id = ? OR parent_id = ?', [id, id]);
        saveDatabase();
    },

    getColumns: (sheetId) => {
        const res = db.exec('SELECT * FROM local_sheet_columns WHERE sheet_id = ? ORDER BY id ASC', [sheetId]);
        if (!res[0]) return [];
        const cols = res[0].columns;
        return res[0].values.map(vals => Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
    },

    getRows: (sheetId) => {
        const res = db.exec('SELECT * FROM local_sheet_rows WHERE sheet_id = ? ORDER BY row_number ASC', [sheetId]);
        if (!res[0]) return [];
        const cols = res[0].columns;
        return res[0].values.map(vals => {
            const row = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
            try {
                row.cells = JSON.parse(row.cells_json);
            } catch (e) {
                row.cells = {};
            }
            return row;
        });
    },

    writeCell: (sheetId, rowNumber, colName, value) => {
        const res = db.exec('SELECT cells_json FROM local_sheet_rows WHERE sheet_id = ? AND row_number = ?', [sheetId, rowNumber]);
        let cells = {};
        if (res[0]?.values[0]) {
            try {
                cells = JSON.parse(res[0].values[0][0]);
            } catch (e) {}
            cells[colName] = value;
            db.run(
                'UPDATE local_sheet_rows SET cells_json = ? WHERE sheet_id = ? AND row_number = ?',
                [JSON.stringify(cells), sheetId, rowNumber]
            );
        } else {
            cells[colName] = value;
            db.run(
                'INSERT INTO local_sheet_rows (sheet_id, row_number, cells_json) VALUES (?, ?, ?)',
                [sheetId, rowNumber, JSON.stringify(cells)]
            );
        }
        db.run('UPDATE local_sheets SET updated_at = datetime("now") WHERE id = ?', [sheetId]);
        saveDatabase();
    },

    writeCellsBatch: (sheetId, updates) => {
        // Group by rowNumber
        const rowUpdates = {};
        for (const update of updates) {
            const { rowNumber, colName, value } = update;
            const rNum = parseInt(rowNumber);
            if (!rowUpdates[rNum]) {
                rowUpdates[rNum] = [];
            }
            rowUpdates[rNum].push({ colName: colName.toUpperCase().trim(), value });
        }

        for (const [rowNumberStr, cols] of Object.entries(rowUpdates)) {
            const rowNumber = parseInt(rowNumberStr);
            const res = db.exec('SELECT cells_json FROM local_sheet_rows WHERE sheet_id = ? AND row_number = ?', [sheetId, rowNumber]);
            let cells = {};
            if (res[0]?.values[0]) {
                try {
                    cells = JSON.parse(res[0].values[0][0]);
                } catch (e) {}
                for (const col of cols) {
                    cells[col.colName] = col.value;
                }
                db.run(
                    'UPDATE local_sheet_rows SET cells_json = ? WHERE sheet_id = ? AND row_number = ?',
                    [JSON.stringify(cells), sheetId, rowNumber]
                );
            } else {
                for (const col of cols) {
                    cells[col.colName] = col.value;
                }
                db.run(
                    'INSERT INTO local_sheet_rows (sheet_id, row_number, cells_json) VALUES (?, ?, ?)',
                    [sheetId, rowNumber, JSON.stringify(cells)]
                );
            }
        }
        db.run('UPDATE local_sheets SET updated_at = datetime("now") WHERE id = ?', [sheetId]);
        saveDatabase();
    },

    addColumn: (sheetId, name, headerLabel, dataType = 'text') => {
        db.run(
            'INSERT INTO local_sheet_columns (sheet_id, name, header_label, data_type) VALUES (?, ?, ?, ?)',
            [sheetId, name, headerLabel, dataType]
        );
        saveDatabase();
    },

    addRow: (sheetId, rowNumber, cells = {}) => {
        db.run(
            'INSERT INTO local_sheet_rows (sheet_id, row_number, cells_json) VALUES (?, ?, ?)',
            [sheetId, rowNumber, JSON.stringify(cells)]
        );
        db.run('UPDATE local_sheets SET updated_at = datetime("now") WHERE id = ?', [sheetId]);
        saveDatabase();
    },

    clearRows: (sheetId) => {
        db.run('DELETE FROM local_sheet_rows WHERE sheet_id = ?', [sheetId]);
        saveDatabase();
    },

    rename: (sheetId, name) => {
        db.run('UPDATE local_sheets SET name = ?, updated_at = datetime("now") WHERE id = ?', [name, sheetId]);
        saveDatabase();
    }
};

const profileQueries = {
    getAll: () => {
        const res = db.exec('SELECT * FROM product_profiles ORDER BY id ASC');
        if (!res[0]) return [];
        const cols = res[0].columns;
        return res[0].values.map(vals => Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
    },

    getById: (id) => {
        const res = db.exec('SELECT * FROM product_profiles WHERE id = ?', [id]);
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        return Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    },

    getBySlug: (slug) => {
        const res = db.exec('SELECT * FROM product_profiles WHERE slug = ?', [slug]);
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        return Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    },

    create: (name, brandName = '', targetUrl = '') => {
        let slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `profile-${Date.now()}`;
        // Ensure unique slug
        const existing = db.exec('SELECT id FROM product_profiles WHERE slug = ?', [slug]);
        if (existing[0]?.values[0]) {
            slug = `${slug}-${Date.now()}`;
        }
        db.run(
            'INSERT INTO product_profiles (name, slug, brand_name, target_url) VALUES (?, ?, ?, ?)',
            [name.trim(), slug, brandName.trim(), targetUrl.trim()]
        );
        const res = db.exec('SELECT last_insert_rowid()');
        saveDatabase();
        return { id: res[0].values[0][0], name: name.trim(), slug, brand_name: brandName.trim(), target_url: targetUrl.trim() };
    },

    delete: (id) => {
        db.run('DELETE FROM product_profiles WHERE id = ?', [id]);
        saveDatabase();
    },

    update: (slug, name, targetUrl, sitemapUrl = '') => {
        db.run(
            'UPDATE product_profiles SET name = ?, target_url = ?, sitemap_url = ?, updated_at = datetime("now") WHERE slug = ?',
            [name.trim(), (targetUrl || '').trim(), (sitemapUrl || '').trim(), slug]
        );
        saveDatabase();
        const res = db.exec('SELECT * FROM product_profiles WHERE slug = ?', [slug]);
        if (!res[0]?.values[0]) return null;
        const cols = res[0].columns;
        return Object.fromEntries(cols.map((c, i) => [c, res[0].values[0][i]]));
    },

    saveHarReport: (slug, reportJson) => {
        db.run(
            'UPDATE product_profiles SET har_report_json = ?, updated_at = datetime("now") WHERE slug = ?',
            [JSON.stringify(reportJson), slug]
        );
        saveDatabase();
    },

    saveSitemap: (slug, { sitemapXml, sitemapUrl }) => {
        db.run(
            'UPDATE product_profiles SET sitemap_xml = ?, sitemap_url = ?, updated_at = datetime("now") WHERE slug = ?',
            [sitemapXml || null, sitemapUrl || null, slug]
        );
        saveDatabase();
    },

    getSitemap: (slug) => {
        const res = db.exec('SELECT sitemap_xml, sitemap_url FROM product_profiles WHERE slug = ?', [slug]);
        if (!res[0]?.values[0]) return { sitemapXml: null, sitemapUrl: null };
        return {
            sitemapXml: res[0].values[0][0] || null,
            sitemapUrl: res[0].values[0][1] || null
        };
    },

    getHarReport: (slug) => {
        const res = db.exec('SELECT har_report_json FROM product_profiles WHERE slug = ?', [slug]);
        if (!res[0]?.values[0]?.[0]) return null;
        try {
            return JSON.parse(res[0].values[0][0]);
        } catch (e) {
            return null;
        }
    }
};

const profileSheetQueries = {
    getBySlug: (slug) => {
        const res = db.exec('SELECT sheets_json FROM profile_sheet_data WHERE profile_slug = ?', [slug]);
        if (!res[0]?.values[0]) return [];
        try {
            return JSON.parse(res[0].values[0][0]);
        } catch (e) {
            return [];
        }
    },

    save: (slug, sheets) => {
        const json = JSON.stringify(sheets);
        const existing = db.exec('SELECT id FROM profile_sheet_data WHERE profile_slug = ?', [slug]);
        if (existing[0]?.values[0]) {
            db.run(
                'UPDATE profile_sheet_data SET sheets_json = ?, updated_at = datetime("now") WHERE profile_slug = ?',
                [json, slug]
            );
        } else {
            db.run(
                'INSERT INTO profile_sheet_data (profile_slug, sheets_json) VALUES (?, ?)',
                [slug, json]
            );
        }
        saveDatabase();
    },

    deleteBySlug: (slug) => {
        try {
            db.run('DELETE FROM profile_sheet_data WHERE profile_slug = ?', [slug]);
            saveDatabase();
        } catch (e) {
            console.error('Error deleting profile sheet data by slug:', e);
        }
    }
};


module.exports = {
    initDatabase,
    saveDatabase,
    getDb: () => db,
    userQueries,
    permissionQueries,
    productQueries,
    openProductsDb,
    localSheetQueries,
    profileQueries,
    profileSheetQueries
};
