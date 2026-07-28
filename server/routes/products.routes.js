const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { productQueries, profileQueries, profileSheetQueries } = require('../db');

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

// DELETE /api/products/profiles/:id — delete a product profile
router.delete('/profiles/:id', (req, res) => {
    try {
        profileQueries.delete(req.params.id);
        res.json({ message: 'Xóa Profile thành công.' });
    } catch (err) {
        console.error('Failed to delete profile:', err);
        res.status(500).json({ error: 'Failed to delete profile.' });
    }
});

// GET /api/products — get list of products (paginated, searched, filtered)
router.get('/', async (req, res) => {
    try {
        const { search = '', category = '', limit = 10, page = 1 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const { total, items } = await productQueries.getAll(search, category, limit, offset);
        res.json({ total, items, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Failed to get products:', err);
        res.status(500).json({ error: 'Failed to retrieve products.' });
    }
});

// GET /api/products/categories — get list of distinct categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await productQueries.getCategories();
        res.json(categories);
    } catch (err) {
        console.error('Failed to get categories:', err);
        res.status(500).json({ error: 'Failed to retrieve categories.' });
    }
});

// GET /api/products/stats — get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await productQueries.getStats();
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
        const { concurrency = 3 } = req.body;
        
        const currentStatus = await productQueries.getCrawlerStatus();
        if (activeCrawlerProcess || (currentStatus && currentStatus.status === 'Running')) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }
        
        // Reset status to starting
        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, 'Launching crawler process...');
        
        console.log(`Spawning Python crawler.py with concurrency: ${concurrency}...`);
        
        // Spawn crawler process asynchronously (not detached so we can easily kill it)
        const pythonProcess = spawn('python', ['-u', 'E:\\sp\\Newland\\crawler.py', '--concurrency', concurrency.toString()], {
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
        const { concurrency = 3, useLocalFile = false, urls } = req.body;

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

        console.log(`Spawning Python crawler.py with --from-file: ${targetFilePath} and concurrency: ${concurrency}...`);

        const pythonProcess = spawn('python', [
            '-u', 'E:\\sp\\Newland\\crawler.py',
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
        const { search = '', category = '' } = req.body;
        
        // Retrieve all products matching the criteria (no pagination)
        const { items } = await productQueries.getAll(search, category, 99999, 0);
        
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
