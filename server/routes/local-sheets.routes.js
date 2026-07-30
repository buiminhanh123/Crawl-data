const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { localSheetQueries, productQueries } = require('../db');

function colToIdx(col) {
    if (!col) return 0;
    const c = (col || '').toUpperCase().trim();
    let r = 0;
    for (let i = 0; i < c.length; i++) {
        r = r * 26 + c.charCodeAt(i) - 64;
    }
    return r - 1;
}

function idxToCol(idx) {
    let code = '';
    let temp = idx;
    while (temp >= 0) {
        code = String.fromCharCode((temp % 26) + 65) + code;
        temp = Math.floor(temp / 26) - 1;
    }
    return code;
}

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// GET /api/local-sheets — list sheets
router.get('/', (req, res) => {
    try {
        const sheets = localSheetQueries.getAll();
        res.json({ sheets });
    } catch (err) {
        console.error('[Local Sheets] Get error:', err);
        res.status(500).json({ error: 'Failed to fetch sheets.' });
    }
});

// POST /api/local-sheets — create sheet
router.post('/', (req, res) => {
    try {
        const { name, template, parentId } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Sheet name is required.' });
        }

        let columns = [];
        if (template === 'seo_sapo') {
            columns = [
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
        } else {
            // Standard columns: Column A (first column)
            columns = [{ name: 'A', header_label: 'Cột A', data_type: 'text' }];
        }

        const id = localSheetQueries.create(name.trim(), columns, parentId || null);
        // Pre-create 100 empty rows
        const startRow = template === 'seo_sapo' ? 3 : 1;
        for (let idx = 0; idx < 100; idx++) {
            localSheetQueries.addRow(id, startRow + idx, {});
        }
        res.json({ message: 'Created sheet successfully.', id });
    } catch (err) {
        console.error('[Local Sheets] Create error:', err);
        res.status(500).json({ error: err.message || 'Failed to create sheet.' });
    }
});

// PUT /api/local-sheets/:id — rename sheet
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Sheet name is required.' });
        }
        localSheetQueries.rename(id, name.trim());
        res.json({ message: 'Renamed sheet successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Rename error:', err);
        res.status(500).json({ error: 'Failed to rename sheet.' });
    }
});

// DELETE /api/local-sheets/:id — delete sheet
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        localSheetQueries.delete(id);
        res.json({ message: 'Deleted sheet successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete sheet.' });
    }
});

// POST /api/local-sheets/:id/duplicate — duplicate sheet
router.post('/:id/duplicate', (req, res) => {
    try {
        const { id } = req.params;
        const baseSheet = localSheetQueries.getById(id);
        if (!baseSheet) return res.status(404).json({ error: 'Sheet not found.' });

        const columns = localSheetQueries.getColumns(id);
        const rows = localSheetQueries.getRows(id);

        const newName = `Bản sao của ${baseSheet.name}`;
        const newId = localSheetQueries.create(newName, columns.map(c => ({ name: c.name, header_label: c.header_label, data_type: c.data_type })));

        rows.forEach(r => {
            localSheetQueries.addRow(newId, r.row_number, r.cells || {});
        });

        res.json({ message: 'Duplicated sheet successfully.', id: newId, name: newName });
    } catch (err) {
        console.error('[Local Sheets] Duplicate error:', err);
        res.status(500).json({ error: 'Failed to duplicate sheet.' });
    }
});

// GET /api/local-sheets/:id/data — get columns and rows
router.get('/:id/data', (req, res) => {
    try {
        const { id } = req.params;
        const sheet = localSheetQueries.getById(id);
        if (!sheet) return res.status(404).json({ error: 'Sheet not found.' });

        const columns = localSheetQueries.getColumns(id);
        const rows = localSheetQueries.getRows(id);

        res.json({ sheet, columns, rows });
    } catch (err) {
        console.error('[Local Sheets] Fetch data error:', err);
        res.status(500).json({ error: 'Failed to fetch sheet data.' });
    }
});

