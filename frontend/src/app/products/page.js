'use client';
import { useState, useEffect, Suspense, useMemo, useRef, useCallback } from 'react';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import ImportSheetModal from '@/components/ImportSheetModal';
import AiAssistantModal from '@/components/AiAssistantModal';
import CrawlerToSheetModal from '@/components/CrawlerToSheetModal';
import ExportExcelModal from '@/components/ExportExcelModal';
import GoogleDriveModal from '@/components/GoogleDriveModal';
import ProfileChecklistModal from '@/components/ProfileChecklistModal';
import IncompleteRowsModal from '@/components/IncompleteRowsModal';
import { 
    Search, 
    Download, 
    CheckSquare, 
    ExternalLink, 
    Eye, 
    Package, 
    X, 
    Filter,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Play,
    Bot,
    FileSpreadsheet,
    Layers,
    HardDrive,
    Pin,

    Edit3,
    Merge,
    Copy,
    Check,
    CheckCircle2,
    Plus,
    Trash2,
    Upload,
    Square,
    Scissors,
    Clipboard,
    Eraser,
    Undo2,
    Redo2,
    History,
    Send,
    Clock,
    XCircle,
    AlertTriangle,
    ShieldAlert,
    ChevronDown,
    FileText,
    Settings,
    RefreshCw,
    Sparkles,
    Globe
} from 'lucide-react';

const STANDARD_31_COLUMNS = [
    { id: 'col-A',  colLetter: 'A', label: 'Cột A (ma_san_pham)' },
    { id: 'col-B',  colLetter: 'B', label: 'Cột B (ten_san_pham)' },
    { id: 'col-C',  colLetter: 'C', label: 'Cột C (ten_san_pham_en)' },
    { id: 'col-D',  colLetter: 'D', label: 'Cột D (url)' },
    { id: 'col-E',  colLetter: 'E', label: 'Cột E (url_en)' },
    { id: 'col-F',  colLetter: 'F', label: 'Cột F (tieu_de_trang)' },
    { id: 'col-G',  colLetter: 'G', label: 'Cột G (tieu_de_trang_en)' },
    { id: 'col-H',  colLetter: 'H', label: 'Cột H (mo_ta)' },
    { id: 'col-I',  colLetter: 'I', label: 'Cột I (mo_ta_en)' },
    { id: 'col-J',  colLetter: 'J', label: 'Cột J (gia)' },
    { id: 'col-K',  colLetter: 'K', label: 'Cột K (khuyen_mai)' },
    { id: 'col-L',  colLetter: 'L', label: 'Cột L (anh_dai_dien)' },
    { id: 'col-M',  colLetter: 'M', label: 'Cột M (anh_1)' },
    { id: 'col-N',  colLetter: 'N', label: 'Cột N (anh_2)' },
    { id: 'col-O',  colLetter: 'O', label: 'Cột O (anh_3)' },
    { id: 'col-P',  colLetter: 'P', label: 'Cột P (anh_4)' },
    { id: 'col-Q',  colLetter: 'Q', label: 'Cột Q (nhan)' },
    { id: 'col-R',  colLetter: 'R', label: 'Cột R (danh_muc_id)' },
    { id: 'col-S',  colLetter: 'S', label: 'Cột S (thuong_hieu_id)' },
    { id: 'col-T',  colLetter: 'T', label: 'Cột T (noi_dung)' },
    { id: 'col-U',  colLetter: 'U', label: 'Cột U (noi_dung_en)' },
    { id: 'col-V',  colLetter: 'V', label: 'Cột V (tl_hdsd_tieu_de)' },
    { id: 'col-W',  colLetter: 'W', label: 'Cột W (tl_hdsd_link)' },
    { id: 'col-X',  colLetter: 'X', label: 'Cột X (tl_cad_tieu_de)' },
    { id: 'col-Y',  colLetter: 'Y', label: 'Cột Y (tl_cad_link)' },
    { id: 'col-Z',  colLetter: 'Z', label: 'Cột Z (tl_chungchi_tieu_de)' },
    { id: 'col-AA', colLetter: 'AA', label: 'Cột AA (tl_chungchi_link)' },
    { id: 'col-AB', colLetter: 'AB', label: 'Cột AB (tl_phanmem_tieu_de)' },
    { id: 'col-AC', colLetter: 'AC', label: 'Cột AC (tl_phanmem_link)' },
    { id: 'col-AD', colLetter: 'AD', label: 'Cột AD (tl_tailieu_tieu_de)' },
    { id: 'col-AE', colLetter: 'AE', label: 'Cột AE (tl_tailieu_link)' }
];

const DEFAULT_HAR_FIELD_MAPPINGS = {
    model: 'col-A',
    name: 'col-B',
    detail_url: 'col-D',
    description: 'col-H',
    price: 'col-J',
    image_url: 'col-L',
    category: 'col-R',
    brand: 'col-S',
    specs_json: 'col-T',
    doc_title: 'col-V',
    document_url: 'col-W'
};

