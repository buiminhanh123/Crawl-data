const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cheerio = require('cheerio');
const xpath = require('xpath');
const { DOMParser } = require('@xmldom/xmldom');
const { productQueries, profileQueries, profileSheetQueries, openProductsDb } = require('../db');
const googleDriveRoutes = require('./google-drive.routes');

router.use('/google-drive', googleDriveRoutes);

const ROOT_DIR = path.resolve(__dirname, '../..');
const SERVER_DIR = path.resolve(__dirname, '..');

const getCrawlerConfig = () => {
    const serverCrawler = path.resolve(SERVER_DIR, 'crawler.py');
    const rootCrawler = path.resolve(ROOT_DIR, 'crawler.py');
    if (fs.existsSync(serverCrawler)) {
        return { scriptPath: serverCrawler, cwd: SERVER_DIR };
    }
    return { scriptPath: rootCrawler, cwd: ROOT_DIR };
};

const getPythonCmd = () => {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    return process.platform === 'win32' ? 'python' : 'python3';
};

// Multer: store HAR in memory (max 80MB)
const harUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 }
});

// ============================================================
//  HAR ANALYSIS — Pure JS logic
// ============================================================

// Field patterns to detect in JSON responses & HTML pages
const FIELD_PATTERNS = {
    detail_url:   { keys: ['url', 'link', 'href', 'product_url', 'detail_url', 'page_url', 'product_link', 'canonical'], label: '🌐 Link Sản Phẩm', icon: '🌐' },
    name:         { keys: ['name', 'title', 'product_name', 'item_name', 'productName', 'displayName', 'product_title'], label: '📝 Tên Sản Phẩm', icon: '📝' },
    model:        { keys: ['model', 'sku', 'part_number', 'partNumber', 'model_number', 'code', 'item_code', 'product_code', 'part_no', 'modelNumber', 'mpn'], label: '🔢 Model / Mã SP', icon: '🔢' },
    category:     { keys: ['category', 'categories', 'type', 'productType', 'product_type', 'group', 'department', 'classification', 'taxonomy', 'catalog'], label: '📂 Danh Mục', icon: '📂' },
    series:       { keys: ['series', 'family', 'line', 'product_family', 'product_line', 'productFamily', 'series_name'], label: '📌 Series / Dòng SP', icon: '📌' },
    brand:        { keys: ['brand', 'manufacturer', 'vendor', 'make', 'brand_name', 'brandName', 'supplier', 'company'], label: '🏷️ Hãng / Thương Hiệu', icon: '🏷️' },
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
 * Foreign language / non-main locale patterns to filter out
 */
const FOREIGN_LOCALES = [
    '/cn/', '/zh/', '/zh-cn/', '/zh-tw/', '/ja/', '/jp/', '/de/', '/fr/', '/es/', '/kr/', '/ru/', '/it/', '/pt/', '/tw/'
];

/**
 * Scan HTML response text for product fields (JSON-LD, meta tags, breadcrumbs, headings, links, images)
 */
function scanHtmlForFields(html, reqUrl, results = {}) {
    if (!html || typeof html !== 'string') return results;

    const pushResult = (fieldKey, path, val) => {
        if (!val || typeof val !== 'string') return;
        const clean = val.trim();
        if (!clean || clean.length < 2) return;
        // Ignore JS code snippets and template placeholders
        if (clean.includes('+') || clean.includes('${') || clean.includes('function(') || clean.includes('var ') || clean.includes('items[')) return;
        if (!results[fieldKey]) results[fieldKey] = [];
        if (!results[fieldKey].some(r => r.sampleValue === clean)) {
            results[fieldKey].push({ path, sampleValue: clean });
        }
    };

    // ------------------------------------------------------------
    // 1. JSON-LD Structured Data (<script type="application/ld+json">)
    // ------------------------------------------------------------
    const ldJsonMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldJsonMatches) {
        try {
            const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
            if (!jsonText) continue;
            const data = JSON.parse(jsonText);
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
                const type = (item['@type'] || '').toLowerCase();
                if (type === 'product') {
                    if (item.name) pushResult('name', 'JSON-LD Product Name', item.name);
                    if (item.model) pushResult('model', 'JSON-LD Product Model', typeof item.model === 'string' ? item.model : item.model.name);
                    if (item.mpn || item.sku) pushResult('model', 'JSON-LD MPN/SKU', item.mpn || item.sku);
                    if (item.brand) pushResult('brand', 'JSON-LD Brand', typeof item.brand === 'string' ? item.brand : item.brand.name);
                    if (item.category) pushResult('category', 'JSON-LD Category', item.category);
                    if (item.description) pushResult('description', 'JSON-LD Description', item.description.slice(0, 150));
                    if (item.image) {
                        const imgUrl = Array.isArray(item.image) ? item.image[0] : (typeof item.image === 'string' ? item.image : item.image.url);
                        if (imgUrl) pushResult('image_url', 'JSON-LD Image', imgUrl);
                    }
                } else if (type === 'breadcrumblist' && Array.isArray(item.itemListElement)) {
                    const crumbs = item.itemListElement
                        .map(c => (c.item?.name || c.name || '').trim())
                        .filter(Boolean);
                    if (crumbs.length >= 2) {
                        pushResult('category', 'JSON-LD Breadcrumb Category', crumbs[1]);
                    }
                    if (crumbs.length >= 3) {
                        pushResult('series', 'JSON-LD Breadcrumb Series', crumbs[2]);
                    }
                } else if (type === 'organization' && item.name) {
                    pushResult('brand', 'JSON-LD Organization Brand', item.name);
                }
            }
        } catch (e) {}
    }

    // ------------------------------------------------------------
    // 2. Meta Tags (OpenGraph & Meta Description / Brand)
    // ------------------------------------------------------------
    const metaBrandMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
    if (metaBrandMatch && metaBrandMatch[1]) {
        pushResult('brand', 'HTML Meta Brand (og:site_name)', metaBrandMatch[1]);
    }

    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (metaDescMatch && metaDescMatch[1]) {
        pushResult('description', 'HTML Meta Description', metaDescMatch[1].slice(0, 150));
    }

    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
        pushResult('name', 'HTML Meta og:title', ogTitleMatch[1]);
    }

    // ------------------------------------------------------------
    // 3. Breadcrumbs DOM Extraction (Category & Series)
    // ------------------------------------------------------------
    const breadcrumbMatches = html.match(/<(?:nav|div|ul)[^>]*class=["'][^"']*(?:breadcrumb|path|location|nav-trail)[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|div|ul)>/gi) || [];
    for (const bBlock of breadcrumbMatches) {
        const textItems = bBlock.replace(/<[^>]+>/g, '\n')
            .split('\n')
            .map(s => s.trim())
            .filter(s => s && s !== '>' && s !== '/' && s !== '»' && s.toLowerCase() !== 'home' && s.toLowerCase() !== 'trang chủ');
        
        if (textItems.length >= 1) {
            pushResult('category', 'HTML Breadcrumb Category', textItems[0]);
        }
        if (textItems.length >= 2) {
            pushResult('series', 'HTML Breadcrumb Series', textItems[1]);
        }
    }

    // ------------------------------------------------------------
    // 4. Page Title & Heading Extraction
    // ------------------------------------------------------------
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        const titleText = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        if (titleText) {
            pushResult('name', 'HTML <title>', titleText);

            // Check if title mentions series
            if (/\b(?:series|line|family)\b/i.test(titleText)) {
                const seriesPart = titleText.split(/[-|]/)[0].trim();
                if (seriesPart) pushResult('series', 'HTML Title Series', seriesPart);
            }
        }
    }

    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
        const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();
        if (h1Text && h1Text.length < 100) {
            pushResult('name', 'HTML <h1> Title', h1Text);
        }
    }

    // ------------------------------------------------------------
    // 5. Product Headings & Model Names (H2, H3, Alt text)
    // ------------------------------------------------------------
    const h2Matches = html.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || [];
    for (const hMatch of h2Matches) {
        const hText = hMatch.replace(/<[^>]+>/g, '').trim();
        if (hText && hText.length > 2 && hText.length < 80) {
            // If looks like a model code or product title
            if (/[A-Z0-9]{2,}[-_/][A-Z0-9]+/i.test(hText) || /\b(?:pro|plus|series|printer|scanner)\b/i.test(hText)) {
                pushResult('model', 'HTML Product Heading Model', hText);
            }
        }
    }

    // ------------------------------------------------------------
    // 6. Detail URLs vs Category URLs (with Locale & Junk filtering)
    // ------------------------------------------------------------
    const linkMatches = html.match(/href=["']([^"']*(?:products-detail|product-detail|products|detail|product)[^"']*)["']/gi) || [];
    const rawLinks = Array.from(new Set(linkMatches.map(m => m.replace(/^href=["']/i, '').replace(/["']$/, ''))))
        .filter(l => !l.match(/\.(css|js|png|jpg|jpeg|svg|gif|woff|woff2)(\?.*)?$/i))
        .filter(l => !l.includes('products-compare') && !l.includes('products-search') && !l.includes('discontinued=') && !l.includes('index_tag_id='))
        // Filter foreign language locales unless current reqUrl is on that locale
        .filter(l => {
            const lowerL = l.toLowerCase();
            const hasForeignLocale = FOREIGN_LOCALES.some(loc => lowerL.includes(loc));
            if (!hasForeignLocale) return true;
            return FOREIGN_LOCALES.some(loc => reqUrl.toLowerCase().includes(loc));
        });

    const detailLinks = [];
    const catLinks = [];

    rawLinks.forEach(l => {
        try {
            const fullUrl = l.startsWith('http') ? l : new URL(l, reqUrl).href;
            const cleanUrl = fullUrl.split('#')[0].split('?')[0];
            const lower = cleanUrl.toLowerCase();

            const isDetail = lower.includes('products-detail') || lower.includes('product-detail') || lower.includes('/detail/') || lower.includes('/item/') || lower.includes('/p/');
            if (isDetail && !lower.replace(/\/$/, '').endsWith('products-detail') && !lower.replace(/\/$/, '').endsWith('product-detail')) {
                detailLinks.push(cleanUrl);
            } else if (lower.includes('/products/') || lower.includes('/product/')) {
                catLinks.push(cleanUrl);
            }
        } catch (e) {}
    });

    const sortedLinks = Array.from(new Set([...detailLinks, ...catLinks]));
    sortedLinks.forEach(l => {
        const isDetail = l.includes('products-detail') || l.includes('product-detail') || l.includes('/detail/') || l.includes('/item/');
        pushResult('detail_url', isDetail ? 'HTML Product Detail Link' : 'HTML Category Link', l);

        // Also check URL path for Category vs Series
        try {
            const pathSegs = new URL(l).pathname.split('/').filter(Boolean);
            if (pathSegs.length >= 2 && (pathSegs[0] === 'products' || pathSegs[0] === 'product')) {
                const catSlug = pathSegs[1].replace(/[-_]/g, ' ');
                pushResult('category', 'HTML Link Category Path', catSlug.charAt(0).toUpperCase() + catSlug.slice(1));
            }
            if (pathSegs.length >= 3) {
                const seriesSlug = pathSegs[2].replace(/[-_]/g, ' ');
                if (!seriesSlug.includes('detail')) {
                    pushResult('series', 'HTML Link Series Path', seriesSlug.charAt(0).toUpperCase() + seriesSlug.slice(1));
                }
            }
        } catch (e) {}
    });

    // ------------------------------------------------------------
    // 7. Image URLs & Alt Text
    // ------------------------------------------------------------
    const imgMatches = html.match(/<img[^>]+>/gi) || [];
    for (const imgTag of imgMatches) {
        const srcMatch = imgTag.match(/(?:src|data-src)=["']([^"']+)["']/i);
        const altMatch = imgTag.match(/alt=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
            const src = srcMatch[1];
            if (/\.(?:jpg|jpeg|png|webp|gif)/i.test(src) && /(?:upload|catalog|product|pic)/i.test(src)) {
                try {
                    const fullUrl = src.startsWith('http') ? src : new URL(src, reqUrl).href;
                    pushResult('image_url', 'HTML <img src>', fullUrl);
                } catch (e) {}
            }
        }
        if (altMatch && altMatch[1]) {
            const altText = altMatch[1].trim();
            if (altText && altText.length > 3 && altText.length < 80 && !altText.toLowerCase().includes('logo') && !altText.toLowerCase().includes('banner')) {
                pushResult('model', 'HTML Image Alt Text Model', altText);
            }
        }
    }

    return results;
}

function analyzeHar(harData, profileTargetUrl) {
    const entries = harData?.log?.entries || [];
    
    // Determine the domain filter
    let baseHost = '';
    try {
        if (profileTargetUrl) {
            baseHost = new URL(profileTargetUrl).hostname.replace(/^www\./, '');
        }
    } catch (e) {}

    // Filter entries: relevant to domain (JSON APIs & HTML Web Pages)
    const apiEntries = [];
    const htmlEntries = [];
    const allDomains = new Set();
    
    for (const entry of entries) {
        try {
            const reqUrl = entry.request?.url || '';
            const urlObj = new URL(reqUrl);
            const host = urlObj.hostname.replace(/^www\./, '');
            allDomains.add(host);

            const contentType = (entry.response?.content?.mimeType || '').toLowerCase();
            const isJson = contentType.includes('json') || contentType.includes('javascript');
            const isHtml = contentType.includes('html');
            const domainMatch = !baseHost || host.includes(baseHost) || baseHost.includes(host);

            if (domainMatch) {
                const text = entry.response?.content?.text || '';
                if (text && text.length > 20) {
                    if (isJson) {
                        try {
                            const parsed = JSON.parse(text);
                            apiEntries.push({
                                url: reqUrl,
                                method: entry.request?.method || 'GET',
                                status: entry.response?.status || 0,
                                size: text.length,
                                parsed
                            });
                        } catch (e) {}
                    } else if (isHtml) {
                        htmlEntries.push({
                            url: reqUrl,
                            method: entry.request?.method || 'GET',
                            status: entry.response?.status || 0,
                            size: text.length,
                            text
                        });
                    }
                }
            }
        } catch (e) {}
    }

    // Aggregate field detections across all API entries & HTML pages
    const fieldHits = {}; // fieldKey -> { count, samples, endpoints }
    
    for (const apiEntry of apiEntries) {
        const found = scanObjectForFields(apiEntry.parsed);
        for (const [fieldKey, hits] of Object.entries(found)) {
            if (!fieldHits[fieldKey]) {
                fieldHits[fieldKey] = { count: 0, samples: [], endpoints: new Set() };
            }
            fieldHits[fieldKey].count++;
            fieldHits[fieldKey].endpoints.add(apiEntry.url);
            for (const hit of hits) {
                const sv = hit.sampleValue?.trim();
                if (sv && !fieldHits[fieldKey].samples.some(s => s.value === sv) && fieldHits[fieldKey].samples.length < 3) {
                    fieldHits[fieldKey].samples.push({ path: hit.path, value: sv });
                }
            }
        }
    }

    // Also scan HTML entries (for traditional SSR websites like Argox)
    for (const htmlEntry of htmlEntries) {
        const found = scanHtmlForFields(htmlEntry.text, htmlEntry.url);
        for (const [fieldKey, hits] of Object.entries(found)) {
            if (!fieldHits[fieldKey]) {
                fieldHits[fieldKey] = { count: 0, samples: [], endpoints: new Set() };
            }
            fieldHits[fieldKey].count += hits.length;
            fieldHits[fieldKey].endpoints.add(htmlEntry.url);
            
            const maxSamples = (fieldKey === 'detail_url' || fieldKey === 'image_url') ? 500 : 10;
            for (const hit of hits) {
                const sv = hit.sampleValue?.trim();
                if (sv && !fieldHits[fieldKey].samples.some(s => s.value === sv) && fieldHits[fieldKey].samples.length < maxSamples) {
                    fieldHits[fieldKey].samples.push({ path: hit.path, value: sv });
                    if (fieldKey === 'detail_url') {
                        fieldHits[fieldKey].endpoints.add(sv);
                    }
                }
            }
        }
    }

    const totalScanned = Math.max(apiEntries.length + htmlEntries.length, 1);

    // Build report fields with confidence
    const fields = Object.entries(FIELD_PATTERNS).map(([fieldKey, pattern]) => {
        const hits = fieldHits[fieldKey];
        if (!hits) return { fieldKey, label: pattern.label, icon: pattern.icon, confidence: 0, occurrences: 0, samples: [], endpoints: [] };
        
        const confidence = Math.min(100, Math.max(80, Math.round((hits.count / totalScanned) * 100)));
        
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

    // Collect notable API endpoints (JSON APIs or HTML pages)
    const notableEndpoints = (apiEntries.length > 0 ? apiEntries : htmlEntries)
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
            totalJsonApis: apiEntries.length,
            totalHtmlPages: htmlEntries.length,
            siteArchitecture: apiEntries.length > 0 ? "JSON REST API (SPA)" : (htmlEntries.length > 0 ? "HTML Web Page (SSR Website)" : "Khác"),
            detectableFieldsCount: detectableFields.length,
            highConfidenceFieldsCount: highConfidenceFields.length,
            domains: [...allDomains].slice(0, 10),
            analyzedAt: new Date().toISOString()
        },
        fields,
        notableEndpoints
    };
}



// GET /api/products/columns — get actual column names from products table
router.get('/columns', async (req, res) => {
    try {
        const pdb = await openProductsDb();
        const result = pdb.exec('PRAGMA table_info(products)');
        pdb.close();
        if (!result[0]) return res.json({ columns: [] });
        // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
        const cols = result[0].values.map(row => row[1]); // index 1 = name
        // Filter out internal/meta columns not useful for mapping
        const excluded = ['id', 'created_at', 'slug'];
        const columns = cols.filter(c => !excluded.includes(c));
        res.json({ columns });
    } catch (err) {
        console.error('Failed to get product columns:', err);
        res.status(500).json({ error: 'Failed to get columns', columns: [] });
    }
});

// GET /api/products/profile-checklist — audit 8-step workflow completeness for profile
router.get('/profile-checklist', async (req, res) => {
    try {
        const { profile = 'newland' } = req.query;
        
        // 1. Crawled products in products.db
        let crawledCount = 0;
        try {
            const pdb = await openProductsDb();
            const dbRes = pdb.exec("SELECT COUNT(*) as c FROM products WHERE profile_slug = ?", [profile]);
            pdb.close();
            if (dbRes[0] && dbRes[0].values && dbRes[0].values[0]) {
                crawledCount = dbRes[0].values[0][0] || 0;
            }
        } catch (e) {
            console.error('Error fetching crawled count from products.db:', e);
        }

        // 2. Profile sheet rows
        const sheets = profileSheetQueries.getBySlug(profile) || [];
        let totalSheetRows = 0;
        let sapoCount = 0;
        let metaCount = 0;
        let specCount = 0;
        let imgCount = 0;
        let pdfCount = 0;
        let idCount = 0;
        let mandatoryDoneCount = 0;

        const missingDetails = {
            mandatory: [],
            sapo: [],
            meta: [],
            dich: [],
            img: [],
            pdf: [],
            ids: []
        };

        sheets.forEach(s => {
            if (!s.data || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());
            
            // Find column indices (including mandatory red headers: ma_san_pham, ten_san_pham, danh_muc_id)
            const codeAliases = ALIAS_MAP.ma_san_pham;
            const nameAliases = ALIAS_MAP.ten_san_pham;
            const catAliases = ALIAS_MAP.danh_muc_id;

            let codeIdx = headers.findIndex((h, idx) => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            let nameIdx = headers.findIndex((h, idx) => nameAliases.some(a => h === a || h.includes(a)));
            if (nameIdx === -1) nameIdx = 1;

            let catIdx = headers.findIndex((h, idx) => catAliases.some(a => h === a || h.includes(a)));
            if (catIdx === -1 && headers.length > 17) catIdx = 17;

            const sapoIdx = headers.findIndex(h => h.includes('sapo') || h.includes('mô tả ngắn') || h === 'mo_ta');
            const metaIdx = headers.findIndex(h => h.includes('meta') || h.includes('tiêu đề trang') || h === 'tieu_de_trang');
            const specIdx = headers.findIndex(h => h.includes('thông số') || h.includes('table') || h === 'noi_dung');
            const imgIdx = headers.findIndex(h => h.includes('ảnh') || h.includes('img') || h.includes('drive') || h === 'anh_dai_dien');
            const pdfIdx = headers.findIndex(h => h.includes('tài liệu') || h.includes('pdf') || h.includes('doc') || h === 'tl_hdsd_link');
            const catIdIdx = headers.findIndex(h => h.includes('danh_muc') || h.includes('danh mục') || h.includes('cat_id'));
            const brandIdIdx = headers.findIndex(h => h.includes('thuong_hieu') || h.includes('thương hiệu') || h.includes('brand_id'));

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
                totalSheetRows++;
                
                const valCode = (codeIdx >= 0 && codeIdx < row.length) ? String(row[codeIdx] || '').trim() : '';
                const valName = (nameIdx >= 0 && nameIdx < row.length) ? String(row[nameIdx] || '').trim() : '';
                const valCat = (catIdx >= 0 && catIdx < row.length) ? String(row[catIdx] || '').trim() : '';

                const prodName = valName || valCode || `Hàng ${r+1}`;

                // CHECK 3 MANDATORY RED FIELDS
                const missingRed = [];
                if (!valCode) missingRed.push('Mã sản phẩm (ma_san_pham)');
                if (!valName) missingRed.push('Tên sản phẩm (ten_san_pham)');
                if (!valCat) missingRed.push('ID Danh mục (danh_muc_id)');

                if (missingRed.length === 0) {
                    mandatoryDoneCount++;
                } else {
                    if (missingDetails.mandatory.length < 100) {
                        missingDetails.mandatory.push({
                            sheet: s.name,
                            row: r + 1,
                            name: prodName,
                            missingFields: missingRed
                        });
                    }
                }

                // SAPO
                if (sapoIdx >= 0 && row[sapoIdx] && String(row[sapoIdx]).trim().length > 10) {
                    sapoCount++;
                } else {
                    if (missingDetails.sapo.length < 50) missingDetails.sapo.push({ sheet: s.name, row: r+1, name: prodName });
                }

                // META
                if (metaIdx >= 0 && row[metaIdx] && String(row[metaIdx]).trim().length > 5) {
                    metaCount++;
                } else {
                    if (missingDetails.meta.length < 50) missingDetails.meta.push({ sheet: s.name, row: r+1, name: prodName });
                }

                // SPEC / TABLE DỊCH
                if (specIdx >= 0 && row[specIdx] && String(row[specIdx]).trim().length > 10) {
                    specCount++;
                } else {
                    if (missingDetails.dich.length < 50) missingDetails.dich.push({ sheet: s.name, row: r+1, name: prodName });
                }

                // IMG LINK
                if (imgIdx >= 0 && row[imgIdx] && String(row[imgIdx]).trim().length > 3) {
                    imgCount++;
                } else {
                    if (missingDetails.img.length < 50) missingDetails.img.push({ sheet: s.name, row: r+1, name: prodName });
                }

                // PDF LINK
                if (pdfIdx >= 0 && row[pdfIdx] && String(row[pdfIdx]).trim().length > 3) {
                    pdfCount++;
                } else {
                    if (missingDetails.pdf.length < 50) missingDetails.pdf.push({ sheet: s.name, row: r+1, name: prodName });
                }

                // CAT & BRAND ID
                const hasCat = catIdIdx >= 0 && row[catIdIdx] && String(row[catIdIdx]).trim() !== '';
                const hasBrand = brandIdIdx >= 0 && row[brandIdIdx] && String(row[brandIdIdx]).trim() !== '';
                if (hasCat && hasBrand) {
                    idCount++;
                } else {
                    if (missingDetails.ids.length < 50) missingDetails.ids.push({ sheet: s.name, row: r+1, name: prodName });
                }
            }
        });

        const totalTarget = totalSheetRows || crawledCount || 1;

        const steps = [
            {
                id: 'mandatory',
                name: 'Trường Bắt Buộc (Mã SP, Tên SP, ID Danh Mục)',
                desc: '3 trường màu đỏ quy định trong file mẫu Thêm sản phẩm. Cưỡng chế 100% đầy đủ mới được phép xuất Excel.',
                done: mandatoryDoneCount,
                total: totalTarget,
                percent: Math.round((mandatoryDoneCount / totalTarget) * 100),
                missing: missingDetails.mandatory,
                isMandatory: true
            },
            {
                id: 'crawl',
                name: 'Crawl dữ liệu thô',
                desc: 'Crawl sản phẩm từ website nguồn vào Database',
                done: crawledCount,
                total: crawledCount || 1,
                percent: crawledCount > 0 ? 100 : 0
            },
            {
                id: 'sheet',
                name: 'Chuyển vào Profile Sheet',
                desc: 'Đưa sản phẩm vào các Tab trong Sheet của Profile',
                done: totalSheetRows,
                total: crawledCount || totalSheetRows || 1,
                percent: Math.round((totalSheetRows / (crawledCount || totalSheetRows || 1)) * 100)
            },
            {
                id: 'sapo',
                name: 'Viết SAPO giới thiệu',
                desc: 'Dùng AI Assistant tạo đoạn SAPO giới thiệu sản phẩm',
                done: sapoCount,
                total: totalTarget,
                percent: Math.round((sapoCount / totalTarget) * 100),
                missing: missingDetails.sapo
            },
            {
                id: 'meta',
                name: 'Tạo Meta Title & Description SEO',
                desc: 'Dùng AI Assistant chuẩn hóa thẻ Meta SEO',
                done: metaCount,
                total: totalTarget,
                percent: Math.round((metaCount / totalTarget) * 100),
                missing: missingDetails.meta
            },
            {
                id: 'dich',
                name: 'Dịch thông số kỹ thuật chuẩn 1-1',
                desc: 'Dịch bảng HTML thông số kỹ thuật sang Tiếng Việt chuẩn',
                done: specCount,
                total: totalTarget,
                percent: Math.round((specCount / totalTarget) * 100),
                missing: missingDetails.dich
            },
            {
                id: 'img',
                name: 'Tải ảnh & điền Link ảnh',
                desc: 'Tải ảnh về máy/Google Drive & điền Link ảnh vào Sheet',
                done: imgCount,
                total: totalTarget,
                percent: Math.round((imgCount / totalTarget) * 100),
                missing: missingDetails.img
            },
            {
                id: 'pdf',
                name: 'Tải tài liệu PDF & điền Link',
                desc: 'Tải file Datasheet/HDSD PDF & điền Link vào Sheet',
                done: pdfCount,
                total: totalTarget,
                percent: Math.round((pdfCount / totalTarget) * 100),
                missing: missingDetails.pdf
            },
            {
                id: 'ids',
                name: 'Điền ID Danh Mục & ID Thương Hiệu',
                desc: 'Điền ID danh mục và ID thương hiệu khớp hệ thống web',
                done: idCount,
                total: totalTarget,
                percent: Math.round((idCount / totalTarget) * 100),
                missing: missingDetails.ids
            }
        ];

        const overallPercent = Math.round(steps.reduce((acc, s) => acc + Math.min(100, s.percent), 0) / steps.length);

        res.json({
            profile,
            crawledCount,
            totalSheetRows,
            overallPercent,
            mandatoryMissingCount: missingDetails.mandatory.length,
            isExportAllowed: missingDetails.mandatory.length === 0,
            mandatoryMissingRows: missingDetails.mandatory,
            completedStepsCount: steps.filter(s => s.percent >= 100).length,
            totalStepsCount: steps.length,
            steps
        });
    } catch (err) {
        console.error('Failed to calculate profile checklist:', err);
        res.status(500).json({ error: 'Failed to calculate profile checklist.' });
    }
});

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
// POST /api/products/profile-sheet
router.post('/profile-sheet', async (req, res) => {
    try {
        const { profile, sheets } = req.body;
        if (!profile || !sheets) {
            return res.status(400).json({ error: 'profile and sheets are required.' });
        }
        profileSheetQueries.save(profile, sheets);

        // Auto-sync to Google Drive _DATA spreadsheet if Drive is connected
        try {
            const googleDriveService = require('../services/google-drive.service');
            if (googleDriveService.isConnected()) {
                const targetProfile = profileQueries.getBySlug(profile);
                let driveFolderId = targetProfile ? targetProfile.drive_folder_id : null;

                // Auto-create drive folders if not created yet
                if (targetProfile && !driveFolderId) {
                    const driveFolders = await googleDriveService.createProfileFolders(targetProfile.name);
                    if (driveFolders.profileFolderId) {
                        driveFolderId = driveFolders.profileFolderId;
                        profileQueries.updateDriveInfo(profile, driveFolders.profileFolderId, driveFolders.datasheetFolderId, null);
                    }
                }

                if (driveFolderId && Array.isArray(sheets)) {
                    for (const sObj of sheets) {
                        if (sObj && sObj.data && sObj.data.length > 0) {
                            const resSync = await googleDriveService.syncGoogleSheetData(driveFolderId, targetProfile ? targetProfile.name : profile, sObj.name, sObj.data);
                            if (resSync && resSync.spreadsheetId) {
                                profileQueries.updateDriveInfo(profile, null, null, resSync.spreadsheetId);
                            }
                        }
                    }
                }
            }
        } catch (dErr) {
            console.error('[ProductsRoute] Google Drive _DATA sheet sync error:', dErr);
        }

        res.json({ message: 'Lưu dữ liệu Sheet thành công!' });
    } catch (err) {
        console.error('Failed to save profile sheet:', err);
        res.status(500).json({ error: 'Failed to save sheet data.' });
    }
});

// POST /api/products/export-excel — Exports processed sheet data to XLSX matching mau-them-san-pham-17-07-2026.xlsx
const TEMPLATE_HEADERS = [
    "ma_san_pham", "ten_san_pham", "ten_san_pham_en", "url", "url_en",
    "tieu_de_trang", "tieu_de_trang_en", "mo_ta", "mo_ta_en", "gia",
    "khuyen_mai", "anh_dai_dien", "anh_1", "anh_2", "anh_3", "anh_4",
    "nhan", "danh_muc_id", "thuong_hieu_id", "noi_dung", "noi_dung_en",
    "tl_hdsd_tieu_de", "tl_hdsd_link", "tl_cad_tieu_de", "tl_cad_link",
    "tl_chungchi_tieu_de", "tl_chungchi_link", "tl_phanmem_tieu_de", "tl_phanmem_link",
    "tl_tailieu_tieu_de", "tl_tailieu_link"
];

const ALIAS_MAP = {
    ma_san_pham: ['ma_san_pham', 'mã sản phẩm', 'mã sp', 'ma sp', 'sku', 'model', 'cột a'],
    ten_san_pham: ['ten_san_pham', 'tên sản phẩm', 'tên sp', 'ten sp', 'tiêu đề', 'title', 'name', 'cột b'],
    ten_san_pham_en: ['ten_san_pham_en', 'tên tiếng anh', 'tên sp (en)', 'title (en)'],
    url: ['url', 'link', 'nguồn', 'cột d', 'url nguồn'],
    url_en: ['url_en', 'link (en)'],
    tieu_de_trang: ['tieu_de_trang', 'tiêu đề trang', 'meta title', 'cột f'],
    tieu_de_trang_en: ['tieu_de_trang_en', 'tiêu đề trang (en)', 'meta title (en)'],
    mo_ta: ['mo_ta', 'mô tả', 'mô tả ngắn', 'sapo', 'cột h'],
    mo_ta_en: ['mo_ta_en', 'mô tả (en)', 'sapo (en)'],
    gia: ['gia', 'giá', 'giá bán', 'price', 'cột j'],
    khuyen_mai: ['khuyen_mai', 'khuyến mãi', 'giá km', 'sale price', 'cột k'],
    anh_dai_dien: ['anh_dai_dien', 'ảnh đại diện', 'hình đại diện', 'main image', 'thumbnail', 'cột l'],
    anh_1: ['anh_1', 'ảnh 1', 'image 1', 'cột m'],
    anh_2: ['anh_2', 'ảnh 2', 'image 2', 'cột n'],
    anh_3: ['anh_3', 'ảnh 3', 'image 3', 'cột o'],
    anh_4: ['anh_4', 'ảnh 4', 'image 4', 'cột p'],
    nhan: ['nhan', 'nhãn', 'trạng thái', 'tag', 'label', 'cột q'],
    danh_muc_id: ['danh_muc_id', 'danh mục id', 'category id', 'cột r'],
    thuong_hieu_id: ['thuong_hieu_id', 'thương hiệu id', 'brand id', 'cột s'],
    noi_dung: ['noi_dung', 'nội dung', 'nội dung sản phẩm', 'thông số', 'bảng thông số', 'specs', 'content', 'cột c', 'cột t'],
    noi_dung_en: ['noi_dung_en', 'nội dung (en)', 'specs (en)'],
    tl_hdsd_tieu_de: ['tl_hdsd_tieu_de', 'hdsd tiêu đề', 'datasheet title', 'cột v'],
    tl_hdsd_link: ['tl_hdsd_link', 'hdsd link', 'datasheet link', 'datasheet', 'cột w'],
    tl_cad_tieu_de: ['tl_cad_tieu_de', 'cad tiêu đề', 'cột x'],
    tl_cad_link: ['tl_cad_link', 'cad link', 'cột y'],
    tl_chungchi_tieu_de: ['tl_chungchi_tieu_de', 'chứng chỉ tiêu đề', 'cột z'],
    tl_chungchi_link: ['tl_chungchi_link', 'chứng chỉ link', 'cột aa'],
    tl_phanmem_tieu_de: ['tl_phanmem_tieu_de', 'phần mềm tiêu đề', 'cột ab'],
    tl_phanmem_link: ['tl_phanmem_link', 'phần mềm link', 'cột ac'],
    tl_tailieu_tieu_de: ['tl_tailieu_tieu_de', 'tài liệu tiêu đề', 'cột ad'],
    tl_tailieu_link: ['tl_tailieu_link', 'tài liệu link', 'cột ae']
};

router.post('/export-excel', async (req, res) => {
    try {
        const { profile = 'newland', sheetNames = [], mode = 'template' } = req.body;
        const sheets = profileSheetQueries.getBySlug(profile);

        if (!sheets || sheets.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy dữ liệu Sheet cho Profile này.' });
        }

        const sheetsToExport = sheets.filter(s => sheetNames.length === 0 || sheetNames.includes(s.name));

        if (sheetsToExport.length === 0) {
            return res.status(400).json({ error: 'Vui lòng chọn ít nhất 1 Tab Sheet để xuất.' });
        }

        // STRICT MANDATORY FIELD ENFORCEMENT
        // 3 red fields in template: ma_san_pham, ten_san_pham, danh_muc_id
        const mandatoryErrors = [];
        const codeAliases = ALIAS_MAP.ma_san_pham;
        const nameAliases = ALIAS_MAP.ten_san_pham;
        const catAliases = ALIAS_MAP.danh_muc_id;

        sheetsToExport.forEach(sheetObj => {
            const rawRows = sheetObj.data || [];
            if (rawRows.length <= 1) return;

            const headerRow = (rawRows[0] || []).map(h => String(h || '').trim().toLowerCase());

            let codeIdx = headerRow.findIndex((h, idx) => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            let nameIdx = headerRow.findIndex((h, idx) => nameAliases.some(a => h === a || h.includes(a)));
            if (nameIdx === -1) nameIdx = 1;

            let catIdx = headerRow.findIndex((h, idx) => catAliases.some(a => h === a || h.includes(a)));
            if (catIdx === -1 && headerRow.length > 17) catIdx = 17;

            for (let r = 1; r < rawRows.length; r++) {
                const rData = rawRows[r] || [];
                if (rData.every(c => c === undefined || c === null || String(c).trim() === '')) continue;

                const valCode = (codeIdx >= 0 && codeIdx < rData.length) ? String(rData[codeIdx] || '').trim() : '';
                const valName = (nameIdx >= 0 && nameIdx < rData.length) ? String(rData[nameIdx] || '').trim() : '';
                const valCat = (catIdx >= 0 && catIdx < rData.length) ? String(rData[catIdx] || '').trim() : '';

                const missing = [];
                if (!valCode) missing.push('Mã sản phẩm (cột A)');
                if (!valName) missing.push('Tên sản phẩm (cột B)');
                if (!valCat) missing.push('ID Danh mục (cột R)');

                if (missing.length > 0) {
                    mandatoryErrors.push({
                        sheet: sheetObj.name,
                        row: r + 1,
                        productName: valName || valCode || `Hàng ${r + 1}`,
                        missingFields: missing
                    });
                }
            }
        });

        if (mandatoryErrors.length > 0) {
            return res.status(400).json({
                error: `CƯỠNG CHẾ KHÔNG CHO XUẤT FILE: Có ${mandatoryErrors.length} hàng thiếu dữ liệu ở 3 trường màu đỏ bắt buộc (Mã SP, Tên SP, ID Danh Mục). Vui lòng bổ sung đầy đủ trước khi xuất file.`,
                code: 'MANDATORY_FIELDS_MISSING',
                invalidCount: mandatoryErrors.length,
                missingRows: mandatoryErrors
            });
        }

        const wb = XLSX.utils.book_new();

        if (mode === 'raw') {
            sheetsToExport.forEach(s => {
                const ws = XLSX.utils.aoa_to_sheet(s.data || []);
                const safeName = (s.name || 'Sheet').replace(/[\/*?:\[\]]/g, '').slice(0, 31);
                XLSX.utils.book_append_sheet(wb, ws, safeName);
            });
        } else {
            const templateRows = [TEMPLATE_HEADERS];

            sheetsToExport.forEach(sheetObj => {
                const rawRows = sheetObj.data || [];
                if (rawRows.length === 0) return;

                const headerRow = rawRows[0] || [];
                const colIndexMap = {};

                TEMPLATE_HEADERS.forEach(tmplCol => {
                    const aliases = ALIAS_MAP[tmplCol] || [tmplCol];
                    let foundIdx = -1;

                    headerRow.forEach((cellVal, cIdx) => {
                        if (foundIdx !== -1) return;
                        const str = String(cellVal || '').toLowerCase().trim();
                        if (aliases.some(a => str === a || str.includes(a))) {
                            foundIdx = cIdx;
                        }
                    });

                    colIndexMap[tmplCol] = foundIdx;
                });

                // Positional fallback: if alias matching failed, assume column is at its template position index
                // (works perfectly when sheet was generated from the new 31-col preset since labels == field names)
                TEMPLATE_HEADERS.forEach((tmplCol, tmplIdx) => {
                    if (colIndexMap[tmplCol] === -1) {
                        colIndexMap[tmplCol] = tmplIdx;
                    }
                });

                for (let r = 1; r < rawRows.length; r++) {
                    const rData = rawRows[r] || [];
                    if (rData.every(c => c === undefined || c === null || String(c).trim() === '')) {
                        continue;
                    }

                    const formattedRow = TEMPLATE_HEADERS.map(tmplCol => {
                        const idx = colIndexMap[tmplCol];
                        if (idx !== -1 && idx < rData.length) {
                            const val = rData[idx];
                            return val !== undefined && val !== null ? String(val) : '';
                        }
                        return '';
                    });

                    templateRows.push(formattedRow);
                }
            });

            const ws = XLSX.utils.aoa_to_sheet(templateRows);
            XLSX.utils.book_append_sheet(wb, ws, "Danh Sách Sản Phẩm");
        }

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const exportFileName = `Export_${profile}_${Date.now()}.xlsx`;

        // Upload copy to Google Drive profile folder if connected
        try {
            const googleDriveService = require('../services/google-drive.service');
            if (googleDriveService.isConnected()) {
                const targetProfile = profileQueries.getBySlug(profile);
                if (targetProfile && targetProfile.drive_folder_id) {
                    await googleDriveService.uploadExcelToDrive(targetProfile.drive_folder_id, exportFileName, buf);
                }
            }
        } catch (dErr) {
            console.error('[ProductsRoute] Google Drive Excel upload error:', dErr);
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${exportFileName}"`);
        res.send(buf);

    } catch (err) {
        console.error('Export excel error:', err);
        res.status(500).json({ error: 'Lỗi khi tạo file Excel: ' + err.message });
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
router.post('/profiles', async (req, res) => {
    try {
        const { name, brand_name, target_url } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tên Profile là bắt buộc.' });
        }
        const profile = profileQueries.create(name, brand_name || '', target_url || '');

        // Automatically create Google Drive folder & "Datasheet" subfolder if Drive connected
        try {
            const googleDriveService = require('../services/google-drive.service');
            if (googleDriveService.isConnected()) {
                const driveFolders = await googleDriveService.createProfileFolders(profile.name);
                if (driveFolders.profileFolderId) {
                    profileQueries.updateDriveInfo(profile.slug, driveFolders.profileFolderId, driveFolders.datasheetFolderId, null);
                    profile.drive_folder_id = driveFolders.profileFolderId;
                    profile.datasheet_folder_id = driveFolders.datasheetFolderId;
                    profile.drive_folder_link = driveFolders.profileFolderLink;
                    profile.datasheet_folder_link = driveFolders.datasheetFolderLink;
                }
            }
        } catch (dErr) {
            console.error('[ProductsRoute] Google Drive folder creation error:', dErr);
        }

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

        // Delete crawled products belonging to this profile
        try {
            await productQueries.deleteByProfile(slug);
        } catch (e) {
            console.error('Error deleting products by profile:', e);
        }

        // Delete sheet data for this profile
        try {
            profileSheetQueries.deleteBySlug(slug);
        } catch (e) {
            console.error('Error deleting sheet data by profile:', e);
        }

        // Delete profile record if exists
        if (profile) {
            profileQueries.delete(profile.id);
        }

        res.json({ message: `Đã xóa Profile "${profile ? profile.name : slug}" và toàn bộ dữ liệu liên quan thành công.` });
    } catch (err) {
        console.error('Failed to delete profile:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi xóa Profile.' });
    }
});


// PATCH /api/products/profiles/:slug — update profile name and target_url
router.patch('/profiles/:slug', (req, res) => {
    try {
        const { slug } = req.params;
        const { name, target_url, sitemap_url } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tên Profile là bắt buộc.' });
        }
        const updated = profileQueries.update(slug, name, target_url || '', sitemap_url || '');
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

        const existingReport = profileQueries.getHarReport(slug);
        const report = analyzeHar(harData, profile.target_url || '');
        report.profileSlug = slug;
        report.profileName = profile.name;
        report.harFileName = req.file.originalname;
        report.harFileSizeKb = Math.round(req.file.size / 1024);
        if (existingReport?.fieldMappings) {
            report.fieldMappings = existingReport.fieldMappings;
        }

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

// POST /api/products/profiles/:slug/har-mapping — save HAR field column mapping for profile
router.post('/profiles/:slug/har-mapping', (req, res) => {
    try {
        const { slug } = req.params;
        const { fieldMappings } = req.body;
        
        let report = profileQueries.getHarReport(slug);
        if (!report) {
            report = { profileSlug: slug, fields: [], summary: {} };
        }
        
        report.fieldMappings = fieldMappings || {};
        report.mappingUpdatedAt = new Date().toISOString();
        
        profileQueries.saveHarReport(slug, report);
        res.json({ message: 'Đã lưu cấu hình ánh xạ HAR thành công!', fieldMappings: report.fieldMappings });
    } catch (err) {
        console.error('Failed to save HAR mapping:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi lưu cấu hình ánh xạ HAR.' });
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
        res.status(500).json({ error: err.message || 'Failed to retrieve products.' });
    }
});

// DELETE /api/products/batch — delete multiple selected products by ID array
router.delete('/batch', async (req, res) => {
    try {
        const { ids = [] } = req.body;
        if (!ids || ids.length === 0) {
            return res.status(400).json({ error: 'Chưa chọn sản phẩm nào để xóa.' });
        }
        await productQueries.deleteBatch(ids);
        res.json({ message: `Đã xóa thành công ${ids.length} sản phẩm.` });
    } catch (err) {
        console.error('Failed to delete batch products:', err);
        res.status(500).json({ error: 'Lỗi khi xóa danh sách sản phẩm.' });
    }
});

// DELETE /api/products/clear-profile — clear all products belonging to a profile
router.delete('/clear-profile', async (req, res) => {
    try {
        const { profile } = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Mã Profile là bắt buộc.' });
        }
        await productQueries.deleteByProfile(profile);
        res.json({ message: `Đã xóa toàn bộ sản phẩm của Profile "${profile}".` });
    } catch (err) {
        console.error('Failed to clear profile products:', err);
        res.status(500).json({ error: 'Lỗi khi xóa dữ liệu sản phẩm của Profile.' });
    }
});

// DELETE /api/products/:id — delete a single product by ID
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await productQueries.deleteById(id);
        res.json({ message: 'Đã xóa sản phẩm thành công.' });
    } catch (err) {
        console.error('Failed to delete product:', err);
        res.status(500).json({ error: 'Lỗi khi xóa sản phẩm.' });
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
        res.status(500).json({ error: err.message || 'Failed to retrieve categories.' });
    }
});

// GET /api/products/profiles/:slug/sitemap — get sitemap config
router.get('/profiles/:slug/sitemap', async (req, res) => {
    try {
        const { slug } = req.params;
        const sitemap = profileQueries.getSitemap(slug);
        res.json(sitemap);
    } catch (err) {
        console.error('Failed to get sitemap config:', err);
        res.status(500).json({ error: 'Failed to retrieve sitemap configuration.' });
    }
});

// POST /api/products/profiles/:slug/sitemap — save or clear sitemap URL or uploaded XML (optional)
router.post('/profiles/:slug/sitemap', async (req, res) => {
    try {
        const { slug } = req.params;
        const { sitemapUrl, sitemapXml } = req.body;
        const result = profileQueries.saveSitemap(slug, { sitemapUrl, sitemapXml });
        res.json({ message: 'Cập nhật cấu hình Sitemap thành công!', slug, ...result });
    } catch (err) {
        console.error('Failed to save sitemap config:', err);
        res.status(500).json({ error: 'Không thể lưu cấu hình Sitemap.' });
    }
});

// DELETE /api/products/profiles/:slug/sitemap — clear sitemap completely
router.delete('/profiles/:slug/sitemap', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = profileQueries.saveSitemap(slug, { sitemapUrl: '', sitemapXml: '' });
        res.json({ message: 'Đã xóa bỏ cấu hình Sitemap.', slug, ...result });
    } catch (err) {
        console.error('Failed to clear sitemap config:', err);
        res.status(500).json({ error: 'Không thể xóa cấu hình Sitemap.' });
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
        res.status(500).json({ error: err.message || 'Failed to retrieve stats.' });
    }
});

// GET /api/products/crawler/status — get crawler progress/status
router.get('/crawler/status', async (req, res) => {
    try {
        let status = await productQueries.getCrawlerStatus();
        const failed_items = await productQueries.getFailedCount();

        if (status && status.status === 'Completed') {
            const updatedAt = status.updated_at ? new Date(status.updated_at).getTime() : 0;
            const now = Date.now();
            // Auto-reset to Idle if completed over 15 seconds ago
            if (updatedAt > 0 && (now - updatedAt) > 15000) {
                await productQueries.updateCrawlerStatus('Idle', 0, 0, 0, 'Ready', '');
                status = {
                    ...(status || {}),
                    status: 'Idle',
                    progress: 0,
                    total_items: 0,
                    current_item: 0,
                    last_message: 'Ready',
                    profile_slug: ''
                };
            }
        }

        res.json({
            ...(status || {}),
            failed_items: failed_items || 0
        });
    } catch (err) {
        console.error('Failed to get crawler status:', err);
        res.status(500).json({ error: err.message || 'Failed to retrieve crawler status.' });
    }
});

// POST /api/products/crawler/reset — force reset status to Idle
router.post('/crawler/reset', async (req, res) => {
    try {
        await productQueries.updateCrawlerStatus('Idle', 0, 0, 0, 'Ready', '');
        res.json({ success: true, status: 'Idle' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

let activeCrawlerProcess = null;

function isProcessAlive(proc) {
    if (!proc || !proc.pid) return false;
    try {
        if (proc.exitCode !== null || proc.signalCode !== null || proc.killed) return false;
        return process.kill(proc.pid, 0);
    } catch (e) {
        return false;
    }
}

// POST /api/products/crawler/trigger — trigger the crawler
router.post('/crawler/trigger', async (req, res) => {
    try {
        const { concurrency = 3, profile = 'newland' } = req.body;
        
        if (activeCrawlerProcess && isProcessAlive(activeCrawlerProcess)) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }
        activeCrawlerProcess = null;
        
        // Reset status to starting
        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, 'Launching crawler process...', profile);
        
        console.log(`Spawning Python crawler.py for profile: ${profile} with concurrency: ${concurrency}...`);
        
        // Spawn crawler process asynchronously with piped stdio for logging
        const { scriptPath: CRAWLER_SCRIPT, cwd: CRAWLER_CWD } = getCrawlerConfig();
        const pythonProcess = spawn(getPythonCmd(), ['-u', CRAWLER_SCRIPT, '--profile', profile, '--concurrency', concurrency.toString()], {
            cwd: CRAWLER_CWD,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let lastStderr = '';
        if (pythonProcess.stdout) {
            pythonProcess.stdout.on('data', (data) => {
                console.log(`[Python Crawler]: ${data.toString('utf8').trim()}`);
            });
        }
        if (pythonProcess.stderr) {
            pythonProcess.stderr.on('data', (data) => {
                const str = data.toString('utf8').trim();
                console.error(`[Python Crawler Error]: ${str}`);
                lastStderr = str;
            });
        }

        activeCrawlerProcess = pythonProcess;

        pythonProcess.on('error', async (err) => {
            console.error('Lỗi khi kích hoạt tiến trình Python crawler:', err);
            activeCrawlerProcess = null;
            await productQueries.updateCrawlerStatus('Error', 0, 0, 0, `Lỗi khởi chạy Python: ${err.message}`, profile);
        });
        
        pythonProcess.on('exit', async (code) => {
            console.log(`Python crawler process exited with code ${code}`);
            activeCrawlerProcess = null;
            
            const status = await productQueries.getCrawlerStatus();
            if (status && status.status === 'Completed') {
                return;
            }
            if (code === 0 || (status && status.total_items > 0 && status.current_item >= status.total_items)) {
                await productQueries.updateCrawlerStatus('Completed', 100, status?.total_items || 0, status?.total_items || 0, 'Crawling completed successfully.', status?.profile_slug || profile);
            } else {
                const errMsg = lastStderr ? `Lỗi Python: ${lastStderr.slice(-400)}` : `Process exited with code ${code}`;
                await productQueries.updateCrawlerStatus('Error', status?.progress || 0, status?.total_items || 0, status?.current_item || 0, errMsg, status?.profile_slug || profile);
            }
        });
        
        res.json({ message: 'Crawler triggered successfully.' });
    } catch (err) {
        console.error('Failed to trigger crawler:', err);
        res.status(500).json({ error: err.message || 'Failed to start crawler.' });
    }
});


// POST /api/products/crawler/pause — pause the crawler
router.post('/crawler/pause', async (req, res) => {
    try {
        const status = await productQueries.getCrawlerStatus();
        await productQueries.updateCrawlerStatus('Paused', status ? status.progress : 0, status ? status.total_items : 0, status ? status.current_item : 0, 'Crawler paused by user.', status ? status.profile_slug : '');
        res.json({ message: 'Crawler paused.' });
    } catch (err) {
        console.error('Failed to pause crawler:', err);
        res.status(500).json({ error: 'Failed to pause crawler.' });
    }
});

// POST /api/products/crawler/resume — resume the crawler
router.post('/crawler/resume', async (req, res) => {
    try {
        const status = await productQueries.getCrawlerStatus();
        await productQueries.updateCrawlerStatus('Running', status ? status.progress : 0, status ? status.total_items : 0, status ? status.current_item : 0, 'Crawler resumed.', status ? status.profile_slug : '');
        res.json({ message: 'Crawler resumed.' });
    } catch (err) {
        console.error('Failed to resume crawler:', err);
        res.status(500).json({ error: 'Failed to resume crawler.' });
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

// DELETE /api/products/crawler/logs — clear crawler logs
router.delete('/crawler/logs', async (req, res) => {
    try {
        await productQueries.clearCrawlerLogs();
        res.json({ message: 'Crawler logs cleared successfully.' });
    } catch (err) {
        console.error('Failed to clear crawler logs:', err);
        res.status(500).json({ error: 'Failed to clear crawler logs.' });
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
        if (activeCrawlerProcess && isProcessAlive(activeCrawlerProcess)) {
            return res.status(400).json({ error: 'Crawler is already running.' });
        }
        if (!isProcessAlive(activeCrawlerProcess)) {
            activeCrawlerProcess = null;
        }

        const failedCount = await productQueries.getFailedCount();
        if (failedCount === 0) {
            return res.status(400).json({ error: 'No failed URLs to retry.' });
        }

        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, `Retrying ${failedCount} failed URLs...`);

        console.log(`Spawning Python crawler.py --retry-failed with concurrency: ${concurrency}...`);

        const { scriptPath: CRAWLER_SCRIPT, cwd: CRAWLER_CWD } = getCrawlerConfig();
        const pythonProcess = spawn(getPythonCmd(), [
            '-u', CRAWLER_SCRIPT,
            '--retry-failed',
            '--concurrency', concurrency.toString()
        ], { cwd: CRAWLER_CWD, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

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

        const { scriptPath: CRAWLER_SCRIPT, cwd: CRAWLER_CWD } = getCrawlerConfig();
        const pythonProcess = spawn(getPythonCmd(), [
            '-u', CRAWLER_SCRIPT,
            '--fill-downloads',
            '--concurrency', concurrency.toString()
        ], { cwd: CRAWLER_CWD, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

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
            targetFilePath = path.resolve(ROOT_DIR, 'list-link.txt');
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

        const { scriptPath: CRAWLER_SCRIPT, cwd: CRAWLER_CWD } = getCrawlerConfig();
        const pythonProcess = spawn(getPythonCmd(), [
            '-u', CRAWLER_SCRIPT,
            '--profile', profile,
            '--from-file', targetFilePath,
            '--concurrency', concurrency.toString()
        ], { cwd: CRAWLER_CWD, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

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


// ============================================================
//  BATCH CRAWL QUEUE — Sequential multi-profile execution
// ============================================================

/**
 * In-memory batch queue state.
 * Persists in process memory for the lifetime of the Node server.
 */
let batchQueue = {
    isRunning: false,
    profiles: [],      // [{ slug, name, status, message, startedAt, finishedAt, crawledCount, errorCount }]
    currentIdx: -1,
    startedAt: null,
    finishedAt: null,
    summary: null,
    activePid: null    // PID of currently spawned Python process
};

let activeBatchProcess = null;  // ref to current spawned child

function getBatchStatus() {
    return {
        isRunning: batchQueue.isRunning,
        currentIdx: batchQueue.currentIdx,
        totalProfiles: batchQueue.profiles.length,
        profiles: batchQueue.profiles,
        startedAt: batchQueue.startedAt,
        finishedAt: batchQueue.finishedAt,
        summary: batchQueue.summary
    };
}

/**
 * Run the next queued profile (called recursively until queue is empty).
 */
async function runNextInQueue() {
    // Advance to next queued profile
    let nextIdx = batchQueue.currentIdx + 1;
    while (nextIdx < batchQueue.profiles.length && batchQueue.profiles[nextIdx].status !== 'queued') {
        nextIdx++;
    }

    if (nextIdx >= batchQueue.profiles.length) {
        // All done — build summary
        batchQueue.isRunning = false;
        batchQueue.finishedAt = new Date().toISOString();
        const completed = batchQueue.profiles.filter(p => p.status === 'completed').length;
        const failed = batchQueue.profiles.filter(p => p.status === 'failed' || p.status === 'skipped').length;
        batchQueue.summary = {
            totalProfiles: batchQueue.profiles.length,
            completed,
            failed,
            message: `Hoàn thành! ${completed} profile thành công, ${failed} profile bị bỏ qua/lỗi.`
        };
        console.log('[BatchQueue] All profiles finished:', batchQueue.summary);
        return;
    }

    batchQueue.currentIdx = nextIdx;
    const profileEntry = batchQueue.profiles[nextIdx];
    profileEntry.status = 'crawling';
    profileEntry.startedAt = new Date().toISOString();
    profileEntry.message = 'Đang khởi động crawler...';

    console.log(`[BatchQueue] Starting profile ${nextIdx + 1}/${batchQueue.profiles.length}: ${profileEntry.slug}`);

    try {
        // Reset crawler status in DB for this profile crawl run
        await productQueries.updateCrawlerStatus('Starting', 0, 0, 0, `[Batch] Bắt đầu crawl profile: ${profileEntry.name}`);

        const { scriptPath: CRAWLER_SCRIPT, cwd: CRAWLER_CWD } = getCrawlerConfig();
        const pythonProcess = spawn(getPythonCmd(), [
            '-u', CRAWLER_SCRIPT,
            '--profile', profileEntry.slug,
            '--concurrency', '3'
        ], { cwd: CRAWLER_CWD, stdio: 'ignore', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

        activeBatchProcess = pythonProcess;
        batchQueue.activePid = pythonProcess.pid;

        pythonProcess.on('exit', async (code) => {
            console.log(`[BatchQueue] Profile ${profileEntry.slug} exited with code ${code}`);
            activeBatchProcess = null;
            batchQueue.activePid = null;

            if (code === 0) {
                profileEntry.status = 'completed';
                profileEntry.message = 'Crawl hoàn thành thành công.';
            } else if (code === null) {
                // Was killed (batch stopped)
                profileEntry.status = 'stopped';
                profileEntry.message = 'Bị dừng bởi người dùng.';
                batchQueue.isRunning = false;
                batchQueue.finishedAt = new Date().toISOString();
                return;
            } else {
                // Skip this profile (HAR expired / error), continue queue
                profileEntry.status = 'failed';
                profileEntry.message = `Lỗi hoặc HAR hết hạn (exit code: ${code}). Bỏ qua, chạy profile tiếp theo.`;
            }

            profileEntry.finishedAt = new Date().toISOString();

            // Continue to next profile
            if (batchQueue.isRunning) {
                runNextInQueue();
            }
        });

    } catch (err) {
        console.error(`[BatchQueue] Failed to spawn process for profile ${profileEntry.slug}:`, err);
        profileEntry.status = 'failed';
        profileEntry.message = `Lỗi khởi động: ${err.message}`;
        profileEntry.finishedAt = new Date().toISOString();
        // Skip and continue
        if (batchQueue.isRunning) {
            runNextInQueue();
        }
    }
}

// POST /api/products/crawler/batch-start — start sequential batch crawl for selected profiles
router.post('/crawler/batch-start', async (req, res) => {
    try {
        const { profileSlugs } = req.body;

        if (!Array.isArray(profileSlugs) || profileSlugs.length === 0) {
            return res.status(400).json({ error: 'Chưa chọn Profile nào để crawl.' });
        }

        if (batchQueue.isRunning) {
            return res.status(400).json({ error: 'Batch crawler đang chạy. Vui lòng dừng trước khi bắt đầu lại.' });
        }

        if (activeCrawlerProcess) {
            return res.status(400).json({ error: 'Một tiến trình Crawler đơn đang chạy. Hãy dừng lại trước.' });
        }

        // Build profile entries from DB
        const profileEntries = [];
        for (const slug of profileSlugs) {
            const profile = profileQueries.getBySlug(slug);
            if (!profile) {
                console.warn(`[BatchQueue] Profile not found: ${slug}, skipping.`);
                continue;
            }
            profileEntries.push({
                slug: profile.slug,
                name: profile.name,
                target_url: profile.target_url || '',
                status: 'queued',
                message: 'Đang chờ trong hàng...',
                startedAt: null,
                finishedAt: null,
                crawledCount: 0,
                errorCount: 0
            });
        }

        if (profileEntries.length === 0) {
            return res.status(400).json({ error: 'Không tìm thấy Profile hợp lệ nào.' });
        }

        // Initialize batch queue state
        batchQueue = {
            isRunning: true,
            profiles: profileEntries,
            currentIdx: -1,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            summary: null,
            activePid: null
        };

        // Kick off first profile asynchronously
        runNextInQueue();

        res.json({
            message: `Đã bắt đầu batch crawl cho ${profileEntries.length} profile.`,
            status: getBatchStatus()
        });
    } catch (err) {
        console.error('Failed to start batch crawl:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi bắt đầu batch crawl.' });
    }
});

// GET /api/products/crawler/batch-status — get current batch queue status
router.get('/crawler/batch-status', (req, res) => {
    res.json(getBatchStatus());
});

// POST /api/products/crawler/batch-stop — stop batch queue mid-run
router.post('/crawler/batch-stop', async (req, res) => {
    try {
        if (!batchQueue.isRunning) {
            return res.status(400).json({ error: 'Batch crawler không đang chạy.' });
        }

        // Kill currently active Python process if any
        if (activeBatchProcess) {
            console.log('[BatchQueue] Killing active batch Python process...');
            activeBatchProcess.kill('SIGKILL');
            activeBatchProcess = null;
        }

        batchQueue.isRunning = false;
        batchQueue.finishedAt = new Date().toISOString();

        // Mark currently crawling profile as stopped
        const current = batchQueue.profiles[batchQueue.currentIdx];
        if (current && current.status === 'crawling') {
            current.status = 'stopped';
            current.message = 'Bị dừng bởi người dùng.';
            current.finishedAt = new Date().toISOString();
        }

        // Mark remaining queued profiles as cancelled
        batchQueue.profiles.forEach(p => {
            if (p.status === 'queued') {
                p.status = 'cancelled';
                p.message = 'Bị huỷ (batch dừng sớm).';
            }
        });

        const completed = batchQueue.profiles.filter(p => p.status === 'completed').length;
        const total = batchQueue.profiles.length;
        batchQueue.summary = {
            totalProfiles: total,
            completed,
            failed: total - completed,
            message: `Đã dừng. ${completed}/${total} profile hoàn thành trước khi dừng.`
        };

        await productQueries.updateCrawlerStatus('Stopped', 0, 0, 0, 'Batch crawler stopped by user.');

        res.json({ message: 'Batch crawler đã dừng.', status: getBatchStatus() });
    } catch (err) {
        console.error('Failed to stop batch crawl:', err);
        res.status(500).json({ error: err.message || 'Lỗi khi dừng batch crawl.' });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/products/profiles/:slug/check-config
// Get publication check configuration
// ──────────────────────────────────────────────────────────────
router.get('/profiles/:slug/check-config', (req, res) => {
    try {
        const { slug } = req.params;
        const config = profileQueries.getCheckConfig(slug);
        res.json({ success: true, data: config });
    } catch (err) {
        console.error('Failed to get check config:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve check configuration.' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/check-config
// Save publication check configuration
// ──────────────────────────────────────────────────────────────
router.post('/profiles/:slug/check-config', (req, res) => {
    try {
        const { slug } = req.params;
        const { mode = 'sitemap', sitemapUrl = '', apiUrl = '', consumerKey = '', consumerSecret = '' } = req.body;
        const configObj = {
            mode,
            sitemapUrl: (sitemapUrl || '').trim(),
            apiUrl: (apiUrl || '').trim(),
            consumerKey: (consumerKey || '').trim(),
            consumerSecret: (consumerSecret || '').trim()
        };
        profileQueries.saveCheckConfig(slug, configObj);
        res.json({ success: true, message: 'Lưu cấu hình kiểm tra đăng bài thành công!', data: configObj });
    } catch (err) {
        console.error('Failed to save check config:', err);
        res.status(500).json({ success: false, error: 'Không thể lưu cấu hình kiểm tra.' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/check-publication-status
// Run publication status check (Sitemap vs. CMS API)
// ──────────────────────────────────────────────────────────────
const sitemapUrlCache = new Map();
const SITEMAP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

async function fetchXmlWithTimeout(url, timeoutMs = 25000) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
}

async function fetchAllSitemapUrls(rootSitemapUrl, forceRefresh = false) {
    if (forceRefresh) {
        sitemapUrlCache.delete(rootSitemapUrl);
    }
    const cached = sitemapUrlCache.get(rootSitemapUrl);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < SITEMAP_CACHE_TTL)) {
        return cached.urls;
    }

    const xmlText = await fetchXmlWithTimeout(rootSitemapUrl);
    const locMatches = [...xmlText.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map(m => m[1].trim());

    // Check if it is a sitemap index (contains <sitemapindex> or sub-sitemap .xml links)
    const isSitemapIndex = xmlText.includes('<sitemapindex') || locMatches.some(u => u.toLowerCase().endsWith('.xml') || u.toLowerCase().includes('sitemap'));

    let finalUrls = [];

    if (isSitemapIndex) {
        const subSitemaps = locMatches.filter(u => u.toLowerCase().endsWith('.xml') || u.toLowerCase().includes('sitemap'));
        const directUrls = locMatches.filter(u => !subSitemaps.includes(u));
        finalUrls.push(...directUrls);

        // Fetch sub-sitemaps in parallel with concurrency chunks (15 at a time)
        const CHUNK_SIZE = 15;
        for (let i = 0; i < subSitemaps.length; i += CHUNK_SIZE) {
            const chunk = subSitemaps.slice(i, i + CHUNK_SIZE);
            const chunkResults = await Promise.allSettled(chunk.map(async (subUrl) => {
                const subXml = await fetchXmlWithTimeout(subUrl, 15000);
                const subLocs = [...subXml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map(m => m[1].trim());
                return subLocs;
            }));

            for (const res of chunkResults) {
                if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                    finalUrls.push(...res.value);
                }
            }
        }
    } else {
        finalUrls = locMatches;
    }

    const uniqueUrls = Array.from(new Set(finalUrls));
    sitemapUrlCache.set(rootSitemapUrl, { urls: uniqueUrls, timestamp: Date.now() });
    return uniqueUrls;
}

router.post('/profiles/:slug/check-publication-status', async (req, res) => {
    try {
        const { slug } = req.params;
        const config = profileQueries.getCheckConfig(slug);
        const mode = req.body?.mode || config?.mode || 'sitemap';

        const sheets = profileSheetQueries.getBySlug(slug);
        if (!sheets || sheets.length === 0) {
            return res.status(400).json({ success: false, error: 'Không tìm thấy dữ liệu Sheet cho Profile này.' });
        }

        let productItems = [];
        sheets.forEach(sheet => {
            const rows = sheet.data || [];
            if (rows.length < 2) return;
            const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
            let modelColIdx = headers.findIndex(h => h.includes('model') || h.includes('mã') || h.includes('sku') || h.includes('part number'));
            if (modelColIdx === -1) modelColIdx = 0;

            let nameColIdx = headers.findIndex(h => h.includes('tên') || h.includes('name') || h.includes('tiêu đề') || h.includes('title'));
            if (nameColIdx === -1) nameColIdx = 1;

            let urlColIdx = headers.findIndex(h => h === 'url' || h.includes('đường dẫn') || h.includes('slug') || h.includes('link'));

            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!Array.isArray(row)) continue;
                const model = String(row[modelColIdx] || '').trim();
                const name = String(row[nameColIdx] || '').trim();
                const customUrl = urlColIdx !== -1 ? String(row[urlColIdx] || '').trim() : '';
                if (model || name) {
                    productItems.push({
                        sheetName: sheet.name,
                        rowIdx: r,
                        model: model || name,
                        name: name || model,
                        customUrl
                    });
                }
            }
        });

        if (productItems.length === 0) {
            return res.json({ success: true, message: 'Chưa có sản phẩm nào trong trang tính.', logs: [] });
        }

        let logs = [];

        if (mode === 'sitemap') {
            let targetSitemapUrl = req.body?.sitemapUrl || config?.sitemapUrl || config?.targetUrl;
            if (targetSitemapUrl && !targetSitemapUrl.endsWith('.xml') && !targetSitemapUrl.includes('sitemap')) {
                targetSitemapUrl = targetSitemapUrl.replace(/\/$/, '') + '/sitemap.xml';
            }
            if (!targetSitemapUrl) {
                if (slug === 'newland' || slug === 'default') {
                    targetSitemapUrl = 'https://daco.vn/sitemap.xml';
                }
            }
            if (!targetSitemapUrl) {
                return res.status(400).json({ success: false, error: 'Chưa cấu hình URL Sitemap cho Website.' });
            }

            if (req.body?.refresh) {
                sitemapUrlCache.delete(targetSitemapUrl);
            }
            let foundUrls = [];
            try {
                foundUrls = await fetchAllSitemapUrls(targetSitemapUrl, Boolean(req.body?.refresh));
            } catch (e) {
                return res.status(500).json({ success: false, error: `Không thể tải Sitemap từ '${targetSitemapUrl}': ${e.message}` });
            }

            // Build fast lookup indexes from collected sitemap URLs
            const fullUrlsLower = new Set();
            const slugToUrl = new Map();
            const normalizedSlugToUrl = new Map();

            for (const url of foundUrls) {
                const urlLower = url.toLowerCase();
                fullUrlsLower.add(urlLower);

                const cleanUrl = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
                const parts = cleanUrl.split('/').filter(Boolean);
                const lastSegment = parts[parts.length - 1] || '';
                if (lastSegment) {
                    const segLower = lastSegment.toLowerCase();
                    if (!slugToUrl.has(segLower)) {
                        slugToUrl.set(segLower, url);
                    }
                    const norm = segLower.replace(/[^a-z0-9]/g, '');
                    if (norm && !normalizedSlugToUrl.has(norm)) {
                        normalizedSlugToUrl.set(norm, url);
                    }
                }
            }

            logs = productItems.map(p => {
                const candidates = [];
                if (p.customUrl) candidates.push(p.customUrl);
                if (p.model) candidates.push(p.model);
                if (p.name) candidates.push(p.name);

                let isFound = false;
                let liveUrl = '';

                for (const cand of candidates) {
                    const candLower = String(cand).trim().toLowerCase();
                    if (!candLower) continue;

                    const hyphenSlug = candLower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const underscoreSlug = candLower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                    const norm = candLower.replace(/[^a-z0-9]/g, '');

                    if (slugToUrl.has(candLower)) {
                        isFound = true;
                        liveUrl = slugToUrl.get(candLower);
                        break;
                    }
                    if (hyphenSlug && slugToUrl.has(hyphenSlug)) {
                        isFound = true;
                        liveUrl = slugToUrl.get(hyphenSlug);
                        break;
                    }
                    if (underscoreSlug && slugToUrl.has(underscoreSlug)) {
                        isFound = true;
                        liveUrl = slugToUrl.get(underscoreSlug);
                        break;
                    }
                    if (norm && normalizedSlugToUrl.has(norm)) {
                        isFound = true;
                        liveUrl = normalizedSlugToUrl.get(norm);
                        break;
                    }
                    // Fallback substring check in full URLs
                    if (hyphenSlug && hyphenSlug.length >= 4) {
                        const matched = Array.from(fullUrlsLower).find(u => u.includes('/' + hyphenSlug) || u.includes(hyphenSlug));
                        if (matched) {
                            isFound = true;
                            liveUrl = matched;
                            break;
                        }
                    }
                    if (underscoreSlug && underscoreSlug.length >= 4) {
                        const matched = Array.from(fullUrlsLower).find(u => u.includes('/' + underscoreSlug) || u.includes(underscoreSlug));
                        if (matched) {
                            isFound = true;
                            liveUrl = matched;
                            break;
                        }
                    }
                }

                const nowStr = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                return {
                    id: `log_${p.rowIdx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    posted_at: isFound ? nowStr : `Dự kiến: ${nowStr}`,
                    model: p.model,
                    name: p.name,
                    platform: 'Website (Sitemap)',
                    status: isFound ? 'posted' : 'pending',
                    live_url: liveUrl || ''
                };
            });

        } else if (mode === 'cms_api') {
            const apiUrl = req.body?.apiUrl || config?.apiUrl;
            const consumerKey = req.body?.consumerKey || config?.consumerKey;
            const consumerSecret = req.body?.consumerSecret || config?.consumerSecret;
            const apiToken = req.body?.apiToken || config?.apiToken;
            const jsonContent = req.body?.jsonContent || config?.jsonContent;

            let cmsProducts = [];

            if (jsonContent) {
                // Parse directly from uploaded/pasted API JSON file
                try {
                    const parsedJson = JSON.parse(jsonContent);
                    if (Array.isArray(parsedJson)) {
                        cmsProducts = parsedJson;
                    } else if (parsedJson.products && Array.isArray(parsedJson.products)) {
                        cmsProducts = parsedJson.products;
                    } else if (parsedJson.data && Array.isArray(parsedJson.data)) {
                        cmsProducts = parsedJson.data;
                    } else if (typeof parsedJson === 'object') {
                        cmsProducts = [parsedJson];
                    }
                } catch (e) {
                    console.error('Failed to parse jsonContent:', e);
                }
            }

            if (cmsProducts.length === 0 && apiUrl) {
                let wcUrl = apiUrl.replace(/\/$/, '');
                if (!wcUrl.includes('/wp-json/wc/') && !wcUrl.includes('api')) {
                    wcUrl = wcUrl + '/wp-json/wc/v3/products';
                }
                const headers = { 'Content-Type': 'application/json' };
                if (apiToken) {
                    headers['Authorization'] = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`;
                }

                const authParams = (consumerKey && consumerSecret)
                    ? `?consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}&per_page=100`
                    : '?per_page=100';

                try {
                    const response = await fetch(`${wcUrl}${wcUrl.includes('?') ? '&' : authParams}`, {
                        headers,
                        signal: AbortSignal.timeout(20000)
                    });
                    if (response.ok) {
                        const jsonRes = await response.json();
                        cmsProducts = Array.isArray(jsonRes) ? jsonRes : (jsonRes.products || jsonRes.data || []);
                    } else {
                        const errText = await response.text();
                        return res.status(response.status).json({ success: false, error: `CMS API Lỗi HTTP ${response.status}: ${errText.slice(0, 150)}` });
                    }
                } catch (e) {
                    return res.status(500).json({ success: false, error: `Không thể kết nối tới CMS API '${wcUrl}': ${e.message}` });
                }
            }

            const cmsSkuMap = new Map();
            const cmsProdMap = new Map();
            if (Array.isArray(cmsProducts)) {
                cmsProducts.forEach(prod => {
                    const sku = String(prod.sku || prod.model || '').trim().toLowerCase();
                    const slug = String(prod.slug || '').trim().toLowerCase();
                    const name = String(prod.name || prod.product_name || '').trim().toLowerCase();
                    const id = String(prod.id || '').trim().toLowerCase();
                    const status = prod.status || 'publish';

                    const keys = [sku, slug, name, id].filter(Boolean);
                    keys.forEach(k => {
                        cmsSkuMap.set(k, status);
                        cmsProdMap.set(k, prod);
                        const norm = k.replace(/[^a-z0-9]/g, '');
                        if (norm) {
                            cmsSkuMap.set(norm, status);
                            cmsProdMap.set(norm, prod);
                        }
                    });
                });
            }

            logs = productItems.map(p => {
                const candidates = [];
                if (p.customUrl) candidates.push(p.customUrl);
                if (p.model) candidates.push(p.model);
                if (p.name) candidates.push(p.name);

                let cmsStatus = null;
                let matchedProd = null;

                for (const cand of candidates) {
                    const candLower = String(cand).trim().toLowerCase();
                    if (!candLower) continue;
                    const hyphenSlug = candLower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const underscoreSlug = candLower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                    const norm = candLower.replace(/[^a-z0-9]/g, '');

                    cmsStatus = cmsSkuMap.get(candLower) || cmsSkuMap.get(hyphenSlug) || cmsSkuMap.get(underscoreSlug) || cmsSkuMap.get(norm);
                    if (cmsStatus) {
                        matchedProd = cmsProdMap.get(candLower) || cmsProdMap.get(hyphenSlug) || cmsProdMap.get(underscoreSlug) || cmsProdMap.get(norm);
                        break;
                    }
                }

                const isPosted = cmsStatus === 'publish' || cmsStatus === 'active' || cmsStatus === 'posted' || cmsStatus === 1 || cmsStatus === true;
                const isDraft = cmsStatus === 'draft' || cmsStatus === 'pending';
                const nowStr = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                return {
                    id: `log_${p.rowIdx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    posted_at: isPosted ? nowStr : (isDraft ? `Nháp: ${nowStr}` : `Dự kiến: ${nowStr}`),
                    model: p.model,
                    name: p.name,
                    platform: isDraft ? 'Bản nháp (CMS API)' : 'Website (CMS API)',
                    status: isPosted ? 'posted' : 'pending',
                    live_url: matchedProd?.permalink || matchedProd?.url || ''
                };
            });
        }

        const postedCount = logs.filter(l => l.status === 'posted').length;
        const pendingCount = logs.filter(l => l.status === 'pending').length;

        res.json({
            success: true,
            mode,
            message: `🎉 Kiểm tra xong! Đã đăng: ${postedCount} sản phẩm, Chưa đăng: ${pendingCount} sản phẩm.`,
            summary: {
                total: productItems.length,
                posted: postedCount,
                pending: pendingCount,
                error: 0
            },
            logs
        });

    } catch (err) {
        console.error('Failed to check publication status:', err);
        res.status(500).json({ success: false, error: `Lỗi khi kiểm tra đăng bài: ${err.message}` });
    }
});

router.get('/proxy-sitemap', async (req, res) => {
    const sitemapUrl = req.query.url;
    if (!sitemapUrl) return res.status(400).json({ success: false, error: 'Missing url parameter' });
    try {
        const response = await fetch(sitemapUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(15000)
        });
        const xmlText = await response.text();
        return res.json({ success: true, xmlText });
    } catch (e) {
        return res.json({ success: false, error: e.message, xmlText: '' });
    }
});

// POST /api/products/verify-links
// Body: { urls: ["https://...", "https://drive.google.com/file/d/123/view"] }
router.post('/verify-links', async (req, res) => {
    try {
        const { urls } = req.body;
        if (!Array.isArray(urls) || urls.length === 0) {
            return res.json({ success: true, results: {} });
        }

        const targetUrls = Array.from(new Set(urls)).slice(0, 100);
        const results = {};

        // Temporarily bypass strict TLS for internal/company web servers
        const originalTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        const checkSingleUrl = async (url) => {
            const trimmed = String(url || '').trim();
            if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
                return { status: 'invalid_format', statusCode: 0, message: 'Đường dẫn không chứa http:// hoặc https://' };
            }

            try {
                const isDriveLink = trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com');

                const response = await fetch(trimmed, {
                    method: 'HEAD',
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok || response.status === 200 || response.status === 302 || response.status === 301) {
                    if (isDriveLink) {
                        const finalUrl = response.url || '';
                        if (finalUrl.includes('accounts.google.com') || finalUrl.includes('signin')) {
                            return { status: 'private_drive', statusCode: 403, message: 'Google Drive riêng tư (Chưa mở Public)' };
                        }
                    }
                    return { status: 'ok', statusCode: response.status, message: 'Link đang hoạt động (HTTP 200 OK)' };
                } else if (response.status === 404) {
                    return { status: 'broken', statusCode: 404, message: 'Link lỗi 404 (Không tồn tại trên Server)' };
                } else if (response.status === 403 || response.status === 401) {
                    return { status: 'private_drive', statusCode: response.status, message: 'Server từ chối truy cập (HTTP ' + response.status + ')' };
                } else {
                    return { status: 'broken', statusCode: response.status, message: 'HTTP Status ' + response.status };
                }
            } catch (err) {
                try {
                    const getRes = await fetch(trimmed, {
                        method: 'GET',
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': '*/*'
                        },
                        redirect: 'follow',
                        signal: AbortSignal.timeout(10000)
                    });
                    const isDriveLink = trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com');
                    if (getRes.ok || getRes.status === 200 || getRes.status === 302 || getRes.status === 301) {
                        const finalUrl = getRes.url || '';
                        if (isDriveLink && (finalUrl.includes('accounts.google.com') || finalUrl.includes('signin'))) {
                            return { status: 'private_drive', statusCode: 403, message: 'Google Drive chưa mở quyền Public' };
                        }
                        return { status: 'ok', statusCode: getRes.status, message: 'Link hoạt động tốt (HTTP 200)' };
                    } else {
                        return { status: 'broken', statusCode: getRes.status, message: 'Server web trả về HTTP ' + getRes.status };
                    }
                } catch (getErr) {
                    return { status: 'broken', statusCode: 0, message: 'Không kết nối được server (' + (getErr.message || 'Timeout/Network error') + ')' };
                }
            }
        };

        await Promise.all(targetUrls.map(async (u) => {
            results[u] = await checkSingleUrl(u);
        }));

        if (originalTlsEnv !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsEnv;
        }

        return res.json({ success: true, results });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
//  EXTRACTION SCHEMA — In-memory crawl job tracker
// ============================================================
const activeCrawlJobs = new Map(); // slug -> { running, processed, total, found, errors, stopFlag }

/**
 * Apply a single schema rule to a cheerio-loaded HTML page.
 * Returns extracted string value or null.
 */
function resolveFullUrl(val, baseUrl) {
    if (!val) return '';
    try { return new URL(val, baseUrl).href; } catch(e) { return val; }
}

function applySchemaRule(rule, $, baseUrl, context) {
    if (!rule || !rule.type || rule.type === 'skip') return null;
    try {
        const attr = rule.attr || 'text';

        if (rule.type === 'css') {
            const sel = rule.selector || '';
            if (!sel) return null;
            const els = $(sel).toArray();
            if (!els.length) return null;

            if (attr === 'href_all') {
                const links = els.map(el => resolveFullUrl($(el).attr('href') || $(el).attr('data-filename') || $(el).attr('src'), baseUrl)).filter(Boolean);
                return links.length ? links.join('\n') : null;
            }
            if (attr === 'src_all') {
                const srcs = els.map(el => resolveFullUrl($(el).attr('src') || $(el).attr('data-src') || $(el).attr('href'), baseUrl)).filter(Boolean);
                return srcs.length ? srcs.join('\n') : null;
            }
            if (attr === 'text_all') {
                const texts = els.map(el => $(el).text().trim()).filter(Boolean);
                return texts.length ? texts.join('\n') : null;
            }
            if (attr === 'links_with_title') {
                const pairs = els.map(el => {
                    const title = $(el).text().trim();
                    const val = $(el).attr('href') || $(el).attr('data-filename');
                    const fullUrl = resolveFullUrl(val, baseUrl);
                    return title && fullUrl ? `${title}: ${fullUrl}` : (fullUrl || title || '');
                }).filter(Boolean);
                return pairs.length ? pairs.join('\n') : null;
            }

            if (attr === 'text') {
                const getCheerioText = (element) => {
                    const $el = $(element);
                    const children = $el.children();
                    if (children.length > 1) {
                        const childTexts = children.map((_, c) => $(c).text().trim()).get().filter(Boolean);
                        if (childTexts.length > 1) {
                            const hasSep = childTexts.some((p, idx) => idx > 0 && /^[-/\\>|:,•]/.test(p.trim()));
                            const combined = hasSep ? childTexts.join(' ') : childTexts.join(' / ');
                            return combined.replace(/\s*([-/\\>|:,•])\s*/g, ' $1 ').trim();
                        }
                    }
                    return $el.text().trim();
                };

                if (els.length > 1) {
                    const texts = els.map((_, el) => getCheerioText(el)).get().filter(Boolean);
                    const hasSep = texts.some((p, idx) => idx > 0 && /^[-/\\>|:,•]/.test(p.trim()));
                    const combined = hasSep ? texts.join(' ') : texts.join(' / ');
                    return combined.replace(/\s*([-/\\>|:,•])\s*/g, ' $1 ').trim() || null;
                }
                return getCheerioText(els[0]) || null;
            }

            const el = $(els[0]);
            if (attr === 'html') return el.html()?.trim() || null;
            const val = el.attr(attr)?.trim();
            return (attr === 'href' || attr === 'src') ? resolveFullUrl(val, baseUrl) : (val || null);
        }
        if (rule.type === 'jsonld') {
            const path = rule.selector || '';
            if (!path) return null;
            const ldBlocks = [];
            $('script[type="application/ld+json"]').each((_, el) => {
                try { ldBlocks.push(JSON.parse($(el).html())); } catch(e) {}
            });
            // path format: "TypeName.key" or "TypeName.key.subkey"
            const [typeName, ...keys] = path.split('.');
            for (const block of ldBlocks) {
                const items = Array.isArray(block) ? block : [block];
                for (const item of items) {
                    const itemType = (item['@type'] || '').toLowerCase();
                    if (itemType !== typeName.toLowerCase()) continue;
                    let val = item;
                    for (const k of keys) {
                        if (val == null) break;
                        // Support numeric index like BreadcrumbList.itemListElement.1.item.name
                        val = Array.isArray(val) ? val[parseInt(k)] : val[k];
                    }
                    if (val != null && typeof val !== 'object') return String(val).trim();
                    if (typeof val === 'object' && val?.name) return String(val.name).trim();
                }
            }
            return null;
        }
        if (rule.type === 'jsonpath') {
            // Parse first JSON block in page (for SPA pages with embedded JSON)
            const path = rule.selector || '';
            const jsonMatch = $('script:not([type]):not([src])').toArray().map(el => {
                try { return JSON.parse($(el).html()); } catch(e) { return null; }
            }).find(j => j != null);
            if (!jsonMatch) return null;
            const keys = path.split('.');
            let val = jsonMatch;
            for (const k of keys) {
                if (val == null) break;
                val = val[k];
            }
            return val != null ? String(val).trim() : null;
        }
        if (rule.type === 'xpath' || rule.type === 'xpath_full') {
            const expr = (rule.selector || '').trim();
            if (!expr) return null;
            let doc = context?.xmlDoc;
            if (!doc) {
                const xml = $.xml();
                doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
                if (context) context.xmlDoc = doc;
            }
            let nodes;
            try {
                nodes = xpath.select(expr, doc);
            } catch(e) {
                nodes = [];
            }
            if (!nodes || nodes.length === 0) return null;

            if (attr === 'href_all') {
                const links = nodes.map(node => {
                    const val = node.getAttribute ? (node.getAttribute('href') || node.getAttribute('data-filename') || node.getAttribute('src')) : node.nodeValue;
                    return resolveFullUrl((val || '').trim(), baseUrl);
                }).filter(Boolean);
                return links.length ? links.join('\n') : null;
            }
            if (attr === 'src_all') {
                const srcs = nodes.map(node => {
                    const val = node.getAttribute ? (node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('href')) : node.nodeValue;
                    return resolveFullUrl((val || '').trim(), baseUrl);
                }).filter(Boolean);
                return srcs.length ? srcs.join('\n') : null;
            }
            if (attr === 'text_all') {
                const texts = nodes.map(node => (node.textContent || node.nodeValue || '').trim()).filter(Boolean);
                return texts.length ? texts.join('\n') : null;
            }
            if (attr === 'links_with_title') {
                const pairs = nodes.map(node => {
                    const title = (node.textContent || node.nodeValue || '').trim();
                    const val = node.getAttribute ? (node.getAttribute('href') || node.getAttribute('data-filename') || node.getAttribute('src')) : '';
                    const fullUrl = resolveFullUrl((val || '').trim(), baseUrl);
                    return title && fullUrl ? `${title}: ${fullUrl}` : (fullUrl || title || '');
                }).filter(Boolean);
                return pairs.length ? pairs.join('\n') : null;
            }

            if (attr === 'text') {
                const getXmlNodeText = (n) => {
                    if (!n) return '';
                    if (typeof n === 'string' || typeof n === 'number') return String(n).trim();
                    if (n.nodeType === 3 || n.nodeType === 2) return (n.nodeValue || '').trim();
                    if (n.childNodes && n.childNodes.length > 0) {
                        const parts = [];
                        for (let i = 0; i < n.childNodes.length; i++) {
                            const ct = getXmlNodeText(n.childNodes[i]);
                            if (ct) parts.push(ct);
                        }
                        if (parts.length > 1) {
                            const hasSep = parts.some((p, idx) => idx > 0 && /^[-/\\>|:,•]/.test(p.trim()));
                            const combined = hasSep ? parts.join(' ') : parts.join(' / ');
                            return combined.replace(/\s*([-/\\>|:,•])\s*/g, ' $1 ').trim();
                        }
                        if (parts.length === 1) return parts[0];
                    }
                    return (n.textContent || n.nodeValue || '').trim();
                };

                if (nodes.length > 1) {
                    const texts = nodes.map(n => getXmlNodeText(n)).filter(Boolean);
                    if (!texts.length) return null;
                    const hasSep = texts.some((t, idx) => idx > 0 && /^[-/\\>|:,•]/.test(t.trim()));
                    const combined = hasSep ? texts.join(' ') : texts.join(' / ');
                    return combined.replace(/\s*([-/\\>|:,•])\s*/g, ' $1 ').trim();
                }
                return getXmlNodeText(nodes[0]) || null;
            }

            const node = nodes[0];
            if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
                return String(node).trim() || null;
            }
            // nodeType 3: Text node (e.g. //h1/text())
            // nodeType 2: Attribute node (e.g. //img/@src)
            if (node.nodeType === 3 || node.nodeType === 2) {
                const val = (node.nodeValue || '').trim();
                return (attr === 'href' || attr === 'src') ? resolveFullUrl(val, baseUrl) : val;
            }
            if (attr === 'html') {
                return node.toString?.()?.trim() || null;
            }
            // attribute (src, href, content, alt, value...)
            const attrVal = (node.getAttribute?.(attr) || node.nodeValue || '').trim();
            return (attr === 'href' || attr === 'src') ? resolveFullUrl(attrVal, baseUrl) : (attrVal || null);
        }
        if (rule.type === 'regex') {
            const pattern = rule.selector || '';
            if (!pattern) return null;
            const html = $.html();
            const match = html.match(new RegExp(pattern, 'i'));
            return match?.[1]?.trim() || null;
        }
        if (rule.type === 'meta') {
            const name = rule.selector || '';
            const val = $(`meta[name="${name}"]`).attr('content')
                     || $(`meta[property="${name}"]`).attr('content')
                     || $(`meta[property="og:${name}"]`).attr('content');
            return val?.trim() || null;
        }
    } catch (e) {}
    return null;
}

/**
 * Fetch a URL and apply the full schema. Returns { fieldKey: extractedValue }
 */
async function fetchAndApplySchema(url, schema) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-User': '?1'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const context = {};
    const result = {};
    for (const [fieldKey, rule] of Object.entries(schema || {})) {
        result[fieldKey] = applySchemaRule(rule, $, url, context);
    }
    return result;
}

/**
 * Filter out non-product URLs (distributor lists, search filters, company pages, etc.)
 */
function filterLikelyProductUrls(urls, targetUrl = '') {
    if (!urls || !urls.length) return [];
    
    // Normalize target URL / host
    const isHokuyo = (targetUrl || '').includes('hokuyo-aut.jp') || urls.some(u => u.includes('hokuyo-aut.jp'));
    if (isHokuyo) {
        // Hokuyo product detail pages are strictly: single.php?serial=...
        const filtered = urls.filter(u => /single\.php\?serial=\d+/i.test(u));
        if (filtered.length > 0) return filtered;
    }
    
    // General filter: reject clear non-product pages
    const nonProductPattern = /\/(company|about|contact|news|faq|privacy|terms|cart|checkout|login|account|global-network|download|support|history|recruit|policy|inquiry|sitemap|site-map|feed|rss)\b/i;
    const listingSearchPattern = /(\/search\/?(\?.*)?$|\?cap=[A-Z]|\?cate\d*=|\?page=\d+|\/category\/|\/categories\/)/i;
    
    let candidates = urls.filter(u => !nonProductPattern.test(u) && !listingSearchPattern.test(u));
    
    // If we have candidates with explicit product indicators, prioritize them
    const productIndicator = /(\/(product|item|goods|p|sp|detail|details|catalog)\/|\/\d+\.html|\.php\?id=|\.php\?serial=)/i;
    const explicitProducts = candidates.filter(u => productIndicator.test(u));
    if (explicitProducts.length >= 5) {
        return explicitProducts;
    }
    
    return candidates.length > 0 ? candidates : urls;
}

/**
 * Parse sitemap XML (including sitemap index) and return all product-like URLs.
 */
async function parseSitemapUrls(sitemapUrl, sitemapXml, maxUrls = 2000) {
    const allUrls = [];

    const parseXmlText = (xmlText) => {
        const urls = [];
        // Sitemap index: <sitemapindex> with <loc> entries
        const isSitemapIndex = xmlText.includes('<sitemapindex');
        const locMatches = xmlText.match(/<loc[^>]*>([^<]+)<\/loc>/gi) || [];
        for (const m of locMatches) {
            const url = m.replace(/<loc[^>]*>/i, '').replace(/<\/loc>/i, '').trim();
            if (url) urls.push({ url, isSitemapIndex });
        }
        return urls;
    };

    const fetchXml = async (url) => {
        const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
            signal: AbortSignal.timeout(15000)
        });
        return await r.text();
    };

    let rootXml = sitemapXml;
    if (!rootXml && sitemapUrl) {
        rootXml = await fetchXml(sitemapUrl);
    }
    if (!rootXml) return allUrls;

    const rootEntries = parseXmlText(rootXml);

    // Check if it's a sitemap index
    const isIndex = rootXml.includes('<sitemapindex');
    if (isIndex) {
        // Fetch each sub-sitemap
        for (const entry of rootEntries.slice(0, 20)) {
            try {
                const subXml = await fetchXml(entry.url);
                const subEntries = parseXmlText(subXml);
                for (const e of subEntries) {
                    if (!e.isSitemapIndex) allUrls.push(e.url);
                    if (allUrls.length >= maxUrls) break;
                }
            } catch(e) {}
            if (allUrls.length >= maxUrls) break;
        }
    } else {
        for (const e of rootEntries) {
            allUrls.push(e.url);
        }
    }

    const filtered = filterLikelyProductUrls(allUrls, sitemapUrl);
    return filtered.slice(0, maxUrls);
}

// ──────────────────────────────────────────────────────────────
// GET /api/products/profiles/:slug/schema — get saved extraction schema
// ──────────────────────────────────────────────────────────────
router.get('/profiles/:slug/schema', (req, res) => {
    try {
        const { slug } = req.params;
        const schema = profileQueries.getExtractionSchema(slug);
        res.json({ schema: schema || {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/schema — save extraction schema
// ──────────────────────────────────────────────────────────────
router.post('/profiles/:slug/schema', (req, res) => {
    try {
        const { slug } = req.params;
        const { schema } = req.body;
        if (!schema || typeof schema !== 'object') {
            return res.status(400).json({ error: 'Schema không hợp lệ.' });
        }
        profileQueries.saveExtractionSchema(slug, schema);
        res.json({ message: 'Đã lưu Schema trích xuất thành công!', schema });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function executePlaywrightTest(url, schema) {
    return new Promise((resolve, reject) => {
        const pythonCmd = getPythonCmd();
        const scriptPath = path.resolve(__dirname, '../playwright_schema_worker.py');
        const child = spawn(pythonCmd, [scriptPath, '--mode', 'test', '--url', url], {
            cwd: path.resolve(__dirname, '..'),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdoutData = '';
        let stderrData = '';
        
        child.stdout.on('data', (d) => { stdoutData += d.toString('utf8'); });
        child.stderr.on('data', (d) => { stderrData += d.toString('utf8'); });
        
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const parsed = JSON.parse(stdoutData.trim());
                    return resolve(parsed);
                } catch(e) {
                    return reject(new Error('Lỗi parse kết quả từ Playwright: ' + stdoutData));
                }
            } else {
                return reject(new Error(stderrData || `Playwright exited with code ${code}`));
            }
        });
        
        child.stdin.write(JSON.stringify({ schema }));
        child.stdin.end();
    });
}

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/schema/test
// Body: { url, schema, useBrowser }
// Fetch URL → apply schema → return preview results
// ──────────────────────────────────────────────────────────────
router.post('/profiles/:slug/schema/test', async (req, res) => {
    const { url, schema, useBrowser = true } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({ error: 'URL không hợp lệ.' });
    }
    if (!schema || typeof schema !== 'object') {
        return res.status(400).json({ error: 'Schema không hợp lệ.' });
    }
    
    // 1. Try Playwright Headless Browser first (if requested or by default)
    if (useBrowser) {
        try {
            const pwResult = await executePlaywrightTest(url, schema);
            if (pwResult && pwResult.success) {
                return res.json(pwResult);
            }
        } catch (pwErr) {
            console.warn('[Schema Test] Playwright failed, falling back to Fast HTTP:', pwErr.message);
        }
    }
    
    // 2. Fallback / Fast HTTP method
    try {
        const result = await fetchAndApplySchema(url, schema);
        const preview = {};
        for (const [fieldKey, value] of Object.entries(result)) {
            preview[fieldKey] = {
                value: value,
                status: value ? 'ok' : 'empty'
            };
        }
        res.json({ success: true, url, preview });
    } catch (err) {
        res.status(500).json({ success: false, error: `Không thể fetch URL: ${err.message}` });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/products/profiles/:slug/crawl-status
// Return current crawl job progress
// ──────────────────────────────────────────────────────────────
router.get('/profiles/:slug/crawl-status', (req, res) => {
    const { slug } = req.params;
    const job = activeCrawlJobs.get(slug);
    if (!job) {
        return res.json({ running: false, processed: 0, total: 0, found: 0, errors: 0, done: false });
    }
    res.json({ ...job, stopFlag: undefined });
});

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/crawl-schema/stop
// Stop a running crawl job
// ──────────────────────────────────────────────────────────────
router.post('/profiles/:slug/crawl-schema/stop', (req, res) => {
    const { slug } = req.params;
    const job = activeCrawlJobs.get(slug);
    if (job) {
        job.stopFlag = true;
        job.running = false;
    }
    res.json({ success: true, message: 'Đã gửi lệnh dừng crawl.' });
});

// ──────────────────────────────────────────────────────────────
// POST /api/products/profiles/:slug/crawl-schema
// Body: { maxUrls, concurrency, delay, useBrowser }
// Crawl all sitemap URLs using the saved schema, merge into HAR report
// ──────────────────────────────────────────────────────────────
router.post('/profiles/:slug/crawl-schema', async (req, res) => {
    const { slug } = req.params;

    // Only one crawl per profile at a time
    if (activeCrawlJobs.get(slug)?.running) {
        return res.status(409).json({ error: 'Đang có một crawl job đang chạy cho Profile này. Vui lòng đợi hoặc dừng lại trước.' });
    }

    const profile = profileQueries.getBySlug(slug);
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy Profile.' });

    const schema = profileQueries.getExtractionSchema(slug);
    if (!schema || Object.keys(schema).length === 0) {
        return res.status(400).json({ error: 'Profile này chưa có Schema trích xuất. Vui lòng định nghĩa Schema trước.' });
    }

    const sitemap = profileQueries.getSitemap(slug);
    const harReport = profileQueries.getHarReport(slug);
    const sitemapUrl = sitemap?.sitemapUrl || profile.sitemap_url || '';
    const sitemapXml = sitemap?.sitemapXml || '';

    if (!sitemapUrl && !sitemapXml && !profile.target_url && (!harReport?.fields || harReport.fields.length === 0)) {
        return res.status(400).json({ error: 'Chưa có thông tin để crawl (chưa có Sitemap, website chính hoặc tệp HAR).' });
    }

    const maxUrls = Math.min(parseInt(req.body?.maxUrls) || 500, 2000);
    const concurrency = Math.min(parseInt(req.body?.concurrency) || 3, 8);
    const delayMs = Math.max(parseInt(req.body?.delay) || 300, 0);
    const useBrowser = req.body?.useBrowser !== false; // default true for high fidelity

    // Initialize job tracker
    const job = { running: true, processed: 0, total: 0, found: 0, errors: 0, done: false, stopFlag: false, startedAt: new Date().toISOString() };
    activeCrawlJobs.set(slug, job);

    // Respond immediately - crawl runs in background
    res.json({ success: true, message: 'Đã bắt đầu crawl schema. Theo dõi tiến độ qua /crawl-status.' });

    // Run crawl asynchronously
    (async () => {
        try {
            // Step 1: Get URLs (from Sitemap if configured, or fallback to target_url / HAR report)
            let allUrls = [];
            if (sitemapUrl || sitemapXml) {
                try {
                    allUrls = await parseSitemapUrls(sitemapUrl, sitemapXml, maxUrls);
                } catch (e) {
                    console.error('[crawl-schema] Error parsing sitemap:', e.message);
                }
            }

            // Fallback 1: Try target_url/sitemap.xml
            if (allUrls.length === 0 && profile.target_url) {
                try {
                    const fallbackUrl = profile.target_url.replace(/\/$/, '') + '/sitemap.xml';
                    allUrls = await parseSitemapUrls(fallbackUrl, '', maxUrls);
                } catch (e) {}
            }

            // Fallback 2: Hokuyo auto-discovery if Hokuyo profile
            if (allUrls.length === 0 && (profile.target_url?.includes('hokuyo-aut.jp') || slug.includes('hokuyo'))) {
                try {
                    const hokuyoUrls = new Set();
                    for (let c = 1; c <= 5; c++) {
                        try {
                            const sResp = await fetch(`https://www.hokuyo-aut.jp/search/?cate01=${c}`, {
                                headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
                                signal: AbortSignal.timeout(10000)
                            });
                            const sHtml = await sResp.text();
                            const matches = sHtml.match(/href=["']([^"']*single\.php\?serial=[^"']+)["']/gi) || [];
                            for (const m of matches) {
                                const rawHref = m.replace(/^href=["']|["']$/gi, '').trim();
                                const fullU = new URL(rawHref, 'https://www.hokuyo-aut.jp/search/').href.split('#')[0];
                                hokuyoUrls.add(fullU);
                            }
                        } catch (e) {}
                    }
                    if (hokuyoUrls.size > 0) {
                        allUrls = Array.from(hokuyoUrls).slice(0, maxUrls);
                    }
                } catch (e) {
                    console.error('[crawl-schema] Hokuyo search scan error:', e.message);
                }
            }

            // Fallback 3: Extract candidate product URLs from HAR report
            if (allUrls.length === 0 && harReport?.fields) {
                const urlSet = new Set();
                for (const f of harReport.fields) {
                    for (const s of (f.samples || [])) {
                        const v = typeof s === 'string' ? s : s?.value;
                        if (v && typeof v === 'string' && v.startsWith('http') && !v.match(/\.(css|js|png|jpg|jpeg|svg|gif|pdf|ico|woff2?)(\?|$)/i)) {
                            urlSet.add(v.split('#')[0]);
                        }
                    }
                    for (const ep of (f.endpoints || [])) {
                        if (typeof ep === 'string' && ep.startsWith('http') && !ep.match(/\.(css|js|png|jpg|jpeg|svg|gif|pdf|ico|woff2?)(\?|$)/i)) {
                            urlSet.add(ep.split('#')[0]);
                        }
                    }
                }
                allUrls = Array.from(urlSet).slice(0, maxUrls);
            }

            // Final filter: ensure non-product URLs (distributors, search, etc.) are excluded
            allUrls = filterLikelyProductUrls(allUrls, profile.target_url || slug);

            job.total = allUrls.length;

            if (allUrls.length === 0) {
                job.running = false;
                job.done = true;
                job.error = 'Không tìm thấy URL nào từ Sitemap hoặc tệp HAR.';
                return;
            }

            // Step 2: Crawl
            const crawlResults = []; // Array of { url, ...fieldValues }

            if (useBrowser) {
                // High-performance Playwright batch crawler
                const pythonCmd = getPythonCmd();
                const scriptPath = path.resolve(__dirname, '../playwright_schema_worker.py');
                const tmpUrlsFile = path.resolve(__dirname, `../data/tmp_urls_${slug}_${Date.now()}.txt`);
                
                // Write URLs to temporary file
                fs.writeFileSync(tmpUrlsFile, allUrls.join('\n'), 'utf8');
                
                const child = spawn(pythonCmd, [
                    scriptPath,
                    '--mode', 'crawl',
                    '--urls-file', tmpUrlsFile,
                    '--concurrency', String(concurrency),
                    '--delay', String(delayMs)
                ], {
                    cwd: path.resolve(__dirname, '..'),
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                child.stdin.write(JSON.stringify({ schema }));
                child.stdin.end();
                
                let lineBuffer = '';
                child.stdout.on('data', (chunk) => {
                    lineBuffer += chunk.toString('utf8');
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop(); // keep remainder
                    
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line.trim());
                            if (msg.type === 'progress') {
                                job.processed = msg.processed;
                                job.total = msg.total;
                                job.found = msg.found;
                                job.errors = msg.errors;
                            } else if (msg.type === 'item') {
                                crawlResults.push(msg.data);
                            }
                        } catch(e) {}
                    }
                });
                
                await new Promise((resolve) => {
                    child.on('close', () => {
                        try { if (fs.existsSync(tmpUrlsFile)) fs.unlinkSync(tmpUrlsFile); } catch(e) {}
                        resolve();
                    });
                });
            } else {
                // Fast HTTP Crawler
                const crawlUrl = async (url) => {
                    if (job.stopFlag) return;
                    try {
                        const result = await fetchAndApplySchema(url, schema);
                        const hasData = Object.values(result).some(v => v != null && v !== '');
                        if (hasData) {
                            crawlResults.push({ url, ...result });
                            job.found++;
                        }
                    } catch (e) {
                        job.errors++;
                    }
                    job.processed++;
                };

                // Process in batches of `concurrency`
                for (let i = 0; i < allUrls.length; i += concurrency) {
                    if (job.stopFlag) break;
                    const batch = allUrls.slice(i, i + concurrency);
                    await Promise.all(batch.map(crawlUrl));
                    if (i + concurrency < allUrls.length && !job.stopFlag) {
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                }
            }

            // Step 3: Insert / Upsert into Products Table (for Danh Sách Sản Phẩm Crawler tab)
            if (crawlResults.length > 0) {
                try {
                    await productQueries.bulkUpsertProducts(slug, crawlResults);
                } catch(e) {
                    console.error('[crawl-schema] Error saving to products table:', e.message);
                }

                let report = profileQueries.getHarReport(slug) || { profileSlug: slug, fields: [], summary: {}, notableEndpoints: [] };

                // Build fieldKey -> samples map from crawlResults
                const newSamples = {};
                for (const row of crawlResults) {
                    for (const [fieldKey, value] of Object.entries(row)) {
                        if (fieldKey === 'url' || !value) continue;
                        if (!newSamples[fieldKey]) newSamples[fieldKey] = [];
                        if (!newSamples[fieldKey].some(s => s.value === value) && newSamples[fieldKey].length < 500) {
                            newSamples[fieldKey].push({ path: 'Schema Crawl', value: String(value).slice(0, 200) });
                        }
                    }
                    // Always add detail_url if we have URL from crawl
                    if (row.url) {
                        if (!newSamples['detail_url']) newSamples['detail_url'] = [];
                        if (!newSamples['detail_url'].some(s => s.value === row.url) && newSamples['detail_url'].length < 500) {
                            newSamples['detail_url'].push({ path: 'Schema Crawl URL', value: row.url });
                        }
                    }
                }

                // Merge into existing report fields
                const FIELD_KEYS = Object.keys(FIELD_PATTERNS);
                for (const fieldKey of [...FIELD_KEYS, ...Object.keys(newSamples)]) {
                    if (!newSamples[fieldKey] || newSamples[fieldKey].length === 0) continue;
                    let existingField = report.fields?.find(f => f.fieldKey === fieldKey);
                    if (!existingField) {
                        const pat = FIELD_PATTERNS[fieldKey];
                        existingField = { fieldKey, label: pat?.label || fieldKey, icon: pat?.icon || '📌', confidence: 0, occurrences: 0, samples: [], endpoints: [] };
                        if (!report.fields) report.fields = [];
                        report.fields.push(existingField);
                    }
                    // Merge samples (avoid duplicates)
                    const existingSampleValues = new Set((existingField.samples || []).map(s => s.value));
                    let added = 0;
                    for (const s of newSamples[fieldKey]) {
                        if (!existingSampleValues.has(s.value)) {
                            existingField.samples.push(s);
                            existingSampleValues.add(s.value);
                            added++;
                        }
                    }
                    existingField.occurrences = existingField.samples.length;
                    existingField.confidence = Math.min(100, Math.max(existingField.confidence, added > 0 ? 95 : existingField.confidence));
                }

                // Update summary
                if (!report.summary) report.summary = {};
                report.summary.lastSchemaCrawlAt = new Date().toISOString();
                report.summary.schemaCrawlTotal = allUrls.length;
                report.summary.schemaCrawlFound = crawlResults.length;
                report.summary.detectableFieldsCount = (report.fields || []).filter(f => f.occurrences > 0).length;
                report.summary.highConfidenceFieldsCount = (report.fields || []).filter(f => f.confidence >= 50).length;

                profileQueries.saveHarReport(slug, report);
            }

            // Save crawl stats
            profileQueries.saveCrawlStats(slug, {
                lastCrawlAt: new Date().toISOString(),
                totalUrls: allUrls.length,
                processedUrls: job.processed,
                foundProducts: crawlResults.length,
                errors: job.errors
            });

            job.running = false;
            job.done = true;
        } catch (err) {
            console.error('[crawl-schema] Error:', err);
            job.running = false;
            job.done = true;
            job.error = err.message;
        }
    })();
});

module.exports = router;