// POST /api/local-sheets/:id/columns — add column
router.post('/:id/columns', (req, res) => {
    try {
        const { id } = req.params;
        const { name, header_label, data_type = 'text' } = req.body;
        if (!name || !header_label) {
            return res.status(400).json({ error: 'Column name and header label are required.' });
        }

        localSheetQueries.addColumn(id, name.toUpperCase().trim(), header_label.trim(), data_type);
        res.json({ message: 'Column added successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Add column error:', err);
        res.status(500).json({ error: err.message || 'Failed to add column.' });
    }
});

// POST /api/local-sheets/:id/rows — add row
router.post('/:id/rows', (req, res) => {
    try {
        const { id } = req.params;
        const { row_number, cells = {} } = req.body;
        if (!row_number) {
            return res.status(400).json({ error: 'Row number is required.' });
        }

        localSheetQueries.addRow(id, row_number, cells);
        res.json({ message: 'Row added successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Add row error:', err);
        res.status(500).json({ error: err.message || 'Failed to add row.' });
    }
});

// POST /api/local-sheets/:id/write — write cell value
router.post('/:id/write', (req, res) => {
    try {
        const { id } = req.params;
        const { row_number, col_name, value } = req.body;
        if (!row_number || !col_name) {
            return res.status(400).json({ error: 'Row number and column name are required.' });
        }

        localSheetQueries.writeCell(id, parseInt(row_number), col_name.toUpperCase().trim(), value);
        res.json({ message: 'Cell value saved successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Write cell error:', err);
        res.status(500).json({ error: 'Failed to write cell.' });
    }
});

// POST /api/local-sheets/:id/batch-write — batch write multiple cells at once
router.post('/:id/batch-write', (req, res) => {
    try {
        const { id } = req.params;
        const { updates } = req.body; // Array of { rowNumber, colName, value }
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'Updates must be an array.' });
        }

        localSheetQueries.writeCellsBatch(id, updates);
        res.json({ message: 'Batch cells saved successfully.' });
    } catch (err) {
        console.error('[Local Sheets] Batch write error:', err);
        res.status(500).json({ error: 'Failed to write batch cells.' });
    }
});

