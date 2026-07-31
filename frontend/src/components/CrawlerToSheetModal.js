'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { 
    X, 
    Plus, 
    Trash2, 
    Save, 
    Check, 
    FileSpreadsheet, 
    ArrowUp, 
    ArrowDown, 
    Sliders,
    FolderPlus,
    FileText,
    CheckCircle2,
    Loader2
} from 'lucide-react';

// Default Proposal Presets
const DEFAULT_PRESETS = [
    {
        id: 'preset-default',
        name: 'Đề xuất chuẩn (Đầy đủ Link, Model, PDF & Thông Số Kỹ Thuật)',
        columns: [
            { id: 'col-1', label: 'Link Sản Phẩm', field: 'detail_url' },
            { id: 'col-2', label: 'Hãng / Thương hiệu', field: 'brand' },
            { id: 'col-3', label: 'Danh Mục', field: 'category' },
            { id: 'col-4', label: 'Series', field: 'series' },
            { id: 'col-5', label: 'Model / Mã SP', field: 'model' },
            { id: 'col-6', label: 'Tên Sản Phẩm', field: 'name' },
            { id: 'col-7', label: 'Link Hình Ảnh', field: 'image_url' },
            { id: 'col-8', label: 'Link Tài Liệu / PDF', field: 'document_url' },
            { id: 'col-9', label: 'Mô Tả Nguyên Bản', field: 'description' },
            { id: 'col-10', label: 'Thông Số Kỹ Thuật Gốc', field: 'specs_json' },
            { id: 'col-11', label: 'SAPO AI', field: 'custom_empty' },
            { id: 'col-12', label: 'Bảng Thông Số AI (Dịch HTML)', field: 'custom_empty' }
        ]
    },
    {
        id: 'preset-seo',
        name: 'Cấu hình SEO Content & Bài Viết',
        columns: [
            { id: 'col-1', label: 'Tên Sản Phẩm', field: 'name' },
            { id: 'col-2', label: 'Model / Mã SP', field: 'model' },
            { id: 'col-3', label: 'Danh Mục', field: 'category' },
            { id: 'col-4', label: 'Link Chi Tiết', field: 'detail_url' },
            { id: 'col-5', label: 'Link Ảnh', field: 'image_url' },
            { id: 'col-6', label: 'Thông Số Kỹ Thuật Gốc', field: 'specs_json' },
            { id: 'col-7', label: 'Ghi Chú Nguồn Ngoài', field: 'custom_empty' },
            { id: 'col-8', label: 'SAPO AI', field: 'custom_empty' },
            { id: 'col-9', label: 'Bài Viết Chi Tiết AI', field: 'custom_empty' }
        ]
    }
];

const AVAILABLE_FIELDS = [
    { value: 'detail_url', label: '🌐 Link bài viết chi tiết' },
    { value: 'brand', label: '🏷️ Hãng / Thương hiệu' },
    { value: 'main_category', label: '📁 Danh mục lớn (Main Category)' },
    { value: 'category', label: '📂 Danh mục con (Sub Category)' },
    { value: 'series', label: '📌 Dòng Series sản phẩm' },
    { value: 'model', label: '🔢 Model / Mã sản phẩm' },
    { value: 'name', label: '📝 Tên sản phẩm' },
    { value: 'image_url', label: '🖼️ Link hình ảnh chính' },
    { value: 'document_url', label: '📄 Link tài liệu / Datasheet PDF' },
    { value: 'description', label: '📖 Mô tả / Nội dung chi tiết gốc' },
    { value: 'specs_json', label: '📊 Thông số kỹ thuật gốc (JSON / HTML / Text)' },
    { value: 'custom_empty', label: '➕ (Ô trống - Tự nhập tên Header tùy ý)' }
];

