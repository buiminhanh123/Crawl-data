const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { productQueries, profileQueries, profileSheetQueries } = require('../db');

// Multer: store HAR in memory (max 80MB)
const harUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 }
});

// ============================================================
//  HAR ANALYSIS — Pure JS logic
// ============================================================

// Field patterns to detect in JSON responses
const FIELD_PATTERNS = {
    detail_url:   { keys: ['url', 'link', 'href', 'product_url', 'detail_url', 'page_url', 'product_link', 'canonical'], label: '🌐 Link Sản Phẩm', icon: '🌐' },
    name:         { keys: ['name', 'title', 'product_name', 'item_name', 'productName', 'displayName', 'product_title'], label: '📝 Tên Sản Phẩm', icon: '📝' },
    model:        { keys: ['model', 'sku', 'part_number', 'partNumber', 'model_number', 'code', 'item_code', 'product_code', 'part_no', 'modelNumber'], label: '🔢 Model / Mã SP', icon: '🔢' },
    category:     { keys: ['category', 'categories', 'type', 'productType', 'product_type', 'group', 'department', 'classification', 'taxonomy'], label: '📂 Danh Mục', icon: '📂' },
    brand:        { keys: ['brand', 'manufacturer', 'vendor', 'make', 'brand_name', 'brandName', 'supplier'], label: '🏷️ Hãng / Thương Hiệu', icon: '🏷️' },
    series:       { keys: ['series', 'family', 'line', 'product_family', 'product_line', 'productFamily'], label: '📌 Series / Dòng SP', icon: '📌' },
    image_url:    { keys: ['image', 'img', 'image_url', 'imageUrl', 'thumbnail', 'photo', 'picture', 'main_image', 'cover_image', 'primary_image'], label: '🖼️ Link Hình Ảnh', icon: '🖼️' },
    description:  { keys: ['description', 'desc', 'short_description', 'summary', 'overview', 'intro', 'excerpt', 'content'], label: '📖 Mô Tả SP', icon: '📖' },
    specs_json:   { keys: ['specs', 'specifications', 'technical_specs', 'attributes', 'features', 'parameters', 'properties', 'technicalSpecs', 'techspecs'], label: '📊 Thông Số Kỹ Thuật', icon: '📊' },
    document_url: { keys: ['pdf', 'document', 'datasheet', 'download', 'file_url', 'manual', 'brochure', 'doc_url', 'catalog', 'resource'], label: '📄 Link Tài Liệu / PDF', icon: '📄' },
    price:        { keys: ['price', 'cost', 'msrp', 'list_price', 'retail_price', 'unit_price'], label: '💰 Giá (nếu có)', icon: '💰' },
};

/**
 * Deep scan an object recursively and record which FIELD_PATTERNS keys appear
 * Returns: { fieldKey: [{ path, sampleValue }] }
 */
function scanObjectForFields(obj, depth = 0, pathPrefix = '', results = {}) {
    if (depth > 6 || !obj || typeof obj !== 'object') return results;

    for (const [rawKey, val] of Object.entries(obj)) {
        const lowerKey = rawKey.toLowerCase().replace(/[-_\s]/g, '');
        const currentPath = pathPrefix ? `${pathPrefix}.${rawKey}` : rawKey;

        for (const [fieldKey, pattern] of Object.entries(FIELD_PATTERNS)) {
            const matched = pattern.keys.some(k => {
                const lk = k.toLowerCase().replace(/[-_\s]/g, '');
                return lowerKey === lk || lowerKey.includes(lk) || lk.includes(lowerKey);
            });

            if (matched && val !== null && val !== undefined) {
                if (!results[fieldKey]) results[fieldKey] = [];
                let sample = '';
                if (typeof val === 'string') sample = val.slice(0, 120);
                else if (typeof val === 'number' || typeof val === 'boolean') sample = String(val);
                else if (Array.isArray(val)) sample = `[Array, ${val.length} items]`;
                else if (typeof val === 'object') sample = JSON.stringify(val).slice(0, 120);

                if (sample) {
                    results[fieldKey].push({ path: currentPath, sampleValue: sample });
                }
            }
        }

        // Recurse into objects and arrays
        if (typeof val === 'object' && val !== null) {
            if (Array.isArray(val)) {
                if (val.length > 0 && typeof val[0] === 'object') {
                    scanObjectForFields(val[0], depth + 1, `${currentPath}[0]`, results);
                }
            } else {
                scanObjectForFields(val, depth + 1, currentPath, results);
            }
        }
    }
    return results;
}