// POST /api/local-sheets/:id/sync-crawler — sync crawler products into local sheet
router.post('/:id/sync-crawler', async (req, res) => {
    try {
        const { id } = req.params;
        const { mode = 'direct' } = req.body; // 'direct' or 'hierarchical'

        const baseSheet = localSheetQueries.getById(id);
        if (!baseSheet) return res.status(404).json({ error: 'Sheet not found.' });

        // 1. Fetch crawler products
        const { items } = await productQueries.getAll('', '', 99999, 0);
        if (items.length === 0) {
            return res.status(400).json({ error: 'Không có sản phẩm crawler nào để đồng bộ.' });
        }

        const columns = localSheetQueries.getColumns(id);

        if (mode === 'hierarchical') {
            // Group products by brand and major category
            const categoryGroups = {};

            items.forEach(product => {
                const prodBrand = product.brand_name || product.brand || 'Newland';
                let cat = product.category || 'General';
                // Prettify main category segment for sheet title
                let tabName = cat.split('/')[0] || 'General';
                tabName = tabName.split('-').map(w => {
                    if (w.toLowerCase() === 'rfid') return 'RFID';
                    return w.charAt(0).toUpperCase() + w.slice(1);
                }).join(' ');

                const targetSheetName = `${prodBrand} - Product Data - ${tabName}`;
                if (!categoryGroups[targetSheetName]) {
                    categoryGroups[targetSheetName] = [];
                }
                categoryGroups[targetSheetName].push(product);
            });

            const syncedSheets = [];
            let totalSynced = 0;

            for (const [sheetName, products] of Object.entries(categoryGroups)) {
                let targetSheetId;
                const existing = localSheetQueries.getByName(sheetName);

                if (existing) {
                    targetSheetId = existing.id;
                    localSheetQueries.clearRows(targetSheetId);
                } else {
                    targetSheetId = localSheetQueries.create(sheetName, columns);
                }

                products.forEach((product, idx) => {
                    let specs = {};
                    try { specs = JSON.parse(product.specifications || '{}'); } catch (e) {}
                    
                    const model = product.part_number || product.slug.toUpperCase();
                    const featureKeys = Object.keys(specs).slice(0, 3);
                    const features = featureKeys.map(k => `${k}: ${specs[k]}`).join('\n');

                    let specsHtml = '';
                    if (Object.keys(specs).length > 0) {
                        specsHtml = '<table class="Table_Products_Style">\n<thead>\n<tr>\n<th>Thông số kỹ thuật</th>\n<th>Chi tiết</th>\n</tr>\n</thead>\n<tbody>\n' +
                            Object.entries(specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n') +
                            '\n</tbody>\n</table>';
                    }

                    // Format subcategory for Column B
                    let subCat = '';
                    if (product.category) {
                        const segments = product.category.split('/');
                        if (segments.length > 1) {
                            subCat = segments.slice(1).join(' / ').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        } else {
                            subCat = product.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        }
                    }

                    const prodBrand = product.brand_name || product.brand || 'Newland';
                    const cells = {
                        A: product.url || '',
                        B: subCat,
                        C: prodBrand,
                        D: model,
                        E: product.name || '',
                        F: product.image_url || '',
                        G: product.description || '',
                        H: features,
                        I: specsHtml,
                        J: '', // Sapo
                        K: '', // Meta Title
                        L: '', // Meta Description
                    };

                    localSheetQueries.addRow(targetSheetId, 3 + idx, cells);
                    totalSynced++;
                });

                syncedSheets.push(sheetName);
            }

            return res.json({ 
                message: `Đã đồng bộ phân cấp thành công ${totalSynced} sản phẩm vào ${syncedSheets.length} bảng con theo danh mục.` 
            });
        } else {
            // Direct sync into the current sheet
            localSheetQueries.clearRows(id);

            let rowCount = 0;
            items.forEach((product, idx) => {
                let specs = {};
                try { specs = JSON.parse(product.specifications || '{}'); } catch (e) {}
                
                const model = product.part_number || product.slug.toUpperCase();
                const featureKeys = Object.keys(specs).slice(0, 3);
                const features = featureKeys.map(k => `${k}: ${specs[k]}`).join('\n');

                let specsHtml = '';
                if (Object.keys(specs).length > 0) {
                    specsHtml = '<table class="Table_Products_Style">\n<thead>\n<tr>\n<th>Thông số kỹ thuật</th>\n<th>Chi tiết</th>\n</tr>\n</thead>\n<tbody>\n' +
                        Object.entries(specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n') +
                        '\n</tbody>\n</table>';
                }

                let subCat = '';
                if (product.category) {
                    subCat = product.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }

                const cells = {
                    A: product.url || '',
                    B: subCat,
                    C: 'Newland',
                    D: model,
                    E: product.name || '',
                    F: product.image_url || '',
                    G: product.description || '',
                    H: features,
                    I: specsHtml,
                    J: '', // Sapo
                    K: '', // Meta Title
                    L: '', // Meta Description
                };

                const rowNumber = 3 + idx;
                localSheetQueries.addRow(id, rowNumber, cells);
                rowCount++;
            });

            return res.json({ message: `Đã đồng bộ thành công ${rowCount} sản phẩm vào bảng hiện tại.` });
        }
    } catch (err) {
        console.error('[Local Sheets] Sync crawler error:', err);
        res.status(500).json({ error: err.message || 'Lỗi đồng bộ dữ liệu.' });
    }
});

// POST /api/local-sheets/:id/import-google-sheets — import from online google sheets
router.post('/:id/import-google-sheets', async (req, res) => {
    try {
        const { id } = req.params;
        const { spreadsheetId, sheetName, importAll = false } = req.body;
        if (!spreadsheetId) {
            return res.status(400).json({ error: 'Spreadsheet ID is required.' });
        }
        if (!importAll && !sheetName) {
            return res.status(400).json({ error: 'Sheet Name is required when importAll is false.' });
        }

        const CREDENTIALS_PATH = path.join(__dirname, '..', 'data', 'credentials.json');
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            return res.status(400).json({ error: 'Chưa cấu hình API credentials (credentials.json). Vui lòng upload file credentials.json tại trang cấu hình cũ hoặc liên hệ Admin.' });
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const googleSheets = google.sheets({ version: 'v4', auth });

        const baseSheet = localSheetQueries.getById(id);
        if (!baseSheet) return res.status(404).json({ error: 'Local sheet not found.' });

        const columns = localSheetQueries.getColumns(id);

        if (importAll) {
            // Fetch spreadsheet metadata to get tabs list
            const spreadsheetMeta = await googleSheets.spreadsheets.get({ spreadsheetId });
            const sheetsList = spreadsheetMeta.data.sheets || [];
            const tabNames = sheetsList.map(s => s.properties.title);

            if (tabNames.length === 0) {
                return res.status(400).json({ error: 'Không tìm thấy tab con nào trong bảng tính Google Sheets.' });
            }

            let sheetsImported = 0;
            let totalRowsImported = 0;

            for (const tabName of tabNames) {
                const targetSheetName = `${baseSheet.name} - ${tabName}`;
                let targetSheetId;
                const existing = localSheetQueries.getByName(targetSheetName);

                if (existing) {
                    targetSheetId = existing.id;
                    localSheetQueries.clearRows(targetSheetId);
                } else {
                    targetSheetId = localSheetQueries.create(targetSheetName, columns);
                }

                // Fetch data for this tab
                try {
                    const response = await googleSheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: `${tabName}!A1:Z10000`
                    });
                    const values = response.data.values || [];

                    if (values.length > 0) {
                        // Dynamically create any missing columns for this target sheet
                        const targetCols = localSheetQueries.getColumns(targetSheetId);
                        const maxTabCols = Math.max(...values.map(row => row.length));
                        for (let i = 0; i < maxTabCols; i++) {
                            const colName = idxToCol(i);
                            if (!targetCols.some(c => c.name === colName)) {
                                localSheetQueries.addColumn(targetSheetId, colName, `Cột ${colName}`, 'text');
                            }
                        }
                        const updatedTargetCols = localSheetQueries.getColumns(targetSheetId);

                        values.forEach((row, i) => {
                            const cells = {};
                            updatedTargetCols.forEach(col => {
                                const idx = colToIdx(col.name);
                                cells[col.name] = row[idx] || '';
                            });
                            localSheetQueries.addRow(targetSheetId, i + 1, cells);
                            totalRowsImported++;
                        });
                        sheetsImported++;
                    }
                } catch (e) {
                    console.warn(`Failed to import tab ${tabName}:`, e);
                }
            }

            return res.json({ message: `Đã tự động tạo và nhập thành công ${sheetsImported} bảng con (Tổng cộng ${totalRowsImported} dòng).` });
        } else {
            // Single Tab Import
            const response = await googleSheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A1:Z10000`
            });

            const values = response.data.values || [];
            if (values.length === 0) {
                return res.status(400).json({ error: 'Bảng tính Google Sheets rỗng hoặc không đọc được dữ liệu.' });
            }

            // Dynamically create any missing columns
            const maxCols = Math.max(...values.map(row => row.length));
            for (let i = 0; i < maxCols; i++) {
                const colName = idxToCol(i);
                if (!columns.some(c => c.name === colName)) {
                    localSheetQueries.addColumn(id, colName, `Cột ${colName}`, 'text');
                }
            }
            const updatedColumns = localSheetQueries.getColumns(id);

            // Clear existing rows
            localSheetQueries.clearRows(id);

            // Write new rows matching updated columns
            let rowCount = 0;
            values.forEach((row, i) => {
                const cells = {};
                updatedColumns.forEach(col => {
                    const idx = colToIdx(col.name);
                    cells[col.name] = row[idx] || '';
                });
                localSheetQueries.addRow(id, i + 1, cells);
                rowCount++;
            });

            return res.json({ message: `Đã nhập thành công ${rowCount} dòng từ Google Sheet ID vào bảng nội bộ.` });
        }
    } catch (err) {
        console.error('[Local Sheets] Import Google Sheets error:', err);
        res.status(500).json({ error: err.message || 'Lỗi nhập dữ liệu từ Google Sheets.' });
    }
});

// POST /api/local-sheets/:id/import-csv — import from uploaded CSV text
router.post('/:id/import-csv', async (req, res) => {
    try {
        const { id } = req.params;
        const { csvText } = req.body;
        if (!csvText) {
            return res.status(400).json({ error: 'CSV content is required.' });
        }

        const baseSheet = localSheetQueries.getById(id);
        if (!baseSheet) return res.status(404).json({ error: 'Local sheet not found.' });

        const lines = csvText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
            return res.status(400).json({ error: 'File CSV rỗng.' });
        }

        const parsedRows = lines.map(line => parseCsvLine(line));
        const maxCols = Math.max(...parsedRows.map(row => row.length));

        // Get existing columns
        const columns = localSheetQueries.getColumns(id);

        // Dynamically expand columns if needed
        for (let i = 0; i < maxCols; i++) {
            const colName = idxToCol(i);
            if (!columns.some(c => c.name === colName)) {
                localSheetQueries.addColumn(id, colName, `Cột ${colName}`, 'text');
            }
        }

        const updatedColumns = localSheetQueries.getColumns(id);

        // Clear existing rows
        localSheetQueries.clearRows(id);

        let rowCount = 0;
        parsedRows.forEach((row, i) => {
            const cells = {};
            updatedColumns.forEach(col => {
                const idx = colToIdx(col.name);
                cells[col.name] = row[idx] || '';
            });
            localSheetQueries.addRow(id, i + 1, cells);
            rowCount++;
        });

        res.json({ message: `Đã nhập thành công ${rowCount} dòng từ file CSV vào bảng nội bộ.` });
    } catch (err) {
        console.error('[Local Sheets] Import CSV error:', err);
        res.status(500).json({ error: err.message || 'Lỗi nhập dữ liệu từ CSV.' });
    }
});

module.exports = router;