function ProductsContent() {
    const { user, hasPermission } = useAuth();
    const searchParams = useSearchParams();
    const profileSlug = searchParams?.get('profile') || 'newland';
    const [currentProfile, setCurrentProfile] = useState(null);
    const [profilesList, setProfilesList] = useState([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);

    // Crawler to Sheet conversion state
    const [showCrawlerToSheetModal, setShowCrawlerToSheetModal] = useState(false);
    const [selectedCrawlerProductIds, setSelectedCrawlerProductIds] = useState([]);

    const toggleSelectCrawlerProduct = (id) => {
        setSelectedCrawlerProductIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAllCrawlerProducts = () => {
        if (selectedCrawlerProductIds.length === products.length) {
            setSelectedCrawlerProductIds([]);
        } else {
            setSelectedCrawlerProductIds(products.map(p => p.id));
        }
    };

    // Gating permissions
    if (!hasPermission('products')) {
        return (
            <div className="page-content">
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                    Access denied
                </div>
            </div>
        );
    }

    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
    const limit = 10;
    
    // Modal & Toast
    const [showModal, setShowModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [toasts, setToasts] = useState([]);

    // Custom Double-Check Config Modals State
    const [showSitemapModal, setShowSitemapModal] = useState(false);
    const [showTargetUrlModal, setShowTargetUrlModal] = useState(false);
    const [inputTargetUrl, setInputTargetUrl] = useState('');
    const [inputSitemapUrl, setInputSitemapUrl] = useState('');
    const [activeSitemapTab, setActiveSitemapTab] = useState('file');

    // Posting History & Schedule Modal State
    const [showPostingHistoryModal, setShowPostingHistoryModal] = useState(false);
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPageSize, setHistoryPageSize] = useState('200');



    const toast = (msg, type = 'success') => {
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    const handleCrawlerToSheetSuccess = async ({ sheets: updatedSheets, targetTabName, convertedCount }) => {
        setProfileSheets(updatedSheets);
        setActiveSheetTabName(targetTabName);
        setViewMode('sheet');
        toast(`🎉 Đã chuyển ${convertedCount} sản phẩm sang Tab Sheet "${targetTabName}"!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save converted sheet:', err);
        }
    };

    const fetchCategories = async () => {
        try {
            const data = await fetchApi(`/api/products/categories?profile=${profileSlug}`);
            if (data) setCategories(data);
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const data = await fetchApi(`/api/products?search=${searchTerm}&category=${selectedCategory}&limit=${limit}&page=${currentPage}&profile=${profileSlug}`);
            if (data) {
                setProducts(data.items);
                setTotalProducts(data.total);
                setTotalPages(Math.ceil(data.total / limit) || 1);
            }
        } catch (err) {
            console.error('Error fetching products:', err);
            toast('Failed to load products list.', 'danger');
        } finally {
            setLoading(false);
        }
    };

    // Profile Sheet Data State
    const [profileSheets, setProfileSheets] = useState([]);
    const [activeSheetTabName, setActiveSheetTabName] = useState('');
    const [viewMode, setViewMode] = useState('sheet'); // 'sheet' | 'products' | 'har'
    const [pageRowLimit, setPageRowLimit] = useState(100);

    // Total sheet rows or products count
    const totalProductsCount = useMemo(() => {
        if (profileSheets && profileSheets.length > 0) {
            let sum = 0;
            profileSheets.forEach(s => {
                if (Array.isArray(s.data) && s.data.length > 1) {
                    sum += (s.data.length - 1);
                }
            });
            if (sum > 0) return sum;
        }
        return totalProducts || 0;
    }, [profileSheets, totalProducts]);

    // Custom posting logs state
    const [customPostingLogs, setCustomPostingLogs] = useState(null);

    // Posting logs & summary statistics (Posted - Pending - Error)
    const { postedCount, pendingCount, postingErrorCount, filteredHistoryLogs } = useMemo(() => {
        let logs = customPostingLogs;
        if (!logs) {
            try {
                const saved = localStorage.getItem(`posting_logs_${profileSlug}`);
                if (saved) logs = JSON.parse(saved);
            } catch (e) {}
        }
        if (!logs) logs = [];

        // Build set of current product models/names across all active sheet tabs
        const currentKeys = new Set();
        (profileSheets || []).forEach(s => {
            const rows = s.data || [];
            if (!Array.isArray(rows) || rows.length < 2) return;
            const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
            let modelIdx = headers.findIndex(h => h.includes('model') || h.includes('mã') || h.includes('sku') || h.includes('part number'));
            if (modelIdx === -1) modelIdx = 0;
            let nameIdx = headers.findIndex(h => h.includes('tên') || h.includes('name') || h.includes('tiêu đề') || h.includes('title'));
            if (nameIdx === -1) nameIdx = 1;

            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!Array.isArray(row)) continue;
                const model = String(row[modelIdx] || row[0] || '').trim().toLowerCase();
                const name = String(row[nameIdx] || row[1] || '').trim().toLowerCase();
                if (model) currentKeys.add(model);
                if (name) currentKeys.add(name);
            }
        });

        // Filter logs so only products that exist in current profileSheets are kept
        if (currentKeys.size > 0 && logs.length > 0) {
            logs = logs.filter(l => {
                const mKey = (l.model || '').trim().toLowerCase();
                const nKey = (l.name || '').trim().toLowerCase();
                return (mKey && currentKeys.has(mKey)) || (nKey && currentKeys.has(nKey));
            });
        }

        const posted = logs.filter(l => l.status === 'posted').length;
        const webPostingErr = logs.filter(l => l.status === 'error').length;

        // Collect all models and product names that are successfully posted on Web
        const postedModels = new Set();
        const postedNames = new Set();
        logs.filter(l => l.status === 'posted').forEach(l => {
            const m = (l.model || '').trim().toLowerCase();
            const n = (l.name || '').trim().toLowerCase();
            if (m) postedModels.add(m);
            if (n) postedNames.add(n);
        });

        // Audit & Check Status Error Scan across all profileSheets
        const sheetErrorKeys = new Set();
        const codeAliases = ['ma_san_pham', 'mã sản phẩm', 'mã sp', 'ma sp', 'sku', 'model', 'part_number'];
        const nameAliases = ['ten_san_pham', 'tên sản phẩm', 'tên sp', 'ten sp', 'tiêu đề', 'title', 'name'];
        const catAliases = ['danh_muc_id', 'danh mục id', 'category id', 'danh mục', 'danh_muc', 'category', 'id cat', 'cat id'];

        // Track duplicate SKUs across sheets
        const skuMap = {};
        (profileSheets || []).forEach(s => {
            if (!s.data || !Array.isArray(s.data) || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());
            let codeIdx = headers.findIndex(h => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!Array.isArray(row) || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
                const codeVal = String(row[codeIdx] || '').trim().toUpperCase();
                if (codeVal) {
                    skuMap[codeVal] = (skuMap[codeVal] || 0) + 1;
                }
            }
        });

        (profileSheets || []).forEach((s, sIdx) => {
            if (!s.data || !Array.isArray(s.data) || s.data.length <= 1) return;
            const headers = (s.data[0] || []).map(h => String(h || '').trim().toLowerCase());

            let codeIdx = headers.findIndex(h => codeAliases.some(a => h === a || h.includes(a)));
            if (codeIdx === -1) codeIdx = 0;

            let nameIdx = headers.findIndex(h => nameAliases.some(a => h === a || h.includes(a)));
            if (nameIdx === -1) nameIdx = 1;

            let catIdx = headers.findIndex(h => catAliases.some(a => h === a || h.includes(a)));
            if (catIdx === -1 && headers.length > 17) catIdx = 17;

            let statusColIdx = headers.findIndex(h => {
                const norm = String(h || '').trim().toLowerCase();
                return norm === 'check status' || norm === 'trạng thái audit' || norm === 'status audit' || norm === 'check_status';
            });

            for (let r = 1; r < s.data.length; r++) {
                const row = s.data[r];
                if (!Array.isArray(row) || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;

                const valCode = String(row[codeIdx] || '').trim();
                const valName = String(row[nameIdx] || '').trim();
                const valCat = catIdx >= 0 && catIdx < row.length ? String(row[catIdx] || '').trim() : '';
                const statusVal = statusColIdx >= 0 && statusColIdx < row.length ? String(row[statusColIdx] || '').trim() : '';

                // If product is already successfully posted, skip error check completely!
                const isAlreadyPosted = (valCode && postedModels.has(valCode.toLowerCase())) ||
                                        (valName && postedNames.has(valName.toLowerCase()));
                if (isAlreadyPosted) {
                    continue;
                }

                let isError = false;

                // 1. Explicit CHECK STATUS column contains error
                if (statusVal) {
                    const sLower = statusVal.toLowerCase();
                    if (statusVal.startsWith('❌') || statusVal.startsWith('🔴') || sLower.includes('lỗi') || sLower.includes('thiếu') || sLower.includes('trùng') || sLower.includes('phải là số') || sLower.includes('id (') || sLower.includes('meta desc (')) {
                        isError = true;
                    }
                }

                // 2. Missing mandatory fields or Duplicate SKU
                if (!isError) {
                    if (!valCode || !valName || !valCat) {
                        isError = true;
                    } else if (valCode && skuMap[valCode.toUpperCase()] > 1) {
                        isError = true;
                    }
                }

                if (isError) {
                    const uKey = valCode ? valCode.toUpperCase() : `${s.name}_r_${r}`;
                    sheetErrorKeys.add(uKey);
                }
            }
        });

        // Add web posting error products to error keys set
        logs.filter(l => l.status === 'error').forEach(l => {
            const mKey = (l.model || '').trim().toUpperCase();
            if (mKey) sheetErrorKeys.add(mKey);
        });

        const totalErrCount = sheetErrorKeys.size;
        const total = totalProductsCount;
        const pending = Math.max(0, total - posted);

        let filtered = logs;
        if (historyStatusFilter !== 'all') {
            filtered = filtered.filter(l => l.status === historyStatusFilter);
        }
        if (historySearchTerm.trim()) {
            const term = historySearchTerm.toLowerCase();
            filtered = filtered.filter(l =>
                (l.name && l.name.toLowerCase().includes(term)) ||
                (l.model && l.model.toLowerCase().includes(term)) ||
                (l.platform && l.platform.toLowerCase().includes(term)) ||
                (l.posted_at && l.posted_at.toLowerCase().includes(term))
            );
        }

        return {
            postedCount: posted,
            pendingCount: pending,
            postingErrorCount: totalErrCount,
            filteredHistoryLogs: filtered
        };
    }, [customPostingLogs, profileSlug, profileSheets, totalProductsCount, historyStatusFilter, historySearchTerm]);

    const paginatedHistoryLogs = useMemo(() => {
        if (historyPageSize === 'all') return filteredHistoryLogs;
        const size = parseInt(historyPageSize) || 200;
        const start = (historyPage - 1) * size;
        return filteredHistoryLogs.slice(start, start + size);
    }, [filteredHistoryLogs, historyPage, historyPageSize]);

    const historyTotalPages = useMemo(() => {
        if (historyPageSize === 'all' || !filteredHistoryLogs.length) return 1;
        const size = parseInt(historyPageSize) || 200;
        return Math.ceil(filteredHistoryLogs.length / size);
    }, [filteredHistoryLogs, historyPageSize]);

    // HAR Analysis Report state
    const [harReport, setHarReport] = useState(null);
    const [sitemapInfo, setSitemapInfo] = useState(null);
    const [harReportLoading, setHarReportLoading] = useState(false);
    const [harFieldMappings, setHarFieldMappings] = useState(DEFAULT_HAR_FIELD_MAPPINGS);
    const [savingHarMapping, setSavingHarMapping] = useState(false);

    // Extraction Schema state
    const SCHEMA_FIELD_LABELS = {
        name:         '📝 Tên Sản Phẩm',
        model:        '🔢 Model / Mã SP',
        image_url:    '🖼️ Hình Ảnh',
        description:  '📖 Mô Tả SP',
        specs_json:   '📊 Thông Số Kỹ Thuật',
        document_url: '📄 Link Tài Liệu / PDF',
        detail_url:   '🌐 Link Sản Phẩm',
        category:     '📂 Danh Mục',
        series:       '📌 Series / Dòng SP',
        brand:        '🏷️ Hãng / Thương Hiệu',
        price:        '💰 Giá (nếu có)',
    };
    const SCHEMA_FIELD_KEYS = Object.keys(SCHEMA_FIELD_LABELS);
    const SCHEMA_TYPES = [
        { value: 'skip',       label: '— Bỏ Qua —' },
        { value: 'css',        label: 'CSS Selector' },
        { value: 'xpath',      label: 'XPath (Copy XPath)' },
        { value: 'xpath_full', label: 'Full XPath (Copy full XPath)' },
        { value: 'jsonld',     label: 'JSON-LD (Structured Data)' },
        { value: 'jsonpath',   label: 'JSON Path (Embedded JSON)' },
        { value: 'meta',       label: 'Meta Tag (name/property)' },
        { value: 'regex',      label: 'Regex (capture group 1)' },
    ];
    const SCHEMA_ATTRS = [
        { value: 'text',             label: 'Nội dung text' },
        { value: 'html',             label: 'HTML bên trong' },
        { value: 'href',             label: 'Link href (1 link đầu)' },
        { value: 'href_all',         label: '🔗 Tất cả link href (danh sách)' },
        { value: 'links_with_title', label: '📋 Danh sách Tên + Link (PDF/Docs)' },
        { value: 'src',              label: 'Link ảnh src (1 ảnh đầu)' },
        { value: 'src_all',          label: '🖼️ Tất cả link ảnh (danh sách)' },
        { value: 'text_all',         label: '📝 Tất cả text (danh sách)' },
        { value: 'content',          label: 'Thuộc tính content' },
        { value: 'alt',              label: 'Thuộc tính alt' },
        { value: 'value',            label: 'Thuộc tính value' },
    ];
    const [extractionSchema, setExtractionSchema] = useState({});
    const [schemaLoaded, setSchemaLoaded] = useState(false);
    const [savingSchema, setSavingSchema] = useState(false);
    // Custom extra fields (beyond defaults)
    const [customSchemaFields, setCustomSchemaFields] = useState([]); // [{key, label}]
    const [showAddFieldModal, setShowAddFieldModal] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldKey, setNewFieldKey] = useState('');
    const [hiddenDefaultFields, setHiddenDefaultFields] = useState([]); // keys of hidden default fields
    // Test URL
    const [schemaTestUrl, setSchemaTestUrl] = useState('');
    const [schemaTestResult, setSchemaTestResult] = useState(null);
    const [schemaTestLoading, setSchemaTestLoading] = useState(false);
    const [schemaTestError, setSchemaTestError] = useState('');
    // Crawl
    const [crawlSchemaRunning, setCrawlSchemaRunning] = useState(false);
    const [crawlSchemaProgress, setCrawlSchemaProgress] = useState(null);
    const [crawlSchemaOptions, setCrawlSchemaOptions] = useState({ maxUrls: 500, concurrency: 3, delay: 300, useBrowser: true });
    const crawlPollRef = useRef(null);

    const fetchExtractionSchema = async (slug) => {
        try {
            const data = await fetchApi(`/api/products/profiles/${slug}/schema`);
            if (data?.schema) {
                const { _customFields, _hiddenDefaults, ...schemaRules } = data.schema;
                setExtractionSchema(schemaRules || {});
                setCustomSchemaFields(Array.isArray(_customFields) ? _customFields : []);
                setHiddenDefaultFields(Array.isArray(_hiddenDefaults) ? _hiddenDefaults : []);
            } else {
                setExtractionSchema({});
                setCustomSchemaFields([]);
                setHiddenDefaultFields([]);
            }
            setSchemaLoaded(true);
        } catch (e) {
            setSchemaLoaded(true);
        }
    };

    const handleSaveSchema = async () => {
        try {
            setSavingSchema(true);
            const schemaToSave = {
                ...extractionSchema,
                ...(customSchemaFields.length > 0 ? { _customFields: customSchemaFields } : {}),
                ...(hiddenDefaultFields.length > 0 ? { _hiddenDefaults: hiddenDefaultFields } : {})
            };
            await fetchApi(`/api/products/profiles/${profileSlug}/schema`, {
                method: 'POST',
                body: JSON.stringify({ schema: schemaToSave })
            });
            toast('✅ Đã lưu Schema trích xuất thành công!', 'success');
        } catch (e) {
            toast('❌ ' + (e.message || 'Lỗi khi lưu Schema'), 'danger');
        } finally {
            setSavingSchema(false);
        }
    };

    const handleAddCustomField = () => {
        const label = newFieldLabel.trim();
        const key = (newFieldKey.trim() || label.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')).replace(/^_+|_+$/g, '');
        if (!label || !key) { toast('⚠️ Nhập nhãn trường dữ liệu!', 'warning'); return; }
        const allKeys = [...SCHEMA_FIELD_KEYS, ...customSchemaFields.map(f => f.key)];
        if (allKeys.includes(key)) { toast('⚠️ Key "' + key + '" đã tồn tại!', 'warning'); return; }
        setCustomSchemaFields(prev => [...prev, { key, label }]);
        setNewFieldLabel('');
        setNewFieldKey('');
        setShowAddFieldModal(false);
        toast('✅ Đã thêm trường "' + label + '"', 'success');
    };

    const handleDeleteCustomField = (key) => {
        setCustomSchemaFields(prev => prev.filter(f => f.key !== key));
        setExtractionSchema(prev => { const n = { ...prev }; delete n[key]; return n; });
        toast('🗑️ Đã xóa trường "' + key + '"', 'success');
    };

    const handleDeleteDefaultField = (fieldKey) => {
        const fieldLabel = SCHEMA_FIELD_LABELS[fieldKey] || fieldKey;
        const confirmed = window.confirm(
            `⚠️ CẢNH BÁO: Xóa trường "${fieldLabel}" khỏi schema!\n\n• Trường này sẽ bị xóa khỏi bảng Schema của profile này.\n• Profile khác hoặc khi tạo profile mới vẫn có đầy đủ các trường mặc định.\n• Dữ liệu sản phẩm cũ đã crawl trong database không bị mất.\n• Bạn có thể khôi phục lại bất kỳ lúc nào bằng nút "Khôi phục mặc định".\n\nBạn có chắc chắn muốn xóa không?`
        );
        if (!confirmed) return;
        setHiddenDefaultFields(prev => [...prev, fieldKey]);
        setExtractionSchema(prev => {
            const n = { ...prev };
            delete n[fieldKey];
            return n;
        });
        toast('🗑️ Đã xóa trường "' + fieldLabel + '" khỏi schema (Nhớ bấm Lưu Schema)', 'success');
    };

    const handleRestoreDefaultField = (fieldKey) => {
        setHiddenDefaultFields(prev => prev.filter(k => k !== fieldKey));
        toast('✅ Đã khôi phục trường "' + (SCHEMA_FIELD_LABELS[fieldKey] || fieldKey) + '"', 'success');
    };

    const handleTestSchema = async () => {
        if (!schemaTestUrl || !schemaTestUrl.startsWith('http')) {
            toast('⚠️ Nhập URL hợp lệ bắt đầu bằng http(s)://', 'warning');
            return;
        }
        const activeSchema = Object.fromEntries(
            Object.entries(extractionSchema).filter(([, rule]) => rule?.type && rule.type !== 'skip')
        );
        if (Object.keys(activeSchema).length === 0) {
            toast('⚠️ Chưa định nghĩa rule nào trong Schema. Nhập ít nhất 1 field.', 'warning');
            return;
        }
        setSchemaTestLoading(true);
        setSchemaTestResult(null);
        setSchemaTestError('');
        try {
            const res = await fetchApi(`/api/products/profiles/${profileSlug}/schema/test`, {
                method: 'POST',
                body: JSON.stringify({ url: schemaTestUrl, schema: activeSchema })
            });
            if (res?.success) {
                setSchemaTestResult(res.preview);
            } else {
                setSchemaTestError(res?.error || 'Lỗi không xác định');
            }
        } catch (e) {
            setSchemaTestError(e.message || 'Lỗi kết nối server');
        } finally {
            setSchemaTestLoading(false);
        }
    };

    const startCrawlSchema = async () => {
        try {
            const res = await fetchApi(`/api/products/profiles/${profileSlug}/crawl-schema`, {
                method: 'POST',
                body: JSON.stringify(crawlSchemaOptions)
            });
            if (res?.success) {
                setCrawlSchemaRunning(true);
                setCrawlSchemaProgress({ running: true, processed: 0, total: 0, found: 0, errors: 0 });
                toast('🚀 Đã bắt đầu crawl Schema! Đang theo dõi tiến độ...', 'success');
                // Start polling
                crawlPollRef.current = setInterval(async () => {
                    try {
                        const status = await fetchApi(`/api/products/profiles/${profileSlug}/crawl-status`);
                        setCrawlSchemaProgress(status);
                        if (!status?.running && status?.done) {
                            clearInterval(crawlPollRef.current);
                            setCrawlSchemaRunning(false);
                            toast(`✅ Crawl xong! ${status.found} sản phẩm tìm thấy từ ${status.processed} URLs.`, 'success');
                            // Reload HAR report & Products list with new merged data
                            fetchHarReport(profileSlug);
                            fetchProducts();
                        }
                    } catch(e) {}
                }, 2000);
            } else {
                toast('❌ ' + (res?.error || 'Không thể bắt đầu crawl'), 'danger');
            }
        } catch (e) {
            toast('❌ ' + (e.message || 'Lỗi khi bắt đầu crawl'), 'danger');
        }
    };

    const stopCrawlSchema = async () => {
        try {
            await fetchApi(`/api/products/profiles/${profileSlug}/crawl-schema/stop`, { method: 'POST' });
            clearInterval(crawlPollRef.current);
            setCrawlSchemaRunning(false);
            toast('⏹ Đã dừng crawl.', 'info');
        } catch (e) {}
    };

    // Cleanup polling on unmount
    useEffect(() => {
        return () => { if (crawlPollRef.current) clearInterval(crawlPollRef.current); };
    }, []);

    const fetchHarReport = async (slug) => {
        setHarReportLoading(true);
        try {
            const data = await fetchApi(`/api/products/profiles/${slug}/har-report`);
            if (data?.report) {
                setHarReport(data.report);
                if (data.report.fieldMappings && Object.keys(data.report.fieldMappings).length > 0) {
                    setHarFieldMappings(data.report.fieldMappings);
                } else {
                    setHarFieldMappings(DEFAULT_HAR_FIELD_MAPPINGS);
                }
            }
        } catch (err) {
            setHarReport(null);
        } finally {
            setHarReportLoading(false);
        }
    };


    const handleSaveHarMapping = async () => {
        try {
            setSavingHarMapping(true);
            const res = await fetchApi(`/api/products/profiles/${profileSlug}/har-mapping`, {
                method: 'POST',
                body: JSON.stringify({ fieldMappings: harFieldMappings })
            });
            toast('✅ Đã lưu cấu hình gán trường HAR vào mẫu 31 cột thành công!', 'success');
            if (harReport) {
                setHarReport(prev => ({ ...prev, fieldMappings: harFieldMappings }));
            }
        } catch (err) {
            toast('❌ ' + (err.message || 'Lỗi khi lưu gán cột HAR'), 'danger');
        } finally {
            setSavingHarMapping(false);
        }
    };

    const activePageSheetData = useMemo(() => {
        return profileSheets.find(s => s.name === activeSheetTabName)?.data || [];
    }, [profileSheets, activeSheetTabName]);

    useEffect(() => {
        setPageRowLimit(100);
    }, [activeSheetTabName]);

    const fetchProfileMeta = useCallback(async (slug = profileSlug) => {
        try {
            const res = await fetchApi('/api/products/profiles');
            if (res?.profiles) {
                setProfilesList(res.profiles);
                const found = res.profiles.find(p => p.slug === slug);
                if (found) setCurrentProfile(found);
            }
        } catch (e) {}
        try {
            const sm = await fetchApi(`/api/products/profiles/${slug}/sitemap`);
            if (sm) setSitemapInfo(sm);
        } catch (e) {}
    }, [profileSlug]);

    useEffect(() => {
        fetchProfileMeta(profileSlug);
    }, [profileSlug, fetchProfileMeta]);

    useEffect(() => {
        const handleHarReady = (e) => {
            if (e.detail?.profile === profileSlug) {
                if (e.detail?.report) setHarReport(e.detail.report);
                else fetchHarReport(profileSlug);
                fetchProfileMeta(profileSlug);
                setViewMode('har');
            }
        };
        window.addEventListener('har_analysis_ready', handleHarReady);

        // Check if navigated here fresh from HAR upload via Sidebar
        try {
            const flagSlug = localStorage.getItem('open_har_tab_for');
            if (flagSlug === profileSlug) {
                localStorage.removeItem('open_har_tab_for');
                fetchHarReport(profileSlug);
                fetchProfileMeta(profileSlug);
                fetchExtractionSchema(profileSlug);
                setViewMode('har');
            }
        } catch (e) {}

        return () => window.removeEventListener('har_analysis_ready', handleHarReady);
    }, [profileSlug, fetchProfileMeta]);

    // Load schema when switching to HAR tab
    useEffect(() => {
        if (viewMode === 'har' && !schemaLoaded) {
            fetchExtractionSchema(profileSlug);
        }
    }, [viewMode, profileSlug, schemaLoaded]);

    // Reset schemaLoaded when profile changes
    useEffect(() => {
        setSchemaLoaded(false);
        setSchemaTestResult(null);
        setCrawlSchemaProgress(null);
        setCrawlSchemaRunning(false);
    }, [profileSlug]);


    const maxPageCols = useMemo(() => {
        if (!activePageSheetData.length) return 0;
        const sample = activePageSheetData.slice(0, 200);
        return sample.reduce((max, r) => Math.max(max, Array.isArray(r) ? r.length : 0), 0);
    }, [activePageSheetData]);

    // Feature 1: Freeze rows (Ghim hàng) - Default 0 because header is already pinned
    const [pageFreezeRows, setPageFreezeRows] = useState(0);


    // Google Sheets Style Data Filter State
    const [sheetSearchQuery, setSheetSearchQuery] = useState('');
    const [columnFilters, setColumnFilters] = useState({}); // { [cIdx]: string }
    const [columnSelectedValues, setColumnSelectedValues] = useState({}); // { [cIdx]: string[] }
    const [showFilterRow, setShowFilterRow] = useState(true);
    const [activeFilterDropdownCol, setActiveFilterDropdownCol] = useState(null); // cIdx
    const [dropdownSearch, setDropdownSearch] = useState('');

    // Google Sheets Multi-Row & Multi-Column Selection States
    const [selectedRowIndices, setSelectedRowIndices] = useState([]); // 0-based rIdx
    const [selectedColIndices, setSelectedColIndices] = useState([]); // 0-based cIdx
    const [isDraggingRowSelection, setIsDraggingRowSelection] = useState(false);
    const [isDraggingColSelection, setIsDraggingColSelection] = useState(false);
    const [dragStartRowIndex, setDragStartRowIndex] = useState(null);
    const [dragStartColIndex, setDragStartColIndex] = useState(null);

    // Column Sorting state
    const [columnSortState, setColumnSortState] = useState({ colIndex: null, direction: null }); // direction: 'asc' | 'desc' | null

    // Tab Context Menu & Tab Management State
    const [pageTabContextMenu, setPageTabContextMenu] = useState(null); // { x, y, tabName }
    const [renameTabTarget, setRenameTabTarget] = useState(null); // oldTabName
    const [renameTabInput, setRenameTabInput] = useState('');

    // Column Header Context Menu State
    const [pageColHeaderContextMenu, setPageColHeaderContextMenu] = useState(null); // { x, y, cIdx, currentTitle }
    const [renameColTarget, setRenameColTarget] = useState(null); // { cIdx, currentTitle }
    const [renameColInput, setRenameColInput] = useState('');

    // Helper alias for showToast
    const showToast = toast;

    // Publication Status Check State
    const [showCheckConfigModal, setShowCheckConfigModal] = useState(false);
    const [checkConfig, setCheckConfig] = useState({ mode: 'sitemap', sitemapUrl: '', apiUrl: '', consumerKey: '', consumerSecret: '' });
    const [isCheckingPublication, setIsCheckingPublication] = useState(false);

    const handleLoadCheckConfig = async () => {
        if (!profileSlug) return;
        const defaultSitemap = (profileSlug === 'newland' || profileSlug === 'default') ? 'https://daco.vn/sitemap.xml' : '';
        try {
            const cached = localStorage.getItem(`check_config_${profileSlug}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed) {
                    setCheckConfig({
                        mode: parsed.mode || 'sitemap',
                        sitemapUrl: parsed.sitemapUrl || defaultSitemap,
                        apiUrl: parsed.apiUrl || '',
                        consumerKey: parsed.consumerKey || '',
                        consumerSecret: parsed.consumerSecret || '',
                        uploadedFileName: parsed.uploadedFileName || '',
                        jsonContent: parsed.jsonContent || ''
                    });
                }
            } else if (defaultSitemap) {
                setCheckConfig(prev => ({
                    ...prev,
                    sitemapUrl: prev.sitemapUrl || defaultSitemap
                }));
            }
        } catch (e) {}

        try {
            const res = await fetchApi(`/api/products/profiles/${profileSlug}/check-config`);
            if (res?.success && res.data) {
                setCheckConfig(prev => ({
                    mode: res.data.mode || prev.mode || 'sitemap',
                    sitemapUrl: res.data.sitemapUrl || prev.sitemapUrl || currentProfile?.sitemap_url || currentProfile?.target_url || defaultSitemap,
                    apiUrl: res.data.apiUrl || prev.apiUrl || '',
                    consumerKey: res.data.consumerKey || prev.consumerKey || '',
                    consumerSecret: res.data.consumerSecret || prev.consumerSecret || '',
                    uploadedFileName: prev.uploadedFileName || '',
                    jsonContent: prev.jsonContent || ''
                }));
            }
        } catch (e) {}
    };

    const handleOpenCheckConfigModal = () => {
        handleLoadCheckConfig();
        setShowCheckConfigModal(true);
    };

    const handleSaveCheckConfig = async () => {
        if (!profileSlug) return;
        try {
            localStorage.setItem(`check_config_${profileSlug}`, JSON.stringify(checkConfig));
        } catch (e) {}

        try {
            await fetchApi(`/api/products/profiles/${profileSlug}/check-config`, {
                method: 'POST',
                body: JSON.stringify(checkConfig)
            });
        } catch (e) {}

        toast('✅ Đã lưu Cấu Hình Kiểm Tra Đăng Bài!', 'success');
        setShowCheckConfigModal(false);
    };

    const handleRunPublicationCheck = async (forceRefresh = false) => {
        if (!profileSlug) return;
        setIsCheckingPublication(true);
        try {
            const defaultSitemap = (profileSlug === 'newland' || profileSlug === 'default') ? 'https://daco.vn/sitemap.xml' : '';
            const effectiveSitemapUrl = checkConfig.sitemapUrl || currentProfile?.sitemap_url || currentProfile?.target_url || defaultSitemap;
            const configToSend = {
                ...checkConfig,
                sitemapUrl: effectiveSitemapUrl,
                refresh: Boolean(forceRefresh)
            };

            let res = null;
            try {
                res = await fetchApi(`/api/products/profiles/${profileSlug}/check-publication-status`, {
                    method: 'POST',
                    body: JSON.stringify(configToSend)
                });
            } catch (err) {
                console.warn('Publication check API error:', err);
            }

            let scannedLogs = null;
            if (res?.success && Array.isArray(res.logs)) {
                scannedLogs = res.logs;
            } else if (res && !res.success) {
                toast(res.error || '❌ Lỗi khi kiểm tra đăng bài!', 'danger');
                return;
            } else {
                // Client-side scanning fallback
                const sheets = profileSheets || [];
                let productItems = [];
                sheets.forEach(sheet => {
                    const rows = sheet.data || [];
                    if (rows.length < 2) return;
                    const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
                    let modelColIdx = headers.findIndex(h => h.includes('model') || h.includes('mã') || h.includes('sku') || h.includes('part number'));
                    if (modelColIdx === -1) modelColIdx = 0;

                    let nameColIdx = headers.findIndex(h => h.includes('tên') || h.includes('name') || h.includes('tiêu đề') || h.includes('title'));
                    if (nameColIdx === -1) nameColIdx = 1;

                    let urlColIdx = headers.findIndex(h => h === 'url' || h.includes('đường dẫn') || h.includes('slug') || h.includes('link'));

                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        if (!Array.isArray(row)) continue;
                        const model = String(row[modelColIdx] || row[0] || row[1] || '').trim();
                        const name = String(row[nameColIdx] || row[1] || row[0] || '').trim();
                        const customUrl = urlColIdx !== -1 ? String(row[urlColIdx] || '').trim() : '';
                        if (model || name) {
                            productItems.push({ rowIdx: r, model: model || name, name: name || model, customUrl });
                        }
                    }
                });

                if (checkConfig.mode === 'sitemap') {
                    let targetSitemapUrl = effectiveSitemapUrl;
                    if (targetSitemapUrl && !targetSitemapUrl.endsWith('.xml') && !targetSitemapUrl.includes('sitemap')) {
                        targetSitemapUrl = targetSitemapUrl.replace(/\/$/, '') + '/sitemap.xml';
                    }
                    let xmlText = currentProfile?.sitemap_xml || '';
                    if (targetSitemapUrl && !xmlText) {
                        try {
                            const proxyRes = await fetchApi(`/api/products/proxy-sitemap?url=${encodeURIComponent(targetSitemapUrl)}`);
                            if (proxyRes?.success && proxyRes.xmlText) {
                                xmlText = proxyRes.xmlText;
                            }
                        } catch (e) {
                            xmlText = '';
                        }
                    }
                    const locMatches = xmlText ? (xmlText.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi) || []) : [];
                    const foundUrls = locMatches.map(m => m.replace(/<\/?loc>/gi, '').trim());
                    scannedLogs = productItems.map(p => {
                        const candidates = [p.customUrl, p.model, p.name].filter(Boolean);
                        let isFound = false;
                        let matchedLiveUrl = '';
                        for (const cand of candidates) {
                            const cLower = cand.toLowerCase().trim();
                            const hyphenSlug = cLower.replace(/[^a-z0-9]+/g, '-');
                            const underscoreSlug = cLower.replace(/[^a-z0-9]+/g, '_');
                            const matched = foundUrls.find(u => {
                                const uLower = u.toLowerCase();
                                return uLower.includes(hyphenSlug) || uLower.includes(underscoreSlug) || uLower.includes(cLower);
                            });
                            if (matched) {
                                isFound = true;
                                matchedLiveUrl = matched;
                                break;
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
                            live_url: matchedLiveUrl || (p.customUrl ? (p.customUrl.startsWith('http') ? p.customUrl : `https://daco.vn/${p.customUrl.replace(/^\/+/, '')}`) : '')
                        };
                    });
                } else {
                    let cmsSkuSet = new Set();
                    if (checkConfig.jsonContent) {
                        try {
                            const parsed = JSON.parse(checkConfig.jsonContent);
                            const list = Array.isArray(parsed) ? parsed : (parsed.products || parsed.data || [parsed]);
                            list.forEach(item => {
                                const sku = String(item.sku || item.model || item.slug || item.name || item.product_name || item.id || '').trim().toLowerCase();
                                if (sku) cmsSkuSet.add(sku);
                            });
                        } catch (e) {}
                    }
                    scannedLogs = productItems.map(p => {
                        const candidates = [p.customUrl, p.model, p.name].filter(Boolean);
                        let isFound = false;
                        for (const cand of candidates) {
                            const cLower = cand.toLowerCase().trim();
                            if (cmsSkuSet.has(cLower)) {
                                isFound = true;
                                break;
                            }
                        }
                        const nowStr = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                        return {
                            id: `log_${p.rowIdx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            posted_at: isFound ? nowStr : `Dự kiến: ${nowStr}`,
                            model: p.model,
                            name: p.name,
                            platform: 'Website (CMS API)',
                            status: isFound ? 'posted' : 'pending'
                        };
                    });
                }
            }

            if (scannedLogs) {
                setCustomPostingLogs(scannedLogs);
                try {
                    localStorage.setItem(`posting_logs_${profileSlug}`, JSON.stringify(scannedLogs));
                } catch (e) {}
                const postedCount = scannedLogs.filter(l => l.status === 'posted').length;
                const pendingCount = scannedLogs.filter(l => l.status === 'pending').length;
                toast(`🎉 Kiểm tra xong! Đã đăng: ${postedCount} sản phẩm, Chưa đăng: ${pendingCount} sản phẩm.`, 'success');
            }
        } catch (e) {
            toast(e.message || '❌ Lỗi khi kết nối kiểm tra!', 'danger');
        } finally {
            setIsCheckingPublication(false);
        }
    };


    const handleRenameSheetColumn = async (cIdx, newTitle) => {
        if (newTitle === undefined || newTitle === null) return;
        const trimmed = newTitle.trim();
        if (!trimmed) {
            toast('⚠️ Tên cột không được để trống!', 'warning');
            return;
        }

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = s.data.map(row => Array.isArray(row) ? [...row] : []);
            while (newData.length <= autoHeaderRowIdx) {
                newData.push([]);
            }
            while (newData[autoHeaderRowIdx].length <= cIdx) {
                newData[autoHeaderRowIdx].push('');
            }
            newData[autoHeaderRowIdx][cIdx] = trimmed;
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setRenameColTarget(null);
        toast(`✅ Đã đổi tên cột thành "${trimmed}"`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (e) {
            console.error('Failed to save renamed column:', e);
        }
    };

    const handleInsertColumnAt = async (cIdx, side = 'right') => {
        const insertIdx = side === 'left' ? cIdx : cIdx + 1;
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = s.data.map((row, rIdx) => {
                const newRow = Array.isArray(row) ? [...row] : [];
                const newColVal = rIdx === autoHeaderRowIdx ? `Cột ${getColLetter(insertIdx)}` : '';
                newRow.splice(insertIdx, 0, newColVal);
                return newRow;
            });
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        toast(`✨ Đã chèn 1 cột mới bên ${side === 'left' ? 'trái' : 'phải'} cột ${getColLetter(cIdx)}`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (e) {
            console.error('Failed to save after inserting column:', e);
        }
    };

    const handleDeleteColumnAt = async (cIdx) => {
        const colLetter = getColLetter(cIdx);
        const colTitle = activePageSheetData[autoHeaderRowIdx]?.[cIdx] || `Cột ${colLetter}`;
        const confirmDelete = window.confirm(`⚠️ Bạn có chắc chắn muốn XÓA cột [${colLetter}] "${colTitle}"?\n\nDữ liệu trong cột này sẽ bị xóa vĩnh viễn.`);
        if (!confirmDelete) return;

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = s.data.map(row => {
                if (!Array.isArray(row)) return row;
                const newRow = [...row];
                newRow.splice(cIdx, 1);
                return newRow;
            });
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        toast(`🗑️ Đã xóa cột [${colLetter}] "${colTitle}"`, 'info');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (e) {
            console.error('Failed to save after deleting column:', e);
        }
    };

    // Handlers for Tab Management
    const handleRenameSheetTab = async (oldName, newName) => {
        if (!newName || !newName.trim() || oldName === newName.trim()) return;
        const trimmed = newName.trim();
        if (profileSheets.some(s => s.name === trimmed)) {
            toast('⚠️ Tên tab này đã tồn tại!', 'warning');
            return;
        }

        pushUndoSnapshot(profileSheets);
        const updated = profileSheets.map(s => s.name === oldName ? { ...s, name: trimmed } : s);
        setProfileSheets(updated);
        if (activeSheetTabName === oldName) {
            setActiveSheetTabName(trimmed);
        }
        setRenameTabTarget(null);
        toast(`✅ Đã đổi tên tab thành "${trimmed}"`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updated })
            });
        } catch (e) {
            console.error('Failed to save renamed tab:', e);
        }
    };

    const handleDeleteSheetTab = async (tabName) => {
        if (profileSheets.length <= 1) {
            toast('⚠️ Không thể xóa tab cuối cùng!', 'warning');
            return;
        }
        const confirmDelete = window.confirm(`⚠️ Bạn có chắc chắn muốn XÓA tab "${tabName}"?\n\nDữ liệu trong tab này sẽ bị mất.`);
        if (!confirmDelete) return;

        pushUndoSnapshot(profileSheets);
        const updated = profileSheets.filter(s => s.name !== tabName);
        setProfileSheets(updated);
        if (activeSheetTabName === tabName) {
            setActiveSheetTabName(updated[0]?.name || '');
        }

        // Auto-clear cached posting logs so deleted tab products are immediately removed from pending count
        setCustomPostingLogs(null);
        try {
            localStorage.removeItem(`posting_logs_${profileSlug}`);
        } catch (e) {}

        toast(`🗑️ Đã xóa tab "${tabName}"`, 'info');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updated })
            });
        } catch (e) {
            console.error('Failed to save sheets after tab deletion:', e);
        }
    };

    const handleAddEmptySheetTab = async () => {
        let baseName = 'Sheet';
        let idx = profileSheets.length + 1;
        while (profileSheets.some(s => s.name === `${baseName}${idx}`)) {
            idx++;
        }
        const newTabName = `${baseName}${idx}`;

        // Create empty grid (100 rows, 12 cols)
        const emptyRows = Array.from({ length: 50 }, () => Array(12).fill(''));
        // Default header line
        emptyRows[0] = ['Cột A', 'Cột B', 'Cột C', 'Cột D', 'Cột E', 'Cột F', 'Cột G', 'Cột H', 'Cột I', 'Cột J', 'Cột K', 'Cột L'];

        pushUndoSnapshot(profileSheets);
        const updated = [...profileSheets, { name: newTabName, data: emptyRows }];
        setProfileSheets(updated);
        setActiveSheetTabName(newTabName);
        toast(`✨ Đã thêm tab mới "${newTabName}"`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updated })
            });
        } catch (e) {
            console.error('Failed to save sheets after adding tab:', e);
        }
    };

    // Google Sheets 2D Cell Range Selection (4-direction mouse drag & Ctrl+Shift+Arrows)
    const [selectedPageCell, setSelectedPageCell] = useState(null); // { rIdx: number, cIdx: number }
    const [cellSelectionBox, setCellSelectionBox] = useState(null); // { startRow, startCol, endRow, endCol }
    const [isDraggingCellSelection, setIsDraggingCellSelection] = useState(false);
    const cellClipboardRef = useRef(null); // { type: 'copy'|'cut', data: string[][] }
    const [contextMenu, setContextMenu] = useState(null); // { x, y, minRow, maxRow, minCol, maxCol }


    // Undo / Redo History Stack (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
    const historyStackRef = useRef([]); // Array of profileSheets snapshots
    const historyIndexRef = useRef(-1);

    const pushUndoSnapshot = (sheetsData) => {
        if (!sheetsData || !Array.isArray(sheetsData)) return;
        const stack = historyStackRef.current;
        const index = historyIndexRef.current;

        // Tránh lưu trùng lặp snapshot liên tiếp
        if (index >= 0 && stack[index]) {
            try {
                if (JSON.stringify(stack[index]) === JSON.stringify(sheetsData)) {
                    return;
                }
            } catch (e) {}
        }

        const newStack = stack.slice(0, index + 1);
        const snapshot = JSON.parse(JSON.stringify(sheetsData));
        newStack.push(snapshot);

        if (newStack.length > 50) newStack.shift();

        historyStackRef.current = newStack;
        historyIndexRef.current = newStack.length - 1;
    };

    const handleUndo = async () => {
        const stack = historyStackRef.current;
        const currentIndex = historyIndexRef.current;

        if (currentIndex <= 0 || stack.length === 0) {
            toast('ℹ️ Không có thao tác nào để hoàn tác (Undo)!', 'info');
            return;
        }

        const newIndex = currentIndex - 1;
        const previousSnapshot = JSON.parse(JSON.stringify(stack[newIndex]));
        historyIndexRef.current = newIndex;

        setProfileSheets(previousSnapshot);
        toast(`↩️ Đã hoàn tác (Undo)!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: previousSnapshot })
            });
        } catch (err) {
            console.error('Failed to auto-save after undo:', err);
        }
    };

    const handleRedo = async () => {
        const stack = historyStackRef.current;
        const currentIndex = historyIndexRef.current;

        if (currentIndex >= stack.length - 1) {
            toast('ℹ️ Không có thao tác nào để khôi phục (Redo)!', 'info');
            return;
        }

        const newIndex = currentIndex + 1;
        const nextSnapshot = JSON.parse(JSON.stringify(stack[newIndex]));
        historyIndexRef.current = newIndex;

        setProfileSheets(nextSnapshot);
        toast(`↪️ Đã khôi phục (Redo)!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: nextSnapshot })
            });
        } catch (err) {
            console.error('Failed to auto-save after redo:', err);
        }
    };

    const lastHoveredRowRef = useRef(null);
    const lastHoveredColRef = useRef(null);

    // AI Assistant modal & background task state
    const [showAiModal, setShowAiModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showIncompleteRowsModal, setShowIncompleteRowsModal] = useState(false);
    const [auditModalTab, setAuditModalTab] = useState('mandatory');
    const [showAuditMenuDropdown, setShowAuditMenuDropdown] = useState(false);
    // Spec Field Analyzer modal state
    const [showSpecAnalyzerModal, setShowSpecAnalyzerModal] = useState(false);
    const [specAnalyzerColIdx, setSpecAnalyzerColIdx] = useState(-1); // -1 = not selected
    const [specAnalyzerCatColIdx, setSpecAnalyzerCatColIdx] = useState(-1); // -1 = not selected
    const [specAnalyzerSelectedCat, setSpecAnalyzerSelectedCat] = useState('ALL'); // 'ALL' or specific category name/id
    const [specAnalyzerResult, setSpecAnalyzerResult] = useState(null); // { fields: [{name, count, rows}] }
    const [specAnalyzerRunning, setSpecAnalyzerRunning] = useState(false);
    const [aiTaskState, setAiTaskState] = useState({
        isRunning: false,
        tabName: '',
        targetColIdx: 3,
        startRow: 1,
        endRow: 100,
        totalRows: 0,
        completedRows: 0,
        errorCount: 0,
        statusText: '',
        logs: []
    });

    // Double Click cell viewer / editor modal
    const [pageCellDetailModal, setPageCellDetailModal] = useState(null);
    const [copiedPageCell, setCopiedPageCell] = useState(false);

    // Ghép Cột Hàng (Batch Merge Columns)
    const [showPageMergeColsModal, setShowPageMergeColsModal] = useState(false);
    const [pageMergeTemplate, setPageMergeTemplate] = useState('');
    const [pageMergeTargetColIndex, setPageMergeTargetColIndex] = useState(0);
    const [pageMergeStartRow, setPageMergeStartRow] = useState(1);
    const [pageMergeEndRow, setPageMergeEndRow] = useState('');

    // O(1) Set Lookups to eliminate rendering lag
    const selectedRowSet = useMemo(() => new Set(selectedRowIndices), [selectedRowIndices]);
    const selectedColSet = useMemo(() => new Set(selectedColIndices), [selectedColIndices]);

    const selectedCellRange = useMemo(() => {
        if (!cellSelectionBox) return null;
        const minRow = Math.min(cellSelectionBox.startRow, cellSelectionBox.endRow);
        const maxRow = Math.max(cellSelectionBox.startRow, cellSelectionBox.endRow);
        const minCol = Math.min(cellSelectionBox.startCol, cellSelectionBox.endCol);
        const maxCol = Math.max(cellSelectionBox.startCol, cellSelectionBox.endCol);
        return { minRow, maxRow, minCol, maxCol };
    }, [cellSelectionBox]);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDraggingRowSelection(false);
            setIsDraggingColSelection(false);
            setIsDraggingCellSelection(false);
            lastHoveredRowRef.current = null;
            lastHoveredColRef.current = null;
        };
        const handleGlobalClick = () => {
            setContextMenu(null);
            setPageTabContextMenu(null);
            setPageColHeaderContextMenu(null);
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('click', handleGlobalClick);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('click', handleGlobalClick);
        };
    }, []);

    useEffect(() => {
        setSheetSearchQuery('');
        setColumnFilters({});
        setColumnSelectedValues({});
        setActiveFilterDropdownCol(null);
        setSelectedRowIndices([]);
        setSelectedColIndices([]);
        setCellSelectionBox(null);
        setContextMenu(null);
        setPageColHeaderContextMenu(null);
        setRenameColTarget(null);
    }, [activeSheetTabName]);

    const autoHeaderRowIdx = useMemo(() => {
        if (!activePageSheetData || activePageSheetData.length === 0) return 0;
        for (let r = 0; r < Math.min(activePageSheetData.length, 5); r++) {
            const row = activePageSheetData[r];
            if (!Array.isArray(row)) continue;
            const vals = row.map(v => v !== null && v !== undefined ? String(v).trim() : '').filter(Boolean);
            if (vals.length === 0) continue;
            const isSelector = vals.some(v => v.includes('nth-child') || v.startsWith('a.') || v.startsWith('.') || v === '246');
            if (!isSelector) return r;
        }
        return 0;
    }, [activePageSheetData]);

    const getUniqueColumnValues = useCallback((cIdx) => {
        if (!activePageSheetData || activePageSheetData.length <= autoHeaderRowIdx + 1) return [];
        const dataRows = activePageSheetData.slice(autoHeaderRowIdx + 1);
        const set = new Set();
        dataRows.forEach(row => {
            if (Array.isArray(row)) {
                const val = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]).trim() : '';
                set.add(val || '(Trống)');
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [activePageSheetData, autoHeaderRowIdx]);

    const filteredPageSheetData = useMemo(() => {
        if (!activePageSheetData || activePageSheetData.length === 0) return [];

        let startDataIdx = autoHeaderRowIdx + 1;
        if (pageFreezeRows > 0) {
            startDataIdx = Math.max(pageFreezeRows, autoHeaderRowIdx + 1);
        }

        const items = [];
        for (let i = startDataIdx; i < activePageSheetData.length; i++) {
            items.push({ rawIdx: i, row: activePageSheetData[i] });
        }

        const filteredData = items.filter(({ rawIdx, row }) => {
            if (!Array.isArray(row)) return false;

            // Filter out garbage CSS selector rows if any
            const rowStr = row.map(c => String(c || '')).join(' ');
            if (rowStr.includes('nth-child') || rowStr.includes('a.link-secondary') || rowStr.includes('a.h6')) {
                return false;
            }

            // 1. Global Search Filter
            if (sheetSearchQuery.trim()) {
                const query = sheetSearchQuery.trim().toLowerCase();
                const rowMatches = row.some(cell => 
                    cell !== undefined && cell !== null && String(cell).toLowerCase().includes(query)
                );
                if (!rowMatches) return false;
            }

            // 2. Column Text Input Filters
            for (const [cIdxStr, colQuery] of Object.entries(columnFilters)) {
                const cIdx = parseInt(cIdxStr);
                if (colQuery && colQuery.trim()) {
                    const query = colQuery.trim().toLowerCase();
                    const cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]).toLowerCase() : '';
                    if (!cellVal.includes(query)) return false;
                }
            }

            // 3. Column Unique Values Checkbox Filter
            for (const [cIdxStr, selectedValues] of Object.entries(columnSelectedValues)) {
                const cIdx = parseInt(cIdxStr);
                if (Array.isArray(selectedValues) && selectedValues.length > 0) {
                    const cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]).trim() : '(Trống)';
                    if (!selectedValues.includes(cellVal)) return false;
                }
            }

            return true;
        });

        // 4. Column Sorting (ASC / DESC)
        if (columnSortState.colIndex !== null && columnSortState.direction) {
            const colIdx = columnSortState.colIndex;
            const dir = columnSortState.direction === 'asc' ? 1 : -1;
            filteredData.sort((a, b) => {
                const valA = Array.isArray(a.row) && a.row[colIdx] !== undefined && a.row[colIdx] !== null ? String(a.row[colIdx]).trim() : '';
                const valB = Array.isArray(b.row) && b.row[colIdx] !== undefined && b.row[colIdx] !== null ? String(b.row[colIdx]).trim() : '';
                return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * dir;
            });
        }

        return filteredData;
    }, [activePageSheetData, autoHeaderRowIdx, pageFreezeRows, sheetSearchQuery, columnFilters, columnSelectedValues, columnSortState]);



    const renderedPageRows = useMemo(() => {
        return filteredPageSheetData.slice(0, pageRowLimit);
    }, [filteredPageSheetData, pageRowLimit]);

    const hasActiveFilters = useMemo(() => {
        const hasQuery = Boolean(sheetSearchQuery.trim());
        const hasColText = Object.values(columnFilters).some(v => v && v.trim());
        const hasColSelected = Object.values(columnSelectedValues).some(arr => Array.isArray(arr) && arr.length > 0);
        return hasQuery || hasColText || hasColSelected;
    }, [sheetSearchQuery, columnFilters, columnSelectedValues]);

    const handleClearAllFilters = () => {
        setSheetSearchQuery('');
        setColumnFilters({});
        setColumnSelectedValues({});
        setActiveFilterDropdownCol(null);
    };

    const activeColUniqueValues = useMemo(() => {
        if (activeFilterDropdownCol === null || !activePageSheetData.length) return [];
        const headerCount = pageFreezeRows > 0 ? pageFreezeRows : 0;
        const dataRows = activePageSheetData.slice(headerCount);
        const map = new Map();

        dataRows.forEach(row => {
            if (!Array.isArray(row)) return;
            const val = row[activeFilterDropdownCol] !== undefined && row[activeFilterDropdownCol] !== null ? String(row[activeFilterDropdownCol]).trim() : '(Trống)';
            const key = val || '(Trống)';
            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries()).map(([value, count]) => ({ value, count }));
    }, [activeFilterDropdownCol, activePageSheetData, pageFreezeRows]);

    // Feature 4: Add Rows & Add Columns to Active Sheet Tab with Custom Quantities
    const getColLetter = (idx) => {
        let temp, letter = '';
        while (idx >= 0) {
            temp = idx % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            idx = Math.floor(idx / 26) - 1;
        }
        return letter;
    };

    // ============================================================
    // Spec Field Analyzer: parse HTML <td>Field</td><td>Value</td>
    // from a selected column across all rows of current sheet tab,
    // optionally filtered by category column & value,
    // then count occurrences of each field name.
    // ============================================================
    const runSpecAnalyzer = () => {
        if (specAnalyzerColIdx < 0) return;
        setSpecAnalyzerRunning(true);
        setSpecAnalyzerResult(null);

        try {
            const activeSheet = profileSheets.find(s => s.name === activeSheetTabName);
            if (!activeSheet || !activeSheet.data || activeSheet.data.length < 2) {
                setSpecAnalyzerResult({ error: 'Không có dữ liệu trong tab hiện tại.' });
                return;
            }

            const rows = activeSheet.data;
            // rows[0] is header row — skip it
            const fieldMap = {}; // fieldName -> { count, exampleRows: [] }

            let totalCategoryRows = 0;
            let scannedCategoryRows = 0;

            for (let rIdx = 1; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                if (!Array.isArray(row)) continue;

                // Category filter
                if (specAnalyzerCatColIdx >= 0 && specAnalyzerSelectedCat && specAnalyzerSelectedCat !== 'ALL') {
                    const rowCat = String(row[specAnalyzerCatColIdx] || '').trim();
                    const targetCat = specAnalyzerSelectedCat === '(Trống / Chưa phân loại)' ? '' : specAnalyzerSelectedCat;
                    if (rowCat !== targetCat) {
                        continue; // Skip rows that don't match the selected category
                    }
                }

                totalCategoryRows++;

                const cellVal = row[specAnalyzerColIdx];
                if (!cellVal || String(cellVal).trim() === '') continue;

                scannedCategoryRows++;
                const htmlStr = String(cellVal);

                // Parse pairs: <td>Field</td><td>Value</td>  (or <th> variants)
                // Use a simple regex to extract consecutive td/th pairs
                const tdRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
                const cells = [];
                let m;
                while ((m = tdRegex.exec(htmlStr)) !== null) {
                    // Strip inner HTML tags and decode basic HTML entities
                    const text = m[1]
                        .replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&#160;/g, ' ')
                        .trim();
                    cells.push(text);
                }

                // Group cells into pairs: cells[0]=field, cells[1]=value, cells[2]=field, ...
                for (let i = 0; i < cells.length - 1; i += 2) {
                    const fieldName = cells[i];
                    if (!fieldName) continue;

                    // Normalize: remove trailing colon, collapse whitespace
                    const normalized = fieldName.replace(/:\s*$/, '').replace(/\s+/g, ' ').trim();
                    if (!normalized) continue;

                    if (!fieldMap[normalized]) {
                        fieldMap[normalized] = { count: 0, exampleRows: [] };
                    }
                    fieldMap[normalized].count += 1;
                    if (fieldMap[normalized].exampleRows.length < 3) {
                        fieldMap[normalized].exampleRows.push(rIdx); // store 1-based display row index
                    }
                }
            }

            // Sort by count desc
            const sorted = Object.entries(fieldMap)
                .map(([name, info]) => ({ name, count: info.count, exampleRows: info.exampleRows }))
                .sort((a, b) => b.count - a.count);

            const colHeader = rows[0] && rows[0][specAnalyzerColIdx]
                ? String(rows[0][specAnalyzerColIdx])
                : `Cột #${specAnalyzerColIdx + 1}`;

            const catColHeader = specAnalyzerCatColIdx >= 0 && rows[0] && rows[0][specAnalyzerCatColIdx]
                ? String(rows[0][specAnalyzerCatColIdx])
                : (specAnalyzerCatColIdx >= 0 ? `Cột #${specAnalyzerCatColIdx + 1}` : null);

            const isFiltered = specAnalyzerCatColIdx >= 0 && specAnalyzerSelectedCat && specAnalyzerSelectedCat !== 'ALL';

            setSpecAnalyzerResult({
                fields: sorted,
                totalRows: totalCategoryRows,
                scannedRows: scannedCategoryRows,
                colHeader,
                catColHeader,
                categoryFilter: isFiltered ? specAnalyzerSelectedCat : 'Tất cả danh mục',
                isFiltered,
                sheetName: activeSheetTabName
            });
        } catch (err) {
            setSpecAnalyzerResult({ error: `Lỗi phân tích: ${err.message}` });
        } finally {
            setSpecAnalyzerRunning(false);
        }
    };

    const handleAddPageRows = async (defaultCount = 1) => {
        if (!activeSheetTabName) return;
        const inputVal = prompt('Nhập số lượng hàng trống muốn thêm vào cuối Tab (VD: 1, 5, 10, 50...):', String(defaultCount));
        if (inputVal === null) return; // User cancelled
        const count = Math.max(1, parseInt(inputVal) || 1);

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = [...(s.data || [])];
            const numCols = Math.max(maxPageCols, 1);
            for (let i = 0; i < count; i++) {
                newData.push(Array(numCols).fill(''));
            }
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setPageRowLimit(prev => Math.max(prev, activePageSheetData.length + count));
        toast(`➕ Đã thêm ${count} hàng mới vào Tab "${activeSheetTabName}"!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after adding rows:', err);
        }
    };

    const handleAddPageColumn = async (defaultCount = 1) => {
        if (!activeSheetTabName) return;
        const inputVal = prompt('Nhập số lượng cột mới muốn thêm vào Tab (VD: 1, 2, 5...):', String(defaultCount));
        if (inputVal === null) return; // User cancelled
        const count = Math.max(1, parseInt(inputVal) || 1);

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = s.data || [];
            const currentNumCols = existingData.reduce((max, r) => Math.max(max, Array.isArray(r) ? r.length : 0), 0);

            const newData = existingData.map((row, rIdx) => {
                const newRow = Array.isArray(row) ? [...row] : [];
                for (let i = 0; i < count; i++) {
                    const colLetter = getColLetter(currentNumCols + i);
                    if (rIdx === 0 && (pageFreezeRows > 0 || existingData.length > 1)) {
                        newRow.push(`Cột Mới ${colLetter}`);
                    } else {
                        newRow.push('');
                    }
                }
                return newRow;
            });
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        toast(`➕ Đã thêm ${count} Cột mới vào Tab "${activeSheetTabName}"!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after adding column:', err);
        }
    };

    // Direct Row & Column Deletion Handlers with Preview
    const confirmDeleteRowDirect = async (rIdx) => {
        if (!activeSheetTabName) return;
        const rowNum = rIdx + 1;
        const rowPreview = (activePageSheetData[rIdx] || []).filter(Boolean).slice(0, 3).join(' | ');

        if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA Hàng ${rowNum} khỏi Tab "${activeSheetTabName}"?\n\n📍 Xem trước dữ liệu: ${rowPreview || '(Hàng trống)'}`)) {
            return;
        }

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = [...(s.data || [])];
            existingData.splice(rIdx, 1);
            return { ...s, data: existingData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setSelectedPageCell(null);
        toast(`🗑️ Đã xóa Hàng ${rowNum} khỏi Tab "${activeSheetTabName}"!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after deleting row:', err);
        }
    };

    const confirmDeleteColDirect = async (cIdx) => {
        if (!activeSheetTabName) return;
        const colLetter = getColLetter(cIdx);
        const colHeader = activePageSheetData[0]?.[cIdx] ? String(activePageSheetData[0][cIdx]).trim() : '';

        if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA Cột ${colLetter} ${colHeader ? `("${colHeader}")` : ''} khỏi Tab "${activeSheetTabName}"?\n\nToàn bộ dữ liệu của Cột ${colLetter} sẽ bị xóa bỏ hoàn toàn.`)) {
            return;
        }

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = s.data || [];
            const newData = existingData.map(row => {
                if (!Array.isArray(row)) return row;
                const newRow = [...row];
                newRow.splice(cIdx, 1);
                return newRow;
            });
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setSelectedPageCell(null);
        toast(`🗑️ Đã xóa Cột ${colLetter} ${colHeader ? `("${colHeader}")` : ''} thành công!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after deleting column:', err);
        }
    };

    // Drag Selection Handlers for Rows & Columns (Optimized for 60fps)
    const handleRowMouseDown = (rIdx, e) => {
        if (e && e.button !== 0) return;
        e.preventDefault();
        lastHoveredRowRef.current = rIdx;
        if (e.shiftKey && dragStartRowIndex !== null) {
            const start = Math.min(dragStartRowIndex, rIdx);
            const end = Math.max(dragStartRowIndex, rIdx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedRowIndices(range);
            setSelectedColIndices([]);
        } else {
            setIsDraggingRowSelection(true);
            setDragStartRowIndex(rIdx);
            setSelectedRowIndices([rIdx]);
            setSelectedColIndices([]);
        }
    };

    const handleRowMouseEnter = (rIdx) => {
        if (isDraggingRowSelection && dragStartRowIndex !== null) {
            if (lastHoveredRowRef.current === rIdx) return; // Skip redundant updates if staying on same row
            lastHoveredRowRef.current = rIdx;

            const start = Math.min(dragStartRowIndex, rIdx);
            const end = Math.max(dragStartRowIndex, rIdx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedRowIndices(range);
        }
    };

    const handleColMouseDown = (cIdx, e) => {
        if (e && e.button !== 0) return;
        e.preventDefault();
        lastHoveredColRef.current = cIdx;
        if (e.shiftKey && dragStartColIndex !== null) {
            const start = Math.min(dragStartColIndex, cIdx);
            const end = Math.max(dragStartColIndex, cIdx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedColIndices(range);
            setSelectedRowIndices([]);
        } else {
            setIsDraggingColSelection(true);
            setDragStartColIndex(cIdx);
            setSelectedColIndices([cIdx]);
            setSelectedRowIndices([]);
        }
    };

    const handleColMouseEnter = (cIdx) => {
        if (isDraggingColSelection && dragStartColIndex !== null) {
            if (lastHoveredColRef.current === cIdx) return; // Skip redundant updates if staying on same column
            lastHoveredColRef.current = cIdx;

            const start = Math.min(dragStartColIndex, cIdx);
            const end = Math.max(dragStartColIndex, cIdx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedColIndices(range);
        }
    };

    const scrollToRowInSheet = (rowIndex) => {
        if (!rowIndex || rowIndex < 1) return;
        if (rowIndex > pageRowLimit) {
            setPageRowLimit(prev => Math.max(prev, rowIndex + 50));
        }
        setTimeout(() => {
            const rowEl = document.getElementById(`sheet-row-${rowIndex}`);
            if (rowEl) {
                rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                const container = document.querySelector('.sheet-table-container');
                if (container) {
                    const targetScroll = Math.max(0, (rowIndex - 3) * 36);
                    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
                }
            }
        }, 150);
    };

    const handleDeleteSelectedRows = async () => {
        if (selectedRowIndices.length === 0 || !activeSheetTabName) return;
        const sorted = [...selectedRowIndices].sort((a, b) => a - b);
        const count = sorted.length;
        const firstRowDisplay = sorted[0] + 1;
        const lastRowDisplay = sorted[sorted.length - 1] + 1;

        const labelText = count === 1 ? `Hàng ${firstRowDisplay}` : `từ Hàng ${firstRowDisplay} đến Hàng ${lastRowDisplay} (${count} hàng)`;

        if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA ${labelText} khỏi Tab "${activeSheetTabName}"?\n\nDữ liệu các hàng này sẽ bị xóa bỏ hoàn toàn.`)) {
            return;
        }

        const deleteSet = new Set(sorted);
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = [...(s.data || [])];
            const newData = existingData.filter((_, idx) => !deleteSet.has(idx));
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setSelectedRowIndices([]);
        setSelectedPageCell(null);
        toast(`🗑️ Đã xóa ${count} hàng thành công!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after deleting rows:', err);
        }
    };

    const handleDeleteSelectedCols = async () => {
        if (selectedColIndices.length === 0 || !activeSheetTabName) return;
        const sorted = [...selectedColIndices].sort((a, b) => a - b);
        const count = sorted.length;
        const colLetters = sorted.map(c => getColLetter(c)).join(', ');

        if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA ${count} Cột (${colLetters}) khỏi Tab "${activeSheetTabName}"?\n\nToàn bộ dữ liệu của các cột này sẽ bị xóa bỏ hoàn toàn.`)) {
            return;
        }

        const deleteSet = new Set(sorted);
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = s.data || [];
            const newData = existingData.map(row => {
                if (!Array.isArray(row)) return row;
                return row.filter((_, cIdx) => !deleteSet.has(cIdx));
            });
            return { ...s, data: newData };
        });

        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setSelectedColIndices([]);
        setSelectedPageCell(null);
        toast(`🗑️ Đã xóa ${count} cột (${colLetters}) thành công!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after deleting columns:', err);
        }
    };

    // RFC 4180 compliant TSV parser that supports multi-line quoted cells from Google Sheets & Excel
    const parseClipboardTsv = (text) => {
        if (!text || typeof text !== 'string') return [];
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let inQuotes = false;
        const str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const nextChar = str[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentCell += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentCell += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === '\t') {
                    currentRow.push(currentCell);
                    currentCell = '';
                } else if (char === '\n') {
                    currentRow.push(currentCell);
                    rows.push(currentRow);
                    currentRow = [];
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
        }
        if (currentCell.length > 0 || currentRow.length > 0) {
            currentRow.push(currentCell);
            rows.push(currentRow);
        }
        if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            if (lastRow.length === 1 && lastRow[0] === '') {
                rows.pop();
            }
        }
        return rows;
    };

    // RFC 4180 compliant TSV formatter for system clipboard
    const formatClipboardTsv = (matrix) => {
        if (!Array.isArray(matrix)) return '';
        return matrix.map(row => {
            if (!Array.isArray(row)) return '';
            return row.map(cell => {
                const str = cell !== undefined && cell !== null ? String(cell) : '';
                if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join('\t');
        }).join('\n');
    };

    // 2D Cell Range Operations (Copy, Cut, Paste, Clear)
    const handleCopyRangeContent = (minRow, maxRow, minCol, maxCol) => {
        if (!activePageSheetData || activePageSheetData.length === 0) return;
        const copiedRows = [];
        for (let r = minRow; r <= maxRow; r++) {
            const row = activePageSheetData[r] || [];
            const rowData = [];
            for (let c = minCol; c <= maxCol; c++) {
                const val = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
                rowData.push(val);
            }
            copiedRows.push(rowData);
        }
        cellClipboardRef.current = { type: 'copy', data: copiedRows };

        // Copy TSV string to System Clipboard for Google Sheets / Excel interoperability
        const tsvText = formatClipboardTsv(copiedRows);
        navigator.clipboard.writeText(tsvText).catch(() => {});

        const count = (maxRow - minRow + 1) * (maxCol - minCol + 1);
        toast(`📋 Đã sao chép ${count} ô vào bộ nhớ tạm!`, 'info');
    };

    const handleClearRangeContent = async (minRow, maxRow, minCol, maxCol, silent = false) => {
        if (!activeSheetTabName || !activePageSheetData) return;

        const headerEndIdx = autoHeaderRowIdx >= 0 ? autoHeaderRowIdx : 0;
        const firstDataRowIdx = headerEndIdx + 1;
        
        let startR = minRow;
        if (minRow <= headerEndIdx && maxRow > headerEndIdx) {
            startR = firstDataRowIdx;
        }

        pushUndoSnapshot(profileSheets);

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = [...(s.data || [])];
            for (let r = startR; r <= maxRow; r++) {
                if (r <= headerEndIdx && maxRow > headerEndIdx) continue;
                if (!existingData[r]) continue;
                const newRow = Array.isArray(existingData[r]) ? [...existingData[r]] : [];
                for (let c = minCol; c <= maxCol; c++) {
                    newRow[c] = '';
                }
                existingData[r] = newRow;
            }
            return { ...s, data: existingData };
        });

        setProfileSheets(updatedSheets);
        if (!silent) {
            const count = (maxRow - startR + 1) * (maxCol - minCol + 1);
            toast(`🧹 Đã xóa nội dung ${count} ô thành công!`, 'success');
        }

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after clearing range content:', err);
        }
    };

    const handleCutRangeContent = (minRow, maxRow, minCol, maxCol) => {
        handleCopyRangeContent(minRow, maxRow, minCol, maxCol);
        if (cellClipboardRef.current) cellClipboardRef.current.type = 'cut';
        const safeMinRow = (minRow < 2 && maxRow >= 2) ? 2 : minRow;
        handleClearRangeContent(safeMinRow, maxRow, minCol, maxCol, true);
        const count = (maxRow - safeMinRow + 1) * (maxCol - minCol + 1);
        toast(`✂️ Đã cắt ${count} ô!`, 'info');
    };

    const handlePasteRangeContent = async (startRow, startCol) => {
        if (!activeSheetTabName || !activePageSheetData) return;

        let pasteMatrix = [];
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                pasteMatrix = parseClipboardTsv(text);
            }
        } catch (err) {}

        if ((!pasteMatrix || pasteMatrix.length === 0) && cellClipboardRef.current?.data) {
            pasteMatrix = cellClipboardRef.current.data;
        }

        if (!pasteMatrix || pasteMatrix.length === 0) {
            toast('⚠️ Bộ nhớ tạm không có dữ liệu để dán!', 'warning');
            return;
        }

        pushUndoSnapshot(profileSheets);

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = [...(s.data || [])];

            pasteMatrix.forEach((pasteRow, rOffset) => {
                const targetR = startRow + rOffset;
                if (!existingData[targetR]) {
                    existingData[targetR] = [];
                } else {
                    existingData[targetR] = Array.isArray(existingData[targetR]) ? [...existingData[targetR]] : [];
                }

                pasteRow.forEach((val, cOffset) => {
                    const targetC = startCol + cOffset;
                    existingData[targetR][targetC] = val !== undefined ? String(val) : '';
                });
            });

            return { ...s, data: existingData };
        });

        setProfileSheets(updatedSheets);
        const pasteCount = pasteMatrix.length * (pasteMatrix[0]?.length || 1);
        toast(`📋 Đã dán ${pasteCount} ô thành công!`, 'success');

        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (err) {
            console.error('Failed to auto-save sheet after pasting content:', err);
        }
    };

    // 4-Direction Drag & Keyboard Shortcuts Listener (Ctrl+C, Ctrl+X, Ctrl+V, Delete, Backspace, Ctrl+Shift+Arrows)
    const handleCellMouseDown = (rIdx, cIdx, e) => {
        if (e.button !== 0) return; // Left click only for dragging range
        e.preventDefault(); // Prevents browser default text selection highlight
        try { window.getSelection()?.removeAllRanges(); } catch (err) {}
        setIsDraggingCellSelection(true);
        setCellSelectionBox({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
        setSelectedPageCell({ rIdx, cIdx });
        setSelectedRowIndices([]);
        setSelectedColIndices([]);
        setContextMenu(null);
    };

    const handleCellMouseEnter = (rIdx, cIdx) => {
        if (isDraggingCellSelection && cellSelectionBox) {
            try { window.getSelection()?.removeAllRanges(); } catch (err) {}
            if (lastHoveredRowRef.current === rIdx && lastHoveredColRef.current === cIdx) return;
            lastHoveredRowRef.current = rIdx;
            lastHoveredColRef.current = cIdx;
            setCellSelectionBox(prev => prev ? { ...prev, endRow: rIdx, endCol: cIdx } : null);
        }
    };

    const handleCellContextMenu = (rIdx, cIdx, e) => {
        e.preventDefault();
        e.stopPropagation();

        let range = selectedCellRange;
        if (!range || rIdx < range.minRow || rIdx > range.maxRow || cIdx < range.minCol || cIdx > range.maxCol) {
            setCellSelectionBox({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
            setSelectedPageCell({ rIdx, cIdx });
            range = { minRow: rIdx, maxRow: rIdx, minCol: cIdx, maxCol: cIdx };
        }

        setContextMenu({
            x: Math.min(e.clientX, window.innerWidth - 220),
            y: Math.min(e.clientY, window.innerHeight - 260),
            ...range
        });
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (pageCellDetailModal || showAiModal || showImportModal || showCrawlerToSheetModal || showPageMergeColsModal) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z -> Undo & Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
                return;
            }

            if (!selectedCellRange && !selectedPageCell) return;

            const minRow = selectedCellRange ? selectedCellRange.minRow : selectedPageCell.rIdx;
            const maxRow = selectedCellRange ? selectedCellRange.maxRow : selectedPageCell.rIdx;
            const minCol = selectedCellRange ? selectedCellRange.minCol : selectedPageCell.cIdx;
            const maxCol = selectedCellRange ? selectedCellRange.maxCol : selectedPageCell.cIdx;

            const maxRowsInTab = activePageSheetData.length;
            const maxColsInTab = maxPageCols;

            // Delete / Backspace -> Clear cell contents (Bảo vệ tiêu đề Cột ở Hàng 0 & Hàng 1)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (selectedColIndices.length > 0) {
                    const minC = Math.min(...selectedColIndices);
                    const maxC = Math.max(...selectedColIndices);
                    handleClearRangeContent(2, maxRowsInTab - 1, minC, maxC);
                } else if (selectedRowIndices.length > 0) {
                    const dataRows = selectedRowIndices.filter(r => r >= 2);
                    if (dataRows.length > 0) {
                        handleClearRangeContent(Math.min(...dataRows), Math.max(...dataRows), 0, maxColsInTab - 1);
                    }
                } else {
                    const safeMinRow = (minRow < 2 && maxRow >= 2) ? 2 : minRow;
                    handleClearRangeContent(safeMinRow, maxRow, minCol, maxCol);
                }
                return;
            }

            // Ctrl+C -> Copy
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                handleCopyRangeContent(minRow, maxRow, minCol, maxCol);
                return;
            }

            // Ctrl+X -> Cut
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
                e.preventDefault();
                handleCutRangeContent(minRow, maxRow, minCol, maxCol);
                return;
            }

            // Ctrl+V -> Paste
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                handlePasteRangeContent(minRow, minCol);
                return;
            }

            // Arrow Keys with Shift / Ctrl
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();

                let targetRow = cellSelectionBox ? cellSelectionBox.endRow : selectedPageCell.rIdx;
                let targetCol = cellSelectionBox ? cellSelectionBox.endCol : selectedPageCell.cIdx;

                if (e.ctrlKey && e.shiftKey) {
                    // Ctrl + Shift + Arrow -> Jump to bounds
                    if (e.key === 'ArrowUp') targetRow = 0;
                    if (e.key === 'ArrowDown') targetRow = Math.max(0, maxRowsInTab - 1);
                    if (e.key === 'ArrowLeft') targetCol = 0;
                    if (e.key === 'ArrowRight') targetCol = Math.max(0, maxColsInTab - 1);
                } else if (e.shiftKey) {
                    // Shift + Arrow -> Expand 1 step
                    if (e.key === 'ArrowUp') targetRow = Math.max(0, targetRow - 1);
                    if (e.key === 'ArrowDown') targetRow = Math.min(maxRowsInTab - 1, targetRow + 1);
                    if (e.key === 'ArrowLeft') targetCol = Math.max(0, targetCol - 1);
                    if (e.key === 'ArrowRight') targetCol = Math.min(maxColsInTab - 1, targetCol + 1);
                } else {
                    // Plain Arrow -> Move single cell selection
                    if (e.key === 'ArrowUp') targetRow = Math.max(0, targetRow - 1);
                    if (e.key === 'ArrowDown') targetRow = Math.min(maxRowsInTab - 1, targetRow + 1);
                    if (e.key === 'ArrowLeft') targetCol = Math.max(0, targetCol - 1);
                    if (e.key === 'ArrowRight') targetCol = Math.min(maxColsInTab - 1, targetCol + 1);

                    setSelectedPageCell({ rIdx: targetRow, cIdx: targetCol });
                    setCellSelectionBox({ startRow: targetRow, startCol: targetCol, endRow: targetRow, endCol: targetCol });
                    return;
                }

                const startR = cellSelectionBox ? cellSelectionBox.startRow : selectedPageCell.rIdx;
                const startC = cellSelectionBox ? cellSelectionBox.startCol : selectedPageCell.cIdx;
                setCellSelectionBox({ startRow: startR, startCol: startC, endRow: targetRow, endCol: targetCol });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cellSelectionBox, selectedPageCell, selectedCellRange, activePageSheetData, maxPageCols, pageCellDetailModal, showAiModal, showImportModal, showCrawlerToSheetModal, showPageMergeColsModal]);

    const handleDeletePageRow = () => {
        if (selectedRowIndices.length > 0) {
            handleDeleteSelectedRows();
        } else if (selectedPageCell) {
            confirmDeleteRowDirect(selectedPageCell.rIdx);
        } else {
            alert('💡 Vui lòng nhấp kéo giữ chuột ở cột số thứ tự (#) để bôi đen các Hàng muốn xóa!');
        }
    };

    const handleDeletePageColumn = () => {
        if (selectedColIndices.length > 0) {
            handleDeleteSelectedCols();
        } else if (selectedPageCell) {
            confirmDeleteColDirect(selectedPageCell.cIdx);
        } else {
            alert('💡 Vui lòng nhấp kéo giữ chuột ở tiêu đề Cột (A, B, C...) để bôi đen các Cột muốn xóa!');
        }
    };



    const evaluatePageTemplate = (template, rowArray) => {
        if (!template || !Array.isArray(rowArray)) return '';
        return template.replace(/\{\{([A-Z]+)\}\}/g, (match, p1) => {
            let colIndex = 0;
            for (let i = 0; i < p1.length; i++) {
                colIndex = colIndex * 26 + (p1.charCodeAt(i) - 64);
            }
            colIndex = colIndex - 1;
            return rowArray[colIndex] !== undefined && rowArray[colIndex] !== null ? String(rowArray[colIndex]) : '';
        });
    };

    const handleSavePageCellDetail = async (newVal) => {
        if (!pageCellDetailModal) return;
        const { rIdx, cIdx } = pageCellDetailModal;
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const newData = [...s.data];
            if (!newData[rIdx]) newData[rIdx] = [];
            const newRow = [...newData[rIdx]];
            newRow[cIdx] = newVal;
            newData[rIdx] = newRow;
            return { ...s, data: newData };
        });
        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setPageCellDetailModal(null);
        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
        } catch (e) {
            console.error('Failed to auto-save sheet edit:', e);
        }
    };

    const handleExecutePageMergeCols = async () => {
        if (!pageMergeTemplate.trim()) return;
        const start = Math.max(1, parseInt(pageMergeStartRow) || 1) - 1;
        
        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const end = pageMergeEndRow ? Math.min(s.data.length, parseInt(pageMergeEndRow)) : s.data.length;
            const newData = s.data.map((row, idx) => {
                if (idx < start || idx >= end) return row;
                const mergedVal = evaluatePageTemplate(pageMergeTemplate, row);
                const newRow = Array.isArray(row) ? [...row] : [];
                newRow[pageMergeTargetColIndex] = mergedVal;
                return newRow;
            });
            return { ...s, data: newData };
        });
        pushUndoSnapshot(profileSheets);
        setProfileSheets(updatedSheets);
        setShowPageMergeColsModal(false);
        try {
            await fetchApi('/api/products/profile-sheet', {
                method: 'POST',
                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
            });
            toast('Ghép cột dữ liệu thành công!', 'success');
        } catch (e) {
            console.error('Failed to auto-save merged sheet:', e);
        }
    };

    const fetchProfileSheetData = async (keepActiveTab = true) => {
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${profileSlug}`);
            if (data?.sheets && data.sheets.length > 0) {
                setProfileSheets(data.sheets);
                historyStackRef.current = [JSON.parse(JSON.stringify(data.sheets))];
                historyIndexRef.current = 0;
                
                setActiveSheetTabName(prev => {
                    if (keepActiveTab && prev && data.sheets.some(s => s.name === prev)) {
                        return prev;
                    }
                    return data.sheets[0].name;
                });
                setViewMode('sheet');
            } else {
                setProfileSheets([]);
                historyStackRef.current = [];
                historyIndexRef.current = -1;
                setViewMode('products');
            }
        } catch (err) {
            console.error('Failed to fetch profile sheet:', err);
        }
    };

    useEffect(() => {
        const handleProfileSheetUpdated = (e) => {
            if (!e.detail?.profileSlug || e.detail.profileSlug === profileSlug) {
                fetchProfileSheetData(true);
            }
        };
        window.addEventListener('profile_sheet_updated', handleProfileSheetUpdated);
        return () => {
            window.removeEventListener('profile_sheet_updated', handleProfileSheetUpdated);
        };
    }, [profileSlug]);

    useEffect(() => {
        // Reset state & refetch profile data when profileSlug changes
        setSearchTerm('');
        setSearchInput('');
        setSelectedCategory('');
        setCurrentPage(1);
        setProducts([]);
        setTotalProducts(0);

        fetchProfileSheetData(false);
        fetchCategories();

        const fetchProfileInfo = async () => {
            try {
                const data = await fetchApi('/api/products/profiles');
                if (data?.profiles) {
                    setProfilesList(data.profiles);
                    const match = data.profiles.find(p => p.slug === profileSlug);
                    if (match) setCurrentProfile(match);
                    else setCurrentProfile({ name: profileSlug.charAt(0).toUpperCase() + profileSlug.slice(1), slug: profileSlug });
                }
            } catch (err) {}
            fetchHarReport(profileSlug);
        };
        fetchProfileInfo();
    }, [profileSlug]);



    useEffect(() => {
        fetchProducts();
    }, [searchTerm, selectedCategory, currentPage, profileSlug]);

    const prevCrawlerStatusRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        const checkCrawlerStatus = async () => {
            try {
                const s = await fetchApi('/api/products/crawler/status');
                if (!isMounted) return;
                
                const currentStatus = s?.status;
                const prevStatus = prevCrawlerStatusRef.current;
                
                // If crawler is Running or Starting, periodically refresh products & categories
                if (currentStatus === 'Running' || currentStatus === 'Starting') {
                    fetchProducts();
                    fetchCategories();
                } 
                // If crawler just finished, do a final refresh
                else if ((prevStatus === 'Running' || prevStatus === 'Starting') && (currentStatus === 'Completed' || currentStatus === 'Idle')) {
                    fetchProducts();
                    fetchCategories();
                    toast('🎉 Tiến trình Crawl đã hoàn tất! Danh sách sản phẩm đã được cập nhật.', 'success');
                }
                
                prevCrawlerStatusRef.current = currentStatus;
            } catch (e) {}
        };

        const timer = setInterval(checkCrawlerStatus, 3000);

        const handleManualRefresh = () => {
            fetchProducts();
            fetchCategories();
        };

        window.addEventListener('refresh_crawler_products', handleManualRefresh);

        return () => {
            isMounted = false;
            clearInterval(timer);
            window.removeEventListener('refresh_crawler_products', handleManualRefresh);
        };
    }, [profileSlug, searchTerm, selectedCategory, currentPage]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearchTerm(searchInput);
        setCurrentPage(1);
    };

    const handleCategoryChange = (e) => {
        setSelectedCategory(e.target.value);
        setCurrentPage(1);
    };

    const openProductDetails = (product) => {
        let specs = {};
        try { specs = JSON.parse(product.specifications); } catch (e) { specs = {}; }
        let downloads = [];
        try { downloads = JSON.parse(product.download_links) || []; } catch (e) { downloads = []; }
        setSelectedProduct({ ...product, parsedSpecs: specs, parsedDownloads: downloads });
        setShowModal(true);
    };

    const handleExport = async () => {
        try {
            const token = localStorage.getItem('token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '' : 'http://localhost:3002');
            
            toast('Generating Excel file...', 'info');
            
            const res = await fetch(`${apiUrl}/api/products/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ search: searchTerm, category: selectedCategory, profile: profileSlug })
            });

            
            if (!res.ok) throw new Error('Failed to download Excel export');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Newland_Products_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast('Export completed successfully!', 'success');
        } catch (err) {
            console.error(err);
            toast(err.message || 'Excel export failed', 'danger');
        }
    };

    const formatCategory = (cat) => {
        return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    return (
        <div className="page-content">
            {/* Inline Toasts */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 100000000, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Package style={{ color: 'var(--accent)' }} /> Products — {currentProfile?.name?.startsWith('Profile') ? currentProfile.name : `Profile ${currentProfile?.name || 'Newland'}`}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Quản lý dữ liệu sản phẩm, thông số kỹ thuật và tài liệu của {currentProfile?.brand_name || currentProfile?.name || 'Profile'}.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button 
                        type="button"
                        className="btn"
                        onClick={() => {
                            handleLoadCheckConfig();
                            setShowPostingHistoryModal(true);
                        }}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 600, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <History size={15} style={{ color: 'var(--accent)' }} /> Xem Lịch Sử & Tiến Độ Đăng
                    </button>

                    <button 
                        type="button"
                        className="btn"
                        onClick={() => setShowGoogleDriveModal(true)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: '#f0f9ff', 
                            border: '1px solid #7dd3fc', 
                            color: '#0369a1', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 600, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <HardDrive size={15} style={{ color: '#0284c7' }} /> Kết Nối Google Drive
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* KPI Summary Cards Grid (Tổng sản phẩm - Đã đăng - Chưa đăng - Lỗi) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>

                {/* Card 1: Total Products */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <Package size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tổng sản phẩm</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
                            {totalProductsCount.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>SP</span>
                        </div>
                    </div>
                </div>

                {/* Card 2: Posted */}
                <div 
                    className="card" 
                    onClick={() => {
                        handleLoadCheckConfig();
                        setShowPostingHistoryModal(true);
                    }}
                    title="Bấm để xem chi tiết & quét kiểm tra sản phẩm đã đăng web"
                    style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                >
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#16a34a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <Send size={22} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Đã đăng <span style={{ fontSize: 10, color: '#16a34a', background: 'rgba(22, 163, 74, 0.12)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>🔍 Quét</span>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', lineHeight: 1.2, marginTop: 2 }}>
                            {postedCount} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>SP</span>
                        </div>
                    </div>
                </div>

                {/* Card 3: Pending */}
                <div 
                    className="card" 
                    onClick={() => {
                        handleLoadCheckConfig();
                        setShowPostingHistoryModal(true);
                    }}
                    title="Bấm để xem danh sách & quét kiểm tra sản phẩm chưa đăng web"
                    style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                >
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <Clock size={22} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Chưa đăng</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', lineHeight: 1.2, marginTop: 2 }}>
                            {pendingCount} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>SP</span>
                        </div>
                    </div>
                </div>

                {/* Card 4: Error */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#ef4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <XCircle size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lỗi</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', lineHeight: 1.2, marginTop: 2 }}>
                            {postingErrorCount} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>SP</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* View Mode Switcher Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    className={`btn ${viewMode === 'sheet' ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('sheet')}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '8px 16px', fontWeight: viewMode === 'sheet' ? 600 : 500 }}
                >
                    <FileSpreadsheet size={16} style={{ color: viewMode === 'sheet' ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span>Bảng Dữ Liệu Sheet {profileSheets.length > 0 ? `(${profileSheets.length} tab)` : ''}</span>
                </button>

                <button
                    type="button"
                    className={`btn ${viewMode === 'products' ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => {
                        setViewMode('products');
                        fetchProducts();
                        fetchCategories();
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '8px 16px', fontWeight: viewMode === 'products' ? 600 : 500 }}
                >
                    <Package size={16} style={{ color: viewMode === 'products' ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span>Danh Sách Sản Phẩm Crawler ({totalProducts})</span>
                </button>

                {/* HAR Analysis Tab — always visible, dimmed if no report yet */}
                <button
                    type="button"
                    className={`btn ${viewMode === 'har' ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('har')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 13.5, padding: '8px 16px',
                        fontWeight: viewMode === 'har' ? 600 : 500,
                        opacity: (!harReport && !harReportLoading) ? 0.55 : 1,
                        position: 'relative'
                    }}
                    title={!harReport ? 'Chưa có báo cáo HAR. Hãy upload file HAR trong mục chỉnh sửa Profile.' : 'Xem báo cáo phân tích HAR cho profile này'}
                >
                    <span style={{ fontSize: 16 }}>🔍</span>
                    <span>Phân Tích HAR</span>
                    {harReport && (
                        <span style={{
                            fontSize: 10, fontWeight: 700, background: '#7c3aed', color: 'white',
                            padding: '1px 6px', borderRadius: 10, marginLeft: 2
                        }}>
                            {harReport.summary?.highConfidenceFieldsCount || 0} trường
                        </span>
                    )}
                    {harReportLoading && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>...</span>
                    )}
                </button>

                {/* Spec Field Analyzer Button */}
                <button
                    type="button"
                    className="btn"
                    onClick={() => {
                        const activeSheet = profileSheets.find(s => s.name === activeSheetTabName);
                        const headers = (activeSheet?.data?.[0] || []).map(h => String(h || '').trim().toLowerCase());
                        
                        // Auto-detect spec column
                        let autoSpecIdx = headers.findIndex(h => h.includes('noi_dung') || h.includes('thông số') || h.includes('thong_so') || h.includes('specs') || h.includes('nội dung'));
                        
                        // Auto-detect category column
                        let autoCatIdx = headers.findIndex(h => h.includes('danh_muc') || h.includes('danh mục') || h.includes('category') || h.includes('cat_id') || h.includes('danh_muc_id'));
                        if (autoCatIdx === -1 && headers.length > 17) autoCatIdx = 17; // standard col R

                        setSpecAnalyzerResult(null);
                        setSpecAnalyzerColIdx(autoSpecIdx >= 0 ? autoSpecIdx : -1);
                        setSpecAnalyzerCatColIdx(autoCatIdx >= 0 ? autoCatIdx : -1);
                        setSpecAnalyzerSelectedCat('ALL');
                        setShowSpecAnalyzerModal(true);
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        fontSize: 13.5, padding: '8px 15px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #6d28d9, #4f46e5)', color: '#ffffff',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(109, 40, 217, 0.3)'
                    }}
                    title="Thống kê tần suất xuất hiện của từng trường (field) trong bảng thông số HTML"
                >
                    <span style={{ fontSize: 15 }}>📊</span>
                    <span>Phân Tích Trường TTS</span>
                </button>

                <button
                    type="button"
                    className="btn"
                    onClick={() => {
                        handleLoadCheckConfig();
                        setShowPostingHistoryModal(true);
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        fontSize: 13, padding: '8px 15px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #15803d, #166534)', color: '#ffffff',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(22, 101, 52, 0.3)'
                    }}
                    title="Kiểm tra xem sản phẩm đã được đăng lên website hay chưa qua Sitemap XML & Live URL"
                >
                    <Send size={14} style={{ color: '#86efac' }} />
                    <span>Quét SP Đã Đăng</span>
                </button>

                {/* Unified Data Audit Center Menu Dropdown Button */}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <button
                        type="button"
                        className="btn"
                        onClick={() => setShowAuditMenuDropdown(prev => !prev)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 13.5, padding: '8px 16px', fontWeight: 700,
                            background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#ffffff',
                            border: '1px solid #334155', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)'
                        }}
                    >
                        <ShieldAlert size={16} style={{ color: '#38bdf8' }} />
                        <span>Trung Tâm Kiểm Tra Dữ Liệu</span>
                        <ChevronDown size={14} style={{ color: '#94a3b8', transform: showAuditMenuDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                    </button>

                    {showAuditMenuDropdown && (
                        <div
                            style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300,
                                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12,
                                boxShadow: '0 15px 30px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)',
                                zIndex: 1000, overflow: 'hidden', padding: '6px 0'
                            }}
                        >
                            <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                🛡️ Danh Mục Kiểm Tra & Audit Dữ Liệu
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setShowChecklistModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#334155'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <CheckSquare size={15} style={{ color: '#0284c7' }} />
                                <div>
                                    <div>Checklist Tiến Độ (8 Bước)</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>Theo dõi tiến độ workflow hoàn thiện</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('web_posted');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#16a34a'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <ExternalLink size={15} style={{ color: '#16a34a' }} />
                                <div>
                                    <div>🌐 Trạng Thái Đăng Bài Website</div>
                                    <div style={{ fontSize: 11, color: '#15803d', fontWeight: 400 }}>Kiểm tra xem SP đã đăng hay chưa & Ghi cột Sheet</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('mandatory');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#e11d48'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <ShieldAlert size={15} style={{ color: '#e11d48' }} />
                                <div>
                                    <div>🔴 Trường Bắt Buộc (Mã, Tên, ID)</div>
                                    <div style={{ fontSize: 11, color: '#9f1239', fontWeight: 400 }}>Khóa cứng xuất Excel nếu thiếu</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('duplicate_sku');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#7c3aed'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#faf5ff'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <Copy size={15} style={{ color: '#7c3aed' }} />
                                <div>
                                    <div>🆔 Trùng Mã Sản Phẩm (SKUs)</div>
                                    <div style={{ fontSize: 11, color: '#6b21a8', fontWeight: 400 }}>Cảnh báo lặp lại SKU giữa các dòng</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('image_links');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#d97706'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <ExternalLink size={15} style={{ color: '#d97706' }} />
                                <div>
                                    <div>🖼️ Kiểm Tra Link Ảnh Đại Diện</div>
                                    <div style={{ fontSize: 11, color: '#92400e', fontWeight: 400 }}>Kiểm tra định dạng URL & Live Ping link ảnh</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('pdf_links');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#b45309'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <ExternalLink size={15} style={{ color: '#b45309' }} />
                                <div>
                                    <div>📄 Kiểm Tra Link File PDF</div>
                                    <div style={{ fontSize: 11, color: '#78350f', fontWeight: 400 }}>Kiểm tra URL & Live Ping file tài liệu HDSD</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('meta_desc');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#2563eb'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <FileText size={15} style={{ color: '#2563eb' }} />
                                <div>
                                    <div>📝 Meta Description (mo_ta)</div>
                                    <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 400 }}>Cột H: mô tả ngắn tối đa 160 ký tự</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowAuditMenuDropdown(false);
                                    setAuditModalTab('category_ids');
                                    setShowIncompleteRowsModal(true);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px',
                                    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#0d9488'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <Package size={15} style={{ color: '#0d9488' }} />
                                <div>
                                    <div>🏷️ ID Danh Mục & Thương Hiệu</div>
                                    <div style={{ fontSize: 11, color: '#115e59', fontWeight: 400 }}>Kiểm tra định dạng ID là số</div>
                                </div>
                            </button>
                        </div>
                    )}
                </div>

                {/* Export Excel Button */}
                <button
                    type="button"
                    className="btn"
                    onClick={() => setShowExportModal(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 13.5, padding: '8px 18px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                    }}
                >
                    <Download size={16} />
                    <span>Xuất File Excel (.xlsx)</span>
                </button>
            </div>


            {/* View Mode 1: Bảng Dữ Liệu Sheet (SaaS Dashboard Style - Like Image) */}
            {viewMode === 'sheet' && (
                <div className="card" style={{ padding: 0, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginBottom: 24 }}>
                    {profileSheets.length > 0 ? (
                        <>
                            {/* Unified Single-Row Toolbar (Combine view & action controls into 1 line) */}
                            <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                {/* Left Tools Group */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
                                        <FileSpreadsheet size={16} style={{ color: 'var(--accent)' }} /> 
                                        {activeSheetTabName} ({profileSheets.find(s => s.name === activeSheetTabName)?.data?.length || 0} hàng)
                                    </span>

                                    {/* Search input */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                                        <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            value={sheetSearchQuery}
                                            onChange={e => setSheetSearchQuery(e.target.value)}
                                            placeholder="Tìm nhanh..."
                                            style={{ padding: '4px 6px 4px 26px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: '#ffffff', color: 'var(--text-primary)', width: 150 }}
                                        />
                                        {sheetSearchQuery && (
                                            <button onClick={() => setSheetSearchQuery('')} style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}>
                                                <X size={11} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Undo / Redo */}
                                    <button
                                        type="button"
                                        onClick={handleUndo}
                                        style={{ padding: '5px 8px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Ho�n t�c (Ctrl+Z)"
                                    >
                                        <Undo2 size={14} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleRedo}
                                        style={{ padding: '5px 8px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Khôi phục (Ctrl+Y)"
                                    >
                                        <Redo2 size={14} />
                                    </button>

                                     <button
                                         type="button"
                                         onClick={() => handleAddPageRows(1)}
                                         style={{ padding: '4px 9px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                                     >
                                         <Plus size={12} /> Thêm Hàng
                                     </button>
                                     <button
                                         type="button"
                                         onClick={() => handleAddPageColumn(1)}
                                         style={{ padding: '4px 9px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                                     >
                                         <Plus size={12} /> Thêm Cột
                                     </button>

                                    {/* Batch Merge Columns */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPageMergeTemplate('');
                                            setPageMergeTargetColIndex(0);
                                            setPageMergeStartRow(1);
                                            setPageMergeEndRow('');
                                            setShowPageMergeColsModal(true);
                                        }}
                                        style={{ padding: '4px 10px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#ea580c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                    >
                                        <Merge size={13} /> Ghép Cột
                                    </button>
                                </div>

                                {/* Right Actions Group */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => setShowCrawlerToSheetModal(true)}
                                        style={{ fontSize: 12, padding: '5px 10px', background: '#ffffff', color: '#2563eb', borderColor: '#bfdbfe', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                                    >
                                        <FileSpreadsheet size={13} /> Nạp từ danh sách Crawler
                                    </button>

                                    <button
                                        className="btn btn-outline"
                                        onClick={() => setShowImportModal(true)}
                                        style={{ fontSize: 12, padding: '5px 10px', background: '#ffffff', color: 'var(--text-primary)' }}
                                    >
                                        + Cập nhật / Nạp lại Sheet
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => setShowAiModal(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, #ea580c 0%, #d97706 100%)',
                                            color: 'white',
                                            border: 'none',
                                            fontSize: 12,
                                            padding: '6px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontWeight: 700,
                                            boxShadow: '0 2px 6px rgba(234,88,12,0.3)'
                                        }}
                                    >
                                        <Bot size={14} /> AI Trợ Lý (Tự động hóa)
                                    </button>
                                </div>
                            </div>


                            {/* Multi-Row / Multi-Column Selection Action Banner */}
                            {(selectedRowIndices.length > 0 || selectedColIndices.length > 0) && (
                                <div style={{ padding: '8px 20px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#1e40af', fontWeight: 600, animation: 'fadeIn 0.2s ease' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            🟦 {selectedRowIndices.length > 0 ? (
                                                `Đã bôi đen chọn ${selectedRowIndices.length} hàng (từ Hàng ${Math.min(...selectedRowIndices) + 1} đến Hàng ${Math.max(...selectedRowIndices) + 1})`
                                            ) : (
                                                `Đã bôi đen chọn ${selectedColIndices.length} cột (${selectedColIndices.map(c => getColLetter(c)).join(', ')})`
                                            )}
                                        </span>
                                        {selectedRowIndices.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => scrollToRowInSheet(Math.min(...selectedRowIndices) + 1)}
                                                style={{
                                                    background: '#2563eb', color: '#ffffff', border: 'none',
                                                    padding: '3px 10px', borderRadius: 6, fontSize: 11.5,
                                                    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                                                }}
                                                title="Tự động cuộn tới đúng vị trí dòng đang được chọn"
                                            >
                                                📍 Cuộn đến Hàng #{Math.min(...selectedRowIndices) + 1}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {selectedColIndices.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const minC = Math.min(...selectedColIndices);
                                                    const maxC = Math.max(...selectedColIndices);
                                                    handleClearRangeContent(2, activePageSheetData.length - 1, minC, maxC);
                                                    setSelectedColIndices([]);
                                                }}
                                                style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 4px rgba(59,130,246,0.2)' }}
                                                title="Chỉ xóa dữ liệu của cột, giữ nguyên tiêu đề Cột"
                                            >
                                                🧹 Xóa Nội Dung Cột (Giữ Tiêu Đề)
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={selectedRowIndices.length > 0 ? handleDeleteSelectedRows : handleDeleteSelectedCols}
                                            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 4px rgba(239,68,68,0.2)' }}
                                            title={selectedRowIndices.length > 0 ? 'Xóa hàng khỏi bảng' : 'Xóa hẳn cột khỏi cấu trúc bảng'}
                                        >
                                            <Trash2 size={14} /> {selectedRowIndices.length > 0 ? `Xóa ${selectedRowIndices.length} Hàng Đã Chọn` : `Xóa Cột Khỏi Bảng`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedRowIndices([]); setSelectedColIndices([]); }}
                                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                        >
                                            ❌ Bỏ chọn
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Main Interactive Grid Table */}
                            <div className="sheet-table-container" style={{ minHeight: 380, maxHeight: 540, overflow: 'auto', position: 'relative' }}>
                                {(() => {
                                    if (activePageSheetData.length === 0) {
                                        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Tab này chưa có dữ liệu.</div>;
                                    }

                                    return (
                                        <table className="sheet-grid-table">
                                            <thead>
                                                {/* Header Row: Real Header Column Titles + Sticky + Sort & Filter buttons */}
                                                <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                                                    <th className="row-index-header" style={{ position: 'sticky', left: 0, zIndex: 12 }}>#</th>
                                                    {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => {
                                                         const rawHeader = activePageSheetData[autoHeaderRowIdx]?.[cIdx] !== undefined && activePageSheetData[autoHeaderRowIdx]?.[cIdx] !== null ? String(activePageSheetData[autoHeaderRowIdx][cIdx]).trim() : '';
                                                         const fallbackHeader = activePageSheetData[0]?.[cIdx] !== undefined && activePageSheetData[0]?.[cIdx] !== null ? String(activePageSheetData[0][cIdx]).trim() : '';
                                                         
                                                         let cleanLabel = rawHeader;
                                                         if (!cleanLabel || cleanLabel.includes('nth-child') || cleanLabel.startsWith('a.') || cleanLabel === '246') {
                                                             cleanLabel = fallbackHeader && !fallbackHeader.includes('nth-child') && !fallbackHeader.startsWith('a.') && fallbackHeader !== '246' ? fallbackHeader : `Cột ${getColLetter(cIdx)}`;
                                                         }
                                                         
                                                         const displayTitle = cleanLabel;
                                                         const isColFiltered = Boolean(columnFilters[cIdx]?.trim()) || (Array.isArray(columnSelectedValues[cIdx]) && columnSelectedValues[cIdx].length > 0);
                                                         const isColSorted = columnSortState.colIndex === cIdx;
                                                         const sortDir = isColSorted ? columnSortState.direction : null;
                                                         const isColSelected = selectedColSet.has(cIdx);
                                                         return (
                                                              <th 
                                                                  key={cIdx} 
                                                                  onMouseDown={(e) => {
                                                                      if (e.button !== 0) return;
                                                                      if (e.target.closest('.sheet-filter-btn') || e.target.closest('.sheet-filter-popover')) return;
                                                                      handleColMouseDown(cIdx, e);
                                                                  }}
                                                                  onMouseEnter={() => handleColMouseEnter(cIdx)}
                                                                  onContextMenu={(e) => {
                                                                       e.preventDefault();
                                                                       e.stopPropagation();
                                                                       setRenameColTarget({ cIdx: cIdx, currentTitle: displayTitle });
                                                                       setRenameColInput(displayTitle);
                                                                   }}
                                                                   onDoubleClick={(e) => {
                                                                       e.preventDefault();
                                                                       e.stopPropagation();
                                                                       setRenameColTarget({ cIdx: cIdx, currentTitle: displayTitle });
                                                                       setRenameColInput(displayTitle);
                                                                   }}
                                                                  title={`Chuột phải hoặc nhấp đúp để Đổi tên Cột ${displayTitle}`}
                                                                  style={{ 
                                                                      position: 'relative',
                                                                      userSelect: 'none',
                                                                      cursor: 'pointer',
                                                                      background: isColSelected ? '#dbeafe' : (isColFiltered ? '#f1f5f9' : '#f8fafc'),
                                                                      color: isColSelected ? '#1e40af' : '#1e293b',
                                                                      borderBottom: isColSelected ? '2px solid #2563eb' : (isColFiltered ? '2px solid #3b82f6' : '2px solid #e2e8f0'),
                                                                      padding: '12px 14px',
                                                                      whiteSpace: 'nowrap'
                                                                  }}
                                                              >
                                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                                      <span style={{ fontWeight: 700, fontSize: 12.5, color: isColFiltered ? '#2563eb' : '#334155', textTransform: 'uppercase', letterSpacing: '0.02em' }} title={`Cột: ${displayTitle}`}>
                                                                          {displayTitle} {isColSorted && (sortDir === 'asc' ? '↑' : '↓')}
                                                                      </span>
                                                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                          {/* Sort Button ↑↓ */}
                                                                          <button
                                                                              type="button"
                                                                              className="sheet-filter-btn"
                                                                              onMouseDown={(e) => e.stopPropagation()}
                                                                              onClick={(e) => {
                                                                                  e.stopPropagation();
                                                                                  e.preventDefault();
                                                                                  if (!isColSorted) setColumnSortState({ colIndex: cIdx, direction: 'asc' });
                                                                                  else if (sortDir === 'asc') setColumnSortState({ colIndex: cIdx, direction: 'desc' });
                                                                                  else setColumnSortState({ colIndex: null, direction: null });
                                                                              }}
                                                                              style={{
                                                                                  background: isColSorted ? 'rgba(37,99,235,0.15)' : 'transparent',
                                                                                  color: isColSorted ? '#2563eb' : '#94a3b8',
                                                                                  border: isColSorted ? '1px solid #bfdbfe' : 'none',
                                                                                  borderRadius: 4,
                                                                                  padding: '2px 5px',
                                                                                  cursor: 'pointer',
                                                                                  fontSize: 11,
                                                                                  fontWeight: 700,
                                                                                  display: 'flex',
                                                                                  alignItems: 'center'
                                                                              }}
                                                                              title={sortDir === 'asc' ? 'Đang sắp xếp A-Z (Bấm để đổi sang Z-A)' : sortDir === 'desc' ? 'Đang sắp xếp Z-A (Bấm để bỏ sắp xếp)' : 'Sắp xếp cột này (A-Z / Z-A)'}
                                                                          >
                                                                              {sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '↑↓'}
                                                                          </button>

                                                                          {/* Filter Button ∇ */}
                                                                          <button
                                                                              type="button"
                                                                              className="sheet-filter-btn"
                                                                              onMouseDown={(e) => e.stopPropagation()}
                                                                              onClick={(e) => {
                                                                                  e.stopPropagation();
                                                                                  e.preventDefault();
                                                                                  setDropdownSearch('');
                                                                                  setActiveFilterDropdownCol(activeFilterDropdownCol === cIdx ? null : cIdx);
                                                                              }}
                                                                              style={{
                                                                                  background: isColFiltered ? '#2563eb' : (activeFilterDropdownCol === cIdx ? '#cbd5e1' : 'transparent'),
                                                                                  color: isColFiltered ? '#ffffff' : (activeFilterDropdownCol === cIdx ? '#1e293b' : '#94a3b8'),
                                                                                  border: 'none',
                                                                                  borderRadius: 4,
                                                                                  padding: '2px 5px',
                                                                                  cursor: 'pointer',
                                                                                  display: 'flex',
                                                                                  alignItems: 'center'
                                                                              }}
                                                                              title={`Bộ lọc Cột ${displayTitle}`}
                                                                          >
                                                                              <Filter size={11} />
                                                                          </button>
                                                                      </div>
                                                                  </div>

                                                                  {/* Filter & Sort Popover Dropdown Card */}
                                                                  {activeFilterDropdownCol === cIdx && (
                                                                      <div
                                                                          className="sheet-filter-popover"
                                                                          onMouseDown={(e) => e.stopPropagation()}
                                                                          onClick={(e) => e.stopPropagation()}
                                                                          style={{
                                                                              position: 'absolute',
                                                                              top: '100%',
                                                                              right: 0,
                                                                              zIndex: 100,
                                                                              marginTop: 4,
                                                                              width: 250,
                                                                              background: '#ffffff',
                                                                              border: '1px solid #cbd5e1',
                                                                              borderRadius: 8,
                                                                              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                                                                              padding: 12,
                                                                              textAlign: 'left',
                                                                              fontWeight: 'normal',
                                                                              color: '#1e293b',
                                                                              whiteSpace: 'normal',
                                                                              cursor: 'default'
                                                                          }}
                                                                      >
                                                                          {/* Header Title */}
                                                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                                                                              <span style={{ fontWeight: 700, fontSize: 12, color: '#334155' }}>Lọc & Sắp xếp Cột {displayTitle}</span>
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={() => setActiveFilterDropdownCol(null)}
                                                                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                                                                              >
                                                                                  <X size={13} />
                                                                              </button>
                                                                          </div>

                                                                          {/* Quick Sort Options */}
                                                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={() => setColumnSortState({ colIndex: cIdx, direction: 'asc' })}
                                                                                  style={{
                                                                                      display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
                                                                                      background: sortDir === 'asc' ? '#eff6ff' : 'transparent', color: sortDir === 'asc' ? '#2563eb' : '#334155',
                                                                                      border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', textAlign: 'left', fontWeight: sortDir === 'asc' ? 700 : 500
                                                                                  }}
                                                                              >
                                                                                  <span>↑ Sắp xếp A → Z (Tăng dần)</span>
                                                                              </button>
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={() => setColumnSortState({ colIndex: cIdx, direction: 'desc' })}
                                                                                  style={{
                                                                                      display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
                                                                                      background: sortDir === 'desc' ? '#eff6ff' : 'transparent', color: sortDir === 'desc' ? '#2563eb' : '#334155',
                                                                                      border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', textAlign: 'left', fontWeight: sortDir === 'desc' ? 700 : 500
                                                                                  }}
                                                                              >
                                                                                  <span>↓ Sắp xếp Z → A (Giảm dần)</span>
                                                                              </button>
                                                                              {isColSorted && (
                                                                                  <button
                                                                                      type="button"
                                                                                      onClick={() => setColumnSortState({ colIndex: null, direction: null })}
                                                                                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}
                                                                                  >
                                                                                      ❌ Hủy sắp xếp cột này
                                                                                  </button>
                                                                              )}
                                                                          </div>

                                                                          {/* Text Filter Input */}
                                                                          <div style={{ marginBottom: 10 }}>
                                                                              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                                                                                  Lọc chứa từ khóa:
                                                                              </label>
                                                                              <input
                                                                                  type="text"
                                                                                  value={columnFilters[cIdx] || ''}
                                                                                  onChange={(e) => setColumnFilters(prev => ({ ...prev, [cIdx]: e.target.value }))}
                                                                                  placeholder={`Nhập từ khóa lọc...`}
                                                                                  style={{
                                                                                      width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4,
                                                                                      border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a'
                                                                                  }}
                                                                              />
                                                                          </div>

                                                                          {/* Unique Value Checklist (Google Sheets style) */}
                                                                          {(() => {
                                                                              const uniqueVals = getUniqueColumnValues(cIdx);
                                                                              const filteredVals = uniqueVals.filter(v => !dropdownSearch || v.toLowerCase().includes(dropdownSearch.toLowerCase()));
                                                                              const currentSelected = columnSelectedValues[cIdx] || [];

                                                                              return (
                                                                                  <div style={{ marginTop: 8 }}>
                                                                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                                                          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Giá trị xuất hiện ({uniqueVals.length}):</label>
                                                                                          <div style={{ display: 'flex', gap: 6 }}>
                                                                                              <button
                                                                                                  type="button"
                                                                                                  onClick={() => setColumnSelectedValues(prev => ({ ...prev, [cIdx]: [] }))}
                                                                                                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 10.5, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                                                                                              >
                                                                                                  Tất cả
                                                                                              </button>
                                                                                              <button
                                                                                                  type="button"
                                                                                                  onClick={() => setColumnSelectedValues(prev => ({ ...prev, [cIdx]: ['__NONE__'] }))}
                                                                                                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10.5, cursor: 'pointer', padding: 0 }}
                                                                                              >
                                                                                                  Bỏ hết
                                                                                              </button>
                                                                                          </div>
                                                                                      </div>

                                                                                      <input
                                                                                          type="text"
                                                                                          value={dropdownSearch}
                                                                                          onChange={(e) => setDropdownSearch(e.target.value)}
                                                                                          placeholder="🔍 Tìm giá trị cụ thể..."
                                                                                          style={{ width: '100%', padding: '4px 6px', fontSize: 11, borderRadius: 4, border: '1px solid #e2e8f0', marginBottom: 6 }}
                                                                                      />

                                                                                      <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 4, padding: 4, background: '#fafafa' }}>
                                                                                          {filteredVals.length === 0 ? (
                                                                                              <div style={{ fontSize: 11, color: '#94a3b8', padding: '6px', textAlign: 'center' }}>Không có giá trị nào</div>
                                                                                          ) : (
                                                                                              filteredVals.map((val) => {
                                                                                                  const isChecked = currentSelected.length === 0 || (currentSelected.includes(val) && !currentSelected.includes('__NONE__'));
                                                                                                  return (
                                                                                                      <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 11.5, cursor: 'pointer', borderRadius: 3, userSelect: 'none' }}>
                                                                                                          <input
                                                                                                              type="checkbox"
                                                                                                              checked={isChecked}
                                                                                                              onChange={(e) => {
                                                                                                                  const checked = e.target.checked;
                                                                                                                  setColumnSelectedValues(prev => {
                                                                                                                      const rawExisting = prev[cIdx] || [];
                                                                                                                      const existing = rawExisting.filter(v => v !== '__NONE__');

                                                                                                                      if (rawExisting.length === 0) {
                                                                                                                          if (!checked) {
                                                                                                                              return { ...prev, [cIdx]: uniqueVals.filter(v => v !== val) };
                                                                                                                          }
                                                                                                                      }

                                                                                                                      if (checked) {
                                                                                                                          const next = Array.from(new Set([...existing, val]));
                                                                                                                          return { ...prev, [cIdx]: next.length >= uniqueVals.length ? [] : next };
                                                                                                                      } else {
                                                                                                                          const next = existing.filter(v => v !== val);
                                                                                                                          return { ...prev, [cIdx]: next.length === 0 ? ['__NONE__'] : next };
                                                                                                                      }
                                                                                                                  });
                                                                                                              }}
                                                                                                          />
                                                                                                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: '#334155' }} title={val}>
                                                                                                              {val}
                                                                                                          </span>
                                                                                                      </label>
                                                                                                  );
                                                                                              })
                                                                                          )}
                                                                                      </div>
                                                                                  </div>
                                                                              );
                                                                          })()}

                                                                          {/* Clear Filter & Close Footer */}
                                                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                                                                              {isColFiltered ? (
                                                                                  <button
                                                                                      type="button"
                                                                                      onClick={() => {
                                                                                          setColumnFilters(prev => ({ ...prev, [cIdx]: '' }));
                                                                                          setColumnSelectedValues(prev => ({ ...prev, [cIdx]: [] }));
                                                                                      }}
                                                                                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                                                  >
                                                                                      🧹 Xóa lọc cột
                                                                                  </button>
                                                                              ) : <span />}

                                                                              <button
                                                                                  type="button"
                                                                                  onClick={() => setActiveFilterDropdownCol(null)}
                                                                                  style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                                                                              >
                                                                                  Đóng
                                                                              </button>
                                                                          </div>
                                                                      </div>
                                                                  )}
                                                              </th>
                                                         );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {renderedPageRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={Math.max(maxPageCols + 1, 2)} style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: 13, background: '#ffffff' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                                                <span>🚫 Không có hàng nào khớp với bộ lọc hiện tại.</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleClearAllFilters}
                                                                    style={{ color: '#2563eb', fontWeight: 600, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
                                                                >
                                                                    🧹 Xóa tất cả bộ lọc
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : renderedPageRows.map(({ rawIdx: rIdx, row }) => {
                                                    const isRowPinned = rIdx < pageFreezeRows;
                                                    const isLastPinnedRow = pageFreezeRows > 0 && rIdx === pageFreezeRows - 1;
                                                    const isRowSelected = selectedRowSet.has(rIdx);
                                                    return (
                                                        <tr
                                                            key={rIdx}
                                                            id={`sheet-row-${rIdx + 1}`}
                                                            className={isLastPinnedRow ? 'pinned-row-last' : ''}
                                                            style={isRowPinned ? { position: 'sticky', top: (rIdx + 1) * 32, zIndex: 9, background: '#fffbeb' } : {}}
                                                        >
                                                            <td 
                                                                className="row-index-cell" 
                                                                onMouseDown={(e) => handleRowMouseDown(rIdx, e)}
                                                                onMouseEnter={() => handleRowMouseEnter(rIdx)}
                                                                style={{ 
                                                                    position: 'sticky',
                                                                    left: 0,
                                                                    zIndex: isRowPinned ? 9 : 8,
                                                                    background: isRowSelected ? '#dbeafe' : isRowPinned ? '#fef3c7' : '#f8fafc',
                                                                    userSelect: 'none', 
                                                                    cursor: 'pointer',
                                                                    ...(isRowSelected ? { fontWeight: 700, color: '#1e40af', borderLeft: '3px solid #2563eb' } : isRowPinned ? { fontWeight: 700, color: '#b45309' } : {}) 
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', padding: '0 2px' }}>
                                                                    <span>{rIdx + 1} {isRowPinned && '📌'}</span>
                                                                </div>
                                                            </td>
                                                            {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => {
                                                                const cellVal = Array.isArray(row) ? row[cIdx] : '';
                                                                const valStr = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
                                                                const trimmedVal = valStr.trim();
                                                                const isUrl = trimmedVal.startsWith('http://') || trimmedVal.startsWith('https://') || trimmedVal.startsWith('www.');
                                                                const targetUrl = trimmedVal.startsWith('www.') ? `https://${trimmedVal}` : trimmedVal;

                                                                const isSelected = selectedPageCell?.rIdx === rIdx && selectedPageCell?.cIdx === cIdx;
                                                                const isColSelected = selectedColSet.has(cIdx);
                                                                const isCellInRange = selectedCellRange && 
                                                                    rIdx >= selectedCellRange.minRow && rIdx <= selectedCellRange.maxRow && 
                                                                    cIdx >= selectedCellRange.minCol && cIdx <= selectedCellRange.maxCol;
                                                                const isRowOrColSelected = isRowSelected || isColSelected || isCellInRange;
                                                                return (
                                                                    <td
                                                                        key={cIdx}
                                                                        className={`${isSelected ? 'selected-cell' : ''} ${isCellInRange ? 'range-selected-cell' : ''} ${isUrl ? 'has-url-cell' : ''}`}
                                                                        title="Click đúp để xem & sửa ô (Kéo chuột 4 hướng để bôi đen chọn ô)"
                                                                        onMouseDown={(e) => handleCellMouseDown(rIdx, cIdx, e)}
                                                                        onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                                                                        onContextMenu={(e) => handleCellContextMenu(rIdx, cIdx, e)}
                                                                        onDoubleClick={() => {
                                                                            setSelectedPageCell({ rIdx, cIdx });
                                                                            setPageCellDetailModal({
                                                                                rIdx,
                                                                                cIdx,
                                                                                val: valStr,
                                                                                newVal: valStr,
                                                                                colLetter: getColLetter(cIdx)
                                                                            });
                                                                        }}
                                                                        style={{ 
                                                                            background: isRowOrColSelected ? (isSelected ? undefined : 'rgba(59, 130, 246, 0.1)') : undefined
                                                                        }}
                                                                    >
                                                                        {isUrl ? (
                                                                            <div className="sheet-url-cell">
                                                                                <span className="sheet-url-link">{valStr}</span>
                                                                                {/* Google Sheets Hover Note Popup */}
                                                                                <div className="sheet-url-tooltip">
                                                                                    <span className="url-text">🌐 {valStr}</span>
                                                                                    <a
                                                                                        href={targetUrl}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="btn-open-link"
                                                                                        onClick={e => e.stopPropagation()}
                                                                                    >
                                                                                        <ExternalLink size={12} /> Mở liên kết
                                                                                    </a>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            valStr
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    );
                                })()}
                            </div>

                            {activePageSheetData.length > 0 && (
                                <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap', gap: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        Đang hiển thị <strong>{renderedPageRows.length}</strong> / <strong>{activePageSheetData.length.toLocaleString()}</strong> hàng {activePageSheetData.length > pageRowLimit && '(Tối ưu phản hồi mượt 60fps)'}
                                    </span>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {/* Quick Add Rows & Columns */}
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginRight: 8, borderRight: '1px solid var(--border-color)', paddingRight: 8 }}>
                                            <button type="button" onClick={() => handleAddPageRows(1)} style={{ padding: '3px 8px', fontSize: 11.5, background: 'var(--bg-card)', border: '1px solid #bbf7d0', borderRadius: 3, cursor: 'pointer', color: '#15803d', fontWeight: 600 }} title="Th�m h�ng m�i v�o cu�i Tab">+ Hàng</button>
                                            <button type="button" onClick={() => handleAddPageColumn(1)} style={{ padding: '3px 8px', fontSize: 11.5, background: 'var(--bg-card)', border: '1px solid #bfdbfe', borderRadius: 3, cursor: 'pointer', color: '#1d4ed8', fontWeight: 600 }} title="Th�m C�t m�i v�o Tab">+ Cột Mới</button>
                                        </div>

                                        {activePageSheetData.length > pageRowLimit && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => setPageRowLimit(prev => prev + 200)}
                                                    style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-card)' }}
                                                >
                                                    + Xem thêm 200 hàng
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => setPageRowLimit(activePageSheetData.length)}
                                                    style={{ fontSize: 12, padding: '4px 10px', color: 'var(--accent)', fontWeight: 600 }}
                                                >
                                                    Xem tất cả ({activePageSheetData.length.toLocaleString()} hàng)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Google Sheets Bottom Tab Bar with Right Click & Add Tab */}
                            <div className="sheet-bottom-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' }}>
                                    {profileSheets.map(s => (
                                        <div
                                            key={s.name}
                                            className={`sheet-bottom-tab ${activeSheetTabName === s.name ? 'active' : ''}`}
                                            onClick={() => setActiveSheetTabName(s.name)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setPageTabContextMenu({ x: e.clientX, y: e.clientY, tabName: s.name });
                                            }}
                                            title="Chuột phải để Đổi tên hoặc Xóa Tab"
                                        >
                                            <FileSpreadsheet size={14} />
                                            <span>{s.name}</span>
                                        </div>
                                    ))}
                                    {/* Add Empty Tab Button */}
                                    <button
                                        type="button"
                                        onClick={handleAddEmptySheetTab}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justify: 'center',
                                            gap: 4,
                                            padding: '4px 10px',
                                            marginLeft: 4,
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 4,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title="Thêm Tab mới trống"
                                    >
                                        <Plus size={13} /> Thêm Tab
                                    </button>
                                </div>
                            </div>

                        </>
                    ) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <FileSpreadsheet size={42} style={{ color: 'var(--accent)', marginBottom: 12, opacity: 0.8 }} />
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Chưa có Bảng dữ liệu Sheet cho {currentProfile?.name || 'Profile này'}</h4>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
                                Vui lòng bấm nút "Nhập file excel/link ggsheet" ở trên để nạp dữ liệu vào Profile.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setShowImportModal(true)}
                                style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '10px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FileSpreadsheet size={16} /> + Nhập file Excel / Link Google Sheets ngay
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Specifications Modal Overlay */}
            {showModal && selectedProduct && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Package size={20} style={{ color: 'var(--accent)' }} /> 
                                {selectedProduct.name} Specs
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="modal-body" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            
                            {/* Product Header Card */}
                            <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                                {selectedProduct.image_url ? (
                                    <img 
                                        src={selectedProduct.image_url} 
                                        alt={selectedProduct.name} 
                                        style={{ width: 100, height: 100, objectFit: 'contain', padding: 6, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#fff' }}
                                    />
                                ) : (
                                    <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                        <Package size={36} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 250 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>
                                        {formatCategory(selectedProduct.category)}
                                    </div>
                                    <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProduct.name}</h4>
                                    
                                    {(selectedProduct.part_number || selectedProduct.model) && (
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            Model / Mã SP: <strong style={{ fontFamily: 'monospace' }}>{selectedProduct.part_number || selectedProduct.model}</strong>
                                        </p>
                                    )}
                                    
                                    <a 
                                        href={selectedProduct.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ fontSize: 12, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontWeight: 500 }}
                                    >
                                        View original product page <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>

                            {/* Short Description - Tính năng nổi bật (bullet points) */}
                            {selectedProduct.short_description && (
                                <div style={{ marginBottom: 20 }}>
                                    <h5 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 16 }}>✨</span> Tính Năng Nổi Bật
                                    </h5>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', whiteSpace: 'pre-line' }}>
                                        {selectedProduct.short_description}
                                    </div>
                                </div>
                            )}

                            {/* Description - Tổng quan sản phẩm (detailed overview) */}
                            {selectedProduct.description && (
                                <div style={{ marginBottom: 20 }}>
                                    <h5 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 16 }}>📋</span> Tổng Quan Sản Phẩm
                                    </h5>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', whiteSpace: 'pre-line' }}>
                                        {selectedProduct.description}
                                    </div>
                                </div>
                            )}

                            {/* Fallback for products with only legacy description (no short_description) */}
                            {!selectedProduct.short_description && !selectedProduct.description && selectedProduct.description !== undefined && (
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Chưa có mô tả cho sản phẩm này.</p>
                            )}

                            {/* Specifications Grid */}
                            <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Thông Số Kỹ Thuật (Specifications)</h5>
                            {(() => {
                                const rawSpecs = selectedProduct.specifications || selectedProduct.specs_json;
                                if (!rawSpecs) {
                                    return (
                                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                                            Chưa có thông số kỹ thuật cho sản phẩm này.
                                        </p>
                                    );
                                }
                                // If rawSpecs is an HTML table or HTML block
                                if (typeof rawSpecs === 'string' && (rawSpecs.includes('<table') || rawSpecs.includes('<div') || rawSpecs.includes('<tr'))) {
                                    return (
                                        <div 
                                            style={{ overflowX: 'auto', background: 'var(--bg-primary)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12.5, lineHeight: 1.5, maxHeight: 400, overflowY: 'auto' }}
                                            dangerouslySetInnerHTML={{ __html: rawSpecs }}
                                        />
                                    );
                                }
                                let specsObj = {};
                                if (selectedProduct.parsedSpecs && typeof selectedProduct.parsedSpecs === 'object') {
                                    specsObj = selectedProduct.parsedSpecs;
                                } else if (typeof rawSpecs === 'string') {
                                    try { specsObj = JSON.parse(rawSpecs) || {}; } catch (e) {
                                        return (
                                            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)' }}>
                                                {rawSpecs}
                                            </div>
                                        );
                                    }
                                } else if (rawSpecs && typeof rawSpecs === 'object') {
                                    specsObj = rawSpecs;
                                }
                                const entries = Object.entries(specsObj);
                                if (entries.length === 0) {
                                    return (
                                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                                            Chưa có thông số kỹ thuật cho sản phẩm này.
                                        </p>
                                    );
                                }
                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                                        {entries.map(([key, val]) => (
                                            <div key={key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '8px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 13, alignItems: 'start' }}>
                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{key}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Download Links & Documents */}
                            {(() => {
                                let downloadsArr = [];
                                
                                // Helper to add links from text (single or multi-line "Title: URL" or "URL")
                                const addFromText = (txt, defaultLabel = 'Tài Liệu') => {
                                    if (!txt || typeof txt !== 'string') return;
                                    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
                                    for (const line of lines) {
                                        const colonIdx = line.indexOf(': http');
                                        if (colonIdx > 0) {
                                            const title = line.slice(0, colonIdx).trim();
                                            const u = line.slice(colonIdx + 2).trim();
                                            downloadsArr.push({ name: title || defaultLabel, url: u });
                                        } else if (line.startsWith('http')) {
                                            downloadsArr.push({ name: defaultLabel, url: line });
                                        }
                                    }
                                };

                                if (selectedProduct.document_url) addFromText(selectedProduct.document_url, 'Catalog / Tài Liệu PDF');
                                if (selectedProduct.hdsd) addFromText(selectedProduct.hdsd, 'Sách Hướng Dẫn Sử Dụng (HDSD)');

                                // From parsed custom_data
                                if (selectedProduct.custom_data) {
                                    try {
                                        const cdata = typeof selectedProduct.custom_data === 'string' ? JSON.parse(selectedProduct.custom_data) : selectedProduct.custom_data;
                                        if (cdata && typeof cdata === 'object') {
                                            Object.entries(cdata).forEach(([k, v]) => {
                                                if (k !== 'url' && k !== 'image_url' && typeof v === 'string' && (v.includes('http') || v.includes('.pdf'))) {
                                                    addFromText(v, SCHEMA_FIELD_LABELS[k] || k);
                                                }
                                            });
                                        }
                                    } catch(e) {}
                                }

                                // From legacy fields
                                let rawDl = selectedProduct?.parsedDownloads || selectedProduct?.download_links;
                                if (typeof rawDl === 'string') {
                                    try { rawDl = JSON.parse(rawDl); } catch (e) { rawDl = []; }
                                }
                                if (Array.isArray(rawDl)) {
                                    rawDl.forEach(item => {
                                        if (typeof item === 'string' && item.startsWith('http')) downloadsArr.push({ name: 'Download File', url: item });
                                        else if (item?.url) downloadsArr.push({ name: item.name || item.title || 'Download File', url: item.url });
                                    });
                                }

                                // Deduplicate downloadsArr by URL
                                const seenUrls = new Set();
                                downloadsArr = downloadsArr.filter(d => {
                                    if (!d.url || seenUrls.has(d.url)) return false;
                                    seenUrls.add(d.url);
                                    return true;
                                });

                                if (downloadsArr.length === 0) {
                                    return (
                                        <div style={{ marginTop: 24 }}>
                                            <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Download size={15} style={{ color: 'var(--text-muted)' }} /> Tài Liệu & File Tải Về (Downloads)
                                            </h5>
                                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chưa có file tải về cho sản phẩm này.</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ marginTop: 24 }}>
                                        <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Download size={15} style={{ color: 'var(--accent)' }} /> Tài Liệu & File Tải Về ({downloadsArr.length} files)
                                        </h5>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {downloadsArr.map((dl, idx) => {
                                                const url = dl.url || '';
                                                const ext = url.split('?')[0].split('.').pop().toLowerCase();
                                                const extColors = { pdf: '#ef4444', zip: '#f59e0b', exe: '#8b5cf6', apk: '#10b981', fw: '#0ea5e9', bin: '#64748b' };
                                                const color = extColors[ext] || '#ef4444';
                                                return (
                                                    <a
                                                        key={idx}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            padding: '10px 14px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: 'var(--radius-md)',
                                                            textDecoration: 'none',
                                                            transition: 'border-color 0.15s'
                                                        }}
                                                    >
                                                        <span style={{
                                                            background: color + '22',
                                                            color,
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            padding: '3px 7px',
                                                            borderRadius: 4,
                                                            textTransform: 'uppercase',
                                                            minWidth: 36,
                                                            textAlign: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            {ext || 'FILE'}
                                                        </span>
                                                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {dl.name || url}
                                                        </span>
                                                        <ExternalLink size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                        </div>

                        {/* Modal Footer */}
                        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-primary)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal 1: Cấu hình Sitemap XML (Gộp 2 phần Nạp File & Nhập Link) */}
            {showSitemapModal && (
                <div className="modal-backdrop" onClick={() => setShowSitemapModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '95vw', padding: 0, borderRadius: 'var(--radius-xl)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    🗺️ Cấu Hình Sitemap XML (Tùy Chọn)
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
                                    Profile: <strong>{currentProfile?.name || profileSlug}</strong> — <em>(Tùy chọn, nhập cũng được, để trống hoặc xóa cũng không sao)</em>
                                </p>
                            </div>
                            <button type="button" onClick={() => setShowSitemapModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: 24 }}>
                            {/* Tab Switcher: 1. Nạp File XML | 2. Nhập Link Sitemap Online */}
                            <div style={{ display: 'flex', gap: 8, background: 'var(--bg-primary)', padding: 4, borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 20 }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveSitemapTab('file')}
                                    style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: activeSitemapTab === 'file' ? 'var(--bg-card)' : 'transparent', color: activeSitemapTab === 'file' ? 'var(--accent)' : 'var(--text-muted)', boxShadow: activeSitemapTab === 'file' ? 'var(--shadow-sm)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    📄 1. Nạp File sitemap.xml
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveSitemapTab('link')}
                                    style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: activeSitemapTab === 'link' ? 'var(--bg-card)' : 'transparent', color: activeSitemapTab === 'link' ? 'var(--accent)' : 'var(--text-muted)', boxShadow: activeSitemapTab === 'link' ? 'var(--shadow-sm)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    🔗 2. Nhập Link Sitemap Online
                                </button>
                            </div>

                            {/* Section 1: Upload File XML */}
                            {activeSitemapTab === 'file' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, border: '2px dashed var(--border-color)', borderRadius: 12, padding: '32px 20px', cursor: 'pointer', background: 'var(--bg-primary)', transition: 'border-color 0.2s' }}>
                                        <Upload size={32} style={{ color: 'var(--accent)' }} />
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                Bấm để chọn file <code>.xml</code> hoặc Kéo thả vào đây
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                                Chấp nhận file <code>sitemap.xml</code> từ máy tính (Tùy chọn, không bắt buộc)
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            accept=".xml"
                                            style={{ display: 'none' }}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const text = await file.text();
                                                    await fetchApi(`/api/products/profiles/${profileSlug}/sitemap`, {
                                                        method: 'POST',
                                                        body: JSON.stringify({ sitemapXml: text })
                                                    });
                                                    setSitemapInfo(prev => ({ ...prev, sitemapXml: text }));
                                                    toast(`✅ Đã nạp thành công file sitemap.xml (${(file.size / 1024).toFixed(1)} KB)!`, 'success');
                                                    setShowSitemapModal(false);
                                                } catch (err) {
                                                    toast('❌ Lỗi khi nạp file sitemap: ' + err.message, 'danger');
                                                }
                                            }}
                                        />
                                    </label>
                                    {sitemapInfo?.sitemapXml ? (
                                        <div style={{ fontSize: 12, color: '#16a34a', background: 'rgba(22,163,74,0.08)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(22,163,74,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <CheckCircle2 size={16} /> 
                                                <span>File Sitemap XML đã sẵn sàng trong cơ sở dữ liệu.</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await fetchApi(`/api/products/profiles/${profileSlug}/sitemap`, {
                                                            method: 'POST',
                                                            body: JSON.stringify({ sitemapXml: '' })
                                                        });
                                                        setSitemapInfo(prev => ({ ...prev, sitemapXml: null }));
                                                        toast('✅ Đã xóa bỏ file Sitemap XML (chuyển về không dùng file sitemap)!', 'info');
                                                    } catch (err) {
                                                        toast('❌ Lỗi khi xóa file sitemap: ' + err.message, 'danger');
                                                    }
                                                }}
                                                style={{ padding: '6px 12px', fontSize: 12, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            >
                                                <Trash2 size={13} /> Xóa / Bỏ File Này
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>💡</span>
                                            <span>Mục này là <strong>tùy chọn</strong>. Nếu không có file sitemap.xml từ máy tính, bạn hoàn toàn có thể bỏ qua không cần nạp.</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 2: Nhập Link Online */}
                            {activeSitemapTab === 'link' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Đường Dẫn URL Sitemap Online:
                                            </label>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4 }}>
                                                Tùy chọn - Không bắt buộc
                                            </span>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="url"
                                                placeholder="Để trống nếu không dùng, hoặc VD: https://www.argox.com/sitemap.xml"
                                                value={inputSitemapUrl}
                                                onChange={e => setInputSitemapUrl(e.target.value)}
                                                style={{ width: '100%', padding: '10px 36px 10px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                                            />
                                            {inputSitemapUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => setInputSitemapUrl('')}
                                                    title="Xóa trắng ô link"
                                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
                                                >
                                                    <X size={15} />
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                            💡 Bạn có thể <strong>để trống ô này rồi bấm "Lưu"</strong> để hủy bỏ link sitemap, hoặc bấm nút <strong>"Bỏ Link Sitemap"</strong> bên dưới.
                                        </p>
                                    </div>

                                    {sitemapInfo?.sitemapUrl && (
                                        <div style={{ fontSize: 12, color: '#0284c7', background: 'rgba(2,132,199,0.08)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(2,132,199,0.25)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Globe size={14} /> Link Sitemap hiện tại: <code style={{ wordBreak: 'break-all' }}>{sitemapInfo.sitemapUrl}</code>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
                                        {/* Left: Nút Bỏ link sitemap */}
                                        {(inputSitemapUrl || sitemapInfo?.sitemapUrl) ? (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await fetchApi(`/api/products/profiles/${profileSlug}/sitemap`, {
                                                            method: 'POST',
                                                            body: JSON.stringify({ sitemapUrl: '' })
                                                        });
                                                        setInputSitemapUrl('');
                                                        setSitemapInfo(prev => ({ ...prev, sitemapUrl: null }));
                                                        toast('✅ Đã xóa bỏ link sitemap (chuyển về không dùng link sitemap)!', 'info');
                                                        setShowSitemapModal(false);
                                                    } catch (err) {
                                                        toast('❌ Lỗi khi xóa link sitemap: ' + err.message, 'danger');
                                                    }
                                                }}
                                                style={{ padding: '8px 14px', fontSize: 12.5, background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                            >
                                                <Trash2 size={14} /> Bỏ Link Sitemap
                                            </button>
                                        ) : <div />}

                                        {/* Right: Hủy / Lưu */}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button
                                                type="button"
                                                onClick={() => setShowSitemapModal(false)}
                                                className="btn btn-secondary"
                                                style={{ padding: '8px 16px', fontSize: 13 }}
                                            >
                                                Hủy
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={async () => {
                                                    const trimmedUrl = inputSitemapUrl.trim();
                                                    try {
                                                        await fetchApi(`/api/products/profiles/${profileSlug}/sitemap`, {
                                                            method: 'POST',
                                                            body: JSON.stringify({ sitemapUrl: trimmedUrl })
                                                        });
                                                        setSitemapInfo(prev => ({ ...prev, sitemapUrl: trimmedUrl || null }));
                                                        if (trimmedUrl) {
                                                            toast('✅ Đã lưu Link Sitemap.xml thành công!', 'success');
                                                        } else {
                                                            toast('✅ Đã lưu cấu hình (không sử dụng Link Sitemap)!', 'info');
                                                        }
                                                        setShowSitemapModal(false);
                                                    } catch (err) {
                                                        toast('❌ ' + (err.message || 'Lỗi lưu Link Sitemap'), 'danger');
                                                    }
                                                }}
                                                style={{ padding: '8px 20px', fontSize: 13, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                                            >
                                                💾 {inputSitemapUrl.trim() ? 'Lưu Link Sitemap Online' : 'Lưu (Bỏ / Không Dùng Link)'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal 2: Cấu hình Link Website Hãng (Thay thế prompt() cũ) */}
            {showTargetUrlModal && (
                <div className="modal-backdrop" onClick={() => setShowTargetUrlModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '95vw', padding: 0, borderRadius: 'var(--radius-xl)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    🌐 Cấu Hình Link Website Hãng
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9 }}>
                                    Profile: <strong>{currentProfile?.name || profileSlug}</strong>
                                </p>
                            </div>
                            <button type="button" onClick={() => setShowTargetUrlModal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                                    Đường Dẫn Website Chính của Hãng:
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://www.argox.com"
                                    value={inputTargetUrl}
                                    onChange={e => setInputTargetUrl(e.target.value)}
                                    style={{ width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    💡 Crawler sẽ truy cập đường dẫn này để quét danh mục, series và tất cả sản phẩm của hãng.
                                </p>
                            </div>

                            {/* Preview Domain Card */}
                            {inputTargetUrl && (
                                <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <span>Tên miền nhận diện: <strong style={{ color: '#0284c7' }}>{inputTargetUrl.replace(/^https?:\/\//, '').split('/')[0]}</strong></span>
                                </div>
                            )}

                            {/* Footer Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => setShowTargetUrlModal(false)}
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: 13 }}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        try {
                                            await fetchApi(`/api/products/profiles/${profileSlug}`, {
                                                method: 'PATCH',
                                                body: JSON.stringify({ name: currentProfile?.name || profileSlug, target_url: inputTargetUrl.trim() })
                                            });
                                            setCurrentProfile(prev => ({ ...prev, target_url: inputTargetUrl.trim() }));
                                            toast('✅ Đã cập nhật Link Website Hãng thành công!', 'success');
                                            setShowTargetUrlModal(false);
                                        } catch (err) {
                                            toast('❌ ' + (err.message || 'Lỗi cập nhật Link Website'), 'danger');
                                        }
                                    }}
                                    style={{ padding: '8px 20px', fontSize: 13, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                                >
                                    💾 Lưu Link Website Hãng
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Modal 1: Cell Detail Viewer & Editor (Products Page) */}
            {pageCellDetailModal && (
                <div className="modal-backdrop" onClick={() => setPageCellDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Edit3 size={18} style={{ color: 'var(--accent)' }} /> 
                                Chi Tiết Ô [{pageCellDetailModal.colLetter}{pageCellDetailModal.rIdx + 1}] — Hàng {pageCellDetailModal.rIdx + 1}
                            </span>
                            <button type="button" onClick={() => setPageCellDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ marginBottom: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Nội dung ô:
                            </label>
                            <textarea
                                value={pageCellDetailModal.newVal}
                                onChange={e => setPageCellDetailModal(p => ({ ...p, newVal: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                                        // Plain Enter → Save
                                        e.preventDefault();
                                        handleSavePageCellDetail(pageCellDetailModal.newVal);
                                    } else if (e.key === 'Enter' && e.ctrlKey) {
                                        // Ctrl+Enter → insert newline manually
                                        e.preventDefault();
                                        const ta = e.target;
                                        const start = ta.selectionStart;
                                        const end = ta.selectionEnd;
                                        const val = pageCellDetailModal.newVal;
                                        const newVal = val.slice(0, start) + '\n' + val.slice(end);
                                        setPageCellDetailModal(p => ({ ...p, newVal }));
                                        requestAnimationFrame(() => {
                                            ta.selectionStart = ta.selectionEnd = start + 1;
                                        });
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    minHeight: 220,
                                    maxHeight: '55vh',
                                    padding: '12px 14px',
                                    fontSize: 13,
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'monospace',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.5
                                }}
                            />
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 12 }}>
                                <span>⏎ <kbd style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Enter</kbd> Lưu nhanh</span>
                                <span>↵ <kbd style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Ctrl+Enter</kbd> Xuống dòng</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                    navigator.clipboard.writeText(pageCellDetailModal.newVal);
                                    setCopiedPageCell(true);
                                    setTimeout(() => setCopiedPageCell(false), 2000);
                                }}
                                style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {copiedPageCell ? <Check size={15} style={{ color: '#16a34a' }} /> : <Copy size={15} />}
                                {copiedPageCell ? 'Đã sao chép!' : 'Sao chép nội dung'}
                            </button>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setPageCellDetailModal(null)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleSavePageCellDetail(pageCellDetailModal.newVal)}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <CheckCircle2 size={15} /> Lưu chỉnh sửa ô
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Modal 2: Batch Merge Columns Modal (Products Page) */}
            {showPageMergeColsModal && (
                <div className="modal-backdrop" onClick={() => setShowPageMergeColsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 540, maxWidth: '95%', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Merge size={18} style={{ color: 'var(--accent)' }} /> 🔗 Ghép Cột Hàng (Batch Merge Columns)
                            </span>
                            <button type="button" onClick={() => setShowPageMergeColsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    1. Chọn Cột Đích (Nơi lưu kết quả ghép):
                                </label>
                                <select
                                    value={pageMergeTargetColIndex}
                                    onChange={e => setPageMergeTargetColIndex(parseInt(e.target.value))}
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                >
                                    {Array.from({ length: Math.max(maxPageCols, 1) }).map((_, cIdx) => (
                                        <option key={cIdx} value={cIdx}>
                                            Cột {(() => {
                                                let temp, letter = '';
                                                let colIndex = cIdx;
                                                while (colIndex >= 0) {
                                                    temp = colIndex % 26;
                                                    letter = String.fromCharCode(temp + 65) + letter;
                                                    colIndex = Math.floor(colIndex / 26) - 1;
                                                }
                                                return letter;
                                            })()} ({activePageSheetData[0]?.[cIdx] || `Cột`})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    2. Cấu trúc Ghép (Template):
                                </label>
                                <input
                                    type="text"
                                    value={pageMergeTemplate}
                                    onChange={e => setPageMergeTemplate(e.target.value)}
                                    placeholder="Ví dụ: {{A}} - {{B}} (Model: {{D}})"
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Chèn nhanh tag cột:</span>
                                    {Array.from({ length: Math.min(maxPageCols, 12) }).map((_, cIdx) => {
                                        let temp, letter = '';
                                        let colIndex = cIdx;
                                        while (colIndex >= 0) {
                                            temp = colIndex % 26;
                                            letter = String.fromCharCode(temp + 65) + letter;
                                            colIndex = Math.floor(colIndex / 26) - 1;
                                        }
                                        return (
                                            <button
                                                key={letter}
                                                type="button"
                                                onClick={() => setPageMergeTemplate(prev => prev + `{{${letter}}}`)}
                                                style={{ padding: '2px 7px', fontSize: 11.5, background: '#fff7ed', border: '1px solid #ffedd5', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                + {`{{${letter}}}`}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Từ hàng số:
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={pageMergeStartRow}
                                        onChange={e => setPageMergeStartRow(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Đến hàng số:
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="Mặc định: Hàng cuối"
                                        value={pageMergeEndRow}
                                        onChange={e => setPageMergeEndRow(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                            </div>

                            {/* Live Preview Box */}
                            {pageMergeTemplate.trim() && (
                                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
                                    <strong style={{ color: '#16a34a', display: 'block', marginBottom: 2 }}>
                                        🔍 Xem trước kết quả mẫu (Hàng 1):
                                    </strong>
                                    <span style={{ color: '#15803d', fontFamily: 'monospace' }}>
                                        {evaluatePageTemplate(pageMergeTemplate, activePageSheetData[0] || []) || '(Rỗng)'}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPageMergeColsModal(false)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleExecutePageMergeCols}
                                    disabled={!pageMergeTemplate.trim()}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <Merge size={15} /> Bắt đầu Ghép Cột
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Sheet & Excel Modal */}
            <ImportSheetModal 
                isOpen={showImportModal} 
                onClose={() => setShowImportModal(false)} 
                profileName={currentProfile?.name || 'Profile'} 
                profileSlug={profileSlug}
                onImportSuccess={fetchProfileSheetData}
            />

            {/* AI Assistant Integrated Modal */}
            <AiAssistantModal
                isOpen={showAiModal}
                onClose={() => setShowAiModal(false)}
                profileName={currentProfile?.name || 'Profile'}
                profileSlug={profileSlug}
                sheets={profileSheets}
                activeTabName={activeSheetTabName}
                onUpdateSheets={(newSheets) => setProfileSheets(newSheets)}
                aiState={aiTaskState}
                setAiState={setAiTaskState}
            />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* View Mode 2: Danh Sách Sản Phẩm Crawler (Product Data Grid) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {viewMode === 'products' && (
                <div style={{ marginBottom: 24 }}>
                    {/* Header Controls: Search, Filter, Batch Action Toolbar */}
                    <div className="card" style={{ padding: '16px 20px', marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                            {/* Search & Category Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                                <div style={{ position: 'relative', minWidth: 260 }}>
                                    <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Tìm theo tên sản phẩm, mã, series..."
                                        value={searchInput}
                                        onChange={e => setSearchInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { setSearchTerm(searchInput); setCurrentPage(1); } }}
                                        style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                                    />
                                </div>
                                <select
                                    value={selectedCategory}
                                    onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                                    style={{ padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                >
                                    <option value="">-- Tất cả danh mục ({categories.length}) --</option>
                                    {categories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Batch Action Buttons & Clear Profile Button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                {selectedCrawlerProductIds.length > 0 && (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setSelectedCrawlerProductIds([])}
                                            style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                                        >
                                            <Square size={13} /> Bỏ chọn ({selectedCrawlerProductIds.length})
                                        </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={async () => {
                                            const confirmDelete = window.confirm(`⚠️ Bạn có chắc chắn muốn XÓA ${selectedCrawlerProductIds.length} sản phẩm đã chọn?`);
                                            if (!confirmDelete) return;
                                            try {
                                                await fetchApi('/api/products/batch', {
                                                    method: 'DELETE',
                                                    body: JSON.stringify({ ids: selectedCrawlerProductIds })
                                                });
                                                toast(`🗑️ Đã xóa thành công ${selectedCrawlerProductIds.length} sản phẩm!`, 'success');
                                                setSelectedCrawlerProductIds([]);
                                                fetchProducts();
                                            } catch (err) {
                                                toast('❌ ' + (err.message || 'Lỗi khi xóa sản phẩm'), 'danger');
                                            }
                                        }}
                                        style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}
                                        >
                                            <Trash2 size={14} /> Xóa {selectedCrawlerProductIds.length} sản phẩm đã chọn
                                        </button>
                                    </>
                                )}

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const confirmClear = window.confirm(`🚨 CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ sản phẩm của Profile "${currentProfile?.name || profileSlug}"?\n\nHành động này không thể hoàn tác!`);
                                        if (!confirmClear) return;
                                        try {
                                            await fetchApi('/api/products/clear-profile', {
                                                method: 'DELETE',
                                                body: JSON.stringify({ profile: profileSlug })
                                            });
                                            toast(`🗑️ Đã xóa sạch toàn bộ sản phẩm của Profile!`, 'info');
                                            setSelectedCrawlerProductIds([]);
                                            fetchProducts();
                                        } catch (err) {
                                            toast('❌ ' + (err.message || 'Lỗi khi xóa dữ liệu Profile'), 'danger');
                                        }
                                    }}
                                    style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Trash2 size={13} /> Xóa sạch dữ liệu Profile
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowCrawlerToSheetModal(true)}
                                    disabled={products.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}
                                >
                                    <FileSpreadsheet size={14} style={{ color: '#0284c7' }} />
                                    Chuyển {selectedCrawlerProductIds.length > 0 ? `${selectedCrawlerProductIds.length} đã chọn` : 'tất cả'} sang Sheet
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Products Table Card */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '12px 14px', width: 40, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={products.length > 0 && selectedCrawlerProductIds.length === products.length}
                                                onChange={toggleSelectAllCrawlerProducts}
                                                style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent)' }}
                                            />
                                        </th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', width: 80, fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ảnh</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tên Sản Phẩm</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 140 }}>Danh Mục</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 130 }}>Series</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 120 }}>Model</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 130 }}>Thao Tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                <Loader2 className="spin" size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                                                <div>Đang tải danh sách sản phẩm...</div>
                                            </td>
                                        </tr>
                                    ) : products.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                <Package size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
                                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Chưa có sản phẩm nào trong Profile này</div>
                                                <div style={{ fontSize: 12.5 }}>Hãy nạp File HAR / Sitemap.xml và bấm <strong>Bắt Đầu Crawl (Double Check)</strong> để thu thập dữ liệu.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        products.map(p => {
                                            const isSelected = selectedCrawlerProductIds.includes(p.id);
                                            return (
                                                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectCrawlerProduct(p.id)}
                                                            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent)' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {p.image_url ? (
                                                            <img src={p.image_url} alt={p.name} style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
                                                        ) : (
                                                            <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>No Pic</div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{p.name}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                                                            {p.url}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                                            {p.category || 'Chưa rõ'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', color: '#2563eb', fontWeight: 600 }}>
                                                            {p.series || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                        {p.part_number || p.model || '—'}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setSelectedProduct(p); setShowModal(true); }}
                                                                style={{ padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                                title="Xem chi tiết sản phẩm"
                                                            >
                                                                <Eye size={13} /> Xem
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const confirmSingle = window.confirm(`⚠️ Xóa sản phẩm "${p.name}"?`);
                                                                    if (!confirmSingle) return;
                                                                    try {
                                                                        await fetchApi(`/api/products/${p.id}`, { method: 'DELETE' });
                                                                        toast(`🗑️ Đã xóa sản phẩm "${p.name}"`, 'success');
                                                                        fetchProducts();
                                                                    } catch (err) {
                                                                        toast('❌ ' + (err.message || 'Lỗi khi xóa sản phẩm'), 'danger');
                                                                    }
                                                                }}
                                                                style={{ padding: '6px 8px', background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                                                                title="X�a s�n ph�m n�y"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                    Hiển thị trang {currentPage} / {totalPages} (Tổng {totalProducts} sản phẩm)
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        className="btn btn-secondary"
                                        style={{ fontSize: 12, padding: '6px 12px' }}
                                    >
                                        <ChevronLeft size={14} /> Trang trước
                                    </button>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        className="btn btn-secondary"
                                        style={{ fontSize: 12, padding: '6px 12px' }}
                                    >
                                        Trang sau <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* View Mode 3: HAR Analysis Report Tab */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {viewMode === 'har' && (
                <div style={{ marginBottom: 24 }}>
                    {harReportLoading ? (
                        <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
                            <Loader2 className="spin" size={36} style={{ color: 'var(--accent)', marginBottom: 16 }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Đang tải báo cáo phân tích HAR...</p>
                        </div>
                    ) : !harReport ? (
                        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>🔍</span>
                            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Chưa có báo cáo phân tích HAR</h4>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 20px' }}>
                                Upload file HAR từ DevTools (F12 → Network → Chuột phải → Save all as HAR) trong phần chỉnh sửa Profile (chuột phải vào Profile trong Sidebar).
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <div style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', borderRadius: 8, padding: '12px 20px', fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 340, textAlign: 'left' }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>Cách lấy file HAR:</strong><br/>
                                    1. Mở trình duyệt → F12 → Tab Network<br/>
                                    2. Duyệt qua 1 số trang sản phẩm của hãng<br/>
                                    3. Chuột phải vào danh sách request → Save all as HAR<br/>
                                    4. Upload file .har trong phần Edit Profile
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Report Header */}
                            <div className="card" style={{ padding: '20px 24px', marginBottom: 16, background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', border: 'none', color: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                            <span style={{ fontSize: 24 }}>🔍</span>
                                            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Báo Cáo Phân Tích HAR</h3>
                                        </div>
                                        <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
                                            Profile: <strong>{harReport.profileName || currentProfile?.name}</strong>
                                            {harReport.harFileName && <> &nbsp;·&nbsp; File: <strong>{harReport.harFileName}</strong> ({harReport.harFileSizeKb} KB)</>}
                                        </p>
                                        {harReport.summary?.analyzedAt && (
                                            <p style={{ fontSize: 11.5, opacity: 0.6, margin: '4px 0 0' }}>
                                                Phân tích lúc: {new Date(harReport.summary.analyzedAt).toLocaleString('vi-VN')}
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await fetchApi('/api/products/crawler/trigger', { method: 'POST', body: JSON.stringify({ concurrency: 3, profile: profileSlug }) });
                                                    toast('🚀 Đã kích hoạt Crawler! Đang tiến hành crawl sản phẩm...', 'success');
                                                    fetchProducts();
                                                    fetchCategories();
                                                    window.dispatchEvent(new Event('refresh_crawler_products'));
                                                } catch (err) {
                                                    toast('❌ ' + (err.message || 'Lỗi khi kích hoạt crawler'), 'danger');
                                                }
                                            }}
                                            style={{
                                                padding: '10px 22px', background: '#16a34a', color: 'white',
                                                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                                whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(22,163,74,0.4)'
                                            }}
                                        >
                                            <Play size={16} /> 🚀 Bắt Đầu Crawl (Double Check)
                                        </button>
                                        <span style={{ fontSize: 11, opacity: 0.8 }}>✅ Quét kết hợp HAR + Sitemap + Web Scan</span>
                                    </div>
                                </div>
                            </div>

                            {/* Summary Cards Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                                {[
                                    { label: 'Tổng Requests', value: harReport.summary?.totalEntries?.toLocaleString() || 0, icon: '📡', color: '#3b82f6' },
                                    { label: 'JSON API Calls', value: harReport.summary?.totalJsonApis || 0, icon: '⚡', color: '#8b5cf6' },
                                    { label: 'Trường Phát Hiện', value: harReport.summary?.detectableFieldsCount || 0, icon: '🔎', color: '#f59e0b' },
                                    { label: 'Trường Độ Tin Cao', value: harReport.summary?.highConfidenceFieldsCount || 0, icon: '✅', color: '#16a34a' },
                                ].map(card => (
                                    <div key={card.label} className="card" style={{ padding: '16px 18px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, marginBottom: 6 }}>{card.icon}</div>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{card.label}</div>
                                    </div>
                                ))}
                            </div>


                             {/* Double-Check Multi-Source Configuration & Indicator Panel */}
                             <div className="card" style={{ padding: '18px 22px', marginBottom: 16, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                                 {/* Title */}
                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                                     <div>
                                         <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                             <span>⚡</span> Chế Độ Crawl Double-Check (Đồng Bộ Đa Nguồn 100%)
                                         </h4>
                                         <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                                             Tự động quét & khử trùng lặp link sản phẩm từ Website chính, File HAR và Sitemap.xml để lấy dữ liệu 100% sản phẩm.
                                         </p>
                                     </div>
                                 </div>

                                 {/* Status Badges Row */}
                                 <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 14 }}>
                                     <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>Chỉ báo nguồn:</span>

                                     {/* 1. Website Link Status */}
                                      {currentProfile?.target_url ? (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 12, fontWeight: 600, border: '1px solid rgba(34,197,94,0.3)' }}>
                                              🟢 Link Web: {currentProfile.target_url.replace(/^https?:\/\//, '').split('/')[0]}
                                          </span>
                                      ) : (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border-color)' }}>
                                              ⚪ Link Web: Tùy chọn
                                          </span>
                                      )}

                                      {/* 2. HAR Analysis Status */}
                                      {harReport?.harFileName ? (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 12, fontWeight: 600, border: '1px solid rgba(34,197,94,0.3)' }}>
                                              🟢 File HAR: {harReport.harFileName} ({harReport.summary?.totalEntries || 0} reqs)
                                          </span>
                                      ) : (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#b45309', fontSize: 12, fontWeight: 600, border: '1px solid rgba(245,158,11,0.3)' }}>
                                              🟡 Chưa nạp File HAR
                                          </span>
                                      )}

                                      {/* 3. Sitemap Status */}
                                      {sitemapInfo?.sitemapXml || sitemapInfo?.sitemapUrl || currentProfile?.sitemap_url ? (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 12, fontWeight: 600, border: '1px solid rgba(34,197,94,0.3)' }}>
                                              🟢 Sitemap: Đã sẵn sàng
                                          </span>
                                      ) : (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border-color)' }}>
                                              ⚪ Sitemap XML: Tùy chọn
                                          </span>
                                      )}
                                 </div>

                                 {/* Quick Action Buttons Row */}
                                 <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                     {/* Action 1: Nhập/Sửa Link Web Hãng */}
                                     <button
                                         type="button"
                                         onClick={() => {
                                             setInputTargetUrl(currentProfile?.target_url || '');
                                             setShowTargetUrlModal(true);
                                         }}
                                         style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'var(--shadow-sm)' }}
                                     >
                                         🌐 {currentProfile?.target_url ? 'Sửa Link Web Hãng' : '➕ Nhập Link Web Hãng (Tùy Chọn)'}
                                     </button>

                                     {/* Action 2: Nạp File HAR */}
                                     <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'var(--shadow-sm)' }}>
                                         📡 Nạp File HAR
                                         <input
                                             type="file"
                                             accept=".har,application/json"
                                             style={{ display: 'none' }}
                                             onChange={async (e) => {
                                                 const file = e.target.files?.[0];
                                                 if (!file) return;
                                                 try {
                                                     const form = new FormData();
                                                     form.append('har', file);
                                                     form.append('profile', profileSlug);
                                                     const result = await fetchApi(`/api/products/profiles/${profileSlug}/har`, {
                                                         method: 'POST',
                                                         body: form,
                                                         headers: {}
                                                     });
                                                     if (result?.report) setHarReport(result.report);
                                                     toast(`✅ Phân tích HAR thành công (${result?.report?.summary?.detectableFieldsCount || 0} trường)!`, 'success');
                                                 } catch (err) {
                                                     toast('❌ ' + (err.message || 'Lỗi upload HAR'), 'danger');
                                                 }
                                             }}
                                         />
                                     </label>

                                     {/* Action 3: Gộp 2 nút Sitemap thành 1 nút Cấu hình Sitemap XML */}
                                     <button
                                         type="button"
                                         onClick={() => {
                                             setInputSitemapUrl(sitemapInfo?.sitemapUrl || currentProfile?.sitemap_url || '');
                                             setShowSitemapModal(true);
                                         }}
                                         style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)', boxShadow: 'var(--shadow-sm)' }}
                                     >
                                         🗺️ Nạp / Cấu Hình Sitemap XML (Tùy Chọn)
                                     </button>
                                 </div>
                             </div>
                            {/* Crawlable Fields Table with 31-Column Mapping */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>📋</span> Các Trường Phân Tích HAR & Chỉ Định Gán Cột Sheet
                                        </h4>
                                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                            Chỉ định chính xác từng trường HAR sẽ đổ vào cột nào trong <strong>Mẫu 31 Cột Chuẩn</strong> (từ Cột A đến Cột AE).
                                        </span>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={handleSaveHarMapping}
                                            disabled={savingHarMapping}
                                            style={{
                                                padding: '7px 14px', background: '#3b82f6', color: 'white',
                                                border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12.5,
                                                cursor: savingHarMapping ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                boxShadow: '0 2px 8px rgba(59,130,246,0.3)'
                                            }}
                                        >
                                            {savingHarMapping ? <Loader2 size={14} className="spin" /> : <span>💾</span>}
                                            Lưu Chỉ Định Cột HAR
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowCrawlerToSheetModal(true)}
                                            style={{
                                                padding: '7px 14px', background: '#16a34a', color: 'white',
                                                border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12.5,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                boxShadow: '0 2px 8px rgba(22,163,74,0.3)'
                                            }}
                                        >
                                            <span>📥</span> Chuyển Dữ Liệu Sang Sheet
                                        </button>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 180 }}>Trường Dữ Liệu</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 120 }}>Độ Tin Cậy</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Giá Trị Mẫu</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 80 }}>Xuất Hiện</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--accent)', textTransform: 'uppercase', width: 230 }}>🎯 Gán Cột (Mẫu 31 Cột)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(harReport.fields || []).map((field, idx) => {
                                                const confColor = field.confidence >= 50 ? '#16a34a' : field.confidence >= 20 ? '#f59e0b' : '#94a3b8';
                                                const rowBg = field.confidence >= 50 ? 'rgba(22,163,74,0.04)' : field.confidence >= 20 ? 'rgba(245,158,11,0.04)' : 'var(--bg-card)';
                                                const currentColId = harFieldMappings[field.fieldKey] || '';
                                                const assignedCol = STANDARD_31_COLUMNS.find(c => c.id === currentColId);

                                                return (
                                                    <tr key={field.fieldKey} style={{ borderBottom: '1px solid var(--border-color)', background: rowBg }}>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{field.label}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{field.fieldKey}</div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{ flex: 1, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                                                                    <div style={{ height: '100%', width: `${field.confidence}%`, background: confColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                                                                </div>
                                                                <span style={{ fontSize: 12.5, fontWeight: 700, color: confColor, minWidth: 32, textAlign: 'right' }}>{field.confidence}%</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {field.samples && field.samples.length > 0 ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    {field.samples.slice(0, 2).map((s, si) => (
                                                                        <div key={si} style={{ fontSize: 11.5, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{s.path}:</span>
                                                                            {s.value}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa có mẫu</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            <span style={{ fontWeight: 700, fontSize: 14, color: field.occurrences > 0 ? confColor : 'var(--text-muted)' }}>
                                                                {field.occurrences || 0}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <select
                                                                value={currentColId}
                                                                onChange={(e) => {
                                                                    const selectedVal = e.target.value;
                                                                    setHarFieldMappings(prev => ({
                                                                        ...prev,
                                                                        [field.fieldKey]: selectedVal
                                                                    }));
                                                                }}
                                                                style={{
                                     padding: '6px 10px',
                                                                    fontSize: 12,
                                                                    fontWeight: 600,
                                                                    borderRadius: 6,
                                                                    border: assignedCol ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                                                                    background: assignedCol ? 'rgba(99,102,241,0.08)' : 'var(--bg-primary)',
                                                                    color: assignedCol ? 'var(--accent)' : 'var(--text-secondary)',
                                                                    width: '100%',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <option value="">-- Bỏ qua (Không đổ dữ liệu) --</option>
                                                                {STANDARD_31_COLUMNS.map(col => (
                                                                    <option key={col.id} value={col.id}>
                                                                        {col.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════════════════ */}
                            {/* Section: Schema Trích Xuất Chính Xác                  */}
                            {/* ══════════════════════════════════════════════════════ */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #0f2027 0%, #1a3a4a 100%)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>🎯</span> Schema Trích Xuất Chính Xác
                                        </h4>
                                        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
                                            Định nghĩa 1 lần, dùng mãi. App dùng schema này để crawl đúng từng field thay vì đoán từ HAR.
                                        </span>
                                    </div>
                                    <button
                                         type="button"
                                        onClick={handleSaveSchema}
                                        disabled={savingSchema}
                                        style={{ padding: '8px 18px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: savingSchema ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 2px 8px rgba(14,165,233,0.4)', whiteSpace: 'nowrap' }}
                                    >
                                        {savingSchema ? <Loader2 size={14} className="spin" /> : <span>💾</span>} Lưu Schema
                                    </button>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                                                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', width: 170 }}>Trường Dữ Liệu</th>
                                                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', width: 200 }}>Loại Trích Xuất</th>
                                                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selector / Path / Pattern</th>
                                                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', width: 160 }}>Lấy Thuộc Tính</th>
                                                <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', width: 48 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {SCHEMA_FIELD_KEYS.filter(k => !hiddenDefaultFields.includes(k)).map((fieldKey) => {
                                                const rule = extractionSchema[fieldKey] || {};
                                                const isActive = rule.type && rule.type !== 'skip';
                                                return (
                                                    <tr key={fieldKey} style={{ borderBottom: '1px solid var(--border-color)', background: isActive ? 'rgba(14,165,233,0.04)' : 'var(--bg-card)' }}>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#0ea5e9' : 'var(--text-secondary)' }}>{SCHEMA_FIELD_LABELS[fieldKey]}</div>
                                                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fieldKey}</div>
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <select
                                                                value={rule.type || 'skip'}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], type: e.target.value, selector: prev[fieldKey]?.selector || '', attr: prev[fieldKey]?.attr || 'text' } }))}
                                                                style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: isActive ? '1.5px solid #0ea5e9' : '1px solid var(--border-color)', background: 'var(--bg-primary)', color: isActive ? '#0ea5e9' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                                            >
                                                                {SCHEMA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <input
                                                                type="text"
                                                                value={rule.selector || ''}
                                                                placeholder={
                                                                    rule.type === 'css' ? 'vd: h1.product-title' :
                                                                    rule.type === 'xpath' ? 'vd: //*[@id="title"] hoặc //h1' :
                                                                    rule.type === 'xpath_full' ? 'vd: /html/body/div[1]/main/h1' :
                                                                    rule.type === 'jsonld' ? 'vd: Product.name' :
                                                                    rule.type === 'meta' ? 'vd: description' :
                                                                    rule.type === 'regex' ? 'vd: SKU:\\s*(\\w+)' : 'Nhập selector...'
                                                                }
                                                                disabled={!isActive}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], selector: e.target.value } }))}
                                                                style={{ width: '100%', padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border-color)', background: isActive ? 'var(--bg-primary)' : 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', opacity: isActive ? 1 : 0.5, boxSizing: 'border-box' }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <select
                                                                value={rule.attr || 'text'}
                                                                disabled={!isActive || rule.type === 'jsonld' || rule.type === 'jsonpath' || rule.type === 'meta' || rule.type === 'regex'}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], attr: e.target.value } }))}
                                                                style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', opacity: (isActive && (rule.type === 'css' || rule.type === 'xpath' || rule.type === 'xpath_full')) ? 1 : 0.4 }}
                                                            >
                                                                {SCHEMA_ATTRS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                title="Xóa trường này khỏi schema"
                                                                onClick={() => handleDeleteDefaultField(fieldKey)}
                                                                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 5, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                                                            >🗑️</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {customSchemaFields.map((cf) => {
                                                const fieldKey = cf.key;
                                                const rule = extractionSchema[fieldKey] || {};
                                                const isActive = rule.type && rule.type !== 'skip';
                                                return (
                                                    <tr key={fieldKey} style={{ borderBottom: '1px solid var(--border-color)', background: isActive ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.02)' }}>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#a855f7' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: 10, background: '#f3e8ff', color: '#7c3aed', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>TUỲ CHỈNH</span>
                                                                {cf.label}
                                                            </div>
                                                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fieldKey}</div>
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <select
                                                                value={rule.type || 'skip'}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], type: e.target.value, selector: prev[fieldKey]?.selector || '', attr: prev[fieldKey]?.attr || 'text' } }))}
                                                                style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: isActive ? '1.5px solid #a855f7' : '1px solid var(--border-color)', background: 'var(--bg-primary)', color: isActive ? '#a855f7' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                                            >
                                                                {SCHEMA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <input
                                                                type="text"
                                                                value={rule.selector || ''}
                                                                placeholder={rule.type === 'css' ? 'vd: h1.product-title' : rule.type === 'jsonld' ? 'vd: Product.name' : rule.type === 'meta' ? 'vd: description' : rule.type === 'regex' ? 'vd: SKU:\\s*(\\w+)' : 'Nhap selector...'}
                                                                disabled={!isActive}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], selector: e.target.value } }))}
                                                                style={{ width: '100%', padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border-color)', background: isActive ? 'var(--bg-primary)' : 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', opacity: isActive ? 1 : 0.5, boxSizing: 'border-box' }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <select
                                                                value={rule.attr || 'text'}
                                                                disabled={!isActive || rule.type === 'jsonld' || rule.type === 'jsonpath' || rule.type === 'meta' || rule.type === 'regex'}
                                                                onChange={e => setExtractionSchema(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], attr: e.target.value } }))}
                                                                style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', opacity: (isActive && rule.type === 'css') ? 1 : 0.4 }}
                                                            >
                                                                {SCHEMA_ATTRS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                title="Xóa trường này"
                                                                onClick={() => handleDeleteCustomField(fieldKey)}
                                                                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 5, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                                                            >🗑️</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {showAddFieldModal && (
                                    <div style={{ padding: '14px 20px', background: 'rgba(124,58,237,0.06)', borderTop: '2px dashed rgba(124,58,237,0.35)', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>Tên hiển thị <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={newFieldLabel}
                                                onChange={e => setNewFieldLabel(e.target.value)}
                                                placeholder="vd: Màu Sắc"
                                                style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #a855f7', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                                            />
                                            <label style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>Key (tùy chọn — tự sinh nếu trống)</label>
                                            <input
                                                type="text"
                                                value={newFieldKey}
                                                onChange={e => setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                                                placeholder="vd: mau_sac"
                                                onKeyDown={e => e.key === 'Enter' && handleAddCustomField()}
                                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace' }}
                                            />
                                        </div>
                                        <button type="button" onClick={handleAddCustomField}
                                            style={{ padding: '7px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                            ＋ Thêm
                                        </button>
                                        <button type="button" onClick={() => { setShowAddFieldModal(false); setNewFieldLabel(''); setNewFieldKey(''); }}
                                            style={{ padding: '7px 12px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                                            Hủy
                                        </button>
                                    </div>
                                )}
                                <div style={{ padding: '10px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        💡 Tip: Dùng <code style={{ fontSize: 11, background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 3 }}>CSS Selector</code> cho hầu hết website. Dùng <code style={{ fontSize: 11, background: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 3 }}>JSON-LD</code> nếu website có structured data.
                                    </div>
                                    {hiddenDefaultFields.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setHiddenDefaultFields([]);
                                                toast('✅ Đã khôi phục tất cả các trường mặc định!', 'success');
                                            }}
                                            title="Khôi phục tất cả trường mặc định đã xóa"
                                            style={{ padding: '5px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#b45309', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                            ↩ Khôi phục mặc định ({hiddenDefaultFields.length})
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowAddFieldModal(v => !v); setNewFieldLabel(''); setNewFieldKey(''); }}
                                        style={{ padding: '6px 14px', background: showAddFieldModal ? 'var(--bg-primary)' : 'linear-gradient(135deg,#7c3aed,#a855f7)', color: showAddFieldModal ? 'var(--text-muted)' : 'white', border: showAddFieldModal ? '1px solid var(--border-color)' : 'none', borderRadius: 6, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                                    >
                                        {showAddFieldModal ? '✕ Đóng' : '＋ Thêm Trường'}
                                    </button>
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════════════════ */}
                            {/* Section: Test Schema trên URL Mẫu                    */}
                            {/* ══════════════════════════════════════════════════════ */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>🧪</span> Test Schema Trên URL Mẫu
                                    </h4>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Nhập 1 URL sản phẩm cụ thể → xem kết quả trích xuất ngay trước khi crawl đại trà.</span>
                                </div>
                                <div style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
                                        <input
                                            type="url"
                                            value={schemaTestUrl}
                                            onChange={e => setSchemaTestUrl(e.target.value)}
                                            placeholder="https://vi.kew-ltd.co.jp/products-detail/abc123"
                                            style={{ flex: 1, padding: '9px 14px', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace' }}
                                            onKeyDown={e => e.key === 'Enter' && handleTestSchema()}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleTestSchema}
                                            disabled={schemaTestLoading}
                                            style={{ padding: '9px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: schemaTestLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(124,58,237,0.4)' }}
                                        >
                                            {schemaTestLoading ? <Loader2 size={14} className="spin" /> : <span>▶</span>} Test
                                        </button>
                                    </div>

                                    {schemaTestError && (
                                        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12.5, color: '#dc2626', marginBottom: 10 }}>
                                            ❌ {schemaTestError}
                                        </div>
                                    )}

                                    {schemaTestResult && (
                                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
                                            <div style={{ padding: '8px 14px', background: 'var(--bg-secondary)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Kết Quả Trích Xuất</div>
                                            {Object.entries(schemaTestResult).map(([fieldKey, info], ri) => (
                                                <div key={fieldKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)' }}>
                                                    <span style={{ fontSize: 14, minWidth: 20, marginTop: 1 }}>{info.status === 'ok' ? '✅' : '⚠️'}</span>
                                                    <div style={{ minWidth: 140, fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>{SCHEMA_FIELD_LABELS[fieldKey] || fieldKey}</div>
                                                    <div style={{ flex: 1, fontSize: 12.5, fontFamily: 'monospace', color: info.status === 'ok' ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: info.status === 'ok' ? 'normal' : 'italic', wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {info.status === 'ok' ? (info.value?.length > 200 ? info.value.slice(0, 200) + '...' : info.value) : '(trống — kiểm tra lại selector)'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {!schemaTestResult && !schemaTestLoading && !schemaTestError && (
                                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                                            🔍 Nhập URL sản phẩm mẫu và bấm <strong>Test</strong> để xem kết quả trích xuất.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════════════════ */}
                            {/* Section: Crawl Tự Động Từ Sitemap                    */}
                            {/* ══════════════════════════════════════════════════════ */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #052e16 0%, #14532d 100%)', borderBottom: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>🚀</span> Crawl Toàn Bộ Từ Sitemap Với Schema
                                    </h4>
                                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Dùng Sitemap đã cấu hình + Schema bên trên để crawl tự động tất cả URLs sản phẩm.</span>
                                </div>
                                <div style={{ padding: '16px 20px' }}>
                                    {/* Options row */}
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Chế Độ Crawl</label>
                                            <select
                                                value={crawlSchemaOptions.useBrowser ? 'playwright' : 'fast'}
                                                onChange={e => setCrawlSchemaOptions(p => ({ ...p, useBrowser: e.target.value === 'playwright' }))}
                                                disabled={crawlSchemaRunning}
                                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                <option value="playwright">🌐 Trình duyệt ảo (Playwright - Tiếng Việt)</option>
                                                <option value="fast">⚡ HTTP Nhanh (Fast Fetch)</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Giới Hạn URLs</label>
                                            <input type="number" min="10" max="2000" value={crawlSchemaOptions.maxUrls}
                                                onChange={e => setCrawlSchemaOptions(p => ({ ...p, maxUrls: parseInt(e.target.value) || 500 }))}
                                                disabled={crawlSchemaRunning}
                                                style={{ width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Đồng Thời</label>
                                            <input type="number" min="1" max="8" value={crawlSchemaOptions.concurrency}
                                                onChange={e => setCrawlSchemaOptions(p => ({ ...p, concurrency: parseInt(e.target.value) || 3 }))}
                                                disabled={crawlSchemaRunning}
                                                style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Delay (ms)</label>
                                            <input type="number" min="0" max="5000" step="100" value={crawlSchemaOptions.delay}
                                                onChange={e => setCrawlSchemaOptions(p => ({ ...p, delay: parseInt(e.target.value) || 300 }))}
                                                disabled={crawlSchemaRunning}
                                                style={{ width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 'auto' }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'transparent' }}>.</label>
                                            {!crawlSchemaRunning ? (
                                                <button
                                                    type="button"
                                                    onClick={startCrawlSchema}
                                                    style={{ padding: '9px 22px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 10px rgba(22,163,74,0.4)', whiteSpace: 'nowrap' }}
                                                >
                                                    <Play size={15} /> Bắt Đầu Crawl
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={stopCrawlSchema}
                                                    style={{ padding: '9px 22px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 10px rgba(220,38,38,0.4)', whiteSpace: 'nowrap' }}
                                                >
                                                    <span>⏹</span> Dừng Lại
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Crawl Prerequisite Check (Optional Sitemap Info) */}
                                    {!sitemapInfo?.sitemapUrl && !sitemapInfo?.sitemapXml && !currentProfile?.sitemap_url && (
                                        <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 7, fontSize: 12.5, color: '#2563eb', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>💡</span>
                                            <span><strong>Chưa nạp Sitemap (Tùy chọn):</strong> Bạn có thể bắt đầu crawl ngay bằng link lấy từ tệp HAR hoặc website chính. Nếu muốn quét thêm theo sitemap hãng, bạn có thể cấu hình ở mục "Cấu Hình Sitemap XML" ở trên bất cứ lúc nào.</span>
                                        </div>
                                    )}

                                    {/* Progress Bar */}
                                    {crawlSchemaProgress && (
                                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '14px 16px', marginTop: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: crawlSchemaRunning ? '#16a34a' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    {crawlSchemaRunning ? <Loader2 size={14} className="spin" style={{ color: '#16a34a' }} /> : <span>✅</span>}
                                                    {crawlSchemaRunning ? 'Đang crawl...' : (crawlSchemaProgress.done ? 'Hoàn tất!' : 'Đã dừng')}
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {crawlSchemaProgress.processed || 0} / {crawlSchemaProgress.total || '?'} URLs
                                                </span>
                                            </div>
                                            {crawlSchemaProgress.total > 0 && (
                                                <div style={{ height: 10, background: 'var(--bg-primary)', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                                                    <div style={{ height: '100%', width: `${Math.round((crawlSchemaProgress.processed / crawlSchemaProgress.total) * 100)}%`, background: 'linear-gradient(90deg, #16a34a, #4ade80)', borderRadius: 5, transition: 'width 0.5s ease' }} />
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 18, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                                <span>🟢 Tìm thấy: <strong style={{ color: '#16a34a' }}>{crawlSchemaProgress.found || 0}</strong> sản phẩm</span>
                                                <span>❌ Lỗi: <strong style={{ color: crawlSchemaProgress.errors > 0 ? '#dc2626' : 'var(--text-muted)' }}>{crawlSchemaProgress.errors || 0}</strong></span>
                                                {crawlSchemaProgress.total > 0 && <span>📊 Tiến độ: <strong>{Math.round((crawlSchemaProgress.processed / crawlSchemaProgress.total) * 100)}%</strong></span>}
                                            </div>
                                            {crawlSchemaProgress.error && (
                                                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>⚠️ {crawlSchemaProgress.error}</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Stats from last crawl in report */}
                                    {harReport?.summary?.lastSchemaCrawlAt && !crawlSchemaProgress && (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                                            ✅ Lần crawl cuối: <strong>{new Date(harReport.summary.lastSchemaCrawlAt).toLocaleString('vi-VN')}</strong> — tìm thấy <strong>{harReport.summary.schemaCrawlFound}</strong> / <strong>{harReport.summary.schemaCrawlTotal}</strong> URLs
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* API Endpoints Section */}
                            {harReport.notableEndpoints && harReport.notableEndpoints.length > 0 && (
                                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                    <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>⚡</span> JSON API Endpoints Phát Hiện ({harReport.notableEndpoints.length})
                                        </h4>
                                    </div>
                                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                                        {harReport.notableEndpoints.map((ep, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: ep.method === 'GET' ? '#dbeafe' : '#dcfce7', color: ep.method === 'GET' ? '#1d4ed8' : '#15803d', minWidth: 40, textAlign: 'center' }}>
                                                    {ep.method}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: ep.status >= 200 && ep.status < 300 ? '#f0fdf4' : '#fef2f2', color: ep.status >= 200 && ep.status < 300 ? '#166534' : '#b91c1c', minWidth: 34 }}>
                                                    {ep.status}
                                                </span>
                                                <div style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ep.url}>
                                                    {ep.url}
                                                </div>
                                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ep.sizekb} KB</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Domains detected */}
                            {harReport.summary?.domains?.length > 0 && (
                                <div className="card" style={{ padding: '14px 20px' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 12 }}>Domains phát hiện:</span>
                                    {harReport.summary.domains.map(d => (
                                        <span key={d} style={{ display: 'inline-block', fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', marginRight: 6, marginBottom: 4, fontFamily: 'monospace' }}>
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Crawler to Sheet Conversion Modal */}

            <CrawlerToSheetModal
                isOpen={showCrawlerToSheetModal}
                onClose={() => setShowCrawlerToSheetModal(false)}
                allProducts={products}
                selectedProductIds={selectedCrawlerProductIds}
                totalProductsCount={totalProducts}
                profileSlug={profileSlug}
                sheets={profileSheets}
                activeTabName={activeSheetTabName}
                onConvertSuccess={handleCrawlerToSheetSuccess}
            />

            {/* Floating Background AI Task Running Notification */}
            {aiTaskState.isRunning && !showAiModal && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, background: '#0f172a', color: 'white', padding: '12px 18px', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 14, animation: 'fadeIn 0.3s ease' }}>
                    <Loader2 className="spin" size={20} style={{ color: '#38bdf8' }} />
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                            🤖 AI Trợ Lý đang chạy ngầm... ({aiTaskState.completedRows}/{aiTaskState.totalRows} hàng)
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                            {aiTaskState.statusText}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAiModal(true)}
                        style={{ padding: '6px 14px', fontSize: 12, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Bot size={14} /> Mở AI
                    </button>
                </div>
            )}
            {/* Google Sheets Right-Click Context Menu */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        zIndex: 999999,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                        width: 220,
                        padding: '6px 0',
                        fontSize: 12.5,
                        animation: 'fadeIn 0.1s ease',
                        userSelect: 'none'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}
                        className="context-menu-item"
                        onClick={() => {
                            handleUndo();
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Undo2 size={14} /> Hoàn tác (Undo)</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Ctrl+Z</kbd>
                    </div>

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}
                        className="context-menu-item"
                        onClick={() => {
                            handleRedo();
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Redo2 size={14} /> Khôi phục (Redo)</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Ctrl+Y</kbd>
                    </div>

                    <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}
                        className="context-menu-item"
                        onClick={() => {
                            handleCopyRangeContent(contextMenu.minRow, contextMenu.maxRow, contextMenu.minCol, contextMenu.maxCol);
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Copy size={14} /> Sao chép (Copy)</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Ctrl+C</kbd>
                    </div>

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}
                        className="context-menu-item"
                        onClick={() => {
                            handleCutRangeContent(contextMenu.minRow, contextMenu.maxRow, contextMenu.minCol, contextMenu.maxCol);
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scissors size={14} /> Cắt (Cut)</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Ctrl+X</kbd>
                    </div>

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)' }}
                        className="context-menu-item"
                        onClick={() => {
                            handlePasteRangeContent(contextMenu.minRow, contextMenu.minCol);
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clipboard size={14} /> Dán (Paste)</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Ctrl+V</kbd>
                    </div>

                    <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#ef4444' }}
                        className="context-menu-item"
                        onClick={() => {
                            handleClearRangeContent(contextMenu.minRow, contextMenu.maxRow, contextMenu.minCol, contextMenu.maxCol);
                            setContextMenu(null);
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Eraser size={14} /> Xóa sạch nội dung</span>
                        <kbd style={{ fontSize: 10, opacity: 0.6, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 }}>Delete</kbd>
                    </div>

                    <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

                    <div
                        style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#ef4444' }}
                        className="context-menu-item"
                        onClick={() => {
                            setSelectedRowIndices(Array.from({ length: contextMenu.maxRow - contextMenu.minRow + 1 }, (_, i) => contextMenu.minRow + i));
                            setContextMenu(null);
                            handleDeleteSelectedRows();
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Trash2 size={14} /> Xóa các Hàng này</span>
                    </div>
                </div>
            )}

            {/* Floating Tab Context Menu (Right Click on Sheet Tab) */}
            {pageTabContextMenu && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: pageTabContextMenu.y - 80,
                        left: pageTabContextMenu.x,
                        zIndex: 999999,
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: 8,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        minWidth: 160,
                        padding: '4px 0',
                        fontSize: 13
                    }}
                >
                    <div style={{ padding: '6px 14px', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, borderBottom: '1px solid var(--border-color)' }}>
                        Tab: {pageTabContextMenu.tabName}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setRenameTabTarget(pageTabContextMenu.tabName);
                            setRenameTabInput(pageTabContextMenu.tabName);
                            setPageTabContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Edit3 size={14} style={{ color: 'var(--accent)' }} /> Đổi tên tab
                    </button>
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />
                    <button
                        type="button"
                        onClick={() => {
                            handleDeleteSheetTab(pageTabContextMenu.tabName);
                            setPageTabContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Trash2 size={14} /> Xóa tab này
                    </button>
                </div>
            )}

            {/* Rename Tab Modal */}
            {renameTabTarget && (
                <div className="modal-backdrop" onClick={() => setRenameTabTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 380, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Edit3 size={16} style={{ color: 'var(--accent)' }} /> Đổi Tên Tab
                            </span>
                            <button onClick={() => setRenameTabTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <input
                            type="text"
                            value={renameTabInput}
                            onChange={e => setRenameTabInput(e.target.value)}
                            placeholder="Nhập tên Tab mới..."
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSheetTab(renameTabTarget, renameTabInput);
                            }}
                            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setRenameTabTarget(null)}>Hủy</button>
                            <button type="button" className="btn btn-primary" onClick={() => handleRenameSheetTab(renameTabTarget, renameTabInput)} style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
                                Lưu tên mới
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Column Header Context Menu */}
            {pageColHeaderContextMenu && (
                <div
                    className="sheet-context-menu"
                    style={{
                        position: 'fixed',
                        left: Math.min(pageColHeaderContextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 230),
                        top: Math.min(pageColHeaderContextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300),
                        zIndex: 999999,
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        borderRadius: 8,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        minWidth: 210,
                        padding: '4px 0',
                        fontSize: 13
                    }}
                >
                    <div style={{ padding: '6px 14px', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, borderBottom: '1px solid var(--border-color)' }}>
                        Cột {getColLetter(pageColHeaderContextMenu.cIdx)}: {pageColHeaderContextMenu.currentTitle}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setRenameColTarget({ cIdx: pageColHeaderContextMenu.cIdx, currentTitle: pageColHeaderContextMenu.currentTitle });
                            setRenameColInput(pageColHeaderContextMenu.currentTitle);
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Edit3 size={14} style={{ color: 'var(--accent)' }} /> ✏️ Đổi tên cột này
                    </button>
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />
                    <button
                        type="button"
                        onClick={() => {
                            setColumnSortState({ colIndex: pageColHeaderContextMenu.cIdx, direction: 'asc' });
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <span>↑ Sắp xếp A → Z (Tăng dần)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setColumnSortState({ colIndex: pageColHeaderContextMenu.cIdx, direction: 'desc' });
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <span>↓ Sắp xếp Z → A (Giảm dần)</span>
                    </button>
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />
                    <button
                        type="button"
                        onClick={() => {
                            handleInsertColumnAt(pageColHeaderContextMenu.cIdx, 'left');
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Plus size={14} style={{ color: '#2563eb' }} /> Chèn 1 cột bên trái
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleInsertColumnAt(pageColHeaderContextMenu.cIdx, 'right');
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Plus size={14} style={{ color: '#2563eb' }} /> Chèn 1 cột bên phải
                    </button>
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />
                    <button
                        type="button"
                        onClick={() => {
                            handleDeleteColumnAt(pageColHeaderContextMenu.cIdx);
                            setPageColHeaderContextMenu(null);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                        <Trash2 size={14} /> Xóa cột này
                    </button>
                </div>
            )}

            {/* Rename Column Modal */}
            {renameColTarget && (
                <div className="modal-backdrop" onClick={() => setRenameColTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 400, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Edit3 size={16} style={{ color: 'var(--accent)' }} /> Đổi Tên Cột [{getColLetter(renameColTarget.cIdx)}]
                            </span>
                            <button onClick={() => setRenameColTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                            Tên hiện tại: <strong style={{ color: 'var(--text-primary)' }}>{renameColTarget.currentTitle}</strong>
                        </p>
                        <input
                            type="text"
                            value={renameColInput}
                            onChange={e => setRenameColInput(e.target.value)}
                            placeholder="Nhập tên Cột mới..."
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSheetColumn(renameColTarget.cIdx, renameColInput);
                            }}
                            style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setRenameColTarget(null)}>Hủy</button>
                            <button type="button" className="btn btn-primary" onClick={() => handleRenameSheetColumn(renameColTarget.cIdx, renameColInput)} style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
                                Lưu tên mới
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MODAL: LỊCH SỬ & TIẾN ĐỘ ĐĂNG BÀI */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showPostingHistoryModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 999999,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }} onClick={() => setShowPostingHistoryModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '100%',
                        maxWidth: '920px',
                        maxHeight: '88vh',
                        background: 'var(--bg-card, #ffffff)',
                        borderRadius: '16px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            background: 'var(--bg-primary, #f8fafc)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <History size={22} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                                        Lịch Sử & Tiến Độ Đăng Bài ({currentProfile?.name || profileSlug})
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                        Kiểm soát ngày / thời gian đăng bài và theo dõi tiến độ công việc.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPostingHistoryModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6 }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            
                            {/* Summary Bar */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '14px 16px', background: 'var(--bg-primary, #f1f5f9)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Tổng SP</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{totalProductsCount}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, textTransform: 'uppercase' }}>Đã đăng</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>{postedCount}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#d97706', fontWeight: 700, textTransform: 'uppercase' }}>Chưa đăng</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706', marginTop: 2 }}>{pendingCount}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>Lỗi</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>{postingErrorCount}</div>
                                </div>
                            </div>

                            {/* Filters Bar */}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                    <Search size={16} style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Lọc theo mã SP, tên sản phẩm, ngày đăng..."
                                        value={historySearchTerm}
                                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%', color: 'var(--text-primary)' }}
                                    />
                                </div>
                                <select
                                    value={historyStatusFilter}
                                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="all">Tất cả trạng thái</option>
                                    <option value="posted">✅ Đã đăng</option>
                                    <option value="pending">⏳ Chưa đăng</option>
                                    <option value="error">🔴 Lỗi</option>
                                </select>
                            </div>

                            {/* History Table Container with Scroll & Sticky Header */}
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflowY: 'auto', maxHeight: '440px', position: 'relative' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-primary, #f1f5f9)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                                        <tr style={{ background: 'var(--bg-primary, #f1f5f9)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                            <th style={{ padding: '10px 14px' }}>STT</th>
                                            <th style={{ padding: '10px 14px' }}>Ngày & Thời gian đăng</th>
                                            <th style={{ padding: '10px 14px' }}>Model / Mã SP</th>
                                            <th style={{ padding: '10px 14px' }}>Tên Sản Phẩm</th>
                                            <th style={{ padding: '10px 14px' }}>Kênh Đăng</th>
                                            <th style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>Trạng Thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedHistoryLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                    Không tìm thấy nhật ký phù hợp.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedHistoryLogs.map((item, idx) => {
                                                const globalIdx = historyPageSize === 'all' ? idx + 1 : (historyPage - 1) * parseInt(historyPageSize) + idx + 1;
                                                return (
                                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{globalIdx}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.posted_at || '—'}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                                                            {item.live_url ? (
                                                                <a href={item.live_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} title={`Mở trang: ${item.live_url}`}>
                                                                    {item.model || '—'}
                                                                </a>
                                                            ) : (
                                                                item.model || '—'
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name || ''}>
                                                            {item.live_url ? (
                                                                <a href={item.live_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} title={`Xem bài viết: ${item.live_url}`}>
                                                                    {item.name || '—'}
                                                                </a>
                                                            ) : (
                                                                item.name || '—'
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                            {item.live_url ? (
                                                                <a 
                                                                    href={item.live_url} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer" 
                                                                    style={{ color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                                                                    title={`Mở trang web đã đăng: ${item.live_url}`}
                                                                >
                                                                    {item.platform || 'Website'} <ExternalLink size={12} />
                                                                </a>
                                                            ) : (
                                                                item.platform || 'Website'
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                            {item.status === 'posted' ? (
                                                                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.1)', color: '#15803d', fontWeight: 700, fontSize: 11.5, border: '1px solid rgba(34, 197, 94, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>✅ Đã đăng</span>
                                                            ) : item.status === 'error' ? (
                                                                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontWeight: 700, fontSize: 11.5, border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>🔴 Lỗi</span>
                                                            ) : (
                                                                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', fontWeight: 700, fontSize: 11.5, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>⏳ Chưa đăng</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Modal Table Pagination Bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', fontSize: 12.5, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', marginTop: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span>Hiển thị:</span>
                                    <select
                                        value={historyPageSize}
                                        onChange={(e) => {
                                            setHistoryPageSize(e.target.value);
                                            setHistoryPage(1);
                                        }}
                                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
                                    >
                                        <option value="50">50 SP / Trang</option>
                                        <option value="100">100 SP / Trang</option>
                                        <option value="200">200 SP / Trang</option>
                                        <option value="all">Tất cả ({filteredHistoryLogs.length} SP)</option>
                                    </select>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                        {historyPageSize === 'all'
                                            ? `Hiển thị tất cả ${filteredHistoryLogs.length} sản phẩm`
                                            : `SP ${filteredHistoryLogs.length === 0 ? 0 : (historyPage - 1) * parseInt(historyPageSize) + 1} - ${Math.min(historyPage * parseInt(historyPageSize), filteredHistoryLogs.length)} / Tổng ${filteredHistoryLogs.length} SP`
                                        }
                                    </span>
                                </div>

                                {historyPageSize !== 'all' && historyTotalPages > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button
                                            type="button"
                                            disabled={historyPage <= 1}
                                            onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                                            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: 12, color: historyPage <= 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: historyPage <= 1 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                        >
                                            ◀ Trang trước
                                        </button>
                                        <span style={{ fontWeight: 700, fontSize: 12, padding: '0 4px', color: 'var(--text-primary)' }}>
                                            Trang {historyPage} / {historyTotalPages}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={historyPage >= historyTotalPages}
                                            onClick={() => setHistoryPage(prev => Math.min(historyTotalPages, prev + 1))}
                                            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: 12, color: historyPage >= historyTotalPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: historyPage >= historyTotalPages ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                        >
                                            Trang sau ▶
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleOpenCheckConfigModal}
                                    style={{ fontSize: 13, padding: '8px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                                >
                                    <Settings size={15} /> ⚙️ Cấu Hình Kiểm Tra
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setCustomPostingLogs([]);
                                        try {
                                            localStorage.removeItem(`posting_logs_${profileSlug}`);
                                        } catch (e) {}
                                        toast('🗑️ Đã làm mới lịch sử lưu! Đang quét mới toàn bộ...', 'info');
                                        handleRunPublicationCheck(true);
                                    }}
                                    disabled={isCheckingPublication}
                                    style={{ fontSize: 13, padding: '8px 14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: isCheckingPublication ? 'not-allowed' : 'pointer', color: '#b91c1c' }}
                                    title="Xóa kết quả lưu từ các lần quét trước trong trình duyệt và quét mới tinh từ đầu"
                                >
                                    <Trash2 size={15} style={{ color: '#ef4444' }} /> Xóa Cache & Quét Mới
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleRunPublicationCheck(true)}
                                    disabled={isCheckingPublication}
                                    style={{ fontSize: 13, padding: '8px 18px', fontWeight: 700, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 6, cursor: isCheckingPublication ? 'not-allowed' : 'pointer' }}
                                >
                                    {isCheckingPublication ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={15} />}
                                    {isCheckingPublication ? 'Đang Kiểm Tra...' : '🔍 Kiểm Tra SP Đã Đăng Web'}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowPostingHistoryModal(false)}
                                style={{ fontSize: 13, padding: '8px 20px', fontWeight: 600 }}
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Cấu Hình Kiểm Tra Đăng Bài Web */}
            {showCheckConfigModal && (
                <div className="modal-backdrop" onClick={() => setShowCheckConfigModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--border-color)', borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                                <Settings size={18} style={{ color: 'var(--accent)' }} /> ⚙️ Cấu Hình Kiểm Tra Đăng Bài Web
                            </span>
                            <button onClick={() => setShowCheckConfigModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
                                    Chọn Chế Độ Quét:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <button
                                        type="button"
                                        onClick={() => setCheckConfig(prev => ({ ...prev, mode: 'sitemap' }))}
                                        style={{
                                            padding: '12px', borderRadius: 10, border: `2px solid ${checkConfig.mode === 'sitemap' ? 'var(--accent)' : 'var(--border-color)'}`,
                                            background: checkConfig.mode === 'sitemap' ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                                            color: checkConfig.mode === 'sitemap' ? 'var(--accent)' : 'var(--text-primary)',
                                            fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        ⚡ Quét Nhanh (Sitemap)
                                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 4 }}>Tự nạp XML sitemap website</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCheckConfig(prev => ({ ...prev, mode: 'cms_api' }))}
                                        style={{
                                            padding: '12px', borderRadius: 10, border: `2px solid ${checkConfig.mode === 'cms_api' ? 'var(--accent)' : 'var(--border-color)'}`,
                                            background: checkConfig.mode === 'cms_api' ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                                            color: checkConfig.mode === 'cms_api' ? 'var(--accent)' : 'var(--text-primary)',
                                            fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        🎯 Quét API Web (Custom / API JSON)
                                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 4 }}>Dùng API JSON do Quản lý cấp hoặc REST API</div>
                                    </button>
                                </div>
                            </div>

                            {checkConfig.mode === 'sitemap' ? (
                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                                        URL File Sitemap.xml Website:
                                    </label>
                                    <input
                                        type="text"
                                        value={checkConfig.sitemapUrl}
                                        onChange={e => setCheckConfig(prev => ({ ...prev, sitemapUrl: e.target.value }))}
                                        placeholder="https://dacoautomation.io.vn/sitemap.xml"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        💡 Chế độ Quét Nhanh bóc tách tự động từ sitemap.xml của website. Phù hợp cho cả Web tự code lẫn WordPress/CMS.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Upload / Dán File API JSON do quản lý cấp */}
                                    <div style={{
                                        background: checkConfig.uploadedFileName ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-primary)',
                                        padding: '12px 14px',
                                        borderRadius: 10,
                                        border: `1.5px dashed ${checkConfig.uploadedFileName ? '#16a34a' : 'var(--accent)'}`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <span style={{ fontSize: 12.5, fontWeight: 700, color: checkConfig.uploadedFileName ? '#15803d' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {checkConfig.uploadedFileName ? '✅ Đã kích hoạt File API JSON Web Tự Code!' : '📁 Tải File API JSON do Quản lý cấp (Dành cho Web Tự Code):'}
                                            </span>
                                            <label style={{ cursor: 'pointer', padding: '4px 12px', background: checkConfig.uploadedFileName ? '#16a34a' : 'var(--accent)', color: 'white', borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>
                                                {checkConfig.uploadedFileName ? 'Đổi File Khác' : 'Tải File JSON lên'}
                                                <input
                                                    type="file"
                                                    accept=".json,application/json"
                                                    style={{ display: 'none' }}
                                                    onChange={e => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const reader = new FileReader();
                                                        reader.onload = (evt) => {
                                                            try {
                                                                const content = evt.target?.result;
                                                                const parsed = JSON.parse(content);
                                                                setCheckConfig(prev => ({
                                                                    ...prev,
                                                                    mode: 'cms_api',
                                                                    apiUrl: parsed.apiUrl || parsed.api_url || parsed.url || prev.apiUrl,
                                                                    consumerKey: parsed.consumerKey || parsed.consumer_key || parsed.ck || prev.consumerKey,
                                                                    consumerSecret: parsed.consumerSecret || parsed.consumer_secret || parsed.cs || prev.consumerSecret,
                                                                    jsonContent: content,
                                                                    uploadedFileName: file.name
                                                                }));
                                                                showToast(`✅ Nạp thành công file API JSON: ${file.name}`, 'success');
                                                            } catch (err) {
                                                                showToast('⚠️ File JSON không đúng định dạng!', 'warning');
                                                            }
                                                        };
                                                        reader.readAsText(file);
                                                    }}
                                                />
                                            </label>
                                        </div>
                                        {checkConfig.uploadedFileName ? (
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span>📄 Tệp cấu hình: <strong>{checkConfig.uploadedFileName}</strong></span>
                                                    <span style={{ fontSize: 11, fontWeight: 500, color: '#16a34a', background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: 10 }}>Web Tự Code Ready</span>
                                                </div>
                                                <span style={{ fontSize: 11.5, color: '#166534', fontWeight: 500 }}>
                                                    💡 Hệ thống sẽ ưu tiên sử dụng Endpoint & Mã API trong file JSON này để quét Web tự code của bạn.
                                                </span>
                                            </div>
                                        ) : (
                                            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                                                Vì website của bạn là <strong>Web Tự Code (Custom Website)</strong>, hãy bấm <strong>Tải File JSON lên</strong> để ứng dụng sử dụng cấu hình do Quản lý cấp!
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                                            URL Trang Web / API Endpoint Website:
                                        </label>
                                        <input
                                            type="text"
                                            value={checkConfig.apiUrl}
                                            onChange={e => setCheckConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                                            placeholder="https://dacoautomation.io.vn (hoặc https://abc.com)"
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                                            💡 <em>Mẹo:</em> Bạn có thể nhập nguyên URL website công ty (ví dụ: <code>https://abc.com</code>). Hệ thống sẽ tự ghép đường dẫn API thích hợp.
                                        </p>
                                    </div>

                                    {!checkConfig.uploadedFileName && (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                                                        API Key / Consumer Key:
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={checkConfig.consumerKey}
                                                        onChange={e => setCheckConfig(prev => ({ ...prev, consumerKey: e.target.value }))}
                                                        placeholder="Mã API Key (nếu có)"
                                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                                                        API Secret / Token:
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={checkConfig.consumerSecret}
                                                        onChange={e => setCheckConfig(prev => ({ ...prev, consumerSecret: e.target.value }))}
                                                        placeholder="Mã API Secret (nếu có)"
                                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                                    />
                                                </div>
                                            </div>

                                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                💡 Phù hợp cho cả Web Tự Code (Custom API) và WordPress/WooCommerce/Shopify.
                                            </p>
                                        </>
                                    )}
                                </>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCheckConfigModal(false)}>Hủy</button>
                                <button type="button" className="btn btn-primary" onClick={handleSaveCheckConfig} style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 20px' }}>
                                    Lưu Cấu Hình
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Export Excel (.xlsx) */}
            <ExportExcelModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                defaultProfileSlug={profileSlug}
                profiles={profilesList}
                onOpenChecklist={() => setShowChecklistModal(true)}
                onOpenIncompleteRows={() => setShowIncompleteRowsModal(true)}
            />

            {/* Modal Profile Checklist */}
            <ProfileChecklistModal
                isOpen={showChecklistModal}
                onClose={() => setShowChecklistModal(false)}
                profileSlug={profileSlug}
                profileName={profilesList.find(p => p.slug === profileSlug)?.name || profileSlug}
                onOpenAiAssistant={() => setShowAiModal(true)}
                onOpenImgDownloader={() => window.dispatchEvent(new CustomEvent('open_img_downloader'))}
                onOpenPdfDownloader={() => window.dispatchEvent(new CustomEvent('open_pdf_downloader'))}
                onOpenExportExcel={() => setShowExportModal(true)}
                onOpenCrawlerToSheet={() => setShowCrawlerToSheetModal(true)}
                onOpenIncompleteRows={() => setShowIncompleteRowsModal(true)}
            />

            {/* Modal Incomplete Sheet Rows Inspector */}
            <IncompleteRowsModal
                isOpen={showIncompleteRowsModal}
                onClose={() => setShowIncompleteRowsModal(false)}
                profileSlug={profileSlug}
                profileName={profilesList.find(p => p.slug === profileSlug)?.name || profileSlug}
                sheets={profileSheets}
                initialTab={auditModalTab}
                customPostingLogs={filteredHistoryLogs}
                onNavigateToRow={(sheetName, rowIndex) => {
                    if (sheetName) {
                        setActiveSheetTabName(sheetName);
                        setSelectedRowIndices([rowIndex - 1]);
                        toast(`📍 Đã chuyển sang Tab "${sheetName}" - Hàng #${rowIndex}!`, 'info');
                        scrollToRowInSheet(rowIndex);
                    }
                }}
                onUpdateSheets={(newSheets) => {
                    setProfileSheets(newSheets);
                }}
                onUpdateCell={(sheetName, rowIndex, colIndex, newValue) => {
                    setProfileSheets(prev => prev.map(s => {
                        if (s.name !== sheetName) return s;
                        const newData = s.data.map((row, rIdx) => {
                            if (rIdx !== rowIndex - 1) return row;
                            const newRow = [...row];
                            while (newRow.length <= colIndex) newRow.push('');
                            newRow[colIndex] = newValue;
                            return newRow;
                        });
                        return { ...s, data: newData };
                    }));
                    toast(`💾 Đã cập nhật Tab "${sheetName}" - Hàng #${rowIndex}!`, 'success');
                }}
            />

            {/* ================================================================
                Modal: Phân Tích Trường Thông Số (Spec Field Frequency Analyzer)
                ================================================================ */}
            {showSpecAnalyzerModal && (() => {
                // Get headers of current active sheet tab
                const activeSheet = profileSheets.find(s => s.name === activeSheetTabName);
                const headerRow = (activeSheet?.data?.[0] || []);
                const totalFieldCount = specAnalyzerResult?.fields?.length || 0;
                const maxCount = specAnalyzerResult?.fields?.[0]?.count || 1;

                // Compute distinct categories in the chosen category column
                const distinctCategories = (() => {
                    if (specAnalyzerCatColIdx < 0 || !activeSheet?.data || activeSheet.data.length < 2) return [];
                    const catCounts = {};
                    for (let r = 1; r < activeSheet.data.length; r++) {
                        const row = activeSheet.data[r];
                        if (!Array.isArray(row)) continue;
                        const val = String(row[specAnalyzerCatColIdx] || '').trim();
                        const key = val || '(Trống / Chưa phân loại)';
                        catCounts[key] = (catCounts[key] || 0) + 1;
                    }
                    return Object.entries(catCounts)
                        .map(([name, count]) => ({ name, count }))
                        .sort((a, b) => b.count - a.count);
                })();

                const selectedCatInfo = distinctCategories.find(c => c.name === specAnalyzerSelectedCat);

                return (
                    <div
                        style={{
                            position: 'fixed', inset: 0, zIndex: 2000,
                            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 16
                        }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowSpecAnalyzerModal(false); }}
                    >
                        <div style={{
                            background: '#ffffff', borderRadius: 16,
                            boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
                            width: '100%', maxWidth: 860,
                            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
                                background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 20 }}>📊</span>
                                        Phân Tích Trường Thông Số Kỹ Thuật (Lọc Theo Danh Mục)
                                    </div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
                                        Thống kê tần suất xuất hiện của từng trường (field) trong bảng thông số HTML theo từng danh mục sản phẩm
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowSpecAnalyzerModal(false)}
                                    style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}
                                >×</button>
                            </div>

                            {/* Config Panel */}
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                                    {/* Tab Info */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', height: 18, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            Tab Đang Xem
                                        </div>
                                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b', background: '#e2e8f0', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, height: 38, boxSizing: 'border-box' }}>
                                            <span>📋</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSheetTabName || '(chưa chọn tab)'}</span>
                                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>
                                                ({(activeSheet?.data?.length || 1) - 1} SP)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Column selector for Specs */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', height: 18, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            1. Cột Bảng Thông Số <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
                                        </div>
                                        <select
                                            value={specAnalyzerColIdx}
                                            onChange={e => {
                                                setSpecAnalyzerColIdx(Number(e.target.value));
                                                setSpecAnalyzerResult(null);
                                            }}
                                            style={{
                                                width: '100%', height: 38, padding: '6px 10px', borderRadius: 8,
                                                border: specAnalyzerColIdx < 0 ? '2px solid #f59e0b' : '2px solid #6d28d9',
                                                background: '#ffffff', fontSize: 12.5, color: '#1e293b',
                                                fontWeight: 600, outline: 'none', cursor: 'pointer', boxSizing: 'border-box'
                                            }}
                                        >
                                            <option value={-1}>— Chọn cột HTML thông số —</option>
                                            {headerRow.map((h, i) => (
                                                <option key={i} value={i}>
                                                    {getColLetter(i)} — {h ? String(h) : `(Cột ${i + 1})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Column selector for Category */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', height: 18, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            2. Cột Danh Mục
                                        </div>
                                        <select
                                            value={specAnalyzerCatColIdx}
                                            onChange={e => {
                                                setSpecAnalyzerCatColIdx(Number(e.target.value));
                                                setSpecAnalyzerSelectedCat('ALL');
                                                setSpecAnalyzerResult(null);
                                            }}
                                            style={{
                                                width: '100%', height: 38, padding: '6px 10px', borderRadius: 8,
                                                border: specAnalyzerCatColIdx >= 0 ? '2px solid #0d9488' : '1px solid #cbd5e1',
                                                background: '#ffffff', fontSize: 12.5, color: '#1e293b',
                                                fontWeight: 600, outline: 'none', cursor: 'pointer', boxSizing: 'border-box'
                                            }}
                                        >
                                            <option value={-1}>— Không lọc theo danh mục —</option>
                                            {headerRow.map((h, i) => (
                                                <option key={i} value={i}>
                                                    {getColLetter(i)} — {h ? String(h) : `(Cột ${i + 1})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Specific Category Value Filter */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', height: 18, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            3. Lọc Danh Mục Cụ Thể
                                        </div>
                                        <select
                                            value={specAnalyzerSelectedCat}
                                            onChange={e => {
                                                setSpecAnalyzerSelectedCat(e.target.value);
                                                setSpecAnalyzerResult(null);
                                            }}
                                            disabled={specAnalyzerCatColIdx < 0}
                                            style={{
                                                width: '100%', height: 38, padding: '6px 10px', borderRadius: 8,
                                                border: specAnalyzerCatColIdx >= 0 && specAnalyzerSelectedCat !== 'ALL' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                                                background: specAnalyzerCatColIdx < 0 ? '#f1f5f9' : '#ffffff',
                                                fontSize: 12.5, color: specAnalyzerCatColIdx < 0 ? '#94a3b8' : '#1e293b',
                                                fontWeight: 600, outline: 'none',
                                                cursor: specAnalyzerCatColIdx < 0 ? 'not-allowed' : 'pointer',
                                                boxSizing: 'border-box'
                                            }}
                                        >
                                            <option value="ALL">🌟 Tất cả danh mục ({((activeSheet?.data?.length || 1) - 1)} SP)</option>
                                            {distinctCategories.map((c, i) => (
                                                <option key={i} value={c.name}>
                                                    📁 {c.name} ({c.count} SP)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {specAnalyzerCatColIdx >= 0 && specAnalyzerSelectedCat !== 'ALL' ? (
                                            <span style={{ color: '#0d9488', fontWeight: 700, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span>🎯</span> Đang chọn danh mục: <strong>{specAnalyzerSelectedCat}</strong> ({selectedCatInfo?.count || 0} SP)
                                            </span>
                                        ) : specAnalyzerCatColIdx >= 0 ? (
                                            <span style={{ color: '#6d28d9', fontWeight: 600, background: '#faf5ff', border: '1px solid #e9d5ff', padding: '4px 10px', borderRadius: 6 }}>
                                                📂 Tìm thấy {distinctCategories.length} nhóm danh mục trong cột {headerRow[specAnalyzerCatColIdx] ? `"${headerRow[specAnalyzerCatColIdx]}"` : `Cột ${getColLetter(specAnalyzerCatColIdx)}`}.
                                            </span>
                                        ) : (
                                            <span>💡 Chọn cột danh mục và chọn 1 danh mục cụ thể để phân tích các trường đặc thù của dòng SP đó.</span>
                                        )}
                                    </div>

                                    {/* Run button */}
                                    <button
                                        onClick={runSpecAnalyzer}
                                        disabled={specAnalyzerColIdx < 0 || specAnalyzerRunning}
                                        style={{
                                            padding: '8px 24px', borderRadius: 8, fontWeight: 800, fontSize: 13.5,
                                            border: 'none', cursor: specAnalyzerColIdx < 0 ? 'not-allowed' : 'pointer',
                                            background: specAnalyzerColIdx < 0
                                                ? '#e2e8f0'
                                                : 'linear-gradient(135deg, #6d28d9, #4f46e5)',
                                            color: specAnalyzerColIdx < 0 ? '#94a3b8' : '#ffffff',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            boxShadow: specAnalyzerColIdx < 0 ? 'none' : '0 4px 12px rgba(109,40,217,0.3)',
                                            flexShrink: 0, whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {specAnalyzerRunning
                                            ? <><Loader2 size={15} className="spin" /> Đang phân tích...</>
                                            : <><span style={{ fontSize: 15 }}>🔍</span> Chạy Phân Tích</>
                                        }
                                    </button>
                                </div>

                                {specAnalyzerColIdx < 0 && (
                                    <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '6px 12px', borderRadius: 6 }}>
                                        <span>⚠️</span> Vui lòng chọn cột chứa HTML bảng thông số (thường là cột <strong>noi_dung / thông số kỹ thuật</strong>) rồi nhấn Chạy Phân Tích.
                                    </div>
                                )}
                            </div>

                            {/* Results */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                                {specAnalyzerRunning && (
                                    <div style={{ padding: 40, textAlign: 'center' }}>
                                        <Loader2 size={36} className="spin" style={{ color: '#6d28d9', margin: '0 auto 12px' }} />
                                        <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Đang quét và phân tích bảng thông số...</div>
                                    </div>
                                )}

                                {!specAnalyzerRunning && specAnalyzerResult?.error && (
                                    <div style={{ padding: 32, textAlign: 'center', color: '#dc2626' }}>
                                        <div style={{ fontSize: 28, marginBottom: 8 }}>❌</div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{specAnalyzerResult.error}</div>
                                    </div>
                                )}

                                {!specAnalyzerRunning && specAnalyzerResult && !specAnalyzerResult.error && (
                                    <>
                                        {/* Summary bar */}
                                        <div style={{
                                            padding: '12px 24px', background: 'linear-gradient(135deg, #ede9fe, #eef2ff)',
                                            borderBottom: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'
                                        }}>
                                            <div style={{ fontSize: 13, color: '#4c1d95', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>📋</span> Cột TTS: <span style={{ color: '#6d28d9' }}>{specAnalyzerResult.colHeader}</span>
                                            </div>
                                            {specAnalyzerResult.isFiltered && (
                                                <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, background: '#ccfbf1', padding: '2px 8px', borderRadius: 6 }}>
                                                    <span>🎯</span> Danh mục: <span>{specAnalyzerResult.categoryFilter}</span>
                                                </div>
                                            )}
                                            <div style={{ fontSize: 13, color: '#4c1d95', fontWeight: 600 }}>
                                                🗂 Tổng SP {specAnalyzerResult.isFiltered ? 'trong danh mục' : 'quét'}: <strong>{specAnalyzerResult.totalRows}</strong>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#4c1d95', fontWeight: 600 }}>
                                                ✅ SP có thông số: <strong>{specAnalyzerResult.scannedRows}</strong>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#4c1d95', fontWeight: 600 }}>
                                                🏷 Trường unique: <strong>{totalFieldCount}</strong>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const lines = [
                                                        `Báo cáo Phân Tích Trường Thông Số`,
                                                        `Tab: ${specAnalyzerResult.sheetName} | Cột: ${specAnalyzerResult.colHeader}`,
                                                        specAnalyzerResult.isFiltered ? `Lọc Danh Mục: ${specAnalyzerResult.categoryFilter}` : `Lọc Danh Mục: Tất cả`,
                                                        `Tổng SP: ${specAnalyzerResult.totalRows} | SP có TTS: ${specAnalyzerResult.scannedRows} | Unique fields: ${totalFieldCount}`,
                                                        ``,
                                                        `STT\tTrường\tSố lần xuất hiện\tTỉ lệ (%)`,
                                                        ...specAnalyzerResult.fields.map((f, i) =>
                                                            `${i + 1}\t${f.name}\t${f.count}\t${((f.count / (specAnalyzerResult.scannedRows || 1)) * 100).toFixed(1)}%`
                                                        )
                                                    ];
                                                    navigator.clipboard.writeText(lines.join('\n'));
                                                    toast('📋 Đã copy báo cáo vào clipboard!', 'success');
                                                }}
                                                style={{
                                                    marginLeft: 'auto', padding: '6px 14px', background: '#6d28d9',
                                                    color: 'white', border: 'none', borderRadius: 6,
                                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: 5
                                                }}
                                            >
                                                <span>📋</span> Copy Báo Cáo
                                            </button>
                                        </div>

                                        {/* Table */}
                                        {specAnalyzerResult.fields.length === 0 ? (
                                            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                                                <div style={{ fontSize: 32, marginBottom: 10 }}>🔎</div>
                                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                                                    Không tìm thấy cặp &lt;td&gt;Field&lt;/td&gt;&lt;td&gt;Value&lt;/td&gt; nào
                                                    {specAnalyzerResult.isFiltered ? ` trong danh mục "${specAnalyzerResult.categoryFilter}"` : ''}
                                                </div>
                                                <div style={{ fontSize: 12 }}>Kiểm tra lại cột đã chọn hoặc thử chọn danh mục khác.</div>
                                            </div>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 1 }}>
                                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 44 }}>#</th>
                                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>TÊN TRƯỜNG (FIELD)</th>
                                                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 90 }}>SỐ LẦN</th>
                                                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 70 }}>TỈ LỆ</th>
                                                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>MỨC ĐỘ PHỦ</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {specAnalyzerResult.fields.map((field, idx) => {
                                                        const pct = specAnalyzerResult.scannedRows > 0
                                                            ? (field.count / specAnalyzerResult.scannedRows) * 100
                                                            : 0;
                                                        const barPct = maxCount > 0 ? (field.count / maxCount) * 100 : 0;
                                                        const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : pct >= 20 ? '#6d28d9' : '#94a3b8';
                                                        const isTop = idx === 0;
                                                        return (
                                                            <tr
                                                                key={idx}
                                                                style={{
                                                                    background: isTop ? '#faf5ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                                                    borderBottom: '1px solid #f1f5f9',
                                                                    transition: 'background 0.12s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#ede9fe'}
                                                                onMouseLeave={e => e.currentTarget.style.background = isTop ? '#faf5ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'}
                                                            >
                                                                <td style={{ padding: '9px 14px', fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                                                                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                                                </td>
                                                                <td style={{ padding: '9px 14px' }}>
                                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{field.name}</span>
                                                                </td>
                                                                <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                                                    <span style={{
                                                                        fontSize: 14, fontWeight: 800,
                                                                        color: pct >= 80 ? '#10b981' : pct >= 50 ? '#d97706' : '#6d28d9'
                                                                    }}>{field.count}</span>
                                                                    <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>SP</span>
                                                                </td>
                                                                <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                                                    <span style={{
                                                                        fontSize: 12, fontWeight: 700, padding: '2px 8px',
                                                                        borderRadius: 20,
                                                                        background: pct >= 80 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : pct >= 20 ? '#ede9fe' : '#f1f5f9',
                                                                        color: pct >= 80 ? '#15803d' : pct >= 50 ? '#92400e' : pct >= 20 ? '#6d28d9' : '#64748b'
                                                                    }}>
                                                                        {pct.toFixed(1)}%
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '9px 20px' }}>
                                                                    <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden', width: '100%' }}>
                                                                        <div style={{
                                                                            height: '100%', width: `${barPct}%`,
                                                                            background: barColor,
                                                                            borderRadius: 999,
                                                                            transition: 'width 0.4s ease'
                                                                        }} />
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </>
                                )}

                                {!specAnalyzerRunning && !specAnalyzerResult && (
                                    <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                                        <div style={{ fontSize: 48, marginBottom: 14 }}>📊</div>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: '#64748b', marginBottom: 8 }}>
                                            Chọn cột và nhấn "Chạy Phân Tích"
                                        </div>
                                        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#94a3b8', maxWidth: 450, margin: '0 auto' }}>
                                            Công cụ sẽ quét toàn bộ HTML trong cột được chọn (có thể kết hợp lọc riêng cho từng Danh mục),<br />
                                            trích xuất các cặp <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>&lt;td&gt;Field&lt;/td&gt;&lt;td&gt;Value&lt;/td&gt;</code><br />
                                            và thống kê tần suất xuất hiện của mỗi tên trường.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{
                                padding: '12px 24px', borderTop: '1px solid #e2e8f0',
                                background: '#f8fafc', display: 'flex', justifyContent: 'flex-end'
                            }}>
                                <button
                                    onClick={() => setShowSpecAnalyzerModal(false)}
                                    style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal Google Drive Setup & Auth */}
            <GoogleDriveModal
                isOpen={showGoogleDriveModal}
                onClose={() => setShowGoogleDriveModal(false)}
                toast={toast}
            />

        </div>
    );
}

export default function ProductsPage() {
    return (
        <Suspense fallback={
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
                <Loader2 className="spin" size={24} style={{ color: 'var(--accent)' }} />
            </div>
        }>
            <ProductsContent />
        </Suspense>
    );
}
