const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const initSqlJs = require('sql.js');

const {
    uploadPdfToDrive,
    writeCellToSheet,
    verifyDriveFolderExists,
    findFileInFolder,
    listFolderFilesMap,
    getConfig: getDriveConfig,
    isConnected: isDriveConnected
} = require('../services/google-drive.service');

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

async function writeLinkToProductDb(productId, columnName, driveLink) {
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
        pdb.run(`UPDATE products SET "${col}" = ? WHERE id = ?`, [driveLink, productId]);
        saveProductsDbInstance(pdb);
        pdb.close();
    } catch (e) {
        console.error('[pdf-downloader] Failed to write link to products DB:', e);
    }
}

function writeLinkToProfileSheet(profileSlug, columnName, partNumber, linkValue, rowIndex = null) {
    if (!profileSlug || !columnName || columnName.toUpperCase() === 'NONE' || !linkValue) return;
    try {
        const { profileSheetQueries } = require('../db');
        const sheets = profileSheetQueries.getBySlug(profileSlug);
        if (!Array.isArray(sheets) || sheets.length === 0) return;

        const cleanStr = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
        const targetColClean = cleanStr(columnName);
        if (!targetColClean) return;

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

            // 1. Prioritize exact rowIndex
            if (rowIndex !== null && rowIndex !== undefined && rowIndex > headerRowIdx && rowIndex < sheet.data.length) {
                const row = sheet.data[rowIndex];
                if (Array.isArray(row)) {
                    while (row.length <= colIdx) row.push('');
                    row[colIdx] = linkValue;
                    modified = true;
                    continue;
                }
            }

            // 2. Fallback matching by partNumber
            const targetModelClean = cleanStr(partNumber);
            if (targetModelClean) {
                const headerRow = sheet.data[headerRowIdx] || [];
                let modelColIdx = headerRow.findIndex(h => {
                    const ch = cleanStr(h);
                    return ch.includes('model') || ch.includes('masanpham') || ch.includes('masp') || ch.includes('partnumber') || ch.includes('sku') || ch === 'url';
                });
                if (modelColIdx === -1) modelColIdx = 0;

                for (let r = headerRowIdx + 1; r < sheet.data.length; r++) {
                    const row = sheet.data[r];
                    if (!Array.isArray(row)) continue;

                    const cellVal = cleanStr(row[modelColIdx]);
                    if (cellVal && (cellVal === targetModelClean || cellVal.includes(targetModelClean) || targetModelClean.includes(cellVal))) {
                        while (row.length <= colIdx) row.push('');
                        row[colIdx] = linkValue;
                        modified = true;
                    }
                }
            }
        }

        if (modified) {
            profileSheetQueries.save(profileSlug, sheets);
        }
    } catch (err) {
        console.error('[pdf-downloader] Error writing to profile sheet:', err);
    }
}

// ─── Config file ─────────────────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'pdf_downloader_configs.json');