/**
 * Main HAR analysis function
 */
function analyzeHar(harData, profileTargetUrl) {
    const entries = harData?.log?.entries || [];
    
    // Determine the domain filter
    let baseHost = '';
    try {
        if (profileTargetUrl) {
            baseHost = new URL(profileTargetUrl).hostname.replace(/^www\./, '');
        }
    } catch (e) {}

    // Filter entries: relevant to the brand domain + JSON responses
    const apiEntries = [];
    const allDomains = new Set();
    
    for (const entry of entries) {
        try {
            const reqUrl = entry.request?.url || '';
            const urlObj = new URL(reqUrl);
            const host = urlObj.hostname.replace(/^www\./, '');
            allDomains.add(host);

            const contentType = (entry.response?.content?.mimeType || '').toLowerCase();
            const isJson = contentType.includes('json') || contentType.includes('javascript');
            
            // Include if: matches domain (or no domain set) AND is JSON
            const domainMatch = !baseHost || host.includes(baseHost) || baseHost.includes(host);
            if (domainMatch && isJson) {
                const text = entry.response?.content?.text || '';
                if (text && text.length > 20) {
                    try {
                        const parsed = JSON.parse(text);
                        apiEntries.push({
                            url: reqUrl,
                            method: entry.request?.method || 'GET',
                            status: entry.response?.status || 0,
                            size: text.length,
                            parsed
                        });
                    } catch (e) {
                        // Not valid JSON, skip
                    }
                }
            }
        } catch (e) {}
    }

    // Aggregate field detections across all API entries
    const fieldHits = {}; // fieldKey -> { count, samples, endpoints }
    
    for (const apiEntry of apiEntries) {
        const found = scanObjectForFields(apiEntry.parsed);
        for (const [fieldKey, hits] of Object.entries(found)) {
            if (!fieldHits[fieldKey]) {
                fieldHits[fieldKey] = { count: 0, samples: [], endpoints: new Set() };
            }
            fieldHits[fieldKey].count++;
            fieldHits[fieldKey].endpoints.add(apiEntry.url);
            // Collect up to 3 unique non-empty samples
            for (const hit of hits) {
                const sv = hit.sampleValue?.trim();
                if (sv && !fieldHits[fieldKey].samples.some(s => s.value === sv) && fieldHits[fieldKey].samples.length < 3) {
                    fieldHits[fieldKey].samples.push({ path: hit.path, value: sv });
                }
            }
        }
    }

    const totalApiEntries = apiEntries.length;

    // Build report fields with confidence
    const fields = Object.entries(FIELD_PATTERNS).map(([fieldKey, pattern]) => {
        const hits = fieldHits[fieldKey];
        if (!hits) return { fieldKey, label: pattern.label, icon: pattern.icon, confidence: 0, occurrences: 0, samples: [], endpoints: [] };
        
        const confidence = totalApiEntries > 0
            ? Math.min(100, Math.round((hits.count / Math.max(totalApiEntries, 1)) * 100))
            : 0;
        
        return {
            fieldKey,
            label: pattern.label,
            icon: pattern.icon,
            confidence,
            occurrences: hits.count,
            samples: hits.samples,
            endpoints: [...hits.endpoints].slice(0, 5)
        };
    }).sort((a, b) => b.confidence - a.confidence);

    // Collect notable API endpoints (JSON APIs with significant size)
    const notableEndpoints = apiEntries
        .filter(e => e.status >= 200 && e.status < 300 && e.size > 100)
        .sort((a, b) => b.size - a.size)
        .slice(0, 20)
        .map(e => ({
            url: e.url,
            method: e.method,
            status: e.status,
            sizekb: Math.round(e.size / 1024 * 10) / 10
        }));

    const detectableFields = fields.filter(f => f.confidence >= 10);
    const highConfidenceFields = fields.filter(f => f.confidence >= 50);

    return {
        summary: {
            totalEntries: entries.length,
            totalJsonApis: totalApiEntries,
            detectableFieldsCount: detectableFields.length,
            highConfidenceFieldsCount: highConfidenceFields.length,
            domains: [...allDomains].slice(0, 10),
            analyzedAt: new Date().toISOString()
        },
        fields,
        notableEndpoints
    };
}



