'use client';
import { useState, useEffect, Suspense, useMemo, useRef, useCallback } from 'react';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import ImportSheetModal from '@/components/ImportSheetModal';
import AiAssistantModal from '@/components/AiAssistantModal';
import CrawlerToSheetModal from '@/components/CrawlerToSheetModal';
import { 
    Search, 
    Download, 
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
    Pin,

    Edit3,
    Merge,
    Copy,
    Check,
    CheckCircle2,
    Plus,
    Trash2,
    Scissors,
    Clipboard,
    Eraser,
    Undo2,
    Redo2
} from 'lucide-react';

function ProductsContent() {
    const { user, hasPermission } = useAuth();
    const searchParams = useSearchParams();
    const profileSlug = searchParams?.get('profile') || 'newland';
    const [currentProfile, setCurrentProfile] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);

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

    const toast = (msg, type = 'success') => {
        const id = Date.now();
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

    // HAR Analysis Report state
    const [harReport, setHarReport] = useState(null);
    const [harReportLoading, setHarReportLoading] = useState(false);

    const fetchHarReport = async (slug) => {
        setHarReportLoading(true);
        try {
            const data = await fetchApi(`/api/products/profiles/${slug}/har-report`);
            if (data?.report) setHarReport(data.report);
        } catch (err) {
            setHarReport(null);
        } finally {
            setHarReportLoading(false);
        }
    };

    const activePageSheetData = useMemo(() => {
        return profileSheets.find(s => s.name === activeSheetTabName)?.data || [];
    }, [profileSheets, activeSheetTabName]);

    useEffect(() => {
        setPageRowLimit(100);
    }, [activeSheetTabName]);

    useEffect(() => {
        const handleHarReady = (e) => {
            if (e.detail?.profile === profileSlug) {
                if (e.detail?.report) setHarReport(e.detail.report);
                else fetchHarReport(profileSlug);
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
                setViewMode('har');
            }
        } catch (e) {}

        return () => window.removeEventListener('har_analysis_ready', handleHarReady);
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

    // Handlers for Tab Management
    const handleRenameSheetTab = async (oldName, newName) => {
        if (!newName || !newName.trim() || oldName === newName.trim()) return;
        const trimmed = newName.trim();
        if (profileSheets.some(s => s.name === trimmed)) {
            toast('⚠️ Tên tab này đã tồn tại!', 'warning');
            return;
        }

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

        const updated = profileSheets.filter(s => s.name !== tabName);
        setProfileSheets(updated);
        if (activeSheetTabName === tabName) {
            setActiveSheetTabName(updated[0]?.name || '');
        }
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

        const dataRows = activePageSheetData.slice(startDataIdx);

        const filteredData = dataRows.filter((row) => {
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
                const valA = Array.isArray(a) && a[colIdx] !== undefined && a[colIdx] !== null ? String(a[colIdx]).trim() : '';
                const valB = Array.isArray(b) && b[colIdx] !== undefined && b[colIdx] !== null ? String(b[colIdx]).trim() : '';
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
        const tsvText = copiedRows.map(r => r.join('\t')).join('\n');
        navigator.clipboard.writeText(tsvText).catch(() => {});

        const count = (maxRow - minRow + 1) * (maxCol - minCol + 1);
        toast(`📋 Đã sao chép ${count} ô vào bộ nhớ tạm!`, 'info');
    };

    const handleClearRangeContent = async (minRow, maxRow, minCol, maxCol, silent = false) => {
        if (!activeSheetTabName || !activePageSheetData) return;

        const updatedSheets = profileSheets.map(s => {
            if (s.name !== activeSheetTabName) return s;
            const existingData = [...(s.data || [])];
            for (let r = minRow; r <= maxRow; r++) {
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
            const count = (maxRow - minRow + 1) * (maxCol - minCol + 1);
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
        handleClearRangeContent(minRow, maxRow, minCol, maxCol, true);
        const count = (maxRow - minRow + 1) * (maxCol - minCol + 1);
        toast(`✂️ Đã cắt ${count} ô!`, 'info');
    };

    const handlePasteRangeContent = async (startRow, startCol) => {
        if (!activeSheetTabName || !activePageSheetData) return;

        let pasteMatrix = [];
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                pasteMatrix = text.split('\n').map(line => line.split('\t'));
            }
        } catch (err) {}

        if ((!pasteMatrix || pasteMatrix.length === 0) && cellClipboardRef.current?.data) {
            pasteMatrix = cellClipboardRef.current.data;
        }

        if (!pasteMatrix || pasteMatrix.length === 0) {
            toast('⚠️ Bộ nhớ tạm không có dữ liệu để dán!', 'warning');
            return;
        }

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
                    existingData[targetR][targetC] = val !== undefined ? String(val).trim() : '';
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

            // Delete / Backspace -> Clear cell contents
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                handleClearRangeContent(minRow, maxRow, minCol, maxCol);
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

    const fetchProfileSheetData = async () => {
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${profileSlug}`);
            if (data?.sheets && data.sheets.length > 0) {
                setProfileSheets(data.sheets);
                if (historyStackRef.current.length === 0) {
                    historyStackRef.current = [JSON.parse(JSON.stringify(data.sheets))];
                    historyIndexRef.current = 0;
                }
                setActiveSheetTabName(data.sheets[0].name);
                setViewMode('sheet');
            } else {
                setProfileSheets([]);
                setViewMode('products');
            }
        } catch (err) {
            console.error('Failed to fetch profile sheet:', err);
        }
    };

    useEffect(() => {
        // Reset state & refetch profile data when profileSlug changes
        setSearchTerm('');
        setSearchInput('');
        setSelectedCategory('');
        setCurrentPage(1);
        setProducts([]);
        setTotalProducts(0);

        fetchProfileSheetData();
        fetchCategories();

        const fetchProfileInfo = async () => {
            try {
                const data = await fetchApi('/api/products/profiles');
                if (data?.profiles) {
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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
            
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
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        onClick={() => toast(`Sẵn sàng kích hoạt Crawl cho ${currentProfile?.name || 'Profile'}`, 'info')}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 500, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <Play size={14} style={{ color: '#16a34a' }} /> Bắt đầu Crawl
                    </button>



                    <button 
                        type="button"
                        className="btn"
                        onClick={() => setShowImportModal(true)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            background: 'var(--bg-card)', 
                            border: '1px solid var(--border-color)', 
                            color: 'var(--text-primary)', 
                            padding: '9px 14px', 
                            borderRadius: 'var(--radius-md)', 
                            fontWeight: 500, 
                            fontSize: 13,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <FileSpreadsheet size={14} style={{ color: '#0284c7' }} /> Nhập file excel/link ggsheet
                    </button>

                    <button 
                        className="btn btn-primary" 
                        onClick={handleExport}
                        disabled={products.length === 0}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8,
                            background: 'var(--gradient-primary)',
                            border: 'none',
                            color: 'white',
                            padding: '9px 16px',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontSize: 13
                        }}
                    >
                        <Download size={14} /> Export to Excel
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* KPI Summary Cards Grid (SaaS Dashboard Style - Like Image) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>

                {/* Card 1: Total Sheet Rows */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tổng hàng Sheet</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
                            {activePageSheetData.length > 0 ? (activePageSheetData.length - 1).toLocaleString() : 0}
                        </div>
                    </div>
                </div>

                {/* Card 2: Total Tabs */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#16a34a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <Layers size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tabs Sheet</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', lineHeight: 1.2, marginTop: 2 }}>
                            {profileSheets.length} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>Tab</span>
                        </div>
                    </div>
                </div>

                {/* Card 3: Crawler Products */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        <Package size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>SP Crawler</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', lineHeight: 1.2, marginTop: 2 }}>
                            {totalProducts} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>sản phẩm</span>
                        </div>
                    </div>
                </div>

                {/* Card 4: HAR Status */}
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: '#ea580c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                        🔍
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Báo Cáo HAR</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: harReport ? '#16a34a' : 'var(--text-muted)', lineHeight: 1.2, marginTop: 2 }}>
                            {harReport ? `${harReport.summary?.highConfidenceFieldsCount || 0} trường tin cậy` : 'Chưa phân tích'}
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
                    onClick={() => setViewMode('products')}
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
                                            placeholder="🔍 Tìm nhanh..."
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
                                        style={{ padding: '4px 9px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                        title="Hoàn tác (Ctrl+Z)"
                                    >
                                        <Undo2 size={12} /> Hoàn tác
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleRedo}
                                        style={{ padding: '4px 9px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                        title="Khôi phục (Ctrl+Y)"
                                    >
                                        <Redo2 size={12} /> Khôi phục
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
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <button
                                            type="button"
                                            onClick={selectedRowIndices.length > 0 ? handleDeleteSelectedRows : handleDeleteSelectedCols}
                                            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 4px rgba(239,68,68,0.2)' }}
                                        >
                                            <Trash2 size={14} /> Xóa {selectedRowIndices.length > 0 ? `${selectedRowIndices.length} Hàng Đã Chọn` : `${selectedColIndices.length} Cột Đã Chọn`}
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
                            <div className="sheet-table-container" style={{ maxHeight: 540 }}>
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
                                                                  onMouseDown={(e) => handleColMouseDown(cIdx, e)}
                                                                  onMouseEnter={() => handleColMouseEnter(cIdx)}
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
                                                                              onClick={(e) => {
                                                                                  e.stopPropagation();
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
                                                                              onClick={(e) => {
                                                                                  e.stopPropagation();
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
                                                                                                  const isChecked = currentSelected.length === 0 || currentSelected.includes(val);
                                                                                                  return (
                                                                                                      <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 11.5, cursor: 'pointer', borderRadius: 3, userSelect: 'none' }}>
                                                                                                          <input
                                                                                                              type="checkbox"
                                                                                                              checked={isChecked}
                                                                                                              onChange={(e) => {
                                                                                                                  const checked = e.target.checked;
                                                                                                                  setColumnSelectedValues(prev => {
                                                                                                                      const existing = prev[cIdx] ? [...prev[cIdx]] : [];
                                                                                                                      if (existing.length === 0) {
                                                                                                                          const allExceptVal = uniqueVals.filter(v => v !== val);
                                                                                                                          return { ...prev, [cIdx]: allExceptVal };
                                                                                                                      }
                                                                                                                      if (checked) {
                                                                                                                          const next = [...existing, val];
                                                                                                                          return { ...prev, [cIdx]: next.length >= uniqueVals.length ? [] : next };
                                                                                                                      } else {
                                                                                                                          return { ...prev, [cIdx]: existing.filter(v => v !== val) };
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
                                                {renderedPageRows.map((row, rIdx) => {
                                                    const isRowPinned = rIdx < pageFreezeRows;
                                                    const isLastPinnedRow = pageFreezeRows > 0 && rIdx === pageFreezeRows - 1;
                                                    const isRowSelected = selectedRowSet.has(rIdx);
                                                    return (
                                                        <tr
                                                            key={rIdx}
                                                            className={isLastPinnedRow ? 'pinned-row-last' : ''}
                                                            style={isRowPinned ? { position: 'sticky', top: (rIdx + 1) * 32, zIndex: 9, background: '#fffbeb' } : {}}
                                                        >
                                                            <td 
                                                                className="row-index-cell" 
                                                                onMouseDown={(e) => handleRowMouseDown(rIdx, e)}
                                                                onMouseEnter={() => handleRowMouseEnter(rIdx)}
                                                                style={{ 
                                                                    position: 'relative', 
                                                                    userSelect: 'none', 
                                                                    cursor: 'pointer',
                                                                    ...(isRowSelected ? { background: '#dbeafe', fontWeight: 700, color: '#1e40af', borderLeft: '3px solid #2563eb' } : isRowPinned ? { background: '#fef3c7', fontWeight: 700, color: '#b45309' } : {}) 
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
                                            <button type="button" onClick={() => handleAddPageRows(1)} style={{ padding: '3px 8px', fontSize: 11.5, background: 'var(--bg-card)', border: '1px solid #bbf7d0', borderRadius: 3, cursor: 'pointer', color: '#15803d', fontWeight: 600 }} title="Thêm hàng mới vào cuối Tab">+ Hàng</button>
                                            <button type="button" onClick={() => handleAddPageColumn(1)} style={{ padding: '3px 8px', fontSize: 11.5, background: 'var(--bg-card)', border: '1px solid #bfdbfe', borderRadius: 3, cursor: 'pointer', color: '#1d4ed8', fontWeight: 600 }} title="Thêm Cột mới vào Tab">+ Cột Mới</button>
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

            {/* View Mode 2: Filter Bar & Data Table Card (Products List) */}
            {viewMode === 'products' && (
                <div className="card" style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                
                {/* Search & Filters */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <Filter size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                            <select 
                                className="form-select" 
                                value={selectedCategory} 
                                onChange={handleCategoryChange}
                                style={{ 
                                    paddingLeft: 34, 
                                    height: 40, 
                                    width: 220, 
                                    borderRadius: 'var(--radius-md)', 
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-secondary)',
                                    fontSize: 13
                                }}
                            >
                                <option value="">All Categories</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{formatCategory(cat)}</option>
                                ))}
                            </select>
                        </div>

                        {/* Convert Crawler Products to Sheet Button */}
                        <button
                            type="button"
                            onClick={() => setShowCrawlerToSheetModal(true)}
                            style={{
                                padding: '8px 16px',
                                height: 40,
                                background: 'var(--gradient-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}
                        >
                            <FileSpreadsheet size={16} /> 📥 Chuyển {selectedCrawlerProductIds.length > 0 ? `(${selectedCrawlerProductIds.length} chọn)` : 'tất cả'} sang Sheet
                        </button>
                    </div>

                    <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                            <input 
                                className="form-input" 
                                style={{ 
                                    paddingLeft: 36, 
                                    width: 280, 
                                    height: 40,
                                    borderRadius: 'var(--radius-md)', 
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: 13
                                }} 
                                placeholder="Search by name, spec, part number..." 
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>
                        <button 
                            type="submit" 
                            className="btn btn-secondary"
                            style={{ 
                                height: 40,
                                padding: '0 16px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                background: 'var(--bg-primary)',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            Search
                        </button>
                    </form>
                </div>

                {/* Table Wrapper */}
                <div className="table-wrapper" style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                <th style={{ padding: '12px 16px', width: 40, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedCrawlerProductIds.length === products.length && products.length > 0}
                                        onChange={toggleSelectAllCrawlerProducts}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th style={{ padding: '12px 16px', width: 50 }}>#</th>
                                <th style={{ padding: '12px 16px', width: 90 }}>Thumbnail</th>
                                <th style={{ padding: '12px 16px' }}>Product Name</th>
                                <th style={{ padding: '12px 16px', width: 220 }}>Category</th>
                                <th style={{ padding: '12px 16px', width: 180 }}>Part Number</th>
                                <th style={{ padding: '12px 16px', width: 140, textAlign: 'center' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                                        Fetching products list...
                                    </td>
                                </tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                            <Package size={48} style={{ color: 'var(--accent)', opacity: 0.4 }} />
                                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                Chưa có dữ liệu Crawler cho {currentProfile?.name || 'Profile này'}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 450 }}>
                                                Profile này chưa có sản phẩm nào được crawl trong cơ sở dữ liệu. Bạn có thể nạp file HAR hoặc kích hoạt Crawler để quét sản phẩm cho hãng này.
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                            ) : (
                                products.map((prod, i) => (
                                    <tr key={prod.id} style={{ borderBottom: '1px solid var(--border-color)', height: 72, background: selectedCrawlerProductIds.includes(prod.id) ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedCrawlerProductIds.includes(prod.id)}
                                                onChange={() => toggleSelectCrawlerProduct(prod.id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            {(currentPage - 1) * limit + i + 1}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {prod.image_url ? (
                                                <img 
                                                    src={prod.image_url} 
                                                    alt={prod.name} 
                                                    style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', padding: 4, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                                />
                                            ) : (
                                                <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                                    <Package size={24} style={{ color: 'var(--text-muted)' }} />
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {prod.name}
                                                <a href={prod.url} target="_blank" rel="noopener noreferrer" title="View original site" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                                                    <ExternalLink size={12} />
                                                </a>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                                            {formatCategory(prod.category)}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>
                                            {prod.part_number || '-'}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <button 
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => openProductDetails(prod)}
                                                style={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    gap: 6,
                                                    padding: '6px 12px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    cursor: 'pointer',
                                                    fontSize: 12
                                                }}
                                            >
                                                <Eye size={14} /> View Specs
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {products.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            Showing <strong>{(currentPage - 1) * limit + 1}</strong> to <strong>{Math.min(currentPage * limit, totalProducts)}</strong> of <strong>{totalProducts}</strong> products
                        </span>
                        
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button 
                                className="btn btn-secondary btn-sm" 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            
                            <button 
                                className="btn btn-secondary btn-sm" 
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
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
                                    
                                    {selectedProduct.part_number && (
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            Part Number: <strong style={{ fontFamily: 'monospace' }}>{selectedProduct.part_number}</strong>
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

                            {/* Description block */}
                            {selectedProduct.description && (
                                <div style={{ marginBottom: 24 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Overview Description</h5>
                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        {selectedProduct.description}
                                    </p>
                                </div>
                            )}

                            {/* Specifications Grid */}
                            <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Technical Specifications</h5>
                            {Object.keys(selectedProduct.parsedSpecs).length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                                    {Object.entries(selectedProduct.parsedSpecs).map(([key, val]) => (
                                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 13, alignItems: 'start' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{key}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                                    No technical specifications parsed for this item.
                                </p>
                            )}

                            {/* Download Links */}
                            {selectedProduct.parsedDownloads && selectedProduct.parsedDownloads.length > 0 && (
                                <div style={{ marginTop: 28 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={15} style={{ color: 'var(--accent)' }} /> Downloads ({selectedProduct.parsedDownloads.length} files)
                                    </h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedProduct.parsedDownloads.map((dl, idx) => {
                                            const ext = dl.url.split('?')[0].split('.').pop().toLowerCase();
                                            const extColors = { pdf: '#ef4444', zip: '#f59e0b', exe: '#8b5cf6', apk: '#10b981', fw: '#0ea5e9', bin: '#64748b' };
                                            const color = extColors[ext] || '#64748b';
                                            return (
                                                <a
                                                    key={idx}
                                                    href={dl.url}
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
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
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
                                                        {ext}
                                                    </span>
                                                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {dl.name}
                                                    </span>
                                                    <ExternalLink size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedProduct.parsedDownloads !== undefined && selectedProduct.parsedDownloads.length === 0 && (
                                <div style={{ marginTop: 28 }}>
                                    <h5 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Download size={15} style={{ color: 'var(--text-muted)' }} /> Downloads
                                    </h5>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No download files found for this product.</p>
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-primary)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Close</button>
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

            {/* Column Unique Values Filter Dropdown Popover Modal */}
            {activeFilterDropdownCol !== null && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={() => setActiveFilterDropdownCol(null)}>
                    <div style={{ background: 'var(--bg-card)', width: 380, maxWidth: '90vw', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ padding: '14px 18px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Filter size={15} style={{ color: 'var(--accent)' }} /> 
                                Lọc Cột {String.fromCharCode(activeFilterDropdownCol % 26 + 65)} 
                                {activePageSheetData[0]?.[activeFilterDropdownCol] ? `: ${String(activePageSheetData[0][activeFilterDropdownCol]).slice(0, 20)}` : ''}
                            </div>
                            <button type="button" onClick={() => setActiveFilterDropdownCol(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Dropdown Body */}
                        <div style={{ padding: '14px 18px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Search inside unique values */}
                            <div style={{ position: 'relative' }}>
                                <Search size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    value={dropdownSearch}
                                    onChange={e => setDropdownSearch(e.target.value)}
                                    placeholder="Tìm giá trị trong danh sách..."
                                    style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            {/* Select All / Clear All Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const allVals = activeColUniqueValues.map(v => v.value);
                                            setColumnSelectedValues(prev => ({ ...prev, [activeFilterDropdownCol]: allVals }));
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                                    >
                                        Chọn tất cả ({activeColUniqueValues.length})
                                    </button>
                                    <span style={{ color: 'var(--border-color)' }}>|</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setColumnSelectedValues(prev => ({ ...prev, [activeFilterDropdownCol]: [] }));
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                                    >
                                        Bỏ chọn tất cả
                                    </button>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {(columnSelectedValues[activeFilterDropdownCol] || []).length} / {activeColUniqueValues.length} đã chọn
                                </span>
                            </div>

                            {/* Checkbox List of Unique Column Values */}
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', maxHeight: 220, overflowY: 'auto', background: 'var(--bg-secondary)', padding: '6px 0' }}>
                                {activeColUniqueValues
                                    .filter(item => !dropdownSearch || item.value.toLowerCase().includes(dropdownSearch.toLowerCase()))
                                    .map((item, i) => {
                                        const currentSelected = columnSelectedValues[activeFilterDropdownCol];
                                        const isChecked = !currentSelected || currentSelected.includes(item.value);
                                        return (
                                            <label
                                                key={i}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', userSelect: 'none', background: isChecked ? 'rgba(99,102,241,0.06)' : 'transparent' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={e => {
                                                            const isCheckedNow = e.target.checked;
                                                            setColumnSelectedValues(prev => {
                                                                const cur = prev[activeFilterDropdownCol] || activeColUniqueValues.map(v => v.value);
                                                                let updated;
                                                                if (isCheckedNow) {
                                                                    updated = Array.from(new Set([...cur, item.value]));
                                                                } else {
                                                                    updated = cur.filter(v => v !== item.value);
                                                                }
                                                                return { ...prev, [activeFilterDropdownCol]: updated };
                                                            });
                                                        }}
                                                    />
                                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', fontWeight: isChecked ? 600 : 400 }}>
                                                        {item.value}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border-color)', flexShrink: 0 }}>
                                                    {item.count}
                                                </span>
                                            </label>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '10px 18px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setColumnFilters(prev => {
                                        const cp = { ...prev };
                                        delete cp[activeFilterDropdownCol];
                                        return cp;
                                    });
                                    setColumnSelectedValues(prev => {
                                        const cp = { ...prev };
                                        delete cp[activeFilterDropdownCol];
                                        return cp;
                                    });
                                    setActiveFilterDropdownCol(null);
                                }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Xóa lọc cột này
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setActiveFilterDropdownCol(null)}
                                style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '6px 16px', fontSize: 12.5, borderRadius: 'var(--radius-md)' }}
                            >
                                <Check size={14} /> Áp dụng
                            </button>
                        </div>
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
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await fetchApi('/api/products/crawler/trigger', { method: 'POST', body: JSON.stringify({ concurrency: 3 }) });
                                                toast('🚀 Đã kích hoạt Crawler! Đang tiến hành crawl sản phẩm...', 'success');
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
                                        <Play size={16} /> 🚀 Bắt Đầu Crawl
                                    </button>
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

                            {/* Crawlable Fields Table */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                                <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>📋</span> Các Trường Có Thể Crawl Được
                                    </h4>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 11.5, alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} /> Cao ≥50%</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> Trung bình 20-49%</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} /> Thấp &lt;20%</span>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 200 }}>Trường Dữ Liệu</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 160 }}>Độ Tin Cậy</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Giá Trị Mẫu</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', width: 100 }}>Lần Xuất Hiện</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(harReport.fields || []).map((field, idx) => {
                                                const confColor = field.confidence >= 50 ? '#16a34a' : field.confidence >= 20 ? '#f59e0b' : '#94a3b8';
                                                const rowBg = field.confidence >= 50 ? 'rgba(22,163,74,0.04)' : field.confidence >= 20 ? 'rgba(245,158,11,0.04)' : 'var(--bg-card)';
                                                return (
                                                    <tr key={field.fieldKey} style={{ borderBottom: '1px solid var(--border-color)', background: rowBg }}>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{field.label}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{field.fieldKey}</div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{ flex: 1, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
                                                                    <div style={{ height: '100%', width: `${field.confidence}%`, background: confColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                                                                </div>
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: confColor, minWidth: 36, textAlign: 'right' }}>{field.confidence}%</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {field.samples && field.samples.length > 0 ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    {field.samples.slice(0, 2).map((s, si) => (
                                                                        <div key={si} style={{ fontSize: 11.5, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                                            <span style={{ fontWeight: 700, fontSize: 15, color: field.occurrences > 0 ? confColor : 'var(--text-muted)' }}>
                                                                {field.occurrences || 0}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
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