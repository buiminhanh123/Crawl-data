import React, { useState, useMemo, useEffect } from 'react';
import { X, AlertTriangle, ShieldAlert, Layers, ArrowRight, Search, CheckCircle2, Copy, Link as LinkIcon, FileText, Hash, Loader2, Lock, Zap } from 'lucide-react';
import { fetchApi } from '@/lib/api';

const AVAILABLE_MANDATORY_FIELDS = [
    { key: 'ma_san_pham', label: 'Mã Sản Phẩm (SKU / Cột A)', colName: 'Cột A', defaultIdx: 0, aliases: ['ma_san_pham', 'mã sản phẩm', 'mã sp', 'ma sp', 'sku', 'model', 'cột a'] },
    { key: 'ten_san_pham', label: 'Tên Sản Phẩm (Title / Cột B)', colName: 'Cột B', defaultIdx: 1, aliases: ['ten_san_pham', 'tên sản phẩm', 'tên sp', 'ten sp', 'tiêu đề', 'title', 'name', 'cột b'] },
    { key: 'danh_muc_id', label: 'ID Danh Mục (Category / Cột R)', colName: 'Cột R', defaultIdx: 17, aliases: ['danh_muc_id', 'danh mục id', 'category id', 'danh mục', 'danh_muc', 'cột r'] },
    { key: 'thuong_hieu', label: 'ID Thương Hiệu (Brand / Cột Q)', colName: 'Cột Q', defaultIdx: 16, aliases: ['thuong_hieu', 'thương hiệu', 'brand_id', 'brand', 'cột q'] },
    { key: 'sapo', label: 'Mô Tả / Sapo (Meta Description / Cột H)', colName: 'Cột H', defaultIdx: 7, aliases: ['sapo', 'mô tả ngắn', 'mo_ta', 'meta description', 'cột h'] },
    { key: 'anh_dai_dien', label: 'Link Ảnh Đại Diện (Cột D)', colName: 'Cột D', defaultIdx: 3, aliases: ['ảnh', 'img', 'drive', 'anh_dai_dien', 'cột d'] },
    { key: 'tl_hdsd_link', label: 'Link File PDF (Cột F)', colName: 'Cột F', defaultIdx: 5, aliases: ['tài liệu', 'pdf', 'doc', 'tl_hdsd_link', 'cột f'] }
];