// GET /api/products/profile-sheet — get profile sheet data
router.get('/profile-sheet', (req, res) => {
    try {
        const { profile = 'newland' } = req.query;
        const sheets = profileSheetQueries.getBySlug(profile);
        res.json({ sheets });
    } catch (err) {
        console.error('Failed to get profile sheet:', err);
        res.status(500).json({ error: 'Failed to retrieve sheet data.' });
    }
});

// POST /api/products/profile-sheet — save profile sheet data
router.post('/profile-sheet', (req, res) => {
    try {
        const { profile, sheets } = req.body;
        if (!profile || !sheets) {
            return res.status(400).json({ error: 'profile and sheets are required.' });
        }
        profileSheetQueries.save(profile, sheets);
        res.json({ message: 'Lưu dữ liệu Sheet thành công!' });
    } catch (err) {
        console.error('Failed to save profile sheet:', err);
        res.status(500).json({ error: 'Failed to save sheet data.' });
    }
});

// GET /api/products/profiles — get list of product profiles
router.get('/profiles', (req, res) => {
    try {
        const profiles = profileQueries.getAll();
        res.json({ profiles });
    } catch (err) {
        console.error('Failed to get profiles:', err);
        res.status(500).json({ error: 'Failed to retrieve product profiles.' });
    }
});

// POST /api/products/profiles — create a new product profile
router.post('/profiles', (req, res) => {
    try {
        const { name, brand_name, target_url } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tên Profile là bắt buộc.' });
        }
        const profile = profileQueries.create(name, brand_name || '', target_url || '');
        res.json({ message: 'Tạo Profile thành công.', profile });
    } catch (err) {
        console.error('Failed to create profile:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi tạo Profile.' });
    }
});

// DELETE /api/products/profiles/:slug — delete a product profile and its data
router.delete('/profiles/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        if (slug === 'newland') {
            return res.status(400).json({ error: 'Không thể xóa Profile Newland mặc định.' });
        }
        const profile = profileQueries.getBySlug(slug);
        if (!profile) {
            return res.status(404).json({ error: 'Không tìm thấy Profile.' });
        }
        // Delete crawled products belonging to this profile
        await productQueries.deleteByProfile(slug);
        // Delete sheet data for this profile
        profileSheetQueries.deleteBySlug(slug);
        // Delete profile record
        profileQueries.delete(profile.id);
        res.json({ message: `Đã xóa Profile "${profile.name}" và toàn bộ dữ liệu liên quan thành công.` });
    } catch (err) {
        console.error('Failed to delete profile:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi xóa Profile.' });
    }
});


// PATCH /api/products/profiles/:slug — update profile name and target_url
router.patch('/profiles/:slug', (req, res) => {
    try {
        const { slug } = req.params;
        const { name, target_url } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tên Profile là bắt buộc.' });
        }
        const updated = profileQueries.update(slug, name, target_url || '');
        if (!updated) {
            return res.status(404).json({ error: 'Không tìm thấy Profile.' });
        }
        res.json({ message: 'Cập nhật Profile thành công.', profile: updated });
    } catch (err) {
        console.error('Failed to update profile:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi cập nhật Profile.' });
    }
});

// POST /api/products/profiles/:slug/har — upload & analyze HAR file for a profile
router.post('/profiles/:slug/har', harUpload.single('har'), (req, res) => {
    try {
        const { slug } = req.params;
        const profile = profileQueries.getBySlug(slug);
        if (!profile) {
            return res.status(404).json({ error: 'Không tìm thấy Profile.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Chưa chọn file HAR.' });
        }

        let harData;
        try {
            harData = JSON.parse(req.file.buffer.toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: 'File HAR không hợp lệ (không phải JSON hợp lệ).' });
        }

        if (!harData?.log?.entries) {
            return res.status(400).json({ error: 'File HAR không có cấu trúc hợp lệ (thiếu log.entries).' });
        }

        const report = analyzeHar(harData, profile.target_url || '');
        report.profileSlug = slug;
        report.profileName = profile.name;
        report.harFileName = req.file.originalname;
        report.harFileSizeKb = Math.round(req.file.size / 1024);

        // Save report to DB
        profileQueries.saveHarReport(slug, report);

        res.json({ message: 'Phân tích HAR thành công!', report });
    } catch (err) {
        console.error('Failed to analyze HAR:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi phân tích file HAR.' });
    }
});