// ─── In-memory job state ─────────────────────────────────────────────────────
let activeJob = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name) {
    if (!name || name === 'undefined' || name === 'null') return '';
    name = String(name).trim();
    name = name.replace(/\//g, '-').replace(/\\/g, '-');
    name = name.replace(/[<>:"|?*\x00-\x1f]/g, '');
    name = name.replace(/[-\s]+/g, '_').replace(/^[-_\s]+|[-_\s]+$/g, '');
    return name;
}

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
 * Format filename using variables template
 * Placeholder variables: {model}, {series}, {main_category}, {sub_category}, {doc_type}
 */
function formatFilename(pattern, vars = {}) {
    pattern = (pattern || '{model}.pdf').trim();
    let hasExtension = pattern.toLowerCase().endsWith('.pdf');

    let name = pattern;
    name = name.replace(/{(model|mã_sp|ma_sp|mã sp|ma sp|part_number|sku)}/gi, vars.model || 'Model');
    name = name.replace(/{(series)}/gi, vars.series || '');
    name = name.replace(/{(main_category|dm_chính|dm_chinh|dm chính|main_cat|category|danh_muc|danh_muc_id|danh mục)}/gi, vars.main_category || vars.mainCat || '');
    name = name.replace(/{(sub_category|dm_con|sub_cat)}/gi, vars.sub_category || vars.subCat || '');
    name = name.replace(/{(doc_type|loại_tài_liệu|loai_tai_lieu)}/gi, vars.doc_type || 'Datasheet');

    name = sanitizeName(name);
    if (!hasExtension && !name.toLowerCase().endsWith('.pdf')) {
        name += '.pdf';
    }
    return name || 'document.pdf';
}

/**
 * Document Scope Inspector: Determine if document is for a whole Series/Category or a single Model
 */
function inspectDocumentScope(pdfItem, model, series, category) {
    const title = (pdfItem.name || pdfItem.title || '').toLowerCase();
    const url = (pdfItem.url || pdfItem.href || '').toLowerCase();

    if (series && (title.includes(series.toLowerCase()) || url.includes(series.toLowerCase()))) {
        return { scope: 'series', label: `📁 Series ${series}` };
    }
    if (category && (title.includes(category.toLowerCase()) || url.includes(category.toLowerCase()))) {
        return { scope: 'category', label: `📂 Danh mục ${category}` };
    }
    return { scope: 'model', label: `🏷️ SP ${model}` };
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
 * Fetch PDF buffer from URL with redirect support
 */
function fetchPdfBuffer(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            return reject(new Error('Quá nhiều lượt chuyển hướng (Too many redirects)'));
        }
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (err) {
            return reject(new Error(`URL không hợp lệ: ${url}`));
        }
        const proto = parsedUrl.protocol === 'https:' ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/pdf,application/octet-stream,*/*'
            },
            timeout: 60000
        };
        const req = proto.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                try {
                    const nextUrl = new URL(res.headers.location, url).href;
                    res.resume();
                    fetchPdfBuffer(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
                    return;
                } catch (err) {
                    res.resume();
                    return reject(new Error(`Chuyển hướng không hợp lệ: ${res.headers.location}`));
                }
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            const contentType = (res.headers['content-type'] || '').toLowerCase();
            const contentDisp = (res.headers['content-disposition'] || '').toLowerCase();
            if (contentType.includes('text/html') && !contentDisp.includes('.pdf') && !contentDisp.includes('filename=')) {
                res.resume();
                return reject(new Error('URL trả về trang web HTML, không phải file tài liệu PDF'));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout kết nối')); });
    });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Core Download & Upload Runner with De-duplication and Result Link Write-Back
 */
async function runDownloadJob(tasks, concurrency, options = {}) {
    activeJob.status = 'running';
    activeJob.total = tasks.length;
    let idx = 0;

    const urlDriveMap = new Map(); // Cache URL -> driveLink for deduplication

    // Pre-fetch existing files in target Google Drive folder to skip re-uploading!
    const targetFolderId = tasks[0]?.driveFolderId;
    const driveExistingMap = targetFolderId ? await listFolderFilesMap(targetFolderId) : new Map();

    async function worker() {
        while (idx < tasks.length) {
            if (activeJob.stopped) break;
            const taskIdx = idx++;
            const task = tasks[taskIdx];
            const { url, fileName, driveFolderId, spreadsheetId, sheetName, rowNum, resultCol, productId, partNumber, profileSlug, rowIndex, label } = task;

            try {
                let driveLink = '';
                let isDuplicate = false;

                // 1. Check De-duplication: URL memory cache OR file name already exists in target Drive folder
                if (options.deduplicate && urlDriveMap.has(url)) {
                    driveLink = urlDriveMap.get(url);
                    isDuplicate = true;
                } else if (driveExistingMap.has(fileName)) {
                    driveLink = driveExistingMap.get(fileName);
                    isDuplicate = true;
                    if (options.deduplicate) urlDriveMap.set(url, driveLink);
                } else {
                    // Check directly on Drive for this file name if not in map
                    const existingOnDrive = await findFileInFolder(driveFolderId, fileName);
                    if (existingOnDrive) {
                        driveLink = existingOnDrive.webViewLink;
                        isDuplicate = true;
                        driveExistingMap.set(fileName, driveLink);
                        if (options.deduplicate) urlDriveMap.set(url, driveLink);
                    } else {
                        // Download PDF in-memory & Upload to Drive
                        const pdfBuffer = await fetchPdfBuffer(url);
                        const uploaded = await uploadPdfToDrive(driveFolderId, fileName, pdfBuffer);
                        driveLink = uploaded.webViewLink;
                        driveExistingMap.set(fileName, driveLink);
                        if (options.deduplicate) urlDriveMap.set(url, driveLink);
                    }
                }

                // Fallback to original URL if driveLink is empty
                const finalLink = driveLink || url;

                // 2. Write-back result link to DB & Profile Sheet in Profile Mode
                if (resultCol && resultCol.toUpperCase() !== 'NONE') {
                    if (productId) {
                        await writeLinkToProductDb(productId, resultCol, finalLink);
                    }
                    if (profileSlug) {
                        writeLinkToProfileSheet(profileSlug, resultCol, partNumber, finalLink, rowIndex);
                    }
                }

                // 3. Write-back result link to Sheet in Sheet Mode
                if (spreadsheetId && sheetName && rowNum && resultCol && resultCol.toUpperCase() !== 'NONE') {
                    await writeCellToSheet(spreadsheetId, sheetName, rowNum, resultCol.toUpperCase(), finalLink);
                }

                activeJob.done++;
                if (isDuplicate) {
                    activeJob.skip++;
                } else {
                    activeJob.ok++;
                }

                if (finalLink && !activeJob.failLog.includes(finalLink)) {
                    const tag = isDuplicate ? '⏭️ Đã có (Skip)' : '✓ Upload';
                    activeJob.failLog.push(`${label} → ${tag}: ${finalLink}`);
                }
            } catch (e) {
                activeJob.done++;
                activeJob.fail++;
                activeJob.failLog.push(`${label || url} → ❌ ${e.message}`);

                // Even if download/upload fails, write original URL to result column so record is updated
                const fallbackLink = url || '';
                if (fallbackLink && resultCol && resultCol.toUpperCase() !== 'NONE') {
                    if (productId) {
                        try { await writeLinkToProductDb(productId, resultCol, fallbackLink); } catch (err) {}
                    }
                    if (profileSlug) {
                        try { writeLinkToProfileSheet(profileSlug, resultCol, partNumber, fallbackLink, rowIndex); } catch (err) {}
                    }
                    if (spreadsheetId && sheetName && rowNum) {
                        try { await writeCellToSheet(spreadsheetId, sheetName, rowNum, resultCol.toUpperCase(), fallbackLink); } catch (err) {}
                    }
                }
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);

    if (!activeJob.stopped) {
        activeJob.status = 'completed';
        activeJob.endTime = Date.now();

        if (activeJob.options?.autoFillOnComplete !== false && activeJob.options?.profileSlug) {
            try {
                console.log('[pdf-downloader] Auto filling links after download completion...');
                const fillRes = await autoFillPdfLinks(activeJob.options);
                console.log(`[pdf-downloader] Auto fill completed: ${fillRes.updatedCount}/${fillRes.totalTasks} links updated.`);
                activeJob.autoFillResult = fillRes;
            } catch (fillErr) {
                console.error('[pdf-downloader] Error auto filling links on complete:', fillErr);
            }
        }
    }
}

// ─── Build tasks from Profile Sheets & DB products for PDF ─────────────────

function findPdfLinksInRow(row, profPdfUrl = 'ALL') {
    const pdfLinks = [];
    const seenUrls = new Set();

    const isDocUrl = (u) => {
        if (!u || typeof u !== 'string') return false;
        const low = u.trim().toLowerCase();
        if (!low.startsWith('http://') && !low.startsWith('https://')) return false;
        // Filter out HTML pages and web navigation routes
        if (low.endsWith('.html') || low.endsWith('.htm') || low.endsWith('.shtml') || low.endsWith('.jsp') || low.endsWith('.asp') || low.endsWith('.aspx')) return false;
        if (low.includes('applicable_model') || low.includes('applicable-model')) return false;
        if (low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.webp') || low.endsWith('.gif') || low.endsWith('.svg')) return false;
        return true;
    };

    const addLink = (title, url, sourceCol = '') => {
        if (!url || typeof url !== 'string') return;
        const cleanUrl = url.trim();
        if (!isDocUrl(cleanUrl)) return;
        if (seenUrls.has(cleanUrl)) return;
        seenUrls.add(cleanUrl);
        pdfLinks.push({
            name: title || 'Tài liệu',
            url: cleanUrl,
            sourceCol
        });
    };

    const targetCol = String(profPdfUrl || '').trim();

    // 1. If NONE is selected, return empty
    if (targetCol.toUpperCase() === 'NONE') {
        return [];
    }

    // 2. If explicit column requested (anything other than 'ALL' / empty)
    if (targetCol && targetCol.toUpperCase() !== 'ALL') {
        const cleanTarget = targetCol.toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);

        if (targetKey && row[targetKey]) {
            const val = String(row[targetKey]).trim();
            const baseKey = targetKey.replace(/_link$/i, '').replace(/_url$/i, '');
            const titleKey = Object.keys(row).find(k => k.toLowerCase() === `${baseKey}_tieu_de`.toLowerCase() || k.toLowerCase() === `${baseKey}_name`.toLowerCase());
            let docTitle = titleKey && row[titleKey] ? String(row[titleKey]).trim() : '';
            if (!docTitle) {
                const lk = targetKey.toLowerCase();
                if (lk.includes('hdsd')) docTitle = 'Hướng dẫn sử dụng';
                else if (lk.includes('cad')) docTitle = 'Bản vẽ CAD';
                else if (lk.includes('chungchi')) docTitle = 'Chứng chỉ';
                else if (lk.includes('phanmem')) docTitle = 'Phần mềm';
                else if (lk.includes('datasheet')) docTitle = 'Datasheet';
                else if (lk.includes('tailieu')) docTitle = 'Tài liệu liên quan';
                else docTitle = targetKey;
            }

            if (val.startsWith('[')) {
                try {
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(item => addLink(item.name || item.title || docTitle, item.url || item.href || item, targetKey));
                    }
                } catch (e) {}
            } else {
                val.split(/[\n,]+/).forEach(u => addLink(docTitle, u, targetKey));
            }
        }
        // STRICT: Return only links from this column, do NOT fall through to scan other columns
        return pdfLinks;
    }

    // 3. If profPdfUrl === 'ALL' (or empty): Scan all columns for document / PDF links
    for (const [k, v] of Object.entries(row)) {
        if (!v || typeof v !== 'string') continue;
        if (k === 'url' || k === 'url_en' || k === 'anh_dai_dien' || k.startsWith('anh_')) continue;
        const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isDocCol = lk.includes('pdf') || lk.includes('datasheet') || lk.includes('hdsd') ||
                         lk.includes('manual') || lk.includes('cad') || lk.includes('tailieu') ||
                         lk.includes('chungchi') || lk.includes('phanmem') || lk.includes('document') ||
                         lk.includes('download') || lk.endsWith('link') || lk.endsWith('url');

        if (!isDocCol && !v.includes('.pdf') && !v.includes('/download/')) continue;

        // Find corresponding title column if available (e.g. tl_hdsd_tieu_de for tl_hdsd_link)
        const baseKey = k.replace(/_link$/i, '').replace(/_url$/i, '');
        const titleKey = Object.keys(row).find(k2 => k2.toLowerCase() === `${baseKey}_tieu_de`.toLowerCase() || k2.toLowerCase() === `${baseKey}_name`.toLowerCase());
        let docTitle = titleKey && row[titleKey] ? String(row[titleKey]).trim() : '';

        if (!docTitle) {
            if (lk.includes('hdsd')) docTitle = 'Hướng dẫn sử dụng';
            else if (lk.includes('cad')) docTitle = 'Bản vẽ CAD';
            else if (lk.includes('chungchi')) docTitle = 'Chứng chỉ';
            else if (lk.includes('phanmem')) docTitle = 'Phần mềm';
            else if (lk.includes('datasheet')) docTitle = 'Datasheet';
            else if (lk.includes('tailieu')) docTitle = 'Tài liệu liên quan';
            else docTitle = k;
        }

        const lines = String(v).split(/[\n,]+/);
        lines.forEach(l => {
            const trimL = l.trim();
            if (trimL.includes('http')) {
                const matchUrl = trimL.match(/(https?:\/\/[^\s"',]+)/);
                if (matchUrl) {
                    addLink(docTitle, matchUrl[1], k);
                }
            }
        });
    }

    return pdfLinks;
}

function extractPdfRowsFromProfileSheets(profileSlug) {
    try {
        const { profileSheetQueries } = require('../db');
        const sheets = profileSheetQueries.getBySlug(profileSlug);
        const rows = [];
        if (!Array.isArray(sheets) || sheets.length === 0) return rows;

        for (const sheet of sheets) {
            const sheetRows = sheet.data || [];
            if (!Array.isArray(sheetRows) || sheetRows.length < 2) continue;

            let headerIdx = -1;
            for (let i = 0; i < Math.min(4, sheetRows.length); i++) {
                const r = sheetRows[i];
                if (Array.isArray(r) && r.filter(c => c && typeof c === 'string' && !c.startsWith('http') && isNaN(c)).length >= 2) {
                    headerIdx = i;
                    break;
                }
            }
            if (headerIdx === -1) headerIdx = 0;

            const header = sheetRows[headerIdx].map(h => String(h || '').trim());
            for (let i = headerIdx + 1; i < sheetRows.length; i++) {
                const r = sheetRows[i];
                if (!Array.isArray(r) || r.length === 0 || r.every(c => !c || String(c).trim() === '')) continue;

                const rowObj = {};
                header.forEach((h, idx) => {
                    if (h && r[idx] !== undefined && r[idx] !== null) {
                        rowObj[h] = String(r[idx]).trim();
                    }
                });

                let model = '';
                for (const [k, v] of Object.entries(rowObj)) {
                    const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (!model && (lk.includes('model') || lk.includes('masanpham') || lk.includes('masp') || lk.includes('sku') || lk.includes('partnumber'))) {
                        model = v;
                    }
                }
                if (!model) model = r[0] ? String(r[0]).trim() : `Item_${i}`;

                const pdfLinks = findPdfLinksInRow(rowObj, 'ALL');

                rows.push({
                    _rowIndex: i,
                    _sheetName: sheet.name || '',
                    id: i,
                    part_number: model,
                    name: rowObj.ten_san_pham || rowObj.name || model,
                    download_links: JSON.stringify(pdfLinks),
                    category: rowObj.danh_muc_id || rowObj.category || sheet.name || '',
                    main_category: rowObj.danh_muc_id || rowObj.category || sheet.name || '',
                    series: rowObj.Series || rowObj.series || '',
                    profile_slug: profileSlug,
                    ...rowObj
                });
            }
        }
        return rows;
    } catch (e) {
        console.error('[pdf-downloader] Error extracting PDF rows from sheet:', e);
        return [];
    }
}

async function buildPdfTasksFromProfile(profileSlug, categoryFilter, seriesFilter, driveFolderId, options = {}) {
    const {
        profBrand = 'profile_slug',
        profMainCategory = 'main_category',
        profSubCategory = 'NONE',
        profSeries = 'NONE',
        profModel = 'part_number',
        profPdfUrl = 'ALL',
        pdfFilterMode = 'all_pdfs', // 'all_pdfs' | 'datasheet_only' | 'keywords'
        keywords = '',
        filenamePattern = '{model}_{doc_type}.pdf',
        resultCol = 'NONE'
    } = options;

    // 1. First extract rows from Profile Sheets (most comprehensive column structure)
    let sheetRows = extractPdfRowsFromProfileSheets(profileSlug);

    // 2. Also check DB products for any additional products or DB IDs
    let dbProducts = [];
    try {
        const pdb = await openProductsDb();
        if (pdb) {
            const res = pdb.exec(`SELECT * FROM products WHERE profile_slug = ?`, [profileSlug]);
            pdb.close();
            if (res[0]) {
                const cols = res[0].columns;
                dbProducts = res[0].values.map(row => {
                    const obj = {};
                    cols.forEach((c, i) => { obj[c] = row[i]; });
                    return obj;
                });
            }
        }
    } catch (e) {}

    // Map DB products by model code for fast lookup of DB product ID
    const dbProductMap = new Map();
    dbProducts.forEach(p => {
        if (p.part_number) dbProductMap.set(String(p.part_number).trim().toLowerCase(), p);
        if (p.name) dbProductMap.set(String(p.name).trim().toLowerCase(), p);
    });

    let combinedRows = [];
    if (sheetRows.length > 0) {
        combinedRows = sheetRows.map(r => {
            const dbMatch = dbProductMap.get(String(r.part_number || '').trim().toLowerCase()) ||
                            dbProductMap.get(String(r.name || '').trim().toLowerCase());
            return {
                ...r,
                id: dbMatch ? dbMatch.id : r.id,
                ...(dbMatch?.download_links && !r.download_links ? { download_links: dbMatch.download_links } : {})
            };
        });
    } else if (dbProducts.length > 0) {
        combinedRows = dbProducts;
    }

    // Apply category & series filters
    let filteredRows = combinedRows.filter(r => {
        if (categoryFilter && r.main_category !== categoryFilter && r.category !== categoryFilter) return false;
        if (seriesFilter && r.series !== seriesFilter) return false;
        return true;
    });

    const getVal = (row, field) => {
        if (!field || field.toUpperCase() === 'NONE' || field.trim() === '') return '';
        const f = field.trim().toLowerCase();
        const foundKey = Object.keys(row).find(k => k.toLowerCase() === f);
        if (foundKey && row[foundKey] !== null && row[foundKey] !== undefined) {
            return sanitizeName(row[foundKey]);
        }
        return '';
    };

    const tasks = [];
    for (const row of filteredRows) {
        const rawLinks = findPdfLinksInRow(row, profPdfUrl);
        if (!Array.isArray(rawLinks) || rawLinks.length === 0) continue;

        // Filter PDF links based on filter mode
        let selectedPdfs = rawLinks;
        // If a specific column was chosen (e.g. tl_tailieu_link, tl_hdsd_link), keep all valid links from that column
        if (profPdfUrl && profPdfUrl !== 'ALL' && profPdfUrl !== 'NONE') {
            selectedPdfs = rawLinks;
        } else if (pdfFilterMode === 'datasheet_only') {
            const datasheetItem = rawLinks.find(item => {
                const n = (item.name || item.title || '').toLowerCase();
                const u = (item.url || item.href || '').toLowerCase();
                return n.includes('datasheet') || u.includes('datasheet');
            });
            selectedPdfs = [datasheetItem || rawLinks[0]];
        } else if (pdfFilterMode === 'keywords' && keywords.trim()) {
            const norm = s => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const kwList = keywords.split(',').map(k => norm(k.trim())).filter(Boolean);
            selectedPdfs = rawLinks.filter(item => {
                const n = norm(item.name || item.title || '');
                const u = (item.url || item.href || '').toLowerCase();
                return kwList.some(kw => n.includes(kw) || u.includes(kw));
            });
        }

        const rawModel  = getVal(row, profModel) || row.part_number || row.name || String(row.id);
        const model     = getBestModelName(row, rawModel);
        const series    = getVal(row, profSeries) || sanitizeName(row.series);
        const mainCat   = getVal(row, profMainCategory) || sanitizeName(row.main_category);
        const subCat    = getVal(row, profSubCategory) || sanitizeName(row.category);

        selectedPdfs.forEach((pdfItem, i) => {
            const pdfUrl = pdfItem.url || pdfItem.href;
            if (!pdfUrl) return;

            let docType = sanitizeName(pdfItem.name || pdfItem.title || 'Datasheet');
            if (docType.toLowerCase().endsWith('pdf')) docType = docType.slice(0, -3).trim();

            const fileName = formatFilename(filenamePattern, {
                model,
                series,
                main_category: mainCat,
                sub_category: subCat,
                doc_type: docType
            });

            const scopeInfo = inspectDocumentScope(pdfItem, model, series, mainCat);

            tasks.push({
                url: pdfUrl,
                fileName,
                driveFolderId,
                resultCol: (resultCol && resultCol !== 'NONE') ? resultCol : (pdfItem.sourceCol || 'NONE'),
                productId: row.id,
                partNumber: model,
                profileSlug,
                rowIndex: row._rowIndex,
                docLabel: docType,
                scopeInfo,
                label: `[${profileSlug}] ${model} (${docType})`
            });
        });
    }

    return tasks;
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// GET /api/pdf-downloader/status — current job status
router.get('/status', (req, res) => {
    if (!activeJob) {
        return res.json({ status: 'idle', total: 0, done: 0, ok: 0, skip: 0, fail: 0 });
    }
    const elapsedSec = (Date.now() - activeJob.startTime) / 1000;
    const speed = elapsedSec > 0 ? (activeJob.done / elapsedSec).toFixed(1) : 0;
    const remaining = activeJob.total - activeJob.done;
    const etaSec = speed > 0 ? Math.round(remaining / speed) : 0;

    res.json({
        ...activeJob,
        speed: parseFloat(speed),
        etaSec
    });
});

// POST /api/pdf-downloader/start — start download & upload to Drive job
router.post('/start', async (req, res) => {
    if (activeJob && activeJob.status === 'running') {
        return res.status(400).json({ error: 'Tiến trình đang chạy. Vui lòng dừng hoặc chờ hoàn thành.' });
    }

    const { mode = 'profile', driveFolderId, concurrency = 10, deduplicate = true } = req.body;

    if (!isDriveConnected()) {
        return res.status(400).json({ error: 'Chưa kết nối Google Drive. Vui lòng kết nối tài khoản Google Drive trước!' });
    }

    const driveConfig = getDriveConfig();
    const targetFolderId = (driveFolderId || driveConfig.parentFolderId || '').trim();

    if (!targetFolderId) {
        return res.status(400).json({ error: 'Vui lòng chỉ định Google Drive Target Folder ID.' });
    }

    const isValid = await verifyDriveFolderExists(targetFolderId);
    if (!isValid) {
        return res.status(400).json({ error: `Folder ID '${targetFolderId}' không tồn tại hoặc không có quyền truy cập trên Google Drive.` });
    }

    activeJob = {
        status: 'loading',
        mode,
        total: 0,
        done: 0,
        ok: 0,
        skip: 0,
        fail: 0,
        failLog: [],
        startTime: Date.now(),
        stopped: false,
        driveFolderId: targetFolderId
    };

    try {
        let tasks = [];

        if (mode === 'profile') {
            const { profileSlug, categoryFilter, seriesFilter } = req.body;
            if (!profileSlug) { activeJob.status = 'error'; activeJob.errorMessage = 'Thiếu profileSlug'; return res.status(400).json({ error: 'Thiếu profileSlug' }); }
            tasks = await buildPdfTasksFromProfile(profileSlug, categoryFilter, seriesFilter, targetFolderId, req.body);
        } else {
            // Sheet mode
            const { sheetInput, sheetName, headerRow = 2, dataStartRow = 3,
                colBrand = 'C', colMainCategory = 'B', colSubCategory = 'NONE', colSeries = 'NONE', colModel = 'F', colPdfUrl = 'J', colResult = 'K',
                filenamePattern = '{model}.pdf',
                batchStart = 1, batchEnd = 0 } = req.body;

            if (!sheetInput || !sheetName) { activeJob.status = 'error'; activeJob.errorMessage = 'Thiếu thông tin Sheet'; return res.status(400).json({ error: 'Thiếu thông tin Sheet' }); }

            const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
            const spreadsheetId = match ? match[1] : sheetInput.trim();

            const csvText = await fetchSheetCSV(sheetInput, sheetName);
            const rows = parseCSV(csvText);
            const dRow = parseInt(dataStartRow);
            const dataRows = rows.slice(dRow - 1);
            const bStart = (parseInt(batchStart) || 1) - 1;
            const bEnd = parseInt(batchEnd) > 0 ? parseInt(batchEnd) : dataRows.length;
            const batch = dataRows.slice(bStart, bEnd);

            const idxPdfUrl       = colLetterToIdx(colPdfUrl);
            const idxBrand        = colLetterToIdx(colBrand);
            const idxMainCategory = colLetterToIdx(colMainCategory);
            const idxSubCategory  = colLetterToIdx(colSubCategory);
            const idxSeries       = colLetterToIdx(colSeries);
            const idxModel        = colLetterToIdx(colModel);

            batch.forEach((row, i) => {
                const url = idxPdfUrl >= 0 ? (row[idxPdfUrl] || '') : '';
                if (!url || url.toLowerCase() === 'nan') return;

                const brand    = idxBrand >= 0 ? sanitizeName(row[idxBrand]) : '';
                const mainCat  = idxMainCategory >= 0 ? sanitizeName(row[idxMainCategory]) : '';
                const subCat   = idxSubCategory >= 0 ? sanitizeName(row[idxSubCategory]) : '';
                const series   = idxSeries >= 0 ? sanitizeName(row[idxSeries]) : '';
                const model    = idxModel >= 0 ? sanitizeName(row[idxModel]) : `row_${bStart + i + dRow}`;

                const fileName = formatFilename(filenamePattern, {
                    model,
                    series,
                    main_category: mainCat,
                    sub_category: subCat,
                    doc_type: 'Datasheet'
                });

                const rowNum = bStart + i + dRow;

                tasks.push({
                    url,
                    fileName,
                    driveFolderId: targetFolderId,
                    spreadsheetId,
                    sheetName,
                    rowNum,
                    resultCol: colResult,
                    label: `[Sheet] Dòng ${rowNum}: ${model}`
                });
            });
        }

        if (tasks.length === 0) {
            activeJob.status = 'completed';
            activeJob.endTime = Date.now();
            return res.json({ success: true, total: 0 });
        }

        runDownloadJob(tasks, parseInt(concurrency) || 10, { deduplicate });
        res.json({ success: true, total: tasks.length });
    } catch (e) {
        activeJob.status = 'error';
        activeJob.errorMessage = e.message;
        res.status(500).json({ error: e.message });
    }
});

// POST /api/pdf-downloader/stop — stop current job
router.post('/stop', (req, res) => {
    if (activeJob) {
        activeJob.stopped = true;
        activeJob.status = 'stopped';
        activeJob.endTime = Date.now();
    }
    res.json({ success: true });
});

// POST /api/pdf-downloader/reset — reset status
router.post('/reset', (req, res) => {
    activeJob = null;
    res.json({ success: true });
});

// GET /api/pdf-downloader/profile-stats — profile stats for PDF
router.get('/profile-stats', async (req, res) => {
    try {
        const { profileQueries, profileSheetQueries } = require('../db');
        const allProfiles = profileQueries.getAll();

        const dbStatsMap = new Map();
        try {
            const pdb = await openProductsDb();
            if (pdb) {
                const result = pdb.exec(`
                    SELECT profile_slug,
                           COUNT(*) as total_products,
                           SUM(CASE WHEN download_links IS NOT NULL AND trim(download_links) != '' AND download_links != '[]' THEN 1 ELSE 0 END) as with_pdf
                    FROM products
                    GROUP BY profile_slug
                `);
                pdb.close();
                if (result[0]) {
                    const cols = result[0].columns;
                    result[0].values.forEach(r => {
                        const slug = r[cols.indexOf('profile_slug')];
                        const total = r[cols.indexOf('total_products')] || 0;
                        const withPdf = r[cols.indexOf('with_pdf')] || 0;
                        dbStatsMap.set(slug, { total, withPdf });
                    });
                }
            }
        } catch (e) {}

        const stats = allProfiles.map(p => {
            const dbStat = dbStatsMap.get(p.slug) || { total: 0, withPdf: 0 };
            let total = dbStat.total;
            let withPdf = dbStat.withPdf;

            // Check profile sheet data
            const sheetRows = extractPdfRowsFromProfileSheets(p.slug);
            if (sheetRows.length > 0) {
                total = Math.max(total, sheetRows.length);
                const sheetWithPdf = sheetRows.filter(r => {
                    try {
                        const arr = JSON.parse(r.download_links || '[]');
                        return Array.isArray(arr) && arr.length > 0;
                    } catch (e) {
                        return false;
                    }
                }).length;
                withPdf = Math.max(withPdf, sheetWithPdf);
            }

            return {
                profile_slug: p.slug,
                profile_name: p.name || p.slug,
                total_products: total,
                with_pdf: withPdf
            };
        });

        res.json({ stats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/pdf-downloader/preview-profile — preview PDF tasks and Document Scope
router.post('/preview-profile', async (req, res) => {
    const { profileSlug, categoryFilter, seriesFilter, driveFolderId } = req.body;
    if (!profileSlug) return res.status(400).json({ error: 'Missing profileSlug' });

    try {
        const tasks = await buildPdfTasksFromProfile(profileSlug, categoryFilter, seriesFilter, driveFolderId || 'GOOGLE_DRIVE_TARGET_FOLDER', req.body);
        
        // Count scope distribution
        let modelCount = 0;
        let seriesCount = 0;
        tasks.forEach(t => {
            if (t.scopeInfo?.scope === 'model') modelCount++;
            else seriesCount++;
        });

        res.json({
            totalTasks: tasks.length,
            modelCount,
            seriesCount,
            preview: tasks.slice(0, 10).map(t => ({
                label: t.label,
                url: t.url,
                fileName: t.fileName,
                scopeInfo: t.scopeInfo
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function autoFillPdfLinks(options = {}) {
    const { profileSlug, driveFolderId, resultCol, categoryFilter, seriesFilter } = options;
    if (!profileSlug) throw new Error('Thiếu profileSlug');
    if (!resultCol || resultCol.toUpperCase() === 'NONE') {
        throw new Error('Vui lòng chọn Cột Link Kết Quả trước khi điền');
    }
    if (!driveFolderId) {
        throw new Error('Vui lòng nhập Google Drive Target Folder ID');
    }

    const driveExistingMap = await listFolderFilesMap(driveFolderId);
    const tasks = await buildPdfTasksFromProfile(profileSlug, categoryFilter, seriesFilter, driveFolderId, options);
    
    let updatedCount = 0;

    for (const task of tasks) {
        const { url, fileName, productId, partNumber, profileSlug: slug } = task;
        
        let driveLink = '';
        if (driveExistingMap.has(fileName)) {
            driveLink = driveExistingMap.get(fileName);
        } else {
            const existing = await findFileInFolder(driveFolderId, fileName);
            if (existing) driveLink = existing.webViewLink;
        }

        const finalLink = driveLink || url || '';
        if (finalLink) {
            if (productId) {
                await writeLinkToProductDb(productId, resultCol, finalLink);
            }
            if (slug) {
                writeLinkToProfileSheet(slug, resultCol, partNumber, finalLink);
            }
            updatedCount++;
        }
    }

    return { updatedCount, totalTasks: tasks.length };
}

// POST /api/pdf-downloader/auto-fill-links — Scan Google Drive & auto-fill links into Profile Sheet & DB
router.post('/auto-fill-links', async (req, res) => {
    try {
        const result = await autoFillPdfLinks(req.body);
        res.json({
            success: true,
            updatedCount: result.updatedCount,
            totalTasks: result.totalTasks
        });
    } catch (e) {
        console.error('[pdf-downloader] Error auto filling links:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET/POST/DELETE configs
router.get('/configs', (req, res) => res.json(loadConfigs()));

router.post('/configs/:name', (req, res) => {
    const configs = loadConfigs();
    configs[req.params.name] = req.body;
    saveConfigs(configs);
    res.json({ success: true });
});

router.delete('/configs/:name', (req, res) => {
    const configs = loadConfigs();
    delete configs[req.params.name];
    saveConfigs(configs);
    res.json({ success: true });
});

module.exports = router;