export default function IncompleteRowsModal({
    isOpen,
    onClose,
    profileSlug = 'newland',
    profileName = 'Newland',
    sheets = [],
    initialTab = 'mandatory',
    customPostingLogs = [],
    onNavigateToRow,
    onUpdateCell,
    onUpdateSheets
}) {
    const [filterTab, setFilterTab] = useState(initialTab); // 'mandatory' | 'duplicate_sku' | 'image_links' | 'pdf_links' | 'meta_desc' | 'category_ids' | 'web_posted' | 'all'
    const [selectedSheetName, setSelectedSheetName] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Synchronize initialTab prop to internal filterTab state
    useEffect(() => {
        if (initialTab) {
            setFilterTab(initialTab);
        }
    }, [initialTab]);

    // Customizable Mandatory Keys state
    const [selectedMandatoryKeys, setSelectedMandatoryKeys] = useState(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('newland_mandatory_keys') : null;
            return saved ? JSON.parse(saved) : ['ma_san_pham', 'ten_san_pham', 'danh_muc_id'];
        } catch (e) {
            return ['ma_san_pham', 'ten_san_pham', 'danh_muc_id'];
        }
    });

    // Hard-lock export toggle state
    const [lockExportOnMissingMandatory, setLockExportOnMissingMandatory] = useState(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('newland_lock_export_mandatory') : null;
            return saved !== null ? JSON.parse(saved) : true;
        } catch (e) {
            return true;
        }
    });

    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [quickInputs, setQuickInputs] = useState({}); // { `${sheet}-${row}-${colIdx}`: value }

    // Dynamic columns & Presets state
    const [customColumns, setCustomColumns] = useState(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('newland_custom_mandatory_cols') : null;
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });

    const [newCustomColName, setNewCustomColName] = useState('');

    const [presets, setPresets] = useState(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('newland_mandatory_presets') : null;
            return saved ? JSON.parse(saved) : [
                { id: 'default_strict', name: 'Mặc định (SKU, Tên, ID Danh mục)', keys: ['ma_san_pham', 'ten_san_pham', 'danh_muc_id'] },
                { id: 'full_seo', name: 'Đầy đủ SEO & Media (SKU, Tên, Mô tả, Ảnh, PDF)', keys: ['ma_san_pham', 'ten_san_pham', 'danh_muc_id', 'sapo', 'anh_dai_dien', 'tl_hdsd_link'] }
            ];
        } catch (e) {
            return [
                { id: 'default_strict', name: 'Mặc định (SKU, Tên, ID Danh mục)', keys: ['ma_san_pham', 'ten_san_pham', 'danh_muc_id'] }
            ];
        }
    });

    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [newPresetName, setNewPresetName] = useState('');
    const [showSavePresetInput, setShowSavePresetInput] = useState(false);

    // Extract all unique columns from all active sheets dynamically
    const allSheetColumns = useMemo(() => {
        const colMap = new Map();
        
        // Add built-in defaults first
        AVAILABLE_MANDATORY_FIELDS.forEach(f => {
            colMap.set(f.key, { key: f.key, label: f.label, colName: f.colName, aliases: f.aliases, defaultIdx: f.defaultIdx });
        });

        // Add columns detected from uploaded/active sheets
        (sheets || []).forEach(s => {
            if (!s.data || !s.data[0]) return;
            const headers = s.data[0];
            headers.forEach((h, idx) => {
                const headerStr = String(h || '').trim();
                if (!headerStr) return;
                const norm = headerStr.toLowerCase();
                
                // Check if this header matches any existing built-in field
                const existing = Array.from(colMap.values()).find(item => 
                    item.aliases && item.aliases.some(a => norm === a || norm.includes(a))
                );
                
                if (!existing) {
                    const key = `col_header_${norm.replace(/[^a-z0-9]/g, '_')}`;
                    if (!colMap.has(key)) {
                        const colLetter = idx < 26 ? String.fromCharCode(65 + idx) : `Cột ${idx + 1}`;
                        colMap.set(key, {
                            key,
                            label: `${headerStr} (Cột ${colLetter})`,
                            colName: `Cột ${colLetter}`,
                            defaultIdx: idx,
                            aliases: [norm, headerStr]
                        });
                    }
                }
            });
        });

        // Add user defined custom columns
        customColumns.forEach(cc => {
            if (!colMap.has(cc.key)) {
                colMap.set(cc.key, cc);
            }
        });

        return Array.from(colMap.values());
    }, [sheets, customColumns]);

    // Save mandatory keys config
    const handleToggleMandatoryKey = (key) => {
        const next = selectedMandatoryKeys.includes(key)
            ? selectedMandatoryKeys.filter(k => k !== key)
            : [...selectedMandatoryKeys, key];
        setSelectedMandatoryKeys(next);
        try {
            localStorage.setItem('newland_mandatory_keys', JSON.stringify(next));
        } catch (e) {}
    };

    // Add new custom column
    const handleAddCustomColumn = () => {
        if (!newCustomColName.trim()) return;
        const norm = newCustomColName.trim().toLowerCase();
        const key = `custom_${Date.now()}_${norm.replace(/[^a-z0-9]/g, '_')}`;
        const newCol = {
            key,
            label: `Cột: ${newCustomColName.trim()}`,
            colName: newCustomColName.trim(),
            defaultIdx: -1,
            aliases: [norm, newCustomColName.trim()]
        };
        const nextCustom = [...customColumns, newCol];
        setCustomColumns(nextCustom);
        setNewCustomColName('');
        try {
            localStorage.setItem('newland_custom_mandatory_cols', JSON.stringify(nextCustom));
        } catch (e) {}
        // Auto select newly added column
        handleToggleMandatoryKey(key);
    };

    // Save current selection as a new Preset
    const handleSaveCurrentAsPreset = () => {
        if (!newPresetName.trim()) return;
        const newPreset = {
            id: `preset_${Date.now()}`,
            name: newPresetName.trim(),
            keys: [...selectedMandatoryKeys]
        };
        const nextPresets = [...presets, newPreset];
        setPresets(nextPresets);
        setSelectedPresetId(newPreset.id);
        setNewPresetName('');
        setShowSavePresetInput(false);
        try {
            localStorage.setItem('newland_mandatory_presets', JSON.stringify(nextPresets));
        } catch (e) {}
    };

    // Apply selected Preset
    const handleApplyPreset = (presetId) => {
        setSelectedPresetId(presetId);
        if (!presetId) return;
        const target = presets.find(p => p.id === presetId);
        if (target) {
            setSelectedMandatoryKeys(target.keys);
            try {
                localStorage.setItem('newland_mandatory_keys', JSON.stringify(target.keys));
            } catch (e) {}
        }
    };

    // Delete a preset
    const handleDeletePreset = (presetId, e) => {
        e.stopPropagation();
        const nextPresets = presets.filter(p => p.id !== presetId);
        setPresets(nextPresets);
        if (selectedPresetId === presetId) setSelectedPresetId('');
        try {
            localStorage.setItem('newland_mandatory_presets', JSON.stringify(nextPresets));
        } catch (e) {}
    };

    // Save lock export toggle
    const handleToggleLockExport = (val) => {
        setLockExportOnMissingMandatory(val);
        try {
            localStorage.setItem('newland_lock_export_mandatory', JSON.stringify(val));
        } catch (e) {}
    };

    // Live link & Drive permissions verification state
    const [liveCheckLoading, setLiveCheckLoading] = useState(false);
    const [liveCheckResults, setLiveCheckResults] = useState({});

    // Map set of SKUs / Product Codes that are successfully posted on Web
    const postedSkuSet = useMemo(() => {
        const set = new Set();
        const logs = Array.isArray(customPostingLogs) ? customPostingLogs : [];
        logs.forEach(item => {
            if (!item) return;
            const status = String(item.status || item.publish_status || '').toLowerCase();
            const isOk = status === 'success' || status === 'published' || item.posted_url || item.post_id || item.product_id;
            if (isOk) {
                if (item.product_code || item.sku || item.ma_san_pham) {
                    set.add(String(item.product_code || item.sku || item.ma_san_pham).trim().toLowerCase());
                }
                if (item.product_name || item.name) {
                    set.add(String(item.product_name || item.name).trim().toLowerCase());
                }
            }
        });
        return set;
    }, [customPostingLogs]);

    // Analyze all rows in sheets for missing required & smart audit checks
    const analyzedData = useMemo(() => {
        if (!sheets || sheets.length === 0) {
            return {
                rows: [],
                mandatoryCount: 0,
                duplicateCount: 0,
                imgLinkErrorCount: 0,
                pdfLinkErrorCount: 0,
                mediaLinkErrorCount: 0,
                metaDescErrorCount: 0,
                catIdErrorCount: 0,
                totalIncompleteCount: 0,
                postedCount: 0,
                totalRowsCount: 0
            };
        }

        const allRows = [];
        let mandatoryCount = 0;
        let duplicateCount = 0;
        let imgLinkErrorCount = 0;
        let pdfLinkErrorCount = 0;
        let mediaLinkErrorCount = 0;
        let metaDescErrorCount = 0;
        let catIdErrorCount = 0;
        let totalIncompleteCount = 0;
        let postedCount = 0;
        let totalRowsCount = 0;

        const codeAliases = ['ma_san_pham', 'mã sản phẩm', 'mã sp', 'ma sp', 'sku', 'model', 'cột a'];
        const nameAliases = ['ten_san_pham', 'tên sản phẩm', 'tên sp', 'ten sp', 'tiêu đề', 'title', 'name', 'cột b'];
        const catAliases = ['danh_muc_id', 'danh mục id', 'category id', 'danh mục', 'danh_muc', 'cột r'];

        // Map to track duplicate SKUs: sku -> array of { sheetName, rowIndex, productName }
        const skuOccurrences = {};

        // Phase 1: Collect SKU occurrences across all sheets
        sheets.forEach(s => {
            if (!s.data || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());

            let codeIdx = headers.findIndex((h, idx) => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            let nameIdx = headers.findIndex((h, idx) => nameAliases.some(a => h === a || h.includes(a)));
            if (nameIdx === -1) nameIdx = 1;

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

                const valCode = (codeIdx >= 0 && codeIdx < row.length) ? String(row[codeIdx] || '').trim() : '';
                const valName = (nameIdx >= 0 && nameIdx < row.length) ? String(row[nameIdx] || '').trim() : '';

                if (valCode) {
                    const normCode = valCode.toUpperCase();
                    if (!skuOccurrences[normCode]) skuOccurrences[normCode] = [];
                    skuOccurrences[normCode].push({
                        sheetName: s.name,
                        rowIndex: r + 1,
                        productName: valName || valCode
                    });
                }
            }
        });

        // Phase 2: Audit rows in details
        sheets.forEach(s => {
            if (!s.data || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());

            let codeIdx = headers.findIndex((h, idx) => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            let nameIdx = headers.findIndex((h, idx) => nameAliases.some(a => h === a || h.includes(a)));
            if (nameIdx === -1) nameIdx = 1;

            let catIdx = headers.findIndex((h, idx) => catAliases.some(a => h === a || h.includes(a)));
            if (catIdx === -1 && headers.length > 17) catIdx = 17;

            const sapoIdx = headers.findIndex(h => h.includes('sapo') || h.includes('mô tả ngắn') || h === 'mo_ta');
            const metaTitleIdx = headers.findIndex(h => h.includes('meta title') || h.includes('tiêu đề trang') || h === 'tieu_de_trang');
            const specIdx = headers.findIndex(h => h.includes('thông số') || h.includes('table') || h === 'noi_dung');
            const imgIdx = headers.findIndex(h => h.includes('ảnh') || h.includes('img') || h.includes('drive') || h === 'anh_dai_dien');
            const pdfIdx = headers.findIndex(h => h.includes('tài liệu') || h.includes('pdf') || h.includes('doc') || h === 'tl_hdsd_link');
            const brandIdx = headers.findIndex(h => h.includes('thuong_hieu') || h.includes('thương hiệu') || h.includes('brand_id'));

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

                totalRowsCount++;
                const valCode = (codeIdx >= 0 && codeIdx < row.length) ? String(row[codeIdx] || '').trim() : '';
                const valName = (nameIdx >= 0 && nameIdx < row.length) ? String(row[nameIdx] || '').trim() : '';
                const valCat = (catIdx >= 0 && catIdx < row.length) ? String(row[catIdx] || '').trim() : '';

                // Web Posted Status Check
                const isWebPosted = (valCode && postedSkuSet.has(valCode.toLowerCase())) || (valName && postedSkuSet.has(valName.toLowerCase()));
                if (isWebPosted) postedCount++;

                // 1. Mandatory fields (based on user config selectedMandatoryKeys & allSheetColumns)
                const missingMandatory = [];
                selectedMandatoryKeys.forEach(mKey => {
                    const def = allSheetColumns.find(f => f.key === mKey);
                    if (!def) return;
                    let targetIdx = headers.findIndex(h => def.aliases && def.aliases.some(a => h === a || h.includes(a)));
                    if (targetIdx === -1 && def.defaultIdx !== undefined && def.defaultIdx >= 0) {
                        targetIdx = def.defaultIdx;
                    }

                    const val = (targetIdx >= 0 && targetIdx < row.length) ? String(row[targetIdx] || '').trim() : '';
                    if (!val || targetIdx === -1) {
                        missingMandatory.push({ key: def.key, label: def.label, colIdx: targetIdx >= 0 ? targetIdx : 0 });
                    }
                });

                // 2. Duplicate SKU check
                const isDuplicateSku = valCode && skuOccurrences[valCode.toUpperCase()] && skuOccurrences[valCode.toUpperCase()].length > 1;
                const duplicateOtherRows = isDuplicateSku
                    ? skuOccurrences[valCode.toUpperCase()].filter(o => o.sheetName !== s.name || o.rowIndex !== (r + 1))
                    : [];

                // 3. Image Link Check
                const missingImgLinks = [];
                const valImg = (imgIdx >= 0 && imgIdx < row.length) ? String(row[imgIdx] || '').trim() : '';
                if (!valImg) {
                    missingImgLinks.push({ key: 'img_missing', label: 'Thiếu Link Ảnh Đại Diện' });
                } else if (!valImg.startsWith('http://') && !valImg.startsWith('https://')) {
                    missingImgLinks.push({ key: 'img_invalid', label: 'Link Ảnh Chưa Đúng HTTP/HTTPS' });
                } else if (liveCheckResults[valImg]) {
                    const resImg = liveCheckResults[valImg];
                    if (resImg.status === 'broken') {
                        missingImgLinks.push({ key: 'img_live_404', label: '🔴 Link Ảnh Lỗi 404 (Không Tồn Tại)' });
                    } else if (resImg.status === 'private_drive') {
                        missingImgLinks.push({ key: 'img_live_private', label: '🔒 Link Ảnh Google Drive Chưa Mở Public' });
                    }
                }

                // 4. PDF Link Check
                const missingPdfLinks = [];
                const valPdf = (pdfIdx >= 0 && pdfIdx < row.length) ? String(row[pdfIdx] || '').trim() : '';
                if (pdfIdx >= 0 && valPdf && !valPdf.startsWith('http://') && !valPdf.startsWith('https://')) {
                    missingPdfLinks.push({ key: 'pdf_invalid', label: 'Link File PDF Chưa Đúng HTTP/HTTPS' });
                } else if (valPdf && liveCheckResults[valPdf]) {
                    const resPdf = liveCheckResults[valPdf];
                    if (resPdf.status === 'broken') {
                        missingPdfLinks.push({ key: 'pdf_live_404', label: '🔴 Link PDF Lỗi 404 (Không Tồn Tại)' });
                    } else if (resPdf.status === 'private_drive') {
                        missingPdfLinks.push({ key: 'pdf_live_private', label: '🔒 Link PDF Google Drive Chưa Mở Public' });
                    }
                }

                // 5. Meta Description Check (mo_ta column H <= 160 chars)
                const metaDescIssues = [];
                const valDesc = (sapoIdx >= 0 && sapoIdx < row.length) ? String(row[sapoIdx] || '').trim() : '';
                if (!valDesc) {
                    metaDescIssues.push({ key: 'meta_desc_missing', label: 'Thiếu Meta Description (Mô Tả)' });
                } else if (valDesc.length > 160) {
                    metaDescIssues.push({ key: 'meta_desc_long', label: `Meta Description Quá Dài (${valDesc.length}/160 ký tự)` });
                }

                // 6. Category & Brand ID Check
                const catBrandIssues = [];
                if (!valCat) {
                    catBrandIssues.push({ key: 'cat_id_missing', label: 'Thiếu ID Danh Mục' });
                } else if (!/^\d+$/.test(valCat)) {
                    catBrandIssues.push({ key: 'cat_id_invalid', label: `ID Danh Mục Phải Là Số ("${valCat}")` });
                }

                const valBrand = (brandIdx >= 0 && brandIdx < row.length) ? String(row[brandIdx] || '').trim() : '';
                if (brandIdx >= 0 && valBrand && !/^\d+$/.test(valBrand)) {
                    catBrandIssues.push({ key: 'brand_id_invalid', label: `ID Thương Hiệu Phải Là Số ("${valBrand}")` });
                }

                // General optional missing fields
                const missingOptional = [];
                if (specIdx >= 0 && (!row[specIdx] || String(row[specIdx]).trim().length <= 10)) {
                    missingOptional.push({ key: 'dich', label: 'Dịch HTML Thông Số' });
                }

                const isMandatoryMissing = missingMandatory.length > 0;
                const isIncomplete = isMandatoryMissing || isDuplicateSku || missingImgLinks.length > 0 || missingPdfLinks.length > 0 || metaDescIssues.length > 0 || catBrandIssues.length > 0 || missingOptional.length > 0;

                if (isMandatoryMissing) mandatoryCount++;
                if (isDuplicateSku) duplicateCount++;
                if (missingImgLinks.length > 0) imgLinkErrorCount++;
                if (missingPdfLinks.length > 0) pdfLinkErrorCount++;
                if (metaDescIssues.length > 0) metaDescErrorCount++;
                if (catBrandIssues.length > 0) catIdErrorCount++;
                if (isIncomplete) totalIncompleteCount++;

                if (isIncomplete) {
                    allRows.push({
                        sheetName: s.name,
                        rowIndex: r + 1,
                        productName: valName || valCode || `Hàng ${r + 1}`,
                        productCode: valCode || '(Trống)',
                        rawImgUrl: valImg,
                        rawPdfUrl: valPdf,
                        missingMandatory,
                        isDuplicateSku,
                        duplicateOtherRows,
                        missingImgLinks,
                        missingPdfLinks,
                        missingMediaLinks: [...missingImgLinks, ...missingPdfLinks],
                        metaDescIssues,
                        catBrandIssues,
                        missingOptional,
                        isMandatoryMissing,
                        isIncomplete,
                        isWebPosted
                    });
                }
            }
        });

        return {
            rows: allRows,
            mandatoryCount,
            duplicateCount,
            imgLinkErrorCount,
            pdfLinkErrorCount,
            mediaLinkErrorCount: imgLinkErrorCount + pdfLinkErrorCount,
            metaDescErrorCount,
            catIdErrorCount,
            totalIncompleteCount,
            postedCount,
            totalRowsCount
        };
    }, [sheets, liveCheckResults, selectedMandatoryKeys, postedSkuSet]);

    // Live link verification handler scoped to active tab
    const handleRunLiveLinkCheck = async () => {
        const urlsToTest = [];
        const imgAliases = ['ảnh', 'img', 'drive', 'anh_dai_dien'];
        const pdfAliases = ['tài liệu', 'pdf', 'doc', 'tl_hdsd_link'];

        const checkImages = filterTab === 'image_links' || filterTab === 'media_links' || filterTab === 'all';
        const checkPdfs = filterTab === 'pdf_links' || filterTab === 'media_links' || filterTab === 'all';

        sheets.forEach(s => {
            if (!s.data || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());
            const imgIdx = headers.findIndex(h => imgAliases.some(a => h.includes(a) || h === a));
            const pdfIdx = headers.findIndex(h => pdfAliases.some(a => h.includes(a) || h === a));

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!row) continue;
                const valImg = (imgIdx >= 0 && imgIdx < row.length) ? String(row[imgIdx] || '').trim() : '';
                const valPdf = (pdfIdx >= 0 && pdfIdx < row.length) ? String(row[pdfIdx] || '').trim() : '';

                if (checkImages && valImg && (valImg.startsWith('http://') || valImg.startsWith('https://'))) {
                    urlsToTest.push(valImg);
                }
                if (checkPdfs && valPdf && (valPdf.startsWith('http://') || valPdf.startsWith('https://'))) {
                    urlsToTest.push(valPdf);
                }
            }
        });

        const uniqueUrls = Array.from(new Set(urlsToTest));
        const targetTypeName = filterTab === 'image_links' ? 'LINK ẢNH' : (filterTab === 'pdf_links' ? 'LINK FILE PDF' : 'LINK ẢNH & PDF');

        if (uniqueUrls.length === 0) {
            alert(`Không tìm thấy ${targetTypeName} chứa http:// hoặc https:// nào trong toàn bộ bảng dữ liệu.`);
            return;
        }

        setLiveCheckLoading(true);
        try {
            const res = await fetchApi('/api/products/verify-links', {
                method: 'POST',
                body: JSON.stringify({ urls: uniqueUrls })
            });
            if (res && res.success) {
                const results = res.results || {};
                setLiveCheckResults(prev => ({ ...prev, ...results }));

                let ok = 0, broken = 0, privateDrive = 0;
                Object.values(results).forEach(item => {
                    if (item.status === 'ok') ok++;
                    else if (item.status === 'private_drive') privateDrive++;
                    else broken++;
                });

                if (broken === 0 && privateDrive === 0) {
                    alert(`✅ KẾT QUẢ LIVE PING ${targetTypeName}:\n\nĐã kiểm tra ${uniqueUrls.length} ${targetTypeName} thành công!\n👉 100% link (${ok}/${uniqueUrls.length}) đang SỐNG & DRIVE PUBLIC (HTTP 200 OK)!`);
                } else {
                    alert(`⚠️ KẾT QUẢ LIVE PING ${targetTypeName}:\n\nĐã kiểm tra ${uniqueUrls.length} ${targetTypeName}:\n- 🟢 ${ok} link hoạt động tốt (HTTP 200 OK)\n- 🔴 ${broken} link lỗi 404 / Không tồn tại\n- 🔒 ${privateDrive} link Google Drive chưa mở Public`);
                }
            } else {
                alert('Lỗi khi kiểm tra link: ' + (res?.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Lỗi kết nối kiểm tra link: ' + e.message);
        } finally {
            setLiveCheckLoading(false);
        }
    };

    // Automatically write/update Check Status column into all sheets and save to DB
    const handleSyncStatusColumnToSheets = async () => {
        if (!sheets || sheets.length === 0) {
            alert('Chưa có dữ liệu Sheet nào để ghi cột Check Status.');
            return;
        }
        let updatedRowCount = 0;

        const newSheets = sheets.map(s => {
            if (!s.data || s.data.length === 0) return s;

            const rows = [...s.data];
            const headerRow = [...(rows[0] || [])];

            // Find or create "Check Status" header column index
            let statusColIdx = headerRow.findIndex(h => {
                const norm = String(h || '').trim().toLowerCase();
                return norm === 'check status' || norm === 'trạng thái audit' || norm === 'status audit' || norm === 'check_status';
            });

            if (statusColIdx === -1) {
                statusColIdx = headerRow.length;
                headerRow.push('Check Status');
            }

            const updatedRows = [headerRow];

            // Iterate rows
            for (let r = 1; r < rows.length; r++) {
                const row = [...(rows[r] || [])];
                if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
                    updatedRows.push(row);
                    continue;
                }

                while (row.length <= statusColIdx) row.push('');

                // Find audit item for this row if any
                const auditItem = analyzedData.rows.find(item => item.sheetName === s.name && item.rowIndex === (r + 1));
                let statusText = 'OK';

                if (auditItem) {
                    const issues = [];
                    if (auditItem.missingMandatory && auditItem.missingMandatory.length > 0) {
                        issues.push(`Thiếu (${auditItem.missingMandatory.map(m => m.label.split('(')[0].trim()).join(', ')})`);
                    }
                    if (auditItem.isDuplicateSku) {
                        issues.push(`Trùng mã SP (${auditItem.productCode})`);
                    }
                    if (auditItem.missingImgLinks && auditItem.missingImgLinks.length > 0) {
                        issues.push(`Link ảnh (${auditItem.missingImgLinks.map(m => m.label).join(', ')})`);
                    }
                    if (auditItem.missingPdfLinks && auditItem.missingPdfLinks.length > 0) {
                        issues.push(`Link PDF (${auditItem.missingPdfLinks.map(m => m.label).join(', ')})`);
                    }
                    if (auditItem.metaDescIssues && auditItem.metaDescIssues.length > 0) {
                        issues.push(`Meta Desc (${auditItem.metaDescIssues.map(m => m.label).join(', ')})`);
                    }
                    if (auditItem.catBrandIssues && auditItem.catBrandIssues.length > 0) {
                        issues.push(`ID (${auditItem.catBrandIssues.map(m => m.label).join(', ')})`);
                    }

                    if (issues.length > 0) {
                        statusText = '❌ ' + issues.join(' | ');
                    } else {
                        statusText = 'OK';
                    }
                }

                row[statusColIdx] = statusText;
                updatedRows.push(row);
                updatedRowCount++;
            }

            return { ...s, data: updatedRows };
        });

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: newSheets })
            });
            if (onUpdateSheets) onUpdateSheets(newSheets);
            window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug } }));
            alert(`✅ ĐÃ GHI CỘT "Check Status" VÀO TOÀN BỘ SHEET & LƯU VĨNH VIỄN!\n\n- Đã cập nhật trạng thái kiểm tra cho ${updatedRowCount} dòng.\n- Các dòng đầy đủ được ghi "OK".\n- Cột "Check Status" đã được lưu vĩnh viễn vào CSDL (khi F5 sẽ không bị mất).`);
        } catch (e) {
            console.error('Failed to save status column:', e);
            alert('Lỗi lưu cột Check Status vào database: ' + e.message);
        }
    };

    // Handler to sync Web Posted status column ("Trạng Thái Đăng Bài") to sheets
    const handleSyncWebPostedStatusToSheets = async () => {
        if (!sheets || sheets.length === 0) return;

        let totalUpdated = 0;
        const newSheets = sheets.map(s => {
            if (!s.data || s.data.length === 0) return s;
            const rows = [...s.data];
            const headerRow = [...(rows[0] || [])];

            let statusColIdx = headerRow.findIndex(h => {
                const str = String(h || '').trim().toLowerCase();
                return str === 'trạng thái đăng bài' || str === 'trạng thái đăng' || str === 'posted status' || str === 'web status';
            });

            if (statusColIdx === -1) {
                statusColIdx = headerRow.length;
                headerRow.push('Trạng Thái Đăng Bài');
            }

            const candidateCodeKeys = ['mã_sản_phẩm', 'ma_san_pham', 'mã sản phẩm', 'sku', 'model', 'part_number'];
            const candidateNameKeys = ['tên_sản_phẩm', 'ten_san_pham', 'tên sản phẩm', 'tên', 'name', 'product_name'];
            const headersLower = headerRow.map(h => String(h || '').trim().toLowerCase());
            const codeIdx = headersLower.findIndex(h => candidateCodeKeys.some(a => h === a || h.includes(a)));
            const nameIdx = headersLower.findIndex(h => candidateNameKeys.some(a => h === a || h.includes(a)));

            const updatedRows = [headerRow];
            for (let r = 1; r < rows.length; r++) {
                const row = [...(rows[r] || [])];
                while (row.length < statusColIdx) row.push('');

                const valCode = (codeIdx >= 0 && codeIdx < row.length) ? String(row[codeIdx] || '').trim() : '';
                const valName = (nameIdx >= 0 && nameIdx < row.length) ? String(row[nameIdx] || '').trim() : '';

                const isPosted = (valCode && postedSkuSet.has(valCode.toLowerCase())) || (valName && postedSkuSet.has(valName.toLowerCase()));
                row[statusColIdx] = isPosted ? '✅ Đã Đăng Web' : '⏳ Chưa Đăng';
                updatedRows.push(row);
                totalUpdated++;
            }

            return { ...s, data: updatedRows };
        });

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: newSheets })
            });
            if (onUpdateSheets) onUpdateSheets(newSheets);
            window.dispatchEvent(new CustomEvent('profile_sheet_updated', { detail: { profileSlug } }));
            alert(`🌐 ĐÃ GHI CỘT "Trạng Thái Đăng Bài" VÀO TẤT CẢ CÁC SHEET!\n\n- Đã cập nhật cho ${totalUpdated} dòng sản phẩm.\n- Sản phẩm đã xuất bản web: Ghi "✅ Đã Đăng Web".\n- Sản phẩm chưa đăng: Ghi "⏳ Chưa Đăng".`);
        } catch (e) {
            alert('❌ Lỗi khi ghi cột Trạng Thái Đăng Bài vào Sheet: ' + e.message);
        }
    };

    if (!isOpen) return null;

    // Filtered list based on active tab
    const filteredRows = analyzedData.rows.filter(item => {
        if (filterTab === 'web_posted') {
            // Keep all rows when checking web posted status
        } else if (filterTab === 'mandatory') {
            if (!item.isMandatoryMissing) return false;
        } else if (filterTab === 'duplicate_sku') {
            if (!item.isDuplicateSku) return false;
        } else if (filterTab === 'image_links') {
            if (item.missingImgLinks.length === 0) return false;
        } else if (filterTab === 'pdf_links') {
            if (item.missingPdfLinks.length === 0) return false;
        } else if (filterTab === 'media_links') {
            if (item.missingMediaLinks.length === 0) return false;
        } else if (filterTab === 'meta_desc') {
            if (item.metaDescIssues.length === 0) return false;
        } else if (filterTab === 'category_ids') {
            if (item.catBrandIssues.length === 0) return false;
        } else if (filterTab !== 'all') {
            if (!item.isIncomplete) return false;
        }

        if (selectedSheetName !== 'ALL' && item.sheetName !== selectedSheetName) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const nameMatch = item.productName.toLowerCase().includes(q);
            const codeMatch = item.productCode.toLowerCase().includes(q);
            const sheetMatch = item.sheetName.toLowerCase().includes(q);
            return nameMatch || codeMatch || sheetMatch;
        }
        return true;
    });

    const uniqueSheetNames = Array.from(new Set(analyzedData.rows.map(r => r.sheetName)));

    const isLinkCheckTabActive = filterTab === 'image_links' || filterTab === 'pdf_links' || filterTab === 'media_links';

    return (
        <div className="modal-backdrop" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16
        }}>
            <div style={{
                background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 980,
                maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '18px 24px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                    color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: analyzedData.mandatoryCount > 0 ? '#ef4444' : '#2563eb',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <ShieldAlert size={22} />
                        </div>
<div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                Trung Tâm Kiểm Tra Dữ Liệu (Data Audit Center)
                            </h3>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                Profile: <strong style={{ color: '#38bdf8' }}>{profileName}</strong> ({profileSlug})
                            </div>
                        </div>
                    </div>

                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                        <X size={22} />
                    </button>
                </div>

                {/* Status Alert Banner */}
                <div style={{
                    padding: '12px 24px',
                    background: analyzedData.mandatoryCount > 0 ? (lockExportOnMissingMandatory ? '#fff1f2' : '#fefce8') : '#f0fdf4',
                    borderBottom: '1px solid',
                    borderColor: analyzedData.mandatoryCount > 0 ? (lockExportOnMissingMandatory ? '#fecdd3' : '#fef08a') : '#bbf7d0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {analyzedData.mandatoryCount > 0 ? (
                            lockExportOnMissingMandatory ? (
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#e11d48', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    🔴 CƯỠNG CHẾ CHẶN XUẤT FILE: Có {analyzedData.mandatoryCount} hàng thiếu {selectedMandatoryKeys.length} trường bắt buộc.
                                </span>
                            ) : (
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    ⚠️ CẢNH BÁO: Có {analyzedData.mandatoryCount} hàng thiếu trường bắt buộc (Cưỡng chế khóa xuất file đang TẮT).
                                </span>
                            )
                        ) : (
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
                                ✅ ĐỦ ĐIỀU KIỆN XUẤT FILE EXCEL! Đã đầy đủ các trường bắt buộc.
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (isLinkCheckTabActive) {
                                    handleRunLiveLinkCheck();
                                } else {
                                    alert(`🔍 ĐÃ HOÀN THÀNH QUÉT DỮ LIỆU!\n\n- Đã tự động phân tích ${analyzedData.rows.length} dòng có vấn đề trên toàn bộ Sheet.\n- Phát hiện: ${analyzedData.mandatoryCount} lỗi trường bắt buộc, ${analyzedData.duplicateCount} mã SP trùng, ${analyzedData.mediaLinkErrorCount} link lỗi.`);
                                }
                            }}
                            disabled={liveCheckLoading}
                            style={{
                                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: liveCheckLoading ? '#cbd5e1' : '#2563eb',
                                color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                            }}
                        >
                            {liveCheckLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                            {liveCheckLoading ? 'Đang Quét Ping Link...' : (isLinkCheckTabActive ? '🔍 Chạy Ping Live Link' : '🔍 Quét & Kiểm Tra Lại')}
                        </button>

                        <button
                            type="button"
                            onClick={handleSyncStatusColumnToSheets}
                            style={{
                                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: '#7c3aed', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                            }}
                            title="Tự động thêm/cập nhật cột 'Check Status' vào tất cả các Sheet trong bộ nhớ"
                        >
                            📌 Ghi Cột "Check Status" Vào Sheet
                        </button>

                        <button
                            type="button"
                            onClick={handleSyncWebPostedStatusToSheets}
                            style={{
                                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: '#16a34a', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                            }}
                            title="Tự động thêm/cập nhật cột 'Trạng Thái Đăng Bài' (Đã Đăng Web / Chưa Đăng) vào tất cả các Sheet"
                        >
                            🌐 Ghi Cột "Trạng Thái Đăng Bài" Vào Sheet
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowConfigPanel(!showConfigPanel)}
                            style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: showConfigPanel ? '#0f172a' : '#ffffff',
                                color: showConfigPanel ? '#ffffff' : '#334155',
                                border: '1px solid #cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                            }}
                        >
                            ⚙️ Cấu Hình Trường Bắt Buộc
                        </button>
                    </div>
                </div>

                {/* Config Panel Drawer */}
                {showConfigPanel && (
                    <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Row 1: Preset Selection & Save Preset */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    📌 Bộ Cấu Hình Mẫu (Preset):
                                </span>
                                <select
                                    value={selectedPresetId}
                                    onChange={e => handleApplyPreset(e.target.value)}
                                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 600, color: '#334155', outline: 'none' }}
                                >
                                    <option value="">-- Chọn Preset Mẫu Cột Bắt Buộc --</option>
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>

                                {selectedPresetId && (
                                    <button
                                        type="button"
                                        onClick={(e) => handleDeletePreset(selectedPresetId, e)}
                                        style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 700 }}
                                        title="Xóa Preset này"
                                    >
                                        🗑️ Xóa Preset
                                    </button>
                                )}

                                {!showSavePresetInput ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowSavePresetInput(true)}
                                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', cursor: 'pointer' }}
                                    >
                                        💾 Lưu Cấu Hình Hiện Tại Thành Preset Mới
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type="text"
                                            placeholder="Nhập tên Preset..."
                                            value={newPresetName}
                                            onChange={e => setNewPresetName(e.target.value)}
                                            style={{ padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #93c5fd', outline: 'none' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveCurrentAsPreset}
                                            style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11.5, background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Lưu
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowSavePresetInput(false)}
                                            style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11.5, background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer' }}
                                        >
                                            Hủy
                                        </button>
                                    </div>
                                )}
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#e11d48', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={lockExportOnMissingMandatory}
                                    onChange={e => handleToggleLockExport(e.target.checked)}
                                />
                                🔒 Khóa cứng nút xuất Excel nếu thiếu trường bắt buộc
                            </label>
                        </div>

                        {/* Row 2: Select Fields Checkboxes */}
                        <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                                🛠️ Tích chọn các Cột bắt buộc phải có dữ liệu (Tự động quét từ các Sheet + Cột Tùy Chỉnh):
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', padding: '4px 2px' }}>
                                {allSheetColumns.map(def => {
                                    const isChecked = selectedMandatoryKeys.includes(def.key);
                                    const isCustom = def.key.startsWith('custom_');
                                    return (
                                        <label
                                            key={def.key}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                                background: isChecked ? '#ffe4e6' : '#ffffff',
                                                border: `1px solid ${isChecked ? '#fda4af' : '#cbd5e1'}`,
                                                color: isChecked ? '#9f1239' : '#475569', cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleMandatoryKey(def.key)}
                                            />
                                            <span>{def.label}</span>

                                            {isCustom && (
                                                <span
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const nextCustom = customColumns.filter(c => c.key !== def.key);
                                                        setCustomColumns(nextCustom);
                                                        setSelectedMandatoryKeys(prev => prev.filter(k => k !== def.key));
                                                        try {
                                                            localStorage.setItem('newland_custom_mandatory_cols', JSON.stringify(nextCustom));
                                                        } catch (err) {}
                                                    }}
                                                    style={{ color: '#991b1b', marginLeft: 4, fontWeight: 800, cursor: 'pointer' }}
                                                    title="Xóa cột tùy chỉnh này"
                                                >
                                                    ✕
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Row 3: Add Custom Column Form */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '1px dashed #cbd5e1' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                ➕ Thêm Cột Tùy Chỉnh Mới:
                            </span>
                            <input
                                type="text"
                                placeholder="Nhập tên cột (ví dụ: Bảo Hành, Xuất Xứ, Điện Áp...)"
                                value={newCustomColName}
                                onChange={e => setNewCustomColName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddCustomColumn()}
                                style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', width: 280, outline: 'none' }}
                            />
                            <button
                                type="button"
                                onClick={handleAddCustomColumn}
                                style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#0f172a', color: '#ffffff', border: 'none', cursor: 'pointer' }}
                            >
                                + Thêm Vào Danh Sách
                            </button>
                        </div>
                    </div>
                )}

                {/* Controls Bar: Filter Tabs & Search */}
                <div style={{
                    padding: '10px 20px', background: '#ffffff', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'
                }}>
                    {/* Filter Tabs */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setFilterTab('web_posted')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'web_posted' ? '#16a34a' : '#e2e8f0',
                                color: filterTab === 'web_posted' ? '#ffffff' : '#475569'
                            }}
                        >
                            🌐 Đã Đăng Web ({analyzedData.postedCount || 0}/{analyzedData.totalRowsCount || 0})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('mandatory')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'mandatory' ? '#e11d48' : '#e2e8f0',
                                color: filterTab === 'mandatory' ? '#ffffff' : '#475569'
                            }}
                        >
                            🔴 Trường Bắt Buộc ({analyzedData.mandatoryCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('duplicate_sku')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'duplicate_sku' ? '#9333ea' : '#e2e8f0',
                                color: filterTab === 'duplicate_sku' ? '#ffffff' : '#475569'
                            }}
                        >
                            🆔 Trùng Mã SP ({analyzedData.duplicateCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('image_links')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'image_links' ? '#d97706' : '#e2e8f0',
                                color: filterTab === 'image_links' ? '#ffffff' : '#475569'
                            }}
                        >
                            🖼️ Link Ảnh ({analyzedData.imgLinkErrorCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('pdf_links')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'pdf_links' ? '#b45309' : '#e2e8f0',
                                color: filterTab === 'pdf_links' ? '#ffffff' : '#475569'
                            }}
                        >
                            📄 Link File PDF ({analyzedData.pdfLinkErrorCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('meta_desc')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'meta_desc' ? '#2563eb' : '#e2e8f0',
                                color: filterTab === 'meta_desc' ? '#ffffff' : '#475569'
                            }}
                        >
                            📝 Meta Desc ({analyzedData.metaDescErrorCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('category_ids')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'category_ids' ? '#0d9488' : '#e2e8f0',
                                color: filterTab === 'category_ids' ? '#ffffff' : '#475569'
                            }}
                        >
                            🏷️ Check ID ({analyzedData.catIdErrorCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterTab('all')}
                            style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                background: filterTab === 'all' ? '#0f172a' : '#e2e8f0',
                                color: filterTab === 'all' ? '#ffffff' : '#475569'
                            }}
                        >
                            📋 Tất Cả ({analyzedData.totalIncompleteCount})
                        </button>
                    </div>

                    {/* Live Ping Button: ONLY RENDERED ON IMAGE & PDF LINK TABS */}
                    {isLinkCheckTabActive && (
                        <button
                            type="button"
                            onClick={handleRunLiveLinkCheck}
                            disabled={liveCheckLoading}
                            style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                                background: liveCheckLoading ? '#94a3b8' : 'linear-gradient(135deg, #d97706, #b45309)',
                                color: '#ffffff', border: 'none', cursor: liveCheckLoading ? 'not-allowed' : 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 4px rgba(217,119,6,0.2)'
                            }}
                            title={filterTab === 'image_links' ? 'Gửi Ping kiểm tra HTTP Status 200 tới server chứa ảnh của công ty' : 'Gửi Ping kiểm tra HTTP Status 200 và quyền chia sẻ Public của Google Drive cho file PDF'}
                        >
                            {liveCheckLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
                            {liveCheckLoading ? 'Đang Ping Kiểm Tra...' : (filterTab === 'image_links' ? '⚡ Check Live Link Ảnh Web' : '🔒 Check Live & Quyền Public PDF Drive')}
                        </button>
                    )}

                    {/* Sheet Filter & Search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', maxWidth: 400 }}>
                        <select
                            value={selectedSheetName}
                            onChange={(e) => setSelectedSheetName(e.target.value)}
                            style={{
                                padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                                fontSize: 11.5, background: '#fff', color: '#334155'
                            }}
                        >
                            <option value="ALL">🌐 Tất cả Tab Sheet ({uniqueSheetNames.length})</option>
                            {uniqueSheetNames.map(sName => (
                                <option key={sName} value={sName}>Tab: {sName}</option>
                            ))}
                        </select>

                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: '#94a3b8' }} />
                            <input
                                type="text"
                                placeholder="Tìm mã SP, tên..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '5px 8px 5px 28px', borderRadius: 6,
                                    border: '1px solid #cbd5e1', fontSize: 11.5, outline: 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Rows Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {filteredRows.length === 0 ? (
                        <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                            <CheckCircle2 size={38} style={{ margin: '0 auto 12px', color: '#10b981' }} />
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Dữ liệu đạt chuẩn! Không có cảnh báo nào trong bộ lọc này</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Bạn có thể chọn bộ lọc khác để kiểm tra thêm.</div>
                        </div>
                    ) : (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                                        <th style={{ padding: '9px 10px', width: 45, textAlign: 'center' }}>STT</th>
                                        <th style={{ padding: '9px 10px', width: 120 }}>Tab Sheet</th>
                                        <th style={{ padding: '9px 10px', width: 60, textAlign: 'center' }}>Dòng #</th>
                                        <th style={{ padding: '9px 10px', width: 200 }}>Sản Phẩm & Mã SKU</th>
                                        <th style={{ padding: '9px 10px' }}>Chi Tiết Audit & Sửa Nhanh Trường Bắt Buộc</th>
                                        <th style={{ padding: '9px 10px', width: 110, textAlign: 'center' }}>Thao Tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map((r, idx) => (
                                        <tr key={`${r.sheetName}-${r.rowIndex}`} style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: r.isMandatoryMissing ? '#fff1f2' : (r.isDuplicateSku ? '#faf5ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'))
                                        }}>
                                            <td style={{ padding: '9px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{ padding: '9px 10px', fontWeight: 600, color: '#0f172a' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Layers size={13} style={{ color: '#64748b' }} /> {r.sheetName}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                                <span style={{
                                                    background: '#e2e8f0', color: '#334155',
                                                    padding: '2px 7px', borderRadius: 6, fontWeight: 700, fontSize: 11
                                                }}>
                                                    #{r.rowIndex}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 10px' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.productName}</div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>SKU: <strong>{r.productCode}</strong></div>
                                            </td>
                                            <td style={{ padding: '9px 10px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {/* Mandatory missing tags + Inline Quick Editing */}
                                                    {(filterTab === 'all' || filterTab === 'mandatory') && r.missingMandatory.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {r.missingMandatory.map(m => {
                                                                const inputKey = `${r.sheetName}-${r.rowIndex}-${m.colIdx}`;
                                                                return (
                                                                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                        <span style={{ background: '#e11d48', color: '#ffffff', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                            🔴 Thiếu: {m.label}
                                                                        </span>
                                                                        <input
                                                                            type="text"
                                                                            placeholder={`Điền ${m.label}...`}
                                                                            value={quickInputs[inputKey] ?? ''}
                                                                            onChange={e => setQuickInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                                                            style={{ padding: '2px 8px', fontSize: 11.5, borderRadius: 4, border: '1px solid #fca5a5', background: '#ffffff', color: '#0f172a', width: 170, outline: 'none' }}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const val = quickInputs[inputKey];
                                                                                if (!val || !val.trim()) return alert('Vui lòng nhập nội dung!');
                                                                                const targetSheet = sheets.find(s => s.name === r.sheetName);
                                                                                if (targetSheet && targetSheet.data[r.rowIndex - 1]) {
                                                                                    while (targetSheet.data[r.rowIndex - 1].length <= m.colIdx) {
                                                                                        targetSheet.data[r.rowIndex - 1].push('');
                                                                                    }
                                                                                    targetSheet.data[r.rowIndex - 1][m.colIdx] = val.trim();
                                                                                }
                                                                                if (onUpdateCell) {
                                                                                    onUpdateCell(r.sheetName, r.rowIndex, m.colIdx, val.trim());
                                                                                }
                                                                                setQuickInputs(prev => {
                                                                                    const copy = { ...prev };
                                                                                    delete copy[inputKey];
                                                                                    return copy;
                                                                                });
                                                                            }}
                                                                            style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                                                        >
                                                                            💾 Điền
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Web Posted Status */}
                                                    {(filterTab === 'all' || filterTab === 'web_posted') && (
                                                        <div>
                                                            {r.isWebPosted ? (
                                                                <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    ✅ Đã Đăng Web
                                                                </span>
                                                            ) : (
                                                                <span style={{ background: '#fefce8', color: '#b45309', border: '1px solid #fef08a', padding: '2px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                                    ⏳ Chưa Đăng Web
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Duplicate SKU details */}
                                                    {(filterTab === 'all' || filterTab === 'duplicate_sku') && r.isDuplicateSku && (
                                                        <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', padding: '3px 8px', borderRadius: 6, fontSize: 11, color: '#6b21a8', fontWeight: 600 }}>
                                                            🆔 <strong>TRÙNG MÃ SP ("{r.productCode}")</strong>: Trùng với {r.duplicateOtherRows.map(d => `${d.sheetName} Dòng #${d.rowIndex}`).join(', ')}
                                                        </div>
                                                    )}

                                                    {/* Image link issues & Live Ping Results */}
                                                    {(filterTab === 'all' || filterTab === 'image_links' || filterTab === 'media_links') && (r.missingImgLinks.length > 0 || (r.rawImgUrl && liveCheckResults[r.rawImgUrl])) && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                {r.missingImgLinks.map(m => (
                                                                    <span key={m.key} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                                        🖼️ {m.label}
                                                                    </span>
                                                                ))}
                                                            </div>

                                                            {r.rawImgUrl && liveCheckResults[r.rawImgUrl] && (
                                                                <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    {liveCheckResults[r.rawImgUrl].status === 'ok' ? (
                                                                        <span style={{ color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🟢 Ảnh: HTTP 200 OK (Link Sống)
                                                                        </span>
                                                                    ) : liveCheckResults[r.rawImgUrl].status === 'private_drive' ? (
                                                                        <span style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🔒 Ảnh: Google Drive Chưa Mở Quyền Public
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🔴 Ảnh: {liveCheckResults[r.rawImgUrl].message}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* PDF link issues & Live Ping Results */}
                                                    {(filterTab === 'all' || filterTab === 'pdf_links' || filterTab === 'media_links') && (r.missingPdfLinks.length > 0 || (r.rawPdfUrl && liveCheckResults[r.rawPdfUrl])) && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                {r.missingPdfLinks.map(m => (
                                                                    <span key={m.key} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                                        📄 {m.label}
                                                                    </span>
                                                                ))}
                                                            </div>

                                                            {r.rawPdfUrl && liveCheckResults[r.rawPdfUrl] && (
                                                                <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    {liveCheckResults[r.rawPdfUrl].status === 'ok' ? (
                                                                        <span style={{ color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🟢 PDF: HTTP 200 OK (File Sống)
                                                                        </span>
                                                                    ) : liveCheckResults[r.rawPdfUrl].status === 'private_drive' ? (
                                                                        <span style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🔒 PDF: Google Drive Chưa Mở Quyền Public
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: 4 }}>
                                                                            🔴 PDF: {liveCheckResults[r.rawPdfUrl].message}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Meta Desc issues */}
                                                    {(filterTab === 'all' || filterTab === 'meta_desc') && r.metaDescIssues.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                            {r.metaDescIssues.map(m => (
                                                                <span key={m.key} style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                                    📝 {m.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Cat & Brand ID issues */}
                                                    {(filterTab === 'all' || filterTab === 'category_ids') && r.catBrandIssues.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                            {r.catBrandIssues.map(m => (
                                                                <span key={m.key} style={{ background: '#ccfbf1', color: '#115e59', border: '1px solid #99f6e4', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                                    🏷️ {m.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                                {onNavigateToRow ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onClose();
                                                            onNavigateToRow(r.sheetName, r.rowIndex);
                                                        }}
                                                        style={{
                                                            background: '#2563eb', color: '#ffffff', border: 'none',
                                                            borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 700,
                                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                                                        }}
                                                    >
                                                        📍 Đến dòng <ArrowRight size={11} />
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Dòng #{r.rowIndex}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div style={{
                    padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        🔴 <strong>Trường đỏ bắt buộc</strong>: Mã SP (Cột A), Tên SP (Cột B), ID Danh Mục (Cột R). | 📝 <strong>Meta Description</strong> (Cột H: mo_ta tối đa 160 ký tự).
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1',
                            background: '#ffffff', color: '#334155', fontWeight: 700, fontSize: 12.5, cursor: 'pointer'
                        }}
                    >
                        Đóng Màn Hình
                    </button>
                </div>
            </div>
        </div>
    );
}
