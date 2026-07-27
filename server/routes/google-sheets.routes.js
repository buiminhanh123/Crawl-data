const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { google } = require('googleapis');
const { productQueries } = require('../db');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'data', 'credentials.json');
const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'sheet_settings.json');

// Ensure data directory exists
fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });

// Configure Multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.dirname(CREDENTIALS_PATH));
    },
    filename: (req, file, cb) => {
        cb(null, 'credentials.json');
    }
});
const upload = multer({ storage });

// Helper to read settings
function getSettings() {
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse settings:', e);
        }
    }
    return { spreadsheetId: '', sheetName: 'Sheet1' };
}

// GET /api/sheets/settings — retrieve configuration status
router.get('/settings', (req, res) => {
    try {
        const settings = getSettings();
        const hasCredentials = fs.existsSync(CREDENTIALS_PATH);
        
        let clientEmail = '';
        if (hasCredentials) {
            try {
                const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
                clientEmail = creds.client_email || '';
            } catch (e) {}
        }

        res.json({
            spreadsheetId: settings.spreadsheetId || '',
            sheetName: settings.sheetName || 'Sheet1',
            hasCredentials,
            clientEmail
        });
    } catch (err) {
        console.error('Failed to get sheet settings:', err);
        res.status(500).json({ error: 'Failed to retrieve settings.' });
    }
});

// POST /api/sheets/settings — update Spreadsheet ID and Sheet Tab Name
router.post('/settings', (req, res) => {
    try {
        const { spreadsheetId, sheetName } = req.body;
        if (!spreadsheetId || !sheetName) {
            return res.status(400).json({ error: 'Spreadsheet ID and Sheet Name are required.' });
        }

        const settings = { spreadsheetId, sheetName };
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

        res.json({ message: 'Settings saved successfully.', settings });
    } catch (err) {
        console.error('Failed to save settings:', err);
        res.status(500).json({ error: 'Failed to save settings.' });
    }
});

// POST /api/sheets/upload — upload credentials.json key file
router.post('/upload', upload.single('credentials'), (req, res) => {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            return res.status(400).json({ error: 'File upload failed.' });
        }

        // Validate JSON structure
        let isValid = false;
        let clientEmail = '';
        try {
            const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
            if (data.type === 'service_account' && data.private_key && data.client_email) {
                isValid = true;
                clientEmail = data.client_email;
            }
        } catch (e) {}

        if (!isValid) {
            // Delete invalid file
            fs.unlinkSync(CREDENTIALS_PATH);
            return res.status(400).json({ error: 'Invalid file format. Please upload a Google Service Account JSON credentials file.' });
        }

        res.json({ message: 'API credentials key file uploaded successfully.', clientEmail });
    } catch (err) {
        console.error('Failed to upload credentials:', err);
        res.status(500).json({ error: 'Failed to upload credentials file.' });
    }
});

