const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const initSqlJs = require('sql.js');

const { writeCellToSheet } = require('../services/google-drive.service');

// ─── DB path (same as db.js) ─────────────────────────────────────────────────
const PRODUCTS_DB_PATH = path.join(__dirname, '..', 'data', 'products.db');

async function openProductsDb() {
    const SQL = await initSqlJs({
        locateFile: file => path.resolve(path.dirname(require.resolve('sql.js')), file)
    });
    if (!fs.existsSync(PRODUCTS_DB_PATH)) return null;
    const fileBuffer = fs.readFileSync(PRODUCTS_DB_PATH);
    return new SQL.Database(fileBuffer);
}

// ─── Config file ─────────────────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'img_downloader_configs.json');

// ─── In-memory job state ─────────────────────────────────────────────────────
let activeJob = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name) {
    if (!name || name === 'undefined' || name === 'null') return 'Unknown';
    name = String(name).trim();
    name = name.replace(/\//g, '-').replace(/\\/g, '-');
    name = name.replace(/[<>:"|?*\x00-\x1f]/g, '');
    name = name.replace(/[-\s]+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '');
    return name || 'Unknown';
}

function colLetterToIdx(letter) {
    letter = String(letter).trim().toUpperCase();
    let idx = 0;
    for (const ch of letter) {
        idx = idx * 26 + (ch.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
    }
    return idx - 1;
}

function loadConfigs() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {}
    return {};
}

function saveConfigs(configs) {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf-8');
}

/**
 * Fetch Google Sheet as CSV
 */
async function fetchSheetCSV(sheetInput, sheetName) {
    const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const sheetId = match ? match[1] : sheetInput.trim();
    const encodedSheet = encodeURIComponent(sheetName);
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Không thể truy cập sheet (HTTP ${res.statusCode}). Kiểm tra sheet đã public chưa.`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(l => l.trim());
    return lines.map(line => {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else { inQuotes = !inQuotes; }
            } else if (ch === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        fields.push(current.trim());
        return fields;
    });
}

/**
 * Download one image. Returns { status: 'ok'|'skip'|'fail', detail }
 */
async function downloadOne(url, savePath, maxRetries = 3) {
    if (fs.existsSync(savePath)) return { status: 'skip' };
    let lastError = '';
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const imgBuffer = await fetchImageBuffer(url);
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(savePath, imgBuffer);
            return { status: 'ok' };
        } catch (e) {
            lastError = e.message || String(e);
            if (attempt < maxRetries - 1) await sleep(500 * (attempt + 1));
        }
    }
    return { status: 'fail', detail: lastError };
}

function fetchImageBuffer(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const proto = parsedUrl.protocol === 'https:' ? https : http;
        const options = {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 30000
        };
        const req = proto.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
                res.resume();
                return;
            }
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getBestModelName(row, rawModel) {
    let model = (rawModel || row.part_number || '').trim();
    const fullName = (row.name || row.title || '').trim();

    if (fullName) {
        const codeMatch = fullName.match(/^(NLS-[A-Za-z0-9_-]+|CBL-[A-Za-z0-9_-]+|NQuire\s*\d+|NQuire-[A-Za-z0-9_-]+)/i);
        if (codeMatch) {
            model = codeMatch[1].trim();
        }
    }

    if ((!model || /^\d+$/.test(model)) && fullName) {
        const match = fullName.match(/([a-zA-Z0-9_-]+\s*\d+)/i);
        if (match) {
            model = match[1].trim();
        } else {
            model = fullName.split(/\s+/)[0] + '_' + model;
        }
    }

    if (!model && fullName) {
        model = fullName.split(/\s+-\s+|\s+/)[0];
    }

    return sanitizeName(model);
}

function saveProductsDbInstance(productsDb) {
    try {
        const dir = path.dirname(PRODUCTS_DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = productsDb.export();
        fs.writeFileSync(PRODUCTS_DB_PATH, Buffer.from(data));
    } catch (e) {
        console.error('Failed to save products DB:', e);
    }
}

async function writeLinkToProductDb(productId, columnName, resultValue) {
    if (!productId || !columnName || columnName.toUpperCase() === 'NONE') return;
    try {
        const pdb = await openProductsDb();
        if (!pdb) return;
        const col = columnName.trim();
        try {
            pdb.run(`ALTER TABLE products ADD COLUMN "${col}" TEXT DEFAULT NULL`);
        } catch (colErr) {
            // Column already exists
        }
        pdb.run(`UPDATE products SET "${col}" = ? WHERE id = ?`, [resultValue, productId]);
        saveProductsDbInstance(pdb);
        pdb.close();
    } catch (e) {
        console.error('[img-downloader] Failed to write link to products DB:', e);
    }
}

function writeLinkToProfileSheet(profileSlug, columnName, partNumber, linkValue) {
    if (!profileSlug || !columnName || columnName.toUpperCase() === 'NONE' || !linkValue) return;
    try {
        const { profileSheetQueries } = require('../db');
        const sheets = profileSheetQueries.getBySlug(profileSlug);
        if (!Array.isArray(sheets) || sheets.length === 0) return;

        const cleanStr = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
        const targetColClean = cleanStr(columnName);
        const targetModelClean = cleanStr(partNumber);
        if (!targetColClean || !targetModelClean) return;

        let modified = false;

        for (const sheet of sheets) {
            if (!Array.isArray(sheet.data) || sheet.data.length < 1) continue;

            // Search top 3 rows for existing column header
            let headerRowIdx = -1;
            let colIdx = -1;

            for (let r = 0; r < Math.min(3, sheet.data.length); r++) {
                const row = sheet.data[r];
                if (!Array.isArray(row)) continue;
                const foundI = row.findIndex(cell => cleanStr(cell) === targetColClean);
                if (foundI !== -1) {
                    headerRowIdx = r;
                    colIdx = foundI;
                    break;
                }
            }

            // If column header not found, add to main header row (row 1 if available, else row 0)
            if (colIdx === -1) {
                headerRowIdx = sheet.data.length > 1 ? 1 : 0;
                if (!Array.isArray(sheet.data[headerRowIdx])) sheet.data[headerRowIdx] = [];
                sheet.data[headerRowIdx].push(columnName.trim());
                colIdx = sheet.data[headerRowIdx].length - 1;
                modified = true;
            }

            // Update matching data rows
            for (let r = headerRowIdx + 1; r < sheet.data.length; r++) {
                const row = sheet.data[r];
                if (!Array.isArray(row)) continue;

                const isMatch = row.some(cell => {
                    const cClean = cleanStr(cell);
                    return cClean && (cClean === targetModelClean || cClean.includes(targetModelClean) || targetModelClean.includes(cClean));
                });

                if (isMatch) {
                    while (row.length <= colIdx) {
                        row.push('');
                    }
                    row[colIdx] = linkValue;
                    modified = true;
                }
            }
        }

        if (modified) {
            profileSheetQueries.save(profileSlug, sheets);
        }
    } catch (err) {
        console.error('[img-downloader] Error writing to profile sheet:', err);
    }
}

function formatResultLink(pattern, vars = {}, defaultPath) {
    if (!pattern || !pattern.trim()) return defaultPath;
    let link = pattern.trim();
    link = link.replace(/{model}/gi, vars.model || '');
    link = link.replace(/{brand}/gi, vars.brand || '');
    link = link.replace(/{main_category}/gi, vars.mainCat || '');
    link = link.replace(/{sub_category}/gi, vars.subCat || '');
    link = link.replace(/{series}/gi, vars.series || '');
    link = link.replace(/{filename}/gi, vars.filename || path.basename(defaultPath));
    link = link.replace(/{save_path}/gi, defaultPath || '');
    // Clean up duplicate slashes if variable was empty (e.g., https://daco/san-pham/newland//file.webp -> https://daco/san-pham/newland/file.webp)
    link = link.replace(/([^:])\/\/+/g, '$1/');
    return link;
}

async function runDownloadJob(tasks, concurrency) {
    activeJob.status = 'running';
    activeJob.total = tasks.length;
    let idx = 0;

    async function worker() {
        while (idx < tasks.length) {
            if (activeJob.stopped) break;
            const taskIdx = idx++;
            const { url, savePath, productId, partNumber, profileSlug, resultCol, spreadsheetId, sheetName, rowNum, linkPattern, vars, label } = tasks[taskIdx];
            try {
                const result = await downloadOne(url, savePath);
                activeJob.done++;
                if (result.status === 'ok') activeJob.ok++;
                else if (result.status === 'skip') activeJob.skip++;
                else {
                    activeJob.fail++;
                    activeJob.failLog.push(`${label || url} → ${result.detail}`);
                }

                // Format configured result link/URL
                const resultLink = formatResultLink(linkPattern, vars, savePath);

                // 1. Write result path/link to DB & Profile Sheet in Profile Mode
                if (resultCol && resultCol.toUpperCase() !== 'NONE') {
                    if (productId) {
                        await writeLinkToProductDb(productId, resultCol, resultLink);
                    }
                    if (profileSlug) {
                        writeLinkToProfileSheet(profileSlug, resultCol, partNumber, resultLink);
                    }
                    if (spreadsheetId && sheetName && rowNum) {
                        await writeCellToSheet(spreadsheetId, sheetName, rowNum, resultCol.toUpperCase(), resultLink);
                    }
                }
            } catch (e) {
                activeJob.done++;
                activeJob.fail++;
                activeJob.failLog.push(`${label || url} → ${e.message}`);

                // Write link/URL fallback even on error
                const resultLink = formatResultLink(linkPattern, vars, url || savePath);
                if (resultLink && resultCol && resultCol.toUpperCase() !== 'NONE') {
                    if (productId) {
                        try { await writeLinkToProductDb(productId, resultCol, resultLink); } catch (err) {}
                    }
                    if (profileSlug) {
                        try { writeLinkToProfileSheet(profileSlug, resultCol, partNumber, resultLink); } catch (err) {}
                    }
                    if (spreadsheetId && sheetName && rowNum) {
                        try { await writeCellToSheet(spreadsheetId, sheetName, rowNum, resultCol.toUpperCase(), resultLink); } catch (err) {}
                    }
                }
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, tasks.length || 1) }, () => worker());
    await Promise.all(workers);

    if (activeJob.failLog.length > 0 && activeJob.outputDir) {
        try {
            const failPath = path.join(activeJob.outputDir, '_failed_downloads.txt');
            if (!fs.existsSync(activeJob.outputDir)) fs.mkdirSync(activeJob.outputDir, { recursive: true });
            fs.writeFileSync(failPath, activeJob.failLog.join('\n'), 'utf-8');
            activeJob.failLogPath = failPath;
        } catch (e) {}
    }

    activeJob.status = activeJob.stopped ? 'stopped' : 'completed';
    activeJob.endTime = Date.now();

    if (activeJob.status === 'completed' && activeJob.options?.autoFillOnComplete !== false && activeJob.options?.profileSlug) {
        try {
            console.log('[img-downloader] Auto filling links after download completion...');
            const fillRes = await autoFillImageLinks(activeJob.options);
            console.log(`[img-downloader] Auto fill completed: ${fillRes.updatedCount}/${fillRes.totalTasks} links updated.`);
            activeJob.autoFillResult = fillRes;
        } catch (fillErr) {
            console.error('[img-downloader] Error auto filling links on complete:', fillErr);
        }
    }
}

// ─── Build tasks from DB products ────────────────────────────────────────────

async function buildTasksFromProfile(profileSlug, categoryFilter, seriesFilter, outputDir, options = {}) {
    const {
        profBrand = 'profile_slug',
        profMainCategory = 'main_category',
        profSubCategory = 'NONE',
        profSeries = 'NONE',
        profModel = 'part_number',
        profUrl = 'image_url',
        resultCol = 'NONE'
    } = options;

    const pdb = await openProductsDb();
    if (!pdb) throw new Error('Không tìm thấy products.db');

    let query = `SELECT * FROM products WHERE profile_slug = ? AND image_url IS NOT NULL AND trim(image_url) != ''`;
    const params = [profileSlug];

    if (categoryFilter) { query += ' AND (main_category = ? OR category = ?)'; params.push(categoryFilter, categoryFilter); }
    if (seriesFilter)   { query += ' AND series = ?'; params.push(seriesFilter); }

    const res = pdb.exec(query, params);
    pdb.close();

    if (!res[0]) return [];

    const cols = res[0].columns;
    const rows = res[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = row[i]; });
        return obj;
    });

    return buildDownloadTasks(rows, profileSlug, {
        outputDir,
        profModel,
        profUrl,
        profBrand,
        profMainCategory,
        profSubCategory,
        profSeries,
        resultCol,
        ...options
    });
}

function sanitizeName(name) {
    if (!name || name === 'undefined' || name === 'null') return '';
    name = String(name).trim();
    name = name.replace(/[\/\\]/g, '-');
    name = name.replace(/[<>:"|?*\x00-\x1f]/g, '');
    name = name.replace(/\s+/g, ' ').trim();
    return name;
}

function buildDownloadTasks(rows, profileSlug, options = {}) {
    const {
        outputDir = path.join(process.cwd(), 'downloads'),
        profModel = 'part_number',
        profUrl = 'image_url',
        profBrand = '',
        profMainCategory = '',
        profSubCategory = '',
        profSeries = '',
        resultCol = ''
    } = options;

    const sheetMapByModel = new Map();

    // Read profile sheets from app.db profileSheetQueries to map exact row values
    try {
        const { profileSheetQueries } = require('../db');
        const sheets = profileSheetQueries.getBySlug(profileSlug);
        if (Array.isArray(sheets) && sheets.length > 0) {
            sheets.forEach(s => {
                const sheetRows = s.data || [];
                if (!Array.isArray(sheetRows) || sheetRows.length === 0) return;

                let headerRowIdx = -1;
                for (let r = 0; r < Math.min(3, sheetRows.length); r++) {
                    const row = sheetRows[r];
                    if (!Array.isArray(row)) continue;
                    const validHeaders = row.filter(cell => {
                        if (!cell || typeof cell !== 'string') return false;
                        const str = cell.trim();
                        if (!str || str.length > 100) return false;
                        if (/^\d+$/.test(str)) return false;
                        if (str.startsWith('http://') || str.startsWith('https://')) return false;
                        return true;
                    });
                    if (validHeaders.length >= 2) {
                        headerRowIdx = r;
                        break;
                    }
                }
                if (headerRowIdx === -1) headerRowIdx = 0;

                const headerRow = sheetRows[headerRowIdx];
                if (!Array.isArray(headerRow)) return;
                const headers = headerRow.map(h => String(h || '').trim().toLowerCase());

                for (let r = headerRowIdx + 1; r < sheetRows.length; r++) {
                    const rowData = sheetRows[r];
                    if (!Array.isArray(rowData)) continue;
                    const rowObj = {};
                    headers.forEach((h, cIdx) => {
                        if (h && rowData[cIdx] !== undefined && rowData[cIdx] !== null) {
                            rowObj[h] = String(rowData[cIdx]).trim();
                        }
                    });

                    let modelCode = '';
                    const candidateKeys = ['ma_san_pham', 'mã sản phẩm', 'mã_sản_phẩm', 'ma sp', 'mã sp', 'model', 'part_number', 'sku', 'product_code'];
                    for (const ck of candidateKeys) {
                        if (rowObj[ck]) {
                            modelCode = String(rowObj[ck]).trim();
                            break;
                        }
                    }
                    if (!modelCode && rowData[0]) modelCode = String(rowData[0]).trim();

                    if (modelCode) {
                        sheetMapByModel.set(modelCode.toLowerCase(), rowObj);
                        sheetMapByModel.set(modelCode.toLowerCase().replace(/_/g, ' '), rowObj);
                    }
                }
            });
        }
    } catch (e) {
        console.error('[img-downloader] Error reading profile sheet map:', e);
    }

    const getRawVal = (row, field, sheetRowObj = null) => {
        if (!field || field.toUpperCase() === 'NONE' || field.trim() === '') return '';
        const f = field.trim().toLowerCase();
        const normF = f.replace(/[^a-z0-9]/gi, '');

        // 1. ƯU TIÊN HÀNG ĐẦU: Lấy từ Profile Sheet nếu sản phẩm có trong Profile Sheet
        if (sheetRowObj) {
            const foundSheetKey = Object.keys(sheetRowObj).find(k => {
                const normK = k.toLowerCase().replace(/[^a-z0-9]/gi, '');
                return normK === normF || normK.includes(normF) || normF.includes(normK);
            });
            if (foundSheetKey !== undefined) {
                const val = sheetRowObj[foundSheetKey];
                if (val !== null && val !== undefined) return String(val).trim();
            }
        }

        // 2. Tìm giá trị trực tiếp trong products.db (nếu khớp tên cột DB)
        const foundKey = Object.keys(row).find(k => {
            const normK = k.toLowerCase().replace(/[^a-z0-9]/gi, '');
            return normK === normF;
        });
        if (foundKey !== undefined) {
            const val = row[foundKey];
            if (val !== null && val !== undefined) return String(val).trim();
        }

        // 3. Fallback mặc định chỉ áp dụng khi tên cột liên quan đến danh mục / brand
        if (normF.includes('cat') || normF.includes('danhmuc') || normF.includes('dm')) {
            if (row.main_category) return String(row.main_category).trim();
            if (row.category) return String(row.category).trim();
        }

        if (normF.includes('brand') || normF.includes('hang') || normF.includes('profile')) {
            if (row.profile_slug) return String(row.profile_slug).trim();
        }

        if (normF.includes('series')) {
            if (row.series) return String(row.series).trim();
        }

        return '';
    };

    const tasks = [];
    for (const row of rows) {
        let rawModel = row.part_number || row.name || String(row.id);
        let model = getBestModelName(row, rawModel);

        const sheetRowObj = sheetMapByModel.get(model.toLowerCase())
                         || sheetMapByModel.get(rawModel.toLowerCase())
                         || sheetMapByModel.get(model.toLowerCase().replace(/_/g, ' '))
                         || sheetMapByModel.get(rawModel.toLowerCase().replace(/_/g, ' '))
                         || (row.part_number ? sheetMapByModel.get(String(row.part_number).toLowerCase().trim()) : null)
                         || null;

        if (model) {
            model = model.replace(/\s+/g, '_');
        }

        const url = (profUrl && profUrl.toUpperCase() !== 'NONE')
            ? (getRawVal(row, profUrl, sheetRowObj) || (row.image_url ? String(row.image_url).trim() : ''))
            : (row.image_url ? String(row.image_url).trim() : '');
        if (!url || url.toLowerCase() === 'nan') continue;

        const urlPath = url.split('?')[0];
        const extMatch = urlPath.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i);
        const ext = extMatch ? extMatch[0].toLowerCase() : '.webp';

        const brand = (profBrand && profBrand.toUpperCase() !== 'NONE')
            ? (getRawVal(row, profBrand, sheetRowObj))
            : '';

        const mainCat = (profMainCategory && profMainCategory.toUpperCase() !== 'NONE')
            ? (getRawVal(row, profMainCategory, sheetRowObj))
            : '';

        const subCat = (profSubCategory && profSubCategory.toUpperCase() !== 'NONE')
            ? (getRawVal(row, profSubCategory, sheetRowObj))
            : '';

        const series = (profSeries && profSeries.toUpperCase() !== 'NONE')
            ? (getRawVal(row, profSeries, sheetRowObj))
            : '';

        const filename = `${model}${ext}`;

        let folder = outputDir;
        if (folder.includes('{')) {
            folder = replacePlaceholders(folder, { model, brand, mainCat, subCat, series, filename });
        } else {
            const pathParts = [outputDir];
            if (brand) pathParts.push(sanitizeName(brand));
            if (mainCat) pathParts.push(sanitizeName(mainCat));
            if (subCat && subCat !== mainCat) pathParts.push(sanitizeName(subCat));
            if (series) pathParts.push(sanitizeName(series));
            folder = path.join(...pathParts);
        }

        const savePath = path.join(folder, filename);

        tasks.push({
            url,
            savePath,
            productId: row.id,
            partNumber: model,
            profileSlug,
            resultCol,
            linkPattern: options.linkPattern || '',
            vars: { model, brand, mainCat, subCat, series, filename },
            label: `[${profileSlug}] ${model}`
        });
    }
    return tasks;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/img-downloader/configs
router.get('/configs', (req, res) => {
    res.json(loadConfigs());
});

// POST /api/img-downloader/configs/:name
router.post('/configs/:name', (req, res) => {
    const { name } = req.params;
    const cfg = req.body;
    if (!name || !cfg) return res.status(400).json({ error: 'Missing name or config' });
    const all = loadConfigs();
    all[name] = cfg;
    saveConfigs(all);
    res.json({ ok: true });
});

// DELETE /api/img-downloader/configs/:name
router.delete('/configs/:name', (req, res) => {
    const { name } = req.params;
    const all = loadConfigs();
    delete all[name];
    saveConfigs(all);
    res.json({ ok: true });
});

// GET /api/img-downloader/status
router.get('/status', (req, res) => {
    if (!activeJob) return res.json({ status: 'idle' });
    const elapsed = activeJob.startTime ? (Date.now() - activeJob.startTime) / 1000 : 0;
    const speed = elapsed > 0 ? activeJob.done / elapsed : 0;
    const eta = speed > 0 && activeJob.done < activeJob.total ? (activeJob.total - activeJob.done) / speed : 0;
    res.json({
        status: activeJob.status,
        mode: activeJob.mode || 'profile',
        total: activeJob.total,
        done: activeJob.done,
        ok: activeJob.ok,
        skip: activeJob.skip,
        fail: activeJob.fail,
        failLog: activeJob.failLog.slice(-50),
        failLogPath: activeJob.failLogPath || null,
        startTime: activeJob.startTime,
        elapsed: Math.round(elapsed),
        speed: Math.round(speed * 10) / 10,
        eta: Math.round(eta)
    });
});

// POST /api/img-downloader/stop
router.post('/stop', (req, res) => {
    if (activeJob && activeJob.status === 'running') activeJob.stopped = true;
    res.json({ ok: true });
});

// POST /api/img-downloader/reset
router.post('/reset', (req, res) => {
    if (!activeJob || ['completed', 'stopped', 'error'].includes(activeJob.status)) activeJob = null;
    res.json({ ok: true });
});

// GET /api/img-downloader/profile-stats — summary of images per profile
router.get('/profile-stats', async (req, res) => {
    try {
        const pdb = await openProductsDb();
        if (!pdb) return res.json({ profiles: [] });

        // Count products with image_url per profile
        const result = pdb.exec(`
            SELECT
                profile_slug,
                COUNT(*) as total_products,
                COUNT(CASE WHEN image_url IS NOT NULL AND trim(image_url) != '' THEN 1 END) as with_image
            FROM products
            GROUP BY profile_slug
            ORDER BY total_products DESC
        `);
        pdb.close();

        if (!result[0]) return res.json({ profiles: [] });

        const cols = result[0].columns;
        const profiles = result[0].values.map(row => {
            const obj = {};
            cols.forEach((c, i) => { obj[c] = row[i]; });
            return obj;
        });

        res.json({ profiles });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/img-downloader/profile-categories?profile=xxx — categories for a profile
router.get('/profile-categories', async (req, res) => {
    const { profile } = req.query;
    if (!profile) return res.status(400).json({ error: 'Missing profile' });

    try {
        const pdb = await openProductsDb();
        if (!pdb) return res.json({ categories: [], series: [] });

        const catResult = pdb.exec(`
            SELECT DISTINCT COALESCE(NULLIF(trim(main_category), ''), category) as cat,
                   COUNT(*) as cnt,
                   COUNT(CASE WHEN image_url IS NOT NULL AND trim(image_url) != '' THEN 1 END) as with_image
            FROM products
            WHERE profile_slug = ?
            GROUP BY cat
            ORDER BY cnt DESC
        `, [profile]);

        const seriesResult = pdb.exec(`
            SELECT DISTINCT series,
                   COUNT(*) as cnt,
                   COUNT(CASE WHEN image_url IS NOT NULL AND trim(image_url) != '' THEN 1 END) as with_image
            FROM products
            WHERE profile_slug = ? AND series IS NOT NULL AND trim(series) != ''
            GROUP BY series
            ORDER BY cnt DESC
        `, [profile]);

        pdb.close();

        const mapRows = (r) => {
            if (!r[0]) return [];
            const cols = r[0].columns;
            return r[0].values.map(row => { const o = {}; cols.forEach((c, i) => { o[c] = row[i]; }); return o; });
        };

        res.json({
            categories: mapRows(catResult),
            series: mapRows(seriesResult)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/img-downloader/start — start a download job
// Supports two modes: "profile" (from DB) or "sheet" (from Google Sheet)
router.post('/start', async (req, res) => {
    if (activeJob && activeJob.status === 'running') {
        return res.status(409).json({ error: 'Đang có job chạy. Dừng job trước.' });
    }

    const { mode = 'profile', outputDir, concurrency = 10 } = req.body;

    if (!outputDir) return res.status(400).json({ error: 'Thiếu thư mục lưu ảnh' });

    // Respond immediately, run in background
    res.json({ ok: true, message: 'Đang chuẩn bị task...' });

    activeJob = {
        status: 'loading',
        mode,
        total: 0,
        done: 0,
        ok: 0,
        skip: 0,
        fail: 0,
        failLog: [],
        failLogPath: null,
        startTime: Date.now(),
        stopped: false,
        outputDir
    };

    try {
        let tasks = [];

        if (mode === 'profile') {
            const { profileSlug, categoryFilter, seriesFilter } = req.body;
            if (!profileSlug) { activeJob.status = 'error'; activeJob.errorMessage = 'Thiếu profileSlug'; return; }
            tasks = await buildTasksFromProfile(profileSlug, categoryFilter, seriesFilter, outputDir, req.body);
        } else {
            // Sheet mode
            const { sheetInput, sheetName, headerRow = 2, dataStartRow = 3,
                colBrand = 'C', colMainCategory = 'B', colSubCategory = 'NONE', colSeries = 'NONE', colModel = 'F', colUrl = 'I', colResult = 'NONE',
                batchStart = 1, batchEnd = 0 } = req.body;

            if (!sheetInput || !sheetName) { activeJob.status = 'error'; activeJob.errorMessage = 'Thiếu thông tin Sheet'; return; }

            const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
            const spreadsheetId = match ? match[1] : sheetInput.trim();

            const csvText = await fetchSheetCSV(sheetInput, sheetName);
            const rows = parseCSV(csvText);
            const hRow = parseInt(headerRow);
            const dRow = parseInt(dataStartRow);
            const dataRows = rows.slice(dRow - 1);
            const bStart = (parseInt(batchStart) || 1) - 1;
            const bEnd = parseInt(batchEnd) > 0 ? parseInt(batchEnd) : dataRows.length;
            const batch = dataRows.slice(bStart, bEnd);

            const idxUrl          = colLetterToIdx(colUrl);
            const idxBrand        = colLetterToIdx(colBrand);
            const idxMainCategory = colLetterToIdx(colMainCategory);
            const idxSubCategory  = colLetterToIdx(colSubCategory);
            const idxSeries       = colLetterToIdx(colSeries);
            const idxModel        = colLetterToIdx(colModel);

            batch.forEach((row, i) => {
                const url = idxUrl >= 0 ? (row[idxUrl] || '') : '';
                if (!url || url.toLowerCase() === 'nan') return;
                const brand    = idxBrand >= 0 ? sanitizeName(row[idxBrand]) : '';
                const mainCat  = idxMainCategory >= 0 ? sanitizeName(row[idxMainCategory]) : '';
                const subCat   = idxSubCategory >= 0 ? sanitizeName(row[idxSubCategory]) : '';
                const series   = idxSeries >= 0 ? sanitizeName(row[idxSeries]) : '';
                const model    = idxModel >= 0 ? sanitizeName(row[idxModel]) : 'item';

                const pathParts = [outputDir];
                if (brand) pathParts.push(brand);
                if (mainCat) pathParts.push(mainCat);
                if (subCat && subCat !== mainCat) pathParts.push(subCat);
                if (series) pathParts.push(series);

                const folder   = path.join(...pathParts);
                const filename = `${model}${subCat ? '_' + subCat : (mainCat ? '_' + mainCat : '')}.webp`;
                const rowNum   = bStart + i + dRow;

                tasks.push({
                    url,
                    savePath: path.join(folder, filename),
                    spreadsheetId,
                    sheetName,
                    rowNum,
                    resultCol: colResult,
                    linkPattern: req.body.linkPattern || '',
                    vars: { model, brand, mainCat, subCat, series, filename },
                    label: model
                });
            });
        }

        if (tasks.length === 0) {
            activeJob.status = 'completed';
            activeJob.endTime = Date.now();
            return;
        }

        runDownloadJob(tasks, parseInt(concurrency) || 10);
    } catch (e) {
        activeJob.status = 'error';
        activeJob.errorMessage = e.message;
    }
});

// POST /api/img-downloader/preview-profile — preview products for a profile
router.post('/preview-profile', async (req, res) => {
    const { profileSlug, categoryFilter, seriesFilter } = req.body;
    if (!profileSlug) return res.status(400).json({ error: 'Missing profileSlug' });

    try {
        const tasks = await buildTasksFromProfile(profileSlug, categoryFilter, seriesFilter, 'PREVIEW_ONLY', req.body);
        res.json({
            totalTasks: tasks.length,
            preview: tasks.slice(0, 8).map(t => ({
                label: t.label,
                url: t.url,
                savePath: t.savePath
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/img-downloader/preview — Sheet mode preview
router.post('/preview', async (req, res) => {
    const { sheetInput, sheetName, headerRow, dataStartRow, colBrand, colCategory, colSeries, colModel, colUrl, batchStart, batchEnd } = req.body;
    if (!sheetInput || !sheetName) return res.status(400).json({ error: 'Thiếu URL/ID Sheet hoặc tên Sheet' });

    try {
        const csvText = await fetchSheetCSV(sheetInput, sheetName);
        const rows = parseCSV(csvText);
        const hRow = parseInt(headerRow) || 2;
        const dRow = parseInt(dataStartRow) || 3;
        if (dRow <= hRow) return res.status(400).json({ error: 'Hàng dữ liệu phải lớn hơn hàng tiêu đề' });

        const dataRows = rows.slice(dRow - 1);
        const bStart = (parseInt(batchStart) || 1) - 1;
        const bEnd = parseInt(batchEnd) > 0 ? parseInt(batchEnd) : dataRows.length;
        const batch = dataRows.slice(bStart, bEnd);

        const idxUrl      = colLetterToIdx(colUrl || 'I');
        const idxBrand    = colLetterToIdx(colBrand || 'C');
        const idxCategory = colLetterToIdx(colCategory || 'B');
        const idxSeries   = colLetterToIdx(colSeries || 'E');
        const idxModel    = colLetterToIdx(colModel || 'F');

        let totalValid = 0;
        const preview = [];
        for (const row of batch) {
            const url = row[idxUrl] || '';
            if (!url || url === 'nan') continue;
            totalValid++;
            if (preview.length < 5) {
                preview.push({
                    brand: sanitizeName(row[idxBrand]),
                    category: sanitizeName(row[idxCategory]),
                    series: sanitizeName(row[idxSeries]),
                    model: sanitizeName(row[idxModel]),
                });
            }
        }

        res.json({ totalRows: batch.length, totalValid, skippedNoUrl: batch.length - totalValid, preview });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function autoFillImageLinks(options = {}) {
    const { profileSlug, resultCol, linkPattern, outputDir, categoryFilter, seriesFilter } = options;
    if (!profileSlug) throw new Error('Thiếu profileSlug');
    if (!resultCol || resultCol.toUpperCase() === 'NONE') {
        throw new Error('Vui lòng chọn Cột Link Kết Quả trước khi điền');
    }

    const tasks = await buildTasksFromProfile(profileSlug, categoryFilter, seriesFilter, outputDir || '', options);
    let updatedCount = 0;

    for (const task of tasks) {
        const { savePath, productId, partNumber, profileSlug: slug, linkPattern: pat, vars, url } = task;
        const resultLink = formatResultLink(pat || linkPattern, vars, savePath || url);
        if (resultLink) {
            if (productId) {
                await writeLinkToProductDb(productId, resultCol, resultLink);
            }
            if (slug) {
                writeLinkToProfileSheet(slug, resultCol, partNumber, resultLink);
            }
            updatedCount++;
        }
    }

    return { updatedCount, totalTasks: tasks.length };
}

// POST /api/img-downloader/auto-fill-links — Auto-fill image result links into Profile Sheet & DB
router.post('/auto-fill-links', async (req, res) => {
    try {
        const result = await autoFillImageLinks(req.body);
        res.json({
            success: true,
            updatedCount: result.updatedCount,
            totalTasks: result.totalTasks
        });
    } catch (e) {
        console.error('[img-downloader] Error auto filling links:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