export default function CrawlerToSheetModal({
    isOpen,
    onClose,
    allProducts = [],
    selectedProductIds = [],
    totalProductsCount = 0,
    profileSlug = 'newland',
    sheets = [],
    activeTabName = '',
    onConvertSuccess
}) {
    // 1. Presets State
    const [presets, setPresets] = useState(DEFAULT_PRESETS);
    const [selectedPresetId, setSelectedPresetId] = useState('preset-default');
    const [columns, setColumns] = useState(DEFAULT_PRESETS[0].columns);

    // New Preset Name modal state
    const [newPresetName, setNewPresetName] = useState('');
    const [showSavePresetInput, setShowSavePresetInput] = useState(false);

    // 2. Destination Settings
    const [destMode, setDestMode] = useState('new'); // 'new' | 'append'
    const [newTabName, setNewTabName] = useState(`Crawler_Data_${new Date().getDate()}-${new Date().getMonth() + 1}`);
    const [targetTabName, setTargetTabName] = useState(activeTabName || (sheets[0]?.name || 'Sheet1'));

    // 3. Product Scope: 'selected' | 'limit_count' | 'all_db'
    const [productScope, setProductScope] = useState(selectedProductIds.length > 0 ? 'selected' : 'all_db');
    const [customQuantity, setCustomQuantity] = useState(totalProductsCount || 50);
    const [fetchingProducts, setFetchingProducts] = useState(false);

    // Load saved presets from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('crawler_sheet_mapping_presets');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setPresets(parsed);
                    setSelectedPresetId(parsed[0].id);
                    setColumns(parsed[0].columns);
                }
            }
        } catch (e) {
            console.error('Failed to load mapping presets:', e);
        }
    }, []);

    useEffect(() => {
        if (selectedProductIds.length > 0) {
            setProductScope('selected');
        } else {
            setProductScope('all_db');
        }
    }, [selectedProductIds]);

    if (!isOpen) return null;

    // Handle Preset Selection
    const handleSelectPreset = (presetId) => {
        setSelectedPresetId(presetId);
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            setColumns(JSON.parse(JSON.stringify(preset.columns)));
        }
    };

    // Save current layout as NEW preset
    const handleSaveNewPreset = () => {
        if (!newPresetName.trim()) return;
        const newPresetObj = {
            id: `preset-${Date.now()}`,
            name: newPresetName.trim(),
            columns: JSON.parse(JSON.stringify(columns))
        };
        const updated = [...presets, newPresetObj];
        setPresets(updated);
        setSelectedPresetId(newPresetObj.id);
        setNewPresetName('');
        setShowSavePresetInput(false);
        try {
            localStorage.setItem('crawler_sheet_mapping_presets', JSON.stringify(updated));
        } catch (e) {}
    };

    // Update current selected preset with new column layout
    const handleUpdateCurrentPreset = () => {
        const updated = presets.map(p => p.id === selectedPresetId ? { ...p, columns: JSON.parse(JSON.stringify(columns)) } : p);
        setPresets(updated);
        try {
            localStorage.setItem('crawler_sheet_mapping_presets', JSON.stringify(updated));
        } catch (e) {}
    };

    // Delete current selected preset
    const handleDeleteCurrentPreset = () => {
        if (presets.length <= 1) return;
        const updated = presets.filter(p => p.id !== selectedPresetId);
        setPresets(updated);
        setSelectedPresetId(updated[0].id);
        setColumns(JSON.parse(JSON.stringify(updated[0].columns)));
        try {
            localStorage.setItem('crawler_sheet_mapping_presets', JSON.stringify(updated));
        } catch (e) {}
    };

    // Column Editing Handlers
    const handleAddColumn = () => {
        setColumns(prev => [
            ...prev,
            { id: `col-${Date.now()}`, label: 'Cột Mới', field: 'custom_empty' }
        ]);
    };

    const handleRemoveColumn = (id) => {
        if (columns.length <= 1) return;
        setColumns(prev => prev.filter(c => c.id !== id));
    };

    const handleMoveColumn = (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= columns.length) return;
        const newCols = [...columns];
        const temp = newCols[index];
        newCols[index] = newCols[targetIndex];
        newCols[targetIndex] = temp;
        setColumns(newCols);
    };

    const handleUpdateColumn = (id, field, value) => {
        setColumns(prev => prev.map(c => {
            if (c.id !== id) return c;
            if (field === 'field') {
                const foundField = AVAILABLE_FIELDS.find(f => f.value === value);
                const defaultLabel = foundField && value !== 'custom_empty' ? foundField.label.replace(/^[^a-zA-Z0-9À-ỹ]+/g, '').trim() : c.label;
                return { ...c, field: value, label: defaultLabel };
            }
            return { ...c, [field]: value };
        }));
    };

    // ══════════════════════════════════════════════════════════════════
    //  DATA CONVERSION HELPERS (HTML SPECS, PARAGRAPHS, PDF LINKS, ZH TRANSLATION)
    // ══════════════════════════════════════════════════════════════════

    const ZH_EN_MAP = {
        '標籤': 'Label',
        '商品比較': 'Product Comparison',
        '提出詢問': 'Submit Inquiry',
        '產品介紹': 'Products Overview',
        '產品': 'Products',
        '产品': 'Products',
        '條碼印表機': 'Barcode Printers',
        '条码打印机': 'Barcode Printers',
        '桌面型印表機': 'Desktop Printers',
        '桌面型打印机': 'Desktop Printers',
        '工業型印表機': 'Industrial Printers',
        '工业型打印机': 'Industrial Printers',
        '攜帶型印表機': 'Mobile Printers',
        '便携式打印机': 'Mobile Printers',
        '條碼掃瞄器': 'Barcode Scanners',
        '条码扫描器': 'Barcode Scanners',
        '輕工業型掃瞄器': 'Light Industrial Scanners',
        '通用型1D掃瞄器': 'General 1D Scanners',
        '通用型2D掃瞄器': 'General 2D Scanners',
        '桌上型掃瞄器': 'Desktop Scanners',
        '手持式掃瞄器': 'Handheld Scanners',
        '固定式掃瞄器': 'Fixed Mount Scanners',
        '感熱式/熱轉印': 'Thermal / Thermal Transfer',
        '熱轉印': 'Thermal Transfer',
        '熱感應': 'Direct Thermal',
        '印表機': 'Printers',
        '打印机': 'Printers',
        '掃瞄器': 'Scanners',
        '扫描器': 'Scanners',
        '系列': 'Series',
        '碳帶長度': 'Ribbon Length',
        '碳帶': 'Ribbon',
        '長度': 'Length',
        '寬度': 'Width',
        '高度': 'Height',
        '厚度': 'Thickness',
        '解析度': 'Resolution',
        '分辨率': 'Resolution',
        '列印速度': 'Print Speed',
        '打印速度': 'Print Speed',
        '列印寬度': 'Print Width',
        '打印宽度': 'Print Width',
        '列印長度': 'Print Length',
        '打印长度': 'Print Length',
        '傳輸介面': 'Interface',
        '传输接口': 'Interface',
        '記憶體': 'Memory',
        '内存': 'Memory',
        '重量': 'Weight',
        '體積': 'Dimensions',
        '尺寸': 'Dimensions',
        '電源': 'Power Supply',
        '电源': 'Power Supply',
        '工作溫度': 'Operating Temperature',
        '儲存溫度': 'Storage Temperature',
        '相對濕度': 'Humidity',
        '公尺': 'm',
        '吋': 'inch',
        '公司簡介': '',
        '關於立象': '',
        '關於我們': '',
        '聯絡我們': '',
        '最新消息': 'Latest News',
        '技術支援': 'Support',
        '下載專區': 'Downloads',
    };

    const translateZhToEn = (text) => {
        if (!text || typeof text !== 'string') return text || '';
        let result = text;
        for (const [zh, en] of Object.entries(ZH_EN_MAP)) {
            if (result.includes(zh)) {
                result = result.replaceAll(zh, en);
            }
        }
        return result.trim();
    };

    const isJsOrUiNoise = (line) => {
        if (!line || typeof line !== 'string') return true;
        const l = line.trim();
        if (l.length < 2) return true;

        if (/^\s*\}\)?;?\s*$/.test(l)) return true;
        if (/^\s*\}\s*else\s*\{?\s*$/.test(l)) return true;
        if (/^\s*if\s*\(/i.test(l)) return true;
        if (/\b(parseInt|parseFloat|console\.log|document\.|window\.|location\.|history\.)\b/i.test(l)) return true;
        if (/\b(return\s+false|return\s+true|typeof|void\(0\))\b/i.test(l)) return true;
        if (/==|===|!=|!==|&&|\|\||=>|\$\(/i.test(l)) return true;
        if (/\b(function|var|let|const|addInquiry|del_car_fun|InquiryQuantity|sideLinkBox|CompareQuantity)\b/i.test(l)) return true;
        if (/\$\.[a-zA-Z0-9_]+/i.test(l)) return true;
        if (l.includes('商品比較') || l.includes('提出詢問') || l.toLowerCase() === 'compare' || l.toLowerCase() === 'inquire') return true;

        return false;
    };

    const formatDescriptionToParagraphs = (rawDesc) => {
        if (!rawDesc) return '';
        let text = String(rawDesc);

        // Convert HTML line breaks / paragraphs to newlines first
        text = text.replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
        text = text.replace(/<br\s*\/?>/gi, '\n');

        // Remove script and style tags
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

        // Strip remaining HTML tags
        text = text.replace(/<[^>]+>/g, ' ');

        // Split by lines
        const rawLines = text.split(/[\r\n•|]+/).map(l => l.trim()).filter(Boolean);
        const cleanLines = [];

        for (let line of rawLines) {
            if (isJsOrUiNoise(line)) continue;

            // Translate Chinese
            line = translateZhToEn(line);

            // Clean dangling colons or labels with no values
            if (line.endsWith(':') || line === 'Label' || line === 'Tags') continue;
            if (line.length < 3) continue;

            cleanLines.push(line);
        }

        if (cleanLines.length === 0) return '';

        return cleanLines.map(line => `<p>${line}</p>`).join('\n');
    };

    const convertSpecsToHtmlTable = (specsInput) => {
        if (!specsInput) return '';

        let specsObj = null;

        if (typeof specsInput === 'string') {
            const trimmed = specsInput.trim();

            if (trimmed.toLowerCase().includes('<table')) {
                let html = translateZhToEn(trimmed);
                if (!html.toLowerCase().includes('<h2>')) {
                    html = `<h2>Thông số kỹ thuật</h2>\n` + html;
                }
                if (!html.includes('Table_Products_Style')) {
                    html = html.replace(/<table[^>]*>/i, '<table class="Table_Products_Style">');
                }
                return html;
            }

            try {
                specsObj = JSON.parse(trimmed);
            } catch (e) {
                const lines = trimmed.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
                if (lines.length > 0) {
                    specsObj = {};
                    lines.forEach(line => {
                        const parts = line.split(/[:：]/);
                        if (parts.length >= 2) {
                            const k = parts[0].trim();
                            const v = parts.slice(1).join(':').trim();
                            if (k) specsObj[k] = v;
                        } else {
                            specsObj[line] = '';
                        }
                    });
                }
            }
        } else if (typeof specsInput === 'object' && specsInput !== null) {
            specsObj = specsInput;
        }

        if (!specsObj || typeof specsObj !== 'object') {
            return translateZhToEn(String(specsInput || ''));
        }

        let rowsHtml = '';

        if (Array.isArray(specsObj)) {
            specsObj.forEach(item => {
                const rawKey = item.key || item.name || item.label || item[0] || '';
                const rawVal = item.value || item.val || item[1] || '';
                const key = translateZhToEn(String(rawKey));
                const val = translateZhToEn(String(rawVal));
                if (key || val) {
                    rowsHtml += `  <tr><td>${key}</td><td>${val}</td></tr>\n`;
                }
            });
        } else {
            Object.entries(specsObj).forEach(([rawKey, rawVal]) => {
                const key = translateZhToEn(String(rawKey));
                const displayVal = typeof rawVal === 'object' ? JSON.stringify(rawVal) : translateZhToEn(String(rawVal ?? ''));
                rowsHtml += `  <tr><td>${key}</td><td>${displayVal}</td></tr>\n`;
            });
        }

        if (!rowsHtml) return translateZhToEn(String(specsInput || ''));

        return `<h2>Thông số kỹ thuật</h2>\n<table class="Table_Products_Style">\n  <tr><th>Thông số</th><th>Giá trị</th></tr>\n${rowsHtml}</table>`;
    };

    const formatDocumentLinks = (docInput) => {
        if (!docInput) return '';

        let urls = [];

        if (Array.isArray(docInput)) {
            urls = docInput;
        } else if (typeof docInput === 'string') {
            const trimmed = docInput.trim();
            if (!trimmed) return '';

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    urls = JSON.parse(trimmed);
                } catch (e) {}
            }

            if (urls.length === 0) {
                urls = trimmed.split(/[\r\n,;]+/).map(u => u.trim()).filter(Boolean);
            }
        }

        urls = urls
            .map(u => typeof u === 'object' ? (u.url || u.link || u.href || '') : String(u || '').trim())
            .filter(u => u && !u.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i));

        if (urls.length === 0) return '';

        return urls.map((url, idx) => `tài liệu ${idx + 1}: ${url}`).join('\n');
    };

    // Helper: Convert product object to row array according to column mapping
    const mapProductToRow = (product) => {
        return columns.map(col => {
            if (col.field === 'custom_empty') return '';
            
            // Handle field mappings
            let val = product[col.field];

            // Brand fallback + translation
            if (col.field === 'brand') {
                val = val || product.brand_name || product.brand || product.vendor || (product.profile_slug ? product.profile_slug.replace(/^profile-?/i, '').toUpperCase() : (profileSlug ? profileSlug.replace(/^profile-?/i, '').toUpperCase() : ''));
                val = translateZhToEn(String(val || ''));
            }

            // Category / Series / Name translation
            if (col.field === 'category' || col.field === 'main_category' || col.field === 'series' || col.field === 'name') {
                val = translateZhToEn(String(val || ''));
            }

            // Fallback for model / sku
            if (col.field === 'model' && !val) {
                val = product.sku || product.product_code || '';
            }

            // Document / PDF links formatting
            if (col.field === 'document_url') {
                val = formatDocumentLinks(val || product.pdf_url || product.datasheet_url || product.download_links || product.documents);
            }

            // Description paragraph formatting
            if (col.field === 'description') {
                val = formatDescriptionToParagraphs(val || product.description_raw || product.summary || '');
            }

            // Specs HTML Table formatting
            if (col.field === 'specs_json') {
                val = convertSpecsToHtmlTable(val || product.specs_json || product.specs_html || product.specifications || product.specs || product.technical_specs);
            }

            return val !== undefined && val !== null ? String(val) : '';
        });
    };

    // Execute Conversion
    const handleExecuteConversion = async () => {
        setFetchingProducts(true);
        try {
            let targetProducts = [];

            if (productScope === 'selected' && selectedProductIds.length > 0) {
                targetProducts = allProducts.filter(p => selectedProductIds.includes(p.id));
            } else if (productScope === 'limit_count') {
                const reqLimit = Math.max(1, parseInt(customQuantity) || 1);
                if (allProducts.length >= reqLimit) {
                    targetProducts = allProducts.slice(0, reqLimit);
                } else {
                    const res = await fetchApi(`/api/products?limit=${reqLimit}&page=1`);
                    if (res && Array.isArray(res.items)) {
                        targetProducts = res.items;
                    } else {
                        targetProducts = allProducts;
                    }
                }
            } else {
                // 'all_db': Fetch all products in database
                const fetchLimit = totalProductsCount > 0 ? totalProductsCount : 10000;
                if (allProducts.length >= fetchLimit) {
                    targetProducts = allProducts;
                } else {
                    const res = await fetchApi(`/api/products?limit=${fetchLimit}&page=1`);
                    if (res && Array.isArray(res.items)) {
                        targetProducts = res.items;
                    } else {
                        targetProducts = allProducts;
                    }
                }
            }

            if (targetProducts.length === 0) {
                alert('⚠️ Profile này chưa có dữ liệu sản phẩm Crawler nào để nạp vào Sheet.\n\nVui lòng kích hoạt Crawler hoặc nạp file HAR cho Profile này trước.');
                setFetchingProducts(false);
                return;
            }


            // 2. Build rows
            const headerRow = columns.map(c => c.label || 'Cột');
            const dataRows = targetProducts.map(mapProductToRow);

        let finalSheets = JSON.parse(JSON.stringify(sheets));
        let finalTabName = '';

        if (destMode === 'new') {
            const sanitizedName = (newTabName.trim() || 'Crawler_Data').replace(/[^a-zA-Z0-9_ -À-ỹ]/g, '');
            finalTabName = sanitizedName;
            
            // Check if tab already exists, if so append unique suffix
            let uniqueName = sanitizedName;
            let counter = 1;
            while (finalSheets.some(s => s.name === uniqueName)) {
                uniqueName = `${sanitizedName}_${counter++}`;
            }
            finalTabName = uniqueName;

            const newSheetObj = {
                name: finalTabName,
                data: [headerRow, ...dataRows]
            };
            finalSheets.push(newSheetObj);
        } else {
            // Append mode
            finalTabName = targetTabName;
            finalSheets = finalSheets.map(s => {
                if (s.name !== finalTabName) return s;
                const existingData = [...(s.data || [])];
                
                // If existing sheet is empty, add header row first
                if (existingData.length === 0) {
                    existingData.push(headerRow);
                }
                
                return {
                    ...s,
                    data: [...existingData, ...dataRows]
                };
            });
        }

        if (onConvertSuccess) {
            onConvertSuccess({
                sheets: finalSheets,
                targetTabName: finalTabName,
                convertedCount: targetProducts.length
            });
        }
        onClose();
        } catch (err) {
            console.error('Error during conversion:', err);
            alert('Có lỗi xảy ra khi tải dữ liệu sản phẩm!');
        } finally {
            setFetchingProducts(false);
        }
    };

    const getColLetter = (idx) => {
        let temp, letter = '';
        while (idx >= 0) {
            temp = idx % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            idx = Math.floor(idx / 26) - 1;
        }
        return letter;
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease', padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', width: 780, maxWidth: '95vw', maxHeight: '92vh', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '16px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                📥 Chuyển Dữ Liệu Crawler Sang Sheet
                            </h3>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                Tùy chỉnh ánh xạ cột, chèn cột trống tự chọn và lưu Profile cấu hình
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    
                    {/* Section 1: Presets & Mapping Controls */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Sliders size={15} style={{ color: 'var(--accent)' }} /> 
                                Select Profile Cấu Hình Cột:
                            </label>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleUpdateCurrentPreset}
                                    style={{ padding: '5px 10px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    title="Lưu đè thay đổi các cột vào Profile này"
                                >
                                    <Save size={13} /> Cập Nhật
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSavePresetInput(true)}
                                    style={{ padding: '5px 10px', fontSize: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    <Plus size={13} /> Lưu Mới Profile
                                </button>
                                {presets.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteCurrentPreset}
                                        style={{ padding: '5px 8px', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}
                                        title="Xóa Profile đang chọn"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Preset Select Dropdown */}
                        <select
                            value={selectedPresetId}
                            onChange={e => handleSelectPreset(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                        >
                            {presets.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>

                        {/* Inline Save New Preset Form */}
                        {showSavePresetInput && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, background: 'var(--bg-card)', padding: 10, borderRadius: 6, border: '1px solid var(--accent)' }}>
                                <input
                                    type="text"
                                    value={newPresetName}
                                    onChange={e => setNewPresetName(e.target.value)}
                                    placeholder="Nhập tên Profile cấu hình mới..."
                                    style={{ flex: 1, padding: '6px 10px', fontSize: 12.5, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                />
                                <button type="button" onClick={handleSaveNewPreset} style={{ padding: '6px 12px', fontSize: 12, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>
                                    Lưu
                                </button>
                                <button type="button" onClick={() => setShowSavePresetInput(false)} style={{ padding: '6px 10px', fontSize: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Hủy
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Section 2: Column Mapping Grid */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                📋 Sơ Đồ Cột & Trường Ánh Xạ ({columns.length} cột):
                            </h4>
                            <button
                                type="button"
                                onClick={handleAddColumn}
                                style={{ padding: '4px 12px', fontSize: 12, background: 'var(--bg-card)', border: '1px dashed var(--accent)', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                <Plus size={14} /> Thêm Cột Mới
                            </button>
                        </div>

                        {/* Column Mapping Table */}
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '50px 1.4fr 1.8fr 70px', background: 'var(--bg-secondary)', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', textTransform: 'uppercase' }}>
                                <div>Cột</div>
                                <div>Tên Tiêu Đề (Header Row 1)</div>
                                <div>Trường Dữ Liệu Crawler Ánh Xạ</div>
                                <div style={{ textAlign: 'center' }}>Thao tác</div>
                            </div>

                            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {columns.map((col, idx) => {
                                    const colLetter = getColLetter(idx);
                                    const isCustomEmpty = col.field === 'custom_empty';
                                    return (
                                        <div
                                            key={col.id}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '50px 1.4fr 1.8fr 70px',
                                                gap: 8,
                                                alignItems: 'center',
                                                padding: '8px 12px',
                                                borderBottom: idx === columns.length - 1 ? 'none' : '1px solid var(--border-color)',
                                                background: isCustomEmpty ? 'rgba(99,102,241,0.03)' : 'var(--bg-card)'
                                            }}
                                        >
                                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
                                                {colLetter}
                                            </span>

                                            <input
                                                type="text"
                                                value={col.label}
                                                onChange={e => handleUpdateColumn(col.id, 'label', e.target.value)}
                                                placeholder="Tên tiêu đề cột"
                                                style={{ padding: '5px 8px', fontSize: 12.5, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                                            />

                                            <select
                                                value={col.field}
                                                onChange={e => handleUpdateColumn(col.id, 'field', e.target.value)}
                                                style={{ padding: '5px 8px', fontSize: 12.5, borderRadius: 4, border: `1px solid ${isCustomEmpty ? '#cbd5e1' : '#bfdbfe'}`, background: isCustomEmpty ? 'var(--bg-secondary)' : '#eff6ff', color: isCustomEmpty ? 'var(--text-secondary)' : '#1d4ed8', fontWeight: isCustomEmpty ? 500 : 600 }}
                                            >
                                                {AVAILABLE_FIELDS.map(f => (
                                                    <option key={f.value} value={f.value}>{f.label}</option>
                                                ))}
                                            </select>

                                            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveColumn(idx, -1)}
                                                    disabled={idx === 0}
                                                    style={{ background: 'none', border: 'none', padding: 3, cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                                                >
                                                    <ArrowUp size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveColumn(idx, 1)}
                                                    disabled={idx === columns.length - 1}
                                                    style={{ background: 'none', border: 'none', padding: 3, cursor: idx === columns.length - 1 ? 'default' : 'pointer', opacity: idx === columns.length - 1 ? 0.3 : 1 }}
                                                >
                                                    <ArrowDown size={13} />
                                                </button>
                                                {columns.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveColumn(col.id)}
                                                        style={{ background: 'none', border: 'none', padding: 3, color: '#ef4444', cursor: 'pointer' }}
                                                        title="Xóa cột này"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Scope & Destination Settings */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
                        {/* Scope */}
                        <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                                1. Phạm Vi Sản Phẩm Chuyển Đổi:
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {/* Option 1: Selected Products */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: selectedProductIds.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedProductIds.length === 0 ? 0.5 : 1 }}>
                                    <input
                                        type="radio"
                                        name="scope"
                                        checked={productScope === 'selected'}
                                        disabled={selectedProductIds.length === 0}
                                        onChange={() => setProductScope('selected')}
                                    />
                                    <span>Chỉ <strong>{selectedProductIds.length}</strong> sản phẩm được tích chọn</span>
                                </label>

                                {/* Option 2: Custom Quantity */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="scope"
                                            checked={productScope === 'limit_count'}
                                            onChange={() => setProductScope('limit_count')}
                                        />
                                        <span>Lấy theo số lượng:</span>
                                    </label>
                                    {productScope === 'limit_count' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={totalProductsCount || 10000}
                                                value={customQuantity}
                                                onChange={e => setCustomQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                style={{ width: 75, padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)', fontWeight: 600 }}
                                            />
                                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>sản phẩm đầu</span>
                                        </div>
                                    )}
                                </div>

                                {/* Option 3: All Crawled Products in DB */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="scope"
                                        checked={productScope === 'all_db'}
                                        onChange={() => setProductScope('all_db')}
                                    />
                                    <span>Tất cả sản phẩm crawl được trong CSDL (<strong>{totalProductsCount || allProducts.length}</strong> sản phẩm)</span>
                                </label>
                            </div>
                        </div>

                        {/* Destination */}
                        <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                                2. Tab Đích Đổi Dữ Liệu:
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="dest"
                                        checked={destMode === 'new'}
                                        onChange={() => setDestMode('new')}
                                    />
                                    <span>Tạo Tab Sheet mới:</span>
                                </label>

                                {destMode === 'new' && (
                                    <input
                                        type="text"
                                        value={newTabName}
                                        onChange={e => setNewTabName(e.target.value)}
                                        placeholder="Tên Tab mới..."
                                        style={{ marginLeft: 24, padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                                    />
                                )}

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: sheets.length === 0 ? 'not-allowed' : 'pointer', opacity: sheets.length === 0 ? 0.5 : 1 }}>
                                    <input
                                        type="radio"
                                        name="dest"
                                        checked={destMode === 'append'}
                                        disabled={sheets.length === 0}
                                        onChange={() => setDestMode('append')}
                                    />
                                    <span>Ghi tiếp vào Tab hiện có:</span>
                                </label>

                                {destMode === 'append' && (
                                    <select
                                        value={targetTabName}
                                        onChange={e => setTargetTabName(e.target.value)}
                                        style={{ marginLeft: 24, padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                                    >
                                        {sheets.map(s => (
                                            <option key={s.name} value={s.name}>{s.name} ({s.data?.length || 0} hàng)</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Sẽ chuyển <strong style={{ color: 'var(--accent)' }}>
                            {productScope === 'selected' ? selectedProductIds.length : (productScope === 'limit_count' ? customQuantity : (totalProductsCount || allProducts.length))}
                        </strong> sản phẩm sang Tab Sheet
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={fetchingProducts}>Hủy</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleExecuteConversion}
                            disabled={fetchingProducts}
                            style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 22px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            {fetchingProducts ? (
                                <>
                                    <Loader2 className="spin" size={16} /> Đang tải sản phẩm từ CSDL...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} /> Bắt đầu Chuyển Đổi
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