// POST /api/sheets/sync — sync products table data to Google Sheets
router.post('/sync', async (req, res) => {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            return res.status(400).json({ error: 'API credentials key file (credentials.json) is missing. Please upload it first.' });
        }
        
        const settings = getSettings();
        if (!settings.spreadsheetId) {
            return res.status(400).json({ error: 'Spreadsheet ID is missing. Please save settings first.' });
        }

        const sheetName = settings.sheetName || 'Sheet1';

        // 1. Authorize Google API
        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 2. Fetch all products from Database
        const { items } = await productQueries.getAll('', '', 99999, 0);
        if (items.length === 0) {
            return res.status(400).json({ error: 'No products in database to sync.' });
        }

        // 3. Format product rows according to Column A-P layout (Row 2 headers)
        const rows = items.map(product => {
            let specs = {};
            try { specs = JSON.parse(product.specifications || '{}'); } catch (e) {}
            
            // Extract series (only from specs, no name fallback)
            const series = specs['Series'] || specs['Product Family'] || specs['Family'] || '';

            // Extract model
            const model = product.part_number || product.slug.toUpperCase();

            // Extract datasheet URL from download links
            let downloads = [];
            try { downloads = JSON.parse(product.download_links || '[]'); } catch (e) {}
            let datasheet = '';
            if (Array.isArray(downloads)) {
                const found = downloads.find(dl => 
                    dl.name?.toLowerCase().includes('datasheet') || 
                    dl.url?.toLowerCase().includes('datasheet') || 
                    dl.name?.toLowerCase().includes('data sheet')
                );
                if (found) {
                    datasheet = found.url;
                } else {
                    const pdf = downloads.find(dl => dl.url?.endsWith('.pdf') || dl.name?.toLowerCase().includes('pdf'));
                    if (pdf) {
                        datasheet = pdf.url;
                    }
                }
            }

            // Extract Features (first 3 spec items or default)
            const featureKeys = Object.keys(specs).slice(0, 3);
            const features = featureKeys.map(k => `${k}: ${specs[k]}`).join('\n');

            // Specs HTML table formatting
            let specsHtml = '';
            if (Object.keys(specs).length > 0) {
                specsHtml = '<table class="Table_Products_Style">\n<thead>\n<tr>\n<th>Thông số kỹ thuật</th>\n<th>Chi tiết</th>\n</tr>\n</thead>\n<tbody>\n' +
                    Object.entries(specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n') +
                    '\n</tbody>\n</table>';
            }

            // Return values for columns A through P (Row 2 headers)
            return [
                product.url || '',           // A: Link
                product.category || '',      // B: Category
                'Newland',                   // C: Hãng
                '',                          // D: (Trống)
                series,                      // E: Series
                model,                       // F: Model
                product.name || '',          // G: Title
                datasheet,                   // H: Datasheet URL
                product.image_url || '',     // I: Path
                product.description || '',   // J: Description
                features,                    // K: Features
                '',                          // L: Tech1 (Để trống theo yêu cầu)
                '',                          // M: Tech2 (Để trống theo yêu cầu)
                '',                          // N: Tech3 (Để trống theo yêu cầu)
                specsHtml,                   // O: thông số kỹ thuật
                ''                           // P: sapo (Để trống theo yêu cầu)
            ];
        });

        // 4. Overwrite Sheet values starting from Row 3 (A3)
        // Clear old contents starting from row 3
        try {
            await sheets.spreadsheets.values.clear({
                spreadsheetId: settings.spreadsheetId,
                range: `${sheetName}!A3:P`
            });
        } catch (clearErr) {
            console.warn('Failed to clear sheet, maybe empty or first time setup:', clearErr);
        }

        // Write new rows
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: settings.spreadsheetId,
            range: `${sheetName}!A3:P`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: rows
            }
        });

        res.json({ 
            message: `Successfully synchronized ${rows.length} products to sheet '${sheetName}'.`,
            updatedCells: response.data.updatedCells
        });

    } catch (err) {
        console.error('Failed to sync to Google Sheets:', err);
        
        let userMessage = 'Failed to synchronize with Google Sheets.';
        if (err.message && err.message.includes('permission denied')) {
            userMessage = 'Permission denied. Please ensure the target Google Sheet has been shared with your Service Account email address as "Editor".';
        } else if (err.message && err.message.includes('not found')) {
            userMessage = 'Spreadsheet ID not found. Please double-check your Spreadsheet ID.';
        } else if (err.code === 400) {
            userMessage = `API Error: ${err.message}. Please verify Spreadsheet ID and Sheet Tab Name.`;
        }

        res.status(500).json({ error: userMessage, details: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/sheets/read?spreadsheetId=xxx&range=A1:B50
// Read cell range from a Google Sheet (used by AI Assistant panel)
// ──────────────────────────────────────────────────────────────
router.get('/read', async (req, res) => {
    const { spreadsheetId, range } = req.query;

    if (!spreadsheetId || !range) {
        return res.status(400).json({ error: 'spreadsheetId and range are required' });
    }

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        return res.status(400).json({ error: 'Google API credentials not configured. Please upload credentials.json first.' });
    }

    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        res.json({ values: response.data.values || [], range: response.data.range });
    } catch (err) {
        console.error('[Sheets Read] Error:', err.message);
        res.status(500).json({ error: 'Failed to read from Google Sheets', details: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/sheets/tabs?spreadsheetId=xxx
// List all tab names in a spreadsheet
// ──────────────────────────────────────────────────────────────
router.get('/tabs', async (req, res) => {
    const { spreadsheetId } = req.query;
    if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId required' });
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        return res.status(400).json({ error: 'No credentials configured' });
    }
    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties(title)',
        });
        const tabs = response.data.sheets.map(s => s.properties.title);
        res.json({ tabs });
    } catch (err) {
        console.error('[Sheets Tabs] Error:', err.message);
        res.status(500).json({ error: 'Failed to list sheet tabs', details: err.message });
    }
});



// ──────────────────────────────────────────────────────────────
// POST /api/sheets/write
// Write values to a specific range (used by AI Assistant panel)
// Body: { spreadsheetId, range, values }
// ──────────────────────────────────────────────────────────────
router.post('/write', async (req, res) => {
    const { spreadsheetId, range, values } = req.body;

    if (!spreadsheetId || !range || !values) {
        return res.status(400).json({ error: 'spreadsheetId, range, and values are required' });
    }

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        return res.status(400).json({ error: 'Google API credentials not configured.' });
    }

    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values },
        });

        res.json({
            message: `Đã ghi ${response.data.updatedCells} ô vào ${range}`,
            updatedCells: response.data.updatedCells,
        });
    } catch (err) {
        console.error('[Sheets Write] Error:', err.message);
        res.status(500).json({ error: 'Failed to write to Google Sheets', details: err.message });
    }
});

module.exports = router;