// GET /api/products/profiles/:slug/har-report — get saved HAR analysis report
router.get('/profiles/:slug/har-report', (req, res) => {
    try {
        const { slug } = req.params;
        const report = profileQueries.getHarReport(slug);
        if (!report) {
            return res.status(404).json({ error: 'Chưa có báo cáo phân tích HAR cho Profile này.' });
        }
        res.json({ report });
    } catch (err) {
        console.error('Failed to get HAR report:', err);
        res.status(500).json({ error: 'Lỗi khi lấy báo cáo HAR.' });
    }
});

// GET /api/products — get list of products (paginated, searched, filtered)
router.get('/', async (req, res) => {
    try {
        const { search = '', category = '', limit = 10, page = 1, profile = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { total, items } = await productQueries.getAll(search, category, limit, offset, profile);
        res.json({ total, items, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Failed to get products:', err);
        res.status(500).json({ error: 'Failed to retrieve products.' });
    }
});

// GET /api/products/categories — get list of distinct categories
router.get('/categories', async (req, res) => {
    try {
        const { profile = '' } = req.query;
        const categories = await productQueries.getCategories(profile);
        res.json(categories);
    } catch (err) {
        console.error('Failed to get categories:', err);
        res.status(500).json({ error: 'Failed to retrieve categories.' });
    }
});

// GET /api/products/stats — get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const { profile = '' } = req.query;
        const stats = await productQueries.getStats(profile);
        res.json(stats);
    } catch (err) {
        console.error('Failed to get stats:', err);
        res.status(500).json({ error: 'Failed to retrieve stats.' });
    }
});

// GET /api/products/crawler/status — get crawler progress/status
router.get('/crawler/status', async (req, res) => {
    try {
        const status = await productQueries.getCrawlerStatus();
        res.json(status);
    } catch (err) {
        console.error('Failed to get crawler status:', err);
        res.status(500).json({ error: 'Failed to retrieve crawler status.' });
    }
});

let activeCrawlerProcess = null;

// POST /api/products/crawler/trigger — trigger the crawler
router.post('/crawler/trigger', async (req, res) => {
    try {
        const { concurrency = 3, profile = 'newland' } = req.body;
        
        const currentStatus = await productQueries.getCrawlerStatus();
        if (activeCrawlerProcess || (currentStatus && currentStatus.status === 'Running')) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }
        
        // Reset status to starting
        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, 'Launching crawler process...');
        
        console.log(`Spawning Python crawler.py for profile: ${profile} with concurrency: ${concurrency}...`);
        
        // Spawn crawler process asynchronously (not detached so we can easily kill it)
        const pythonProcess = spawn('python', ['-u', 'E:\\sp\\Newland\\crawler.py', '--profile', profile, '--concurrency', concurrency.toString()], {
            stdio: 'ignore'
        });

        
        activeCrawlerProcess = pythonProcess;
        
        pythonProcess.on('exit', async (code) => {
            console.log(`Python crawler process exited with code ${code}`);
            activeCrawlerProcess = null;
            
            // Check status, if it is still running, set it to Completed
            const status = await productQueries.getCrawlerStatus();
            if (status && (status.status === 'Running' || status.status === 'Starting')) {
                if (code === 0) {
                    await productQueries.updateCrawlerStatus('Completed', 100, status.total_items, status.total_items, 'Crawling completed successfully.');
                } else {
                    await productQueries.updateCrawlerStatus('Error', status.progress, status.total_items, status.current_item, `Process exited with code ${code}`);
                }
            }
        });
        
        res.json({ message: 'Crawler triggered successfully.' });
    } catch (err) {
        console.error('Failed to trigger crawler:', err);
        res.status(500).json({ error: 'Failed to start crawler.' });
    }
});

// POST /api/products/crawler/stop — stop the crawler
router.post('/crawler/stop', async (req, res) => {
    try {
        if (activeCrawlerProcess) {
            console.log('Killing active Python crawler process...');
            activeCrawlerProcess.kill('SIGKILL');
            activeCrawlerProcess = null;
        }
        
        const status = await productQueries.getCrawlerStatus();
        await productQueries.updateCrawlerStatus('Stopped', status ? status.progress : 0, status ? status.total_items : 0, status ? status.current_item : 0, 'Crawler stopped by user.');
        
        res.json({ message: 'Crawler stopped successfully.' });
    } catch (err) {
        console.error('Failed to stop crawler:', err);
        res.status(500).json({ error: 'Failed to stop crawler.' });
    }
});

// GET /api/products/crawler/logs — get crawler logs
router.get('/crawler/logs', async (req, res) => {
    try {
        const logs = await productQueries.getCrawlerLogs();
        res.json(logs);
    } catch (err) {
        console.error('Failed to get crawler logs:', err);
        res.status(500).json({ error: 'Failed to retrieve crawler logs.' });
    }
});

// GET /api/products/crawler/failed — get list of permanently failed URLs
router.get('/crawler/failed', async (req, res) => {
    try {
        const failed = await productQueries.getFailedUrls();
        const count = await productQueries.getFailedCount();
        res.json({ count, items: failed });
    } catch (err) {
        console.error('Failed to get failed URLs:', err);
        res.status(500).json({ error: 'Failed to retrieve failed URLs.' });
    }
});

// DELETE /api/products/crawler/failed — clear failed URLs history
router.delete('/crawler/failed', async (req, res) => {
    try {
        await productQueries.clearFailedUrls();
        res.json({ message: 'Cleared failed URLs history successfully.' });
    } catch (err) {
        console.error('Failed to clear failed URLs:', err);
        res.status(500).json({ error: 'Failed to clear failed URLs.' });
    }
});

// POST /api/products/crawler/retry-failed — retry all permanently failed URLs
router.post('/crawler/retry-failed', async (req, res) => {
    try {
        const { concurrency = 2 } = req.body;

        const currentStatus = await productQueries.getCrawlerStatus();
        if (activeCrawlerProcess || (currentStatus && currentStatus.status === 'Running')) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }

        const failedCount = await productQueries.getFailedCount();
        if (failedCount === 0) {
            return res.status(400).json({ error: 'No failed URLs to retry.' });
        }

        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, `Retrying ${failedCount} failed URLs...`);

        console.log(`Spawning Python crawler.py --retry-failed with concurrency: ${concurrency}...`);

        const pythonProcess = spawn('python', [
            '-u', 'E:\\sp\\Newland\\crawler.py',
            '--retry-failed',
            '--concurrency', concurrency.toString()
        ], { stdio: 'ignore' });

        activeCrawlerProcess = pythonProcess;

        pythonProcess.on('exit', async (code) => {
            console.log(`Python crawler (retry-failed) exited with code ${code}`);
            activeCrawlerProcess = null;
            const status = await productQueries.getCrawlerStatus();
            if (status && (status.status === 'Running' || status.status === 'Starting')) {
                if (code === 0) {
                    await productQueries.updateCrawlerStatus('Completed', 100, status.total_items, status.total_items, 'Retry completed successfully.');
                } else {
                    await productQueries.updateCrawlerStatus('Error', status.progress, status.total_items, status.current_item, `Retry process exited with code ${code}`);
                }
            }
        });

        res.json({ message: `Retry triggered for ${failedCount} failed URLs.` });
    } catch (err) {
        console.error('Failed to trigger retry:', err);
        res.status(500).json({ error: 'Failed to start retry.' });
    }
});

// POST /api/products/crawler/fill-downloads — fill download_links for all products missing them
router.post('/crawler/fill-downloads', async (req, res) => {
    try {
        const { concurrency = 3 } = req.body;

        const currentStatus = await productQueries.getCrawlerStatus();
        if (activeCrawlerProcess || (currentStatus && currentStatus.status === 'Running')) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }

        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, 'Scanning products for missing download links...');

        console.log(`Spawning Python crawler.py --fill-downloads with concurrency: ${concurrency}...`);

        const pythonProcess = spawn('python', [
            '-u', 'E:\\sp\\Newland\\crawler.py',
            '--fill-downloads',
            '--concurrency', concurrency.toString()
        ], { stdio: 'ignore' });

        activeCrawlerProcess = pythonProcess;

        pythonProcess.on('exit', async (code) => {
            console.log(`Python crawler (fill-downloads) exited with code ${code}`);
            activeCrawlerProcess = null;
            const status = await productQueries.getCrawlerStatus();
            if (status && (status.status === 'Running' || status.status === 'Starting')) {
                if (code === 0) {
                    await productQueries.updateCrawlerStatus('Completed', 100, status.total_items, status.total_items, 'Download links filled successfully.');
                } else {
                    await productQueries.updateCrawlerStatus('Error', status.progress, status.total_items, status.current_item, `Fill-downloads process exited with code ${code}`);
                }
            }
        });

        res.json({ message: 'Fill downloads triggered successfully.' });
    } catch (err) {
        console.error('Failed to trigger fill-downloads:', err);
        res.status(500).json({ error: 'Failed to start fill-downloads.' });
    }
});

// POST /api/products/crawler/trigger-from-file — trigger the crawler on a list of product URLs
router.post('/crawler/trigger-from-file', async (req, res) => {
    try {
        const { concurrency = 3, useLocalFile = false, urls, profile = 'newland' } = req.body;

        const currentStatus = await productQueries.getCrawlerStatus();
        if (activeCrawlerProcess || (currentStatus && currentStatus.status === 'Running')) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }

        let targetFilePath = '';
        if (useLocalFile) {
            targetFilePath = 'E:\\sp\\Newland\\list-link.txt';
        } else if (urls && Array.isArray(urls) && urls.length > 0) {
            const dataDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            targetFilePath = path.join(dataDir, 'temp-scrape-list.txt');
            fs.writeFileSync(targetFilePath, urls.join('\n'), 'utf8');
        } else {
            return res.status(400).json({ error: 'No URL list or local file option provided.' });
        }

        if (!fs.existsSync(targetFilePath)) {
            return res.status(400).json({ error: `File not found: ${targetFilePath}` });
        }

        // Reset status to starting
        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, 'Scanning custom list...');

        console.log(`Spawning Python crawler.py for profile: ${profile} with --from-file: ${targetFilePath} and concurrency: ${concurrency}...`);

        const pythonProcess = spawn('python', [
            '-u', 'E:\\sp\\Newland\\crawler.py',
            '--profile', profile,
            '--from-file', targetFilePath,
            '--concurrency', concurrency.toString()
        ], { stdio: 'ignore' });

        activeCrawlerProcess = pythonProcess;

        pythonProcess.on('exit', async (code) => {
            console.log(`Python crawler (from-file) exited with code ${code}`);
            activeCrawlerProcess = null;
            const status = await productQueries.getCrawlerStatus();
            if (status && (status.status === 'Running' || status.status === 'Starting')) {
                if (code === 0) {
                    await productQueries.updateCrawlerStatus('Completed', 100, status.total_items, status.total_items, 'Crawling completed successfully.');
                } else {
                    await productQueries.updateCrawlerStatus('Error', status.progress, status.total_items, status.current_item, `Process exited with code ${code}`);
                }
            }
        });

        res.json({ message: 'Custom list crawl triggered successfully.' });
    } catch (err) {
        console.error('Failed to trigger crawler from file:', err);
        res.status(500).json({ error: 'Failed to start crawler.' });
    }
});

// POST /api/products/export — export matching products to Excel
router.post('/export', async (req, res) => {
    try {
        const { search = '', category = '', profile = '' } = req.body;
        
        // Retrieve all products matching the criteria (no pagination)
        const { items } = await productQueries.getAll(search, category, 99999, 0, profile);

        
        // Format rows for excel
        const rows = items.map((item, index) => {
            let specs = {};
            try {
                specs = JSON.parse(item.specifications);
            } catch (e) {}
            
            return {
                'STT': index + 1,
                'Tên sản phẩm': item.name,
                'Phân loại': item.category,
                'Part Number': item.part_number,
                'Mô tả': item.description,
                'URL sản phẩm': item.url,
                'Ảnh sản phẩm': item.image_url,
                'Chi tiết thông số': Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n')
            };
        });
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        
        // Set column sizes
        const wscols = [
            { wch: 6 },
            { wch: 25 },
            { wch: 25 },
            { wch: 20 },
            { wch: 50 },
            { wch: 40 },
            { wch: 40 },
            { wch: 60 }
        ];
        ws['!cols'] = wscols;
        
        XLSX.utils.book_append_sheet(wb, ws, 'Products');
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Newland_Products.xlsx"');
        res.send(buffer);
    } catch (err) {
        console.error('Failed to export to excel:', err);
        res.status(500).json({ error: 'Failed to export products data to Excel.' });
    }
});

// GET /api/products/:id — get product details by ID
router.get('/:id', async (req, res) => {
    try {
        const product = await productQueries.getById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.json(product);
    } catch (err) {
        console.error('Failed to get product details:', err);
        res.status(500).json({ error: 'Failed to retrieve product details.' });
    }
});

module.exports = router;
