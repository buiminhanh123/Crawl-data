'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import {
    FileSpreadsheet, Plus, Trash2, Download, Upload,
    RefreshCw, Save, Check, Loader2, Play, Settings, Edit3, X, HelpCircle,
    Menu, ChevronDown, Copy, Edit2, Search, ChevronUp
} from 'lucide-react';

const formulaRunnerCache = new Map();

function evaluateFormula(formulaText, rowsList, columnsList) {
    if (!formulaText || typeof formulaText !== 'string' || !formulaText.startsWith('=')) return formulaText;
    
    try {
        const expression = formulaText.substring(1).trim();
        
        const getCellValue = (colName, rowNum) => {
            const row = rowsList.find(r => r.row_number === parseInt(rowNum));
            if (!row) return 0;
            const val = row.cells[colName] || '';
            
            if (typeof val === 'string' && val.startsWith('=')) {
                return evaluateFormula(val, rowsList, columnsList);
            }
            
            const num = parseFloat(val);
            return isNaN(num) ? val : num;
        };

        let resolvedExpr = expression;
        
        // Convert "&" concatenation operator to "+" outside strings
        let processedExpr = '';
        let inDoubleQuotes = false;
        let inSingleQuotes = false;
        for (let i = 0; i < resolvedExpr.length; i++) {
            const char = resolvedExpr[i];
            if (char === '"' && resolvedExpr[i - 1] !== '\\') {
                inDoubleQuotes = !inDoubleQuotes;
                processedExpr += char;
            } else if (char === "'" && resolvedExpr[i - 1] !== '\\') {
                inSingleQuotes = !inSingleQuotes;
                processedExpr += char;
            } else if (char === '&' && !inDoubleQuotes && !inSingleQuotes) {
                processedExpr += '+';
            } else {
                processedExpr += char;
            }
        }
        resolvedExpr = processedExpr;
        
        // 1. Resolve Ranges like A3:A10
        const rangeRegex = /([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)/gi;
        resolvedExpr = resolvedExpr.replace(rangeRegex, (match, colStart, rowStart, colEnd, rowEnd) => {
            const values = [];
            const rStart = parseInt(rowStart);
            const rEnd = parseInt(rowEnd);
            const cStartCode = colStart.toUpperCase().charCodeAt(0);
            const cEndCode = colEnd.toUpperCase().charCodeAt(0);
            
            for (let r = Math.min(rStart, rEnd); r <= Math.max(rStart, rEnd); r++) {
                for (let c = Math.min(cStartCode, cEndCode); c <= Math.max(cStartCode, cEndCode); c++) {
                    const colName = String.fromCharCode(c);
                    values.push(getCellValue(colName, r));
                }
            }
            return JSON.stringify(values);
        });

        // 2. Resolve Single Cells like A3
        const cellRegex = /\b([A-Z]+)([0-9]+)\b/gi;
        resolvedExpr = resolvedExpr.replace(cellRegex, (match, col, row) => {
            const val = getCellValue(col.toUpperCase(), row);
            return typeof val === 'string' ? `"${val.replace(/"/g, '\\"')}"` : val;
        });

        // 3. Mathematical & Logical Context
        const context = {
            SUM: (arr) => {
                const flat = Array.isArray(arr) ? arr.flat(Infinity) : [arr];
                return flat.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
            },
            AVERAGE: (arr) => {
                const flat = Array.isArray(arr) ? arr.flat(Infinity) : [arr];
                const nums = flat.map(v => parseFloat(v)).filter(v => !isNaN(v));
                return nums.length === 0 ? 0 : nums.reduce((sum, v) => sum + v, 0) / nums.length;
            },
            CONCAT: (...args) => {
                return args.flat(Infinity).join('');
            },
            CHAR: (code) => String.fromCharCode(code),
            UPPER: (str) => String(str).toUpperCase(),
            LOWER: (str) => String(str).toLowerCase(),
            LEN: (str) => String(str).length,
            IF: (cond, trueVal, falseVal) => cond ? trueVal : falseVal
        };

        const keys = Object.keys(context);
        const vals = Object.values(context);
        let runner = formulaRunnerCache.get(resolvedExpr);
        if (!runner) {
            runner = new Function(...keys, `return (${resolvedExpr});`);
            if (formulaRunnerCache.size > 1000) formulaRunnerCache.clear();
            formulaRunnerCache.set(resolvedExpr, runner);
        }
        const result = runner(...vals);
        return result === undefined ? '' : result;
    } catch (e) {
        return `#ERROR!`;
    }
}

function evaluateTemplate(template, row, columns, rows) {
    if (!template) return '';
    if (!row) return template;
    let result = template;
    columns.forEach(col => {
        const cellVal = row.cells[col.name] || '';
        const isFormula = typeof cellVal === 'string' && cellVal.startsWith('=');
        const displayVal = isFormula ? evaluateFormula(cellVal, rows, columns) : cellVal;
        result = result.replaceAll(`{{${col.name}}}`, displayVal ?? '');
    });
    return result;
}

function PinnedCellOverlay({ pinnedCell, rows, columns, onSave, onClose, onStartEdit }) {
    const pinnedRow = rows.find(r => r.row_number === pinnedCell.rowNum);
    const rawVal = pinnedRow?.cells[pinnedCell.colName] || '';
    const isFormula = typeof rawVal === 'string' && rawVal.startsWith('=');
    const displayVal = isFormula ? evaluateFormula(rawVal, rows, columns) : rawVal;
    const isHtml = !pinnedCell.editing && displayVal && displayVal.toString().includes('<');

    // Local state for the textarea to ensure 0-lag typing
    const [editVal, setEditVal] = useState(rawVal);

    useEffect(() => {
        setEditVal(rawVal);
    }, [pinnedCell.rowNum, pinnedCell.colName, rawVal]);

    const handleSave = () => {
        onSave(editVal);
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: Math.min(pinnedCell.rect.top, window.innerHeight - 340),
                left: Math.min(pinnedCell.rect.left, window.innerWidth - 500),
                width: Math.max(pinnedCell.rect.width, 480),
                zIndex: 88888,
            }}
        >
            {/* Coordinate badge + close */}
            <div style={{
                position: 'absolute', top: -26, left: 0,
                background: '#1a73e8', color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '3px 10px',
                borderRadius: '4px 4px 0 0',
                display: 'flex', alignItems: 'center', gap: 8,
                userSelect: 'none',
            }}>
                <span>{pinnedCell.colName}{pinnedCell.rowNum}</span>
                <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 400 }}>
                    {pinnedCell.editing ? 'Enter = lưu · Esc = huỷ' : 'Nhấp đúp để sửa'}
                </span>
                <button
                    onClick={onClose}
                    style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 3, color: '#fff', cursor: 'pointer', fontSize: 12, padding: '1px 6px', lineHeight: 1 }}
                >✕</button>
            </div>

            {/* Panel */}
            <div style={{
                background: 'var(--bg-card)',
                border: '2px solid #1a73e8',
                borderRadius: '0 4px 4px 4px',
                boxShadow: '0 8px 32px rgba(26,115,232,0.28)',
                overflow: 'hidden',
            }}>
                {pinnedCell.editing ? (
                    // ── EDIT MODE ──
                    <textarea
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={e => {
                            if (e.key === 'Escape') {
                                onClose();
                                e.preventDefault();
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                                handleSave();
                                e.preventDefault();
                            }
                        }}
                        style={{
                            width: '100%',
                            minHeight: 120,
                            maxHeight: 320,
                            resize: 'vertical',
                            padding: '10px 14px',
                            border: 'none',
                            outline: 'none',
                            fontSize: 13,
                            lineHeight: '1.6',
                            color: 'var(--text-primary)',
                            background: 'var(--bg-card)',
                            fontFamily: 'inherit',
                            display: 'block',
                            boxSizing: 'border-box',
                        }}
                    />
                ) : (
                    // ── VIEW MODE ──
                    <div
                        onDoubleClick={onStartEdit}
                        style={{
                            padding: '10px 14px',
                            maxHeight: 280,
                            overflowY: 'auto',
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            lineHeight: '1.6',
                            wordBreak: 'break-word',
                            whiteSpace: isHtml ? 'normal' : 'pre-wrap',
                            cursor: 'text',
                        }}
                    >
                        {isFormula && (
                            <div style={{ fontSize: 10, color: '#1a73e8', fontWeight: 700, marginBottom: 6, borderBottom: '1px solid #e8f0fe', paddingBottom: 4 }}>
                                fx: {rawVal}
                            </div>
                        )}
                        {isHtml
                            ? <div dangerouslySetInnerHTML={{ __html: displayVal }} />
                            : (displayVal || <span style={{ color: 'var(--text-muted)' }}>—</span>)
                        }
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SheetsPage() {
    const { user, hasPermission } = useAuth();

    // Permission check
    if (!hasPermission('products')) {
        return (
            <div className="page-content">
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                    Access denied
                </div>
            </div>
        );
    }

    // ── State variables ──
    const [sheets, setSheets] = useState([]);
    const [selectedSheetId, setSelectedSheetId] = useState('');

    // Filter parent tables (parent_id is null/undefined AND not a sub-tab name) for Left Panel
    const parentTables = useMemo(() => {
        const list = sheets.filter(s => !s.parent_id && !s.name.startsWith('Tab '));
        if (list.length === 0 && sheets.length > 0) {
            return [sheets[0]];
        }
        return list;
    }, [sheets]);

    // Active parent table object
    const activeParentTable = useMemo(() => {
        const selectedObj = sheets.find(s => s.id === selectedSheetId);
        if (!selectedObj) return parentTables[0] || null;
        if (!selectedObj.parent_id && !selectedObj.name.startsWith('Tab ')) return selectedObj;
        return sheets.find(s => s.id === selectedObj.parent_id) || parentTables[0] || null;
    }, [sheets, selectedSheetId, parentTables]);

    // Sub-tabs for current active parent table (rendered at bottom tab bar)
    const currentSubTabs = useMemo(() => {
        if (!activeParentTable) return [];
        const children = sheets.filter(s => s.parent_id === activeParentTable.id || (!s.parent_id && s.name.startsWith('Tab ') && s.id !== activeParentTable.id));
        return [activeParentTable, ...children];
    }, [sheets, activeParentTable]);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renamingSheet, setRenamingSheet] = useState({ id: '', name: '' });
    const [renamingProcessing, setRenamingProcessing] = useState(false);
    const [editingTabId, setEditingTabId] = useState(null);
    const [editingTabName, setEditingTabName] = useState('');
    const [tabContextMenu, setTabContextMenu] = useState(null);
    const [showTabListModal, setShowTabListModal] = useState(false);
    const [columns, setColumns] = useState([]);
    const [rows, setRows] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [toasts, setToasts] = useState([]);

    // Modals & Forms (Create Table)
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSheetName, setNewSheetName] = useState('');
    const [newSheetTemplate, setNewSheetTemplate] = useState('seo_sapo');
    const [creatingSheet, setCreatingSheet] = useState(false);

    // Modals & Forms (Create Sub-Tab)
    const [showCreateTabModal, setShowCreateTabModal] = useState(false);
    const [newTabName, setNewTabName] = useState('');
    const [newTabTemplate, setNewTabTemplate] = useState('seo_sapo');
    const [creatingTab, setCreatingTab] = useState(false);

    const [showAddColModal, setShowAddColModal] = useState(false);
    const [newColLabel, setNewColLabel] = useState('');
    const [newColType, setNewColType] = useState('text');
    const [addingCol, setAddingCol] = useState(false);

    // Google Sheets Import States
    const [showImportGsModal, setShowImportGsModal] = useState(false);
    const [gsSpreadsheetId, setGsSpreadsheetId] = useState('');
    const [gsSheetName, setGsSheetName] = useState('Sheet1');
    const [importingGs, setImportingGs] = useState(false);
    const [importAllTabs, setImportAllTabs] = useState(false);

    // Credentials Status States
    const [hasCredentials, setHasCredentials] = useState(false);
    const [clientEmail, setClientEmail] = useState('');
    const [uploadingCreds, setUploadingCreds] = useState(false);
    const credsFileInputRef = useRef(null);

    // Sync Crawler States
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncMode, setSyncMode] = useState('direct');

    // Grid Editing
    const [editingCell, setEditingCell] = useState(null); // {rowNum, colName, value}
    const [editingHtmlCell, setEditingHtmlCell] = useState(null); // large modal view for HTML

    // Cell Selection State
    const [selectedCell, setSelectedCell] = useState(null); // {rowNum, colName}
    const [showInspector, setShowInspector] = useState(false);

    // Search States
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

    const searchMatches = useMemo(() => {
        if (!searchTerm.trim() || !columns.length || !rows.length) return [];
        const query = searchTerm.toLowerCase();
        const matches = [];
        rows.forEach(r => {
            columns.forEach(c => {
                const rawVal = r.cells[c.name] || '';
                const isFormula = typeof rawVal === 'string' && rawVal.startsWith('=');
                const displayVal = isFormula ? evaluateFormula(rawVal, rows, columns) : rawVal;
                const strVal = String(displayVal ?? '').toLowerCase();
                const rawStrVal = String(rawVal ?? '').toLowerCase();
                if (strVal.includes(query) || rawStrVal.includes(query)) {
                    matches.push({ rowNum: r.row_number, colName: c.name });
                }
            });
        });
        return matches;
    }, [searchTerm, rows, columns]);

    const searchSet = useMemo(() => {
        const set = new Set();
        searchMatches.forEach(m => set.add(`${m.rowNum}:${m.colName}`));
        return set;
    }, [searchMatches]);

    const activeSearchMatch = searchMatches[currentSearchIndex] || null;

    const jumpToMatch = (index) => {
        if (!searchMatches.length) return;
        const validIdx = (index + searchMatches.length) % searchMatches.length;
        setCurrentSearchIndex(validIdx);
        const match = searchMatches[validIdx];
        setSelectedCell({ rowNum: match.rowNum, colName: match.colName });
        setTimeout(() => {
            const el = document.getElementById(`cell-${match.rowNum}-${match.colName}`);
            if (el) {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }, 50);
    };

    // Row/Column Selection States
    const [selectedRow, setSelectedRow] = useState(null);
    const [selectedCol, setSelectedCol] = useState(null);

    // Freeze Cols & Rows States
    const [freezeCols, setFreezeCols] = useState(0);
    const [freezeRows, setFreezeRows] = useState(0);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, rowNum, colName, type }

    // Pinned Floating Cell State
    const [pinnedCell, setPinnedCell] = useState(null); // { rowNum, colName, val, colLabel, rect: {top,left,width,height} }

    // Local Formula Bar Input Value
    const [formulaBarText, setFormulaBarText] = useState('');

    // Formula Input Focus Tracking
    const formulaInputRef = useRef(null);
    const [formulaFocused, setFormulaFocused] = useState(false);

    const fileInputRef = useRef(null);

    // Batch Merge Columns Modal States
    const [showMergeColsModal, setShowMergeColsModal] = useState(false);
    const [mergeTemplate, setMergeTemplate] = useState(''); // Textarea content containing placeholders like {{col_name}}
    const [mergeTargetCol, setMergeTargetCol] = useState('');
    const [mergeStartRow, setMergeStartRow] = useState(3);
    const [mergeEndRow, setMergeEndRow] = useState('');
    const [mergeProcessing, setMergeProcessing] = useState(false);
    const templateInputRef = useRef(null);

    // ── Toast Helper ──
    const toast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    };

    // ── Actions: Fetch sheets list ──
    const fetchSheets = async (selectNewId = null) => {
        setLoadingList(true);
        try {
            const data = await fetchApi('/api/local-sheets');
            const list = data.sheets || [];
            setSheets(list);
            if (selectNewId) {
                setSelectedSheetId(selectNewId);
            } else if (list.length > 0 && !selectedSheetId) {
                setSelectedSheetId(list[0].id);
            }
        } catch (err) {
            toast('Không thể tải danh sách bảng.', 'danger');
        } finally {
            setLoadingList(false);
        }
    };

    // ── Actions: Fetch sheet data ──
    const fetchSheetData = async (sheetId) => {
        if (!sheetId) return;
        setLoadingData(true);
        try {
            const data = await fetchApi(`/api/local-sheets/${sheetId}/data`);
            if (data) {
                const cols = data.columns || [];
                const rws = data.rows || [];
                setColumns(cols);
                setRows(rws);
                if (cols.length > 0) {
                    setSelectedCell({
                        rowNum: rws[0]?.row_number || 1,
                        colName: cols[0]?.name
                    });
                }
            }
        } catch (err) {
            toast('Không thể tải dữ liệu bảng.', 'danger');
        } finally {
            setLoadingData(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const data = await fetchApi('/api/sheets/settings');
            if (data) {
                setHasCredentials(data.hasCredentials);
                setClientEmail(data.clientEmail || '');
            }
        } catch (err) {
            console.error('Failed to load credentials status:', err);
        }
    };

    useEffect(() => {
        fetchSheets();
        fetchSettings();
    }, []);

    useEffect(() => {
        if (selectedSheetId) {
            fetchSheetData(selectedSheetId);
        } else {
            setColumns([]);
            setRows([]);
        }
    }, [selectedSheetId]);

    useEffect(() => {
        if (selectedSheetId && columns.length > 0 && !selectedCell) {
            setSelectedCell({
                rowNum: rows[0]?.row_number || 1,
                colName: columns[0]?.name
            });
        }
    }, [selectedSheetId, columns, rows, selectedCell]);

    useEffect(() => {
        if (selectedCell) {
            const val = rows.find(r => r.row_number === selectedCell.rowNum)?.cells[selectedCell.colName] || '';
            setFormulaBarText(val);
        } else {
            setFormulaBarText('');
        }
    }, [selectedCell, rows]);
    // ── Keydown & Navigation Handler ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setShowSearch(true);
                return;
            }
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.tagName === 'SELECT' ||
                activeEl.isContentEditable
            )) {
                return;
            }
            if (!selectedCell || editingCell || editingHtmlCell || pinnedCell?.editing) return;

            // Determine current indices
            const colIndex = columns.findIndex(c => c.name === selectedCell.colName);
            const rowIndex = rows.findIndex(r => r.row_number === selectedCell.rowNum);
            if (colIndex === -1 || rowIndex === -1) return;

            let targetRowIndex = rowIndex;
            let targetColIndex = colIndex;

            if (e.key === 'ArrowUp') {
                if (rowIndex > 0) targetRowIndex = rowIndex - 1;
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                if (rowIndex < rows.length - 1) targetRowIndex = rowIndex + 1;
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                if (colIndex > 0) targetColIndex = colIndex - 1;
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                if (colIndex < columns.length - 1) targetColIndex = colIndex + 1;
                e.preventDefault();
            } else if (e.key === 'Enter') {
                // Press enter to edit
                const col = columns[colIndex];
                const row = rows[rowIndex];
                const val = row.cells[col.name] || '';
                if (col.data_type === 'html') {
                    setEditingHtmlCell({ rowNum: row.row_number, colName: col.name, value: val });
                } else {
                    setEditingCell({ rowNum: row.row_number, colName: col.name, value: val });
                }
                e.preventDefault();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                // Clear cell
                const col = columns[colIndex];
                const row = rows[rowIndex];
                handleSaveCell(row.row_number, col.name, '');
                e.preventDefault();
            }
            
            if (targetRowIndex !== rowIndex || targetColIndex !== colIndex) {
                setSelectedCell({
                    rowNum: rows[targetRowIndex].row_number,
                    colName: columns[targetColIndex].name
                });
                
                // Keep selected cell in view (optional scroll helper)
                const element = document.getElementById(`cell-${rows[targetRowIndex].row_number}-${columns[targetColIndex].name}`);
                if (element) {
                    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedCell, editingCell, editingHtmlCell, pinnedCell, columns, rows]);

    // ── Clipboard Copy/Paste/Cut Handlers ──
    useEffect(() => {
        const handleCopy = (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.tagName === 'SELECT' ||
                activeEl.isContentEditable
            )) {
                return;
            }
            if (!selectedCell || editingCell || editingHtmlCell || pinnedCell?.editing) return;
            const row = rows.find(r => r.row_number === selectedCell.rowNum);
            if (!row) return;
            const val = row.cells[selectedCell.colName] || '';
            e.clipboardData.setData('text/plain', val);
            e.preventDefault();
            toast('Đã sao chép nội dung ô', 'success');
        };

        const handleCut = (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.tagName === 'SELECT' ||
                activeEl.isContentEditable
            )) {
                return;
            }
            if (!selectedCell || editingCell || editingHtmlCell || pinnedCell?.editing) return;
            const row = rows.find(r => r.row_number === selectedCell.rowNum);
            if (!row) return;
            const val = row.cells[selectedCell.colName] || '';
            e.clipboardData.setData('text/plain', val);
            handleSaveCell(selectedCell.rowNum, selectedCell.colName, '');
            e.preventDefault();
            toast('Đã cắt nội dung ô', 'success');
        };

        const handlePaste = (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.tagName === 'SELECT' ||
                activeEl.isContentEditable
            )) {
                return;
            }
            if (!selectedCell || editingCell || editingHtmlCell || pinnedCell?.editing) return;
            const pastedText = e.clipboardData.getData('text');
            handleSaveCell(selectedCell.rowNum, selectedCell.colName, pastedText);
            e.preventDefault();
            toast('Đã dán nội dung ô', 'success');
        };

        document.addEventListener('copy', handleCopy);
        document.addEventListener('cut', handleCut);
        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('copy', handleCopy);
            document.removeEventListener('cut', handleCut);
            document.removeEventListener('paste', handlePaste);
        };
    }, [selectedCell, editingCell, editingHtmlCell, pinnedCell, rows]);

    // ── Actions: Colorize Cell and Row ──

    const handleColorizeCell = async (color) => {
        if (!selectedCell || !selectedSheetId) return;
        const row = rows.find(r => r.row_number === selectedCell.rowNum);
        if (!row) return;

        let stylesObj = {};
        if (row.cells._STYLES) {
            try {
                stylesObj = typeof row.cells._STYLES === 'string' ? JSON.parse(row.cells._STYLES) : row.cells._STYLES;
            } catch (e) {
                stylesObj = {};
            }
        }

        if (color) {
            stylesObj[selectedCell.colName] = color;
        } else {
            delete stylesObj[selectedCell.colName];
        }

        setRows(prev => prev.map(r => {
            if (r.row_number === selectedCell.rowNum) {
                return { ...r, cells: { ...r.cells, _STYLES: stylesObj } };
            }
            return r;
        }));

        await fetchApi(`/api/local-sheets/${selectedSheetId}/cells`, {
            method: 'POST',
            body: JSON.stringify({
                row_number: selectedCell.rowNum,
                col_name: '_STYLES',
                value: JSON.stringify(stylesObj)
            })
        });
    };

    const handleColorizeRow = async (color) => {
        if (!selectedCell || !selectedSheetId) return;
        const row = rows.find(r => r.row_number === selectedCell.rowNum);
        if (!row) return;

        let stylesObj = {};
        if (row.cells._STYLES) {
            try {
                stylesObj = typeof row.cells._STYLES === 'string' ? JSON.parse(row.cells._STYLES) : row.cells._STYLES;
            } catch (e) {
                stylesObj = {};
            }
        }

        if (color) {
            stylesObj.row = color;
        } else {
            delete stylesObj.row;
        }

        setRows(prev => prev.map(r => {
            if (r.row_number === selectedCell.rowNum) {
                return { ...r, cells: { ...r.cells, _STYLES: stylesObj } };
            }
            return r;
        }));

        await fetchApi(`/api/local-sheets/${selectedSheetId}/cells`, {
            method: 'POST',
            body: JSON.stringify({
                row_number: selectedCell.rowNum,
                col_name: '_STYLES',
                value: JSON.stringify(stylesObj)
            })
        });
    };

    const insertColumnPlaceholder = (colName) => {
        const textarea = templateInputRef.current;
        if (!textarea) {
            setMergeTemplate(prev => prev + `{{${colName}}}`);
            return;
        }
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const textToInsert = `{{${colName}}}`;
        const newTemplate = mergeTemplate.substring(0, startPos) + textToInsert + mergeTemplate.substring(endPos);
        setMergeTemplate(newTemplate);
        
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = startPos + textToInsert.length;
        }, 50);
    };

    const handleBatchMergeCols = async (e) => {
        if (e) e.preventDefault();
        if (!mergeTemplate.trim()) {
            toast('Hãy nhập mẫu ghép để thực hiện.', 'danger');
            return;
        }
        if (!mergeTargetCol) {
            toast('Hãy chọn cột đích để ghi kết quả.', 'danger');
            return;
        }
        if (!selectedSheetId) return;

        setMergeProcessing(true);
        try {
            const start = parseInt(mergeStartRow) || 1;
            let end = parseInt(mergeEndRow);
            if (isNaN(end) || !end) {
                end = rows.reduce((max, r) => r.row_number > max ? r.row_number : max, 1);
            }

            const updates = [];
            const updatedRowsMap = {};

            for (let rNum = start; rNum <= end; rNum++) {
                const row = rows.find(r => r.row_number === rNum);
                if (!row) continue;

                const mergedText = evaluateTemplate(mergeTemplate, row, columns, rows);
                updates.push({ rowNumber: rNum, colName: mergeTargetCol, value: mergedText });
                updatedRowsMap[rNum] = mergedText;
            }

            if (updates.length === 0) {
                toast('Không tìm thấy dòng dữ liệu phù hợp để ghép.', 'warning');
                setMergeProcessing(false);
                return;
            }

            await fetchApi(`/api/local-sheets/${selectedSheetId}/batch-write`, {
                method: 'POST',
                body: JSON.stringify({ updates })
            });

            setRows(prev => prev.map(r => {
                if (updatedRowsMap[r.row_number] !== undefined) {
                    return {
                        ...r,
                        cells: {
                            ...r.cells,
                            [mergeTargetCol]: updatedRowsMap[r.row_number]
                        }
                    };
                }
                return r;
            }));

            toast(`Đã ghép thành công ${updates.length} hàng dữ liệu vào cột ${mergeTargetCol}.`, 'success');
            setShowMergeColsModal(false);
        } catch (err) {
            console.error('[Batch Merge] Error:', err);
            toast('Lỗi khi ghép cột dữ liệu.', 'danger');
        } finally {
            setMergeProcessing(false);
        }
    };
    // ── Actions: Create sheet ──
    const handleCreateSheet = async (e) => {
        e.preventDefault();
        if (!newSheetName.trim()) return;
        setCreatingSheet(true);
        try {
            const res = await fetchApi('/api/local-sheets', {
                method: 'POST',
                body: JSON.stringify({
                    name: newSheetName.trim(),
                    template: newSheetTemplate
                })
            });
            toast('Đã tạo bảng mới thành công!', 'success');
            setNewSheetName('');
            setShowCreateModal(false);
            fetchSheets(res.id);
        } catch (err) {
            toast(err.message || 'Lỗi tạo bảng.', 'danger');
        } finally {
            setCreatingSheet(false);
        }
    };

    // ── Actions: Create sub-tab ──
    const handleCreateSubTab = async (e) => {
        if (e) e.preventDefault();
        if (!newTabName.trim()) return;
        setCreatingTab(true);
        try {
            const res = await fetchApi('/api/local-sheets', {
                method: 'POST',
                body: JSON.stringify({
                    name: newTabName.trim(),
                    template: newTabTemplate,
                    parentId: activeParentTable?.id || null
                })
            });
            toast(`Đã tạo tab con "${newTabName.trim()}" thành công!`, 'success');
            setNewTabName('');
            setShowCreateTabModal(false);
            fetchSheets(res.id);
        } catch (err) {
            toast(err.message || 'Lỗi tạo tab con.', 'danger');
        } finally {
            setCreatingTab(false);
        }
    };

    // ── Actions: Duplicate sheet ──
    const handleDuplicateSheet = async (sheetId) => {
        try {
            const data = await fetchApi(`/api/local-sheets/${sheetId}/duplicate`, { method: 'POST' });
            toast(`Đã nhân bản trang tính "${data.name}" thành công!`, 'success');
            fetchSheets(data.id);
        } catch (err) {
            toast(err.message || 'Lỗi nhân bản trang tính.', 'danger');
        }
    };

    // ── Actions: Inline tab rename save ──
    const handleSaveInlineTabRename = async (sheetId, newName) => {
        setEditingTabId(null);
        const trimmed = (newName || '').trim();
        const sheet = sheets.find(s => s.id === sheetId);
        if (!trimmed || trimmed === sheet?.name) return;

        try {
            await fetchApi(`/api/local-sheets/${sheetId}`, {
                method: 'PUT',
                body: JSON.stringify({ name: trimmed })
            });
            toast('Đã đổi tên trang tính thành công!', 'success');
            setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, name: trimmed } : s));
        } catch (err) {
            toast(err.message || 'Lỗi đổi tên trang tính.', 'danger');
        }
    };

    // ── Actions: Rename sheet modal execute ──
    const handleExecuteRenameSheet = async (e) => {
        if (e) e.preventDefault();
        if (!renamingSheet.id || !renamingSheet.name.trim()) return;
        setRenamingProcessing(true);
        const newName = renamingSheet.name.trim();
        try {
            await fetchApi(`/api/local-sheets/${renamingSheet.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName })
            });
            toast('Đã đổi tên trang tính thành công!', 'success');
            setShowRenameModal(false);
            setSheets(prev => prev.map(s => s.id === renamingSheet.id ? { ...s, name: newName } : s));
        } catch (err) {
            toast(err.message || 'Lỗi đổi tên trang tính.', 'danger');
        } finally {
            setRenamingProcessing(false);
        }
    };

    // ── Actions: Delete sheet by ID ──
    const handleDeleteSheetById = async (sheetId, sheetName) => {
        if (!confirm(`Bạn có chắc chắn muốn xóa trang tính "${sheetName}"?`)) return;
        try {
            await fetchApi(`/api/local-sheets/${sheetId}`, { method: 'DELETE' });
            toast('Đã xóa trang tính.', 'success');
            const remain = sheets.filter(s => s.id !== sheetId);
            const nextSelect = remain.length > 0 ? remain[0].id : '';
            setSelectedSheetId(nextSelect);
            fetchSheets(nextSelect);
        } catch (err) {
            toast('Lỗi xóa trang tính.', 'danger');
        }
    };

    // ── Actions: Delete current sheet ──
    const handleDeleteSheet = async () => {
        if (!selectedSheetId) return;
        const currentSheet = sheets.find(s => s.id === selectedSheetId);
        handleDeleteSheetById(selectedSheetId, currentSheet?.name || 'này');
    };

    // ── Actions: Rename current sheet (Top Action Bar) ──
    const handleRenameSheet = async () => {
        if (!selectedSheetId) return;
        const currentSheet = sheets.find(s => s.id === selectedSheetId);
        const newName = window.prompt('Nhập tên mới cho bảng tính:', currentSheet?.name || '');
        if (!newName || !newName.trim() || newName.trim() === currentSheet?.name) return;

        try {
            await fetchApi(`/api/local-sheets/${selectedSheetId}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName.trim() })
            });
            toast('Đã đổi tên bảng tính thành công!', 'success');
            setSheets(prev => prev.map(s => s.id === selectedSheetId ? { ...s, name: newName.trim() } : s));
        } catch (err) {
            toast(err.message || 'Lỗi đổi tên bảng tính.', 'danger');
        }
    };

    // ── Actions: Sync from Scraper ──
    const handleSyncCrawler = () => {
        setShowSyncModal(true);
    };

    const handleExecuteSyncCrawler = async () => {
        if (!selectedSheetId) return;
        setSyncing(true);
        try {
            const res = await fetchApi(`/api/local-sheets/${selectedSheetId}/sync-crawler`, { 
                method: 'POST',
                body: JSON.stringify({ mode: syncMode })
            });
            toast(res.message || 'Đồng bộ crawler thành công!', 'success');
            setShowSyncModal(false);
            if (syncMode === 'hierarchical') {
                fetchSheets(selectedSheetId); // reload list because new sheets were created!
            } else {
                fetchSheetData(selectedSheetId);
            }
        } catch (err) {
            toast(err.message || 'Lỗi đồng bộ dữ liệu.', 'danger');
        } finally {
            setSyncing(false);
        }
    };

    // ── Actions: Add Column ──
    const handleAddColumn = async (e) => {
        e.preventDefault();
        if (!newColLabel.trim() || !selectedSheetId) return;

        setAddingCol(true);
        try {
            // Find next column letter code (e.g. if cols are A,B,C -> next is D)
            let nextColLetter = 'A';
            if (columns.length > 0) {
                const charCodes = columns.map(c => c.name);
                // Simple increment (only supports A-Z for column creation)
                const last = charCodes[charCodes.length - 1];
                const lastCode = last.charCodeAt(0);
                nextColLetter = String.fromCharCode(lastCode + 1);
            }

            await fetchApi(`/api/local-sheets/${selectedSheetId}/columns`, {
                method: 'POST',
                body: JSON.stringify({
                    name: nextColLetter,
                    header_label: newColLabel.trim(),
                    data_type: newColType
                })
            });

            toast('Đã thêm cột mới thành công!', 'success');
            setNewColLabel('');
            setShowAddColModal(false);
            fetchSheetData(selectedSheetId);
        } catch (err) {
            toast(err.message || 'Lỗi thêm cột.', 'danger');
        } finally {
            setAddingCol(false);
        }
    };

    // ── Actions: Add Row ──
    const handleAddRow = async () => {
        if (!selectedSheetId) return;
        const nextRowNum = rows.length > 0 ? rows[rows.length - 1].row_number + 1 : 3;

        try {
            await fetchApi(`/api/local-sheets/${selectedSheetId}/rows`, {
                method: 'POST',
                body: JSON.stringify({ row_number: nextRowNum, cells: {} })
            });
            fetchSheetData(selectedSheetId);
        } catch (err) {
            toast('Lỗi thêm hàng mới.', 'danger');
        }
    };

    // ── Actions: Write Cell ──
    const handleSaveCell = async (rowNum, colName, value) => {
        if (!selectedSheetId) return;
        try {
            await fetchApi(`/api/local-sheets/${selectedSheetId}/write`, {
                method: 'POST',
                body: JSON.stringify({
                    row_number: rowNum,
                    col_name: colName,
                    value
                })
            });
            // Update local state without refetching
            setRows(prev => prev.map(r => {
                if (r.row_number === rowNum) {
                    return { ...r, cells: { ...r.cells, [colName]: value } };
                }
                return r;
            }));
        } catch (err) {
            toast('Lỗi lưu ô dữ liệu.', 'danger');
        }
        setEditingCell(null);
    };

    // ── Actions: Export CSV ──
    const handleExportCSV = () => {
        if (columns.length === 0 || !selectedSheetId) return;
        const currentSheet = sheets.find(s => s.id === selectedSheetId);

        const headers = columns.map(c => `"${c.header_label} [${c.name}]"`).join(',');
        const body = rows.map(r => {
            return columns.map(c => {
                const val = r.cells[c.name] || '';
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',');
        }).join('\n');

        const csvContent = '\uFEFF' + headers + '\n' + body; // UTF-8 BOM
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${currentSheet?.name || 'sheet'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('Xuất CSV thành công!', 'success');
    };

    // ── Actions: Import CSV ──
    const handleImportCSVClick = () => {
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleImportCSV = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedSheetId) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const csvText = evt.target.result;
            toast('Đang nạp file CSV...', 'info');
            try {
                const res = await fetchApi(`/api/local-sheets/${selectedSheetId}/import-csv`, {
                    method: 'POST',
                    body: JSON.stringify({ csvText })
                });
                toast(res.message || 'Nhập CSV thành công!', 'success');
                fetchSheetData(selectedSheetId);
            } catch (err) {
                toast(err.message || 'Lỗi nhập CSV.', 'danger');
            }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const handleUploadCredentials = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            toast('Vui lòng tải lên file JSON.', 'danger');
            return;
        }

        setUploadingCreds(true);
        const formData = new FormData();
        formData.append('credentials', file);

        try {
            const token = localStorage.getItem('token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
            
            const res = await fetch(`${apiUrl}/api/sheets/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to upload credentials file');

            toast('Tải lên credentials.json thành công!', 'success');
            setHasCredentials(true);
            setClientEmail(data.clientEmail || '');
        } catch (err) {
            toast(err.message || 'Lỗi tải lên credentials.', 'danger');
        } finally {
            setUploadingCreds(false);
            if (credsFileInputRef.current) credsFileInputRef.current.value = '';
        }
    };

    const handleImportGoogleSheets = async (e) => {
        e.preventDefault();
        if (!gsSpreadsheetId.trim() || (!importAllTabs && !gsSheetName.trim()) || !selectedSheetId) return;
        setImportingGs(true);
        try {
            const res = await fetchApi(`/api/local-sheets/${selectedSheetId}/import-google-sheets`, {
                method: 'POST',
                body: JSON.stringify({
                    spreadsheetId: gsSpreadsheetId.trim(),
                    sheetName: importAllTabs ? '' : gsSheetName.trim(),
                    importAll: importAllTabs
                })
            });
            toast(res.message || 'Nhập từ Google Sheets thành công!', 'success');
            setShowImportGsModal(false);
            setGsSpreadsheetId('');
            setImportAllTabs(false);
            fetchSheets(selectedSheetId); // reload sheets list to see newly spawned tabs
            fetchSheetData(selectedSheetId); // refresh data grid immediately
        } catch (err) {
            toast(err.message || 'Nhập từ Google Sheets thất bại.', 'danger');
        } finally {
            setImportingGs(false);
        }
    };

    const stickyLeftMap = useMemo(() => {
        const map = {};
        let leftVal = 50;
        const count = Math.min(freezeCols || 0, columns.length);
        for (let j = 0; j < count; j++) {
            const col = columns[j];
            map[col.name] = leftVal;
            const width = ['I', 'P', 'Q'].includes(col?.name) ? 280 : 180;
            leftVal += width;
        }
        return map;
    }, [columns, freezeCols]);

    const stickyTopMap = useMemo(() => {
        const map = {};
        const count = Math.min(freezeRows || 0, rows.length);
        for (let i = 0; i < count; i++) {
            const r = rows[i];
            map[r.row_number] = 35 + i * 37;
        }
        return map;
    }, [rows, freezeRows]);

    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileSpreadsheet className="text-accent" size={24} /> Bảng dữ liệu nội bộ
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Quản lý và chỉnh sửa trực tiếp dữ liệu sản phẩm trong ứng dụng
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={15} /> Tạo bảng mới
                    </button>
                    {selectedSheetId && (
                        <>
                            <button className="btn btn-ghost" onClick={handleRenameSheet} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Edit3 size={15} /> Đổi tên
                            </button>
                            <button className="btn btn-danger" onClick={handleDeleteSheet} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Trash2 size={15} /> Xóa bảng
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Dashboard Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
                
                {/* Left Panel: Sheets List */}
                <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'start' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 6px', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Danh sách bảng ({parentTables.length})
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => { setNewSheetName(''); setShowCreateModal(true); }}
                            style={{ padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Tạo bảng dữ liệu mới"
                        >
                            <Plus size={13} /> Thêm bảng
                        </button>
                    </div>
                    {loadingList ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 className="spin" size={16} style={{ display: 'inline', marginRight: 5 }} /> Đang tải...</div>
                    ) : parentTables.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Chưa có bảng nào được tạo</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
                            {parentTables.map(s => {
                                const isActive = activeParentTable?.id === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => setSelectedSheetId(s.id)}
                                        style={{
                                            width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                                            background: isActive ? 'rgba(79, 142, 247, 0.12)' : 'transparent',
                                            color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                                            fontWeight: isActive ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1 }}>
                                            <FileSpreadsheet size={14} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: isActive ? 1 : 0.6 }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenamingSheet({ id: s.id, name: s.name });
                                                    setShowRenameModal(true);
                                                }}
                                                title="Đổi tên bảng"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', display: 'inline-flex' }}
                                                className="btn-icon-hover"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSheetById(s.id, s.name);
                                                }}
                                                title="Xóa bảng"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--danger)', display: 'inline-flex' }}
                                                className="btn-icon-hover"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Panel: Spreadsheet View */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 450 }}>
                    {/* Action Bar */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {selectedSheetId && (
                                <>
                                    <button className="btn btn-secondary" onClick={handleSyncCrawler} disabled={syncing} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        {syncing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                                        Đồng bộ Crawler
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => setShowAddColModal(true)} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Plus size={12} /> Thêm cột
                                    </button>
                                    <button className="btn btn-ghost" onClick={handleAddRow} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Plus size={12} /> Thêm hàng
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => {
                                        setMergeTemplate('');
                                        setMergeTargetCol(columns[0]?.name || '');
                                        const currentSheet = sheets.find(s => s.id === selectedSheetId);
                                        const isSeoSapo = currentSheet?.name?.toLowerCase().includes('sapo') || rows.some(r => r.row_number === 3);
                                        setMergeStartRow(isSeoSapo ? 3 : 1);
                                        setMergeEndRow('');
                                        setShowMergeColsModal(true);
                                    }} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent)' }}>
                                        🔗 Ghép cột hàng loạt
                                    </button>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {selectedSheetId && columns.length > 0 && (
                                <>
                                    <button className="btn btn-ghost" onClick={handleExportCSV} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Download size={12} /> Xuất CSV
                                    </button>
                                    <button className="btn btn-ghost" onClick={handleImportCSVClick} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Upload size={12} /> Nhập CSV
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => setShowImportGsModal(true)} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Upload size={12} /> Nhập Google Sheets
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" style={{ display: 'none' }} />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Formula Bar / Cell Inspector */}
                    {selectedSheetId && !loadingData && (
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', padding: '3px 6px', background: 'rgba(79, 142, 247, 0.1)', borderRadius: 4, border: '1px solid rgba(79, 142, 247, 0.2)', whiteSpace: 'nowrap' }}>
                                Ô {selectedCell ? `${selectedCell.colName}${selectedCell.rowNum}` : '--'}
                            </div>
                            <input
                                ref={formulaInputRef}
                                onFocus={() => setFormulaFocused(true)}
                                type="text"
                                value={formulaBarText}
                                disabled={!selectedCell}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFormulaBarText(val);
                                    if (selectedCell) {
                                        setRows(prev => prev.map(r => {
                                            if (r.row_number === selectedCell.rowNum) {
                                                return { ...r, cells: { ...r.cells, [selectedCell.colName]: val } };
                                            }
                                            return r;
                                        }));
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && selectedCell) {
                                        handleSaveCell(selectedCell.rowNum, selectedCell.colName, formulaBarText);
                                        e.target.blur();
                                    }
                                }}
                                onBlur={() => {
                                    setTimeout(() => setFormulaFocused(false), 200);
                                    if (selectedCell) {
                                        handleSaveCell(selectedCell.rowNum, selectedCell.colName, formulaBarText);
                                    }
                                }}
                                placeholder={selectedCell ? "Xem hoặc gõ nội dung của ô đang chọn..." : "Chọn một ô trong bảng..."}
                                style={{
                                    flex: 1, minWidth: 200, padding: '6px 12px', background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-primary)', fontSize: 12.5, outline: 'none'
                                }}
                            />

                            {/* Color Pickers */}
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Màu Ô:</span>
                                {['#fff2cc', '#d9ead3', '#c9daf8', '#f4cccc', '#d9d2e9'].map(c => (
                                    <button key={c} onClick={() => selectedCell && handleColorizeCell(c)} style={{ width: 15, height: 15, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.15)', background: c, cursor: 'pointer' }} title="Tô màu ô" />
                                ))}
                                <button onClick={() => selectedCell && handleColorizeCell(null)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px' }} title="Xóa màu ô">❌</button>
                            </div>

                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hàng:</span>
                                {['#fff2cc', '#d9ead3', '#c9daf8', '#f4cccc', '#d9d2e9'].map(c => (
                                    <button key={c} onClick={() => selectedCell && handleColorizeRow(c)} style={{ width: 15, height: 15, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)', background: c, cursor: 'pointer' }} title="Tô màu hàng" />
                                ))}
                                <button onClick={() => selectedCell && handleColorizeRow(null)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px' }} title="Xóa màu hàng">❌</button>
                            </div>

                            {/* Freeze Rows & Columns */}
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ghim cột:</span>
                                <select
                                    value={freezeCols}
                                    onChange={(e) => setFreezeCols(parseInt(e.target.value))}
                                    style={{ padding: '3px 6px', fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value={0}>Không</option>
                                    <option value={1}>1 cột (A)</option>
                                    <option value={2}>2 cột (A, B)</option>
                                    <option value={3}>3 cột (A, B, C)</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ghim hàng:</span>
                                <select
                                    value={freezeRows}
                                    onChange={(e) => setFreezeRows(parseInt(e.target.value))}
                                    style={{ padding: '3px 6px', fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value={0}>Không</option>
                                    <option value={1}>1 hàng</option>
                                    <option value={2}>2 hàng</option>
                                    <option value={3}>3 hàng</option>
                                    <option value={5}>5 hàng</option>
                                </select>
                            </div>

                            {!showSearch ? (
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowSearch(true)}
                                    style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}
                                >
                                    <Search size={14} /> Tìm kiếm
                                </button>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)' }}>
                                    <Search size={14} style={{ color: 'var(--accent)' }} />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Tìm kiếm..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSearchTerm(val);
                                            setCurrentSearchIndex(0);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (e.shiftKey) {
                                                    jumpToMatch(currentSearchIndex - 1);
                                                } else {
                                                    jumpToMatch(currentSearchIndex + 1);
                                                }
                                                e.preventDefault();
                                            } else if (e.key === 'Escape') {
                                                setShowSearch(false);
                                                setSearchTerm('');
                                            }
                                        }}
                                        style={{
                                            border: 'none',
                                            outline: 'none',
                                            background: 'transparent',
                                            color: 'var(--text-primary)',
                                            fontSize: 12,
                                            width: 150
                                        }}
                                    />
                                    <span style={{ fontSize: 11, color: searchMatches.length ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                        {searchTerm ? (searchMatches.length > 0 ? `${currentSearchIndex + 1}/${searchMatches.length}` : '0') : ''}
                                    </span>
                                    {searchMatches.length > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => jumpToMatch(currentSearchIndex - 1)}
                                                title="Kết quả trước (Shift+Enter)"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-primary)', display: 'inline-flex' }}
                                            >
                                                <ChevronUp size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => jumpToMatch(currentSearchIndex + 1)}
                                                title="Kết quả tiếp (Enter)"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-primary)', display: 'inline-flex' }}
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                                        title="Đóng tìm kiếm (Esc)"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', display: 'inline-flex' }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lưới dữ liệu (Table Grid) */}
                    <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 380, maxHeight: 'calc(100vh - 210px)' }}>
                        {loadingData ? (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                <Loader2 className="spin" size={24} /> &nbsp;Đang tải bảng...
                            </div>
                        ) : !selectedSheetId ? (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                <FileSpreadsheet size={40} style={{ color: 'var(--border-color)' }} />
                                <span>Vui lòng chọn hoặc tạo mới một bảng để xem dữ liệu</span>
                            </div>
                        ) : columns.length === 0 ? (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                                Bảng chưa có cột nào. Hãy nhấn "Thêm cột" để tạo cấu trúc dữ liệu.
                            </div>
                        ) : (
                            <table
                                style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, textAlign: 'left' }}
                                onClick={() => setContextMenu(null)}
                            >
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 1px 0 var(--border-color)' }}>
                                    <tr>
                                        <th
                                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'corner' }); }}
                                            style={{
                                                width: 50, minWidth: 50, maxWidth: 50,
                                                padding: '8px 10px', color: 'var(--text-muted)',
                                                borderBottom: freezeRows === 0 ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                borderRight: freezeCols === 0 ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                textAlign: 'center', fontWeight: 600,
                                                position: 'sticky', left: 0, zIndex: 12, background: 'var(--bg-secondary)', cursor: 'context-menu'
                                            }}>Hàng</th>
                                        {columns.map(col => {
                                            const stickyLeftVal = stickyLeftMap[col.name];
                                            const isSticky = stickyLeftVal !== undefined;
                                            const colWidth = ['I', 'P', 'Q'].includes(col.name) ? 280 : 180;
                                            const isLastFrozenCol = freezeCols > 0 && col.name === columns[freezeCols - 1]?.name;
                                            return (
                                                <th key={col.id}
                                                    onClick={() => {
                                                        setSelectedCol(col.name);
                                                        setSelectedRow(null);
                                                        setSelectedCell(null);
                                                    }}
                                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'col', colName: col.name }); }}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderBottom: freezeRows === 0 ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                        borderRight: isLastFrozenCol ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                        fontWeight: 600, color: 'var(--text-primary)',
                                                        width: colWidth, minWidth: colWidth, maxWidth: colWidth,
                                                        cursor: 'pointer',
                                                        position: isSticky ? 'sticky' : 'static',
                                                        left: stickyLeftVal,
                                                        zIndex: isSticky ? 12 : undefined,
                                                        background: selectedCol === col.name ? 'rgba(79, 142, 247, 0.15)' : 'var(--bg-secondary)'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700 }}>{col.name}</span>
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={columns.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Bảng trống — Nhấn "Thêm hàng" hoặc "Đồng bộ Crawler" để nạp dữ liệu.
                                            </td>
                                        </tr>
                                    ) : rows.map(row => {
                                        const stickyTopVal = stickyTopMap[row.row_number];
                                        const isStickyRow = stickyTopVal !== undefined;
                                        const isLastFrozenRow = freezeRows > 0 && row.row_number === freezeRows;

                                        let customStyles = {};
                                        if (row.cells._STYLES) {
                                            try {
                                                customStyles = typeof row.cells._STYLES === 'string' ? JSON.parse(row.cells._STYLES) : row.cells._STYLES;
                                            } catch (e) {}
                                        }

                                        return (
                                            <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td
                                                    onClick={() => {
                                                        setSelectedRow(row.row_number);
                                                        setSelectedCol(null);
                                                        setSelectedCell(null);
                                                    }}
                                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'row', rowNum: row.row_number }); }}
                                                    style={{
                                                        width: 50, minWidth: 50, maxWidth: 50,
                                                        padding: '8px 10px', color: 'var(--text-muted)',
                                                        borderRight: freezeCols === 0 ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                        borderBottom: isLastFrozenRow ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                        textAlign: 'center', fontWeight: 500,
                                                        background: selectedRow === row.row_number ? 'rgba(79, 142, 247, 0.15)' : 'var(--bg-secondary)',
                                                        position: 'sticky', left: 0, top: stickyTopVal,
                                                        zIndex: isStickyRow ? 9 : 5, cursor: 'pointer'
                                                    }}
                                                >
                                                     {row.row_number}
                                                </td>
                                                {columns.map(col => {
                                                    const val = row.cells[col.name] || '';
                                                    const isEditing = editingCell?.rowNum === row.row_number && editingCell?.colName === col.name;
                                                    const isSelected = selectedCell?.rowNum === row.row_number && selectedCell?.colName === col.name;
                                                    const isFormula = typeof val === 'string' && val.startsWith('=');
                                                    const displayVal = isFormula ? evaluateFormula(val, rows, columns) : val;

                                                    const stickyLeftVal = stickyLeftMap[col.name];
                                                    const isStickyCol = stickyLeftVal !== undefined;
                                                    const colWidth = ['I', 'P', 'Q'].includes(col.name) ? 280 : 180;
                                                    const isLastFrozenCol = freezeCols > 0 && col.name === columns[freezeCols - 1]?.name;

                                                    const isRowSelected = selectedRow === row.row_number;
                                                    const isColSelected = selectedCol === col.name;
                                                    const isSearchMatch = searchSet.has(`${row.row_number}:${col.name}`);
                                                    const isCurrentSearchMatch = isSearchMatch && activeSearchMatch?.rowNum === row.row_number && activeSearchMatch?.colName === col.name;

                                                    let cellBg = 'var(--bg-card)';
                                                    if (isCurrentSearchMatch) {
                                                        cellBg = 'rgba(255, 179, 0, 0.4)';
                                                    } else if (isSearchMatch) {
                                                        cellBg = 'rgba(255, 235, 59, 0.35)';
                                                    } else if (isSelected && !isEditing) {
                                                        cellBg = 'rgba(79, 142, 247, 0.12)';
                                                    } else if (isRowSelected || isColSelected) {
                                                        cellBg = 'rgba(79, 142, 247, 0.06)';
                                                    } else {
                                                        cellBg = customStyles[col.name] || customStyles.row || 'var(--bg-card)';
                                                    }

                                                    return (
                                                        <td key={col.id}
                                                            id={`cell-${row.row_number}-${col.name}`}
                                                            onClick={(e) => {
                                                                if (formulaFocused && selectedCell) {
                                                                    // Formula injection mode
                                                                    const currentVal = rows.find(r => r.row_number === selectedCell.rowNum)?.cells[selectedCell.colName] || '';
                                                                    const clickedCoord = `${col.name}${row.row_number}`;
                                                                    let separator = '';
                                                                    if (currentVal && !['+', '-', '*', '/', '(', ','].some(op => currentVal.endsWith(op))) {
                                                                        separator = ' + ';
                                                                    }
                                                                    const newVal = currentVal ? `${currentVal}${separator}${clickedCoord}` : `=${clickedCoord}`;
                                                                    
                                                                    setRows(prev => prev.map(r => {
                                                                        if (r.row_number === selectedCell.rowNum) {
                                                                            return { ...r, cells: { ...r.cells, [selectedCell.colName]: newVal } };
                                                                        }
                                                                        return r;
                                                                    }));
                                                                    handleSaveCell(selectedCell.rowNum, selectedCell.colName, newVal);
                                                                    
                                                                    if (formulaInputRef.current) {
                                                                        formulaInputRef.current.focus();
                                                                    }
                                                                    return;
                                                                }
                                                                
                                                                if (!isEditing) {
                                                                    setSelectedCell({ rowNum: row.row_number, colName: col.name });
                                                                    setSelectedRow(null);
                                                                    setSelectedCol(null);
                                                                    // Clear pin if clicking a different cell
                                                                    if (pinnedCell && (pinnedCell.rowNum !== row.row_number || pinnedCell.colName !== col.name)) {
                                                                        setPinnedCell(null);
                                                                    }
                                                                }
                                                            }}
                                                            onDoubleClick={(e) => {
                                                                // Open floating overlay editor
                                                                const tdEl = e.currentTarget;
                                                                const rect = tdEl.getBoundingClientRect();
                                                                setPinnedCell({
                                                                    rowNum: row.row_number,
                                                                    colName: col.name,
                                                                    editing: true,
                                                                    editVal: val,
                                                                    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                                                                });
                                                            }}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'cell', rowNum: row.row_number, colName: col.name });
                                                            }}
                                                            style={{
                                                                padding: '8px 12px',
                                                                borderRight: isLastFrozenCol ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                                borderBottom: isLastFrozenRow ? '2px solid #a0a0a0' : '1px solid var(--border-color)',
                                                                cursor: 'cell',
                                                                position: (isStickyCol || isStickyRow) ? 'sticky' : 'relative',
                                                                left: stickyLeftVal,
                                                                top: stickyTopVal,
                                                                zIndex: (isStickyCol && isStickyRow) ? 8 : (isStickyRow ? 6 : (isStickyCol ? 5 : undefined)),
                                                                outline: isSelected ? '2px solid var(--accent)' : 'none',
                                                                outlineOffset: '-2px',
                                                                background: cellBg,
                                                                width: colWidth,
                                                                minWidth: colWidth,
                                                                maxWidth: colWidth
                                                            }}
                                                            title="Nhấp đúp để sửa"
                                                        >
                                                            <div style={{
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }}>
                                                                {typeof displayVal === 'string' && (displayVal.trim().startsWith('http://') || displayVal.trim().startsWith('https://')) ? (
                                                                    <a href={displayVal} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                                                                        {displayVal}
                                                                    </a>
                                                                ) : (
                                                                    displayVal || <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>-</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {/* ──────── Google Sheets-style Bottom Sheet Tabs Bar ──────── */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--bg-secondary)',
                        borderTop: '1px solid var(--border-color)',
                        height: 38,
                        padding: '0 8px',
                        userSelect: 'none',
                        fontSize: 13
                    }}>
                        {/* Left Controls: Add (+) and Tab List (☰) */}
                        <button
                            type="button"
                            onClick={() => { setNewTabName(`Tab ${sheets.length + 1}`); setShowCreateTabModal(true); }}
                            title="Tạo tab con mới"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 4,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                marginRight: 4
                            }}
                            className="btn-icon-hover"
                        >
                            <Plus size={18} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowTabListModal(true)}
                            title="Tất cả trang tính"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 4,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                marginRight: 8
                            }}
                            className="btn-icon-hover"
                        >
                            <Menu size={18} />
                        </button>

                        <div style={{ height: 20, width: 1, background: 'var(--border-color)', marginRight: 8 }} />

                        {/* Horizontal Sheet Tabs */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            overflowX: 'auto',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                            height: '100%'
                        }}>
                            {currentSubTabs.map(s => {
                                const isActive = s.id === selectedSheetId;
                                const isEditingThisTab = editingTabId === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => {
                                            if (!isEditingThisTab) {
                                                setSelectedSheetId(s.id);
                                                setSelectedCell(null);
                                                setSelectedRow(null);
                                                setSelectedCol(null);
                                            }
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTabId(s.id);
                                            setEditingTabName(s.name);
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setTabContextMenu({ x: e.clientX, y: e.clientY, sheetId: s.id, sheetName: s.name });
                                        }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            height: '100%',
                                            padding: '0 14px',
                                            cursor: 'pointer',
                                            background: isActive ? 'var(--bg-card)' : 'transparent',
                                            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                            fontWeight: isActive ? 700 : 500,
                                            borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                                            borderLeft: isActive ? '1px solid var(--border-color)' : '1px solid transparent',
                                            borderRight: isActive ? '1px solid var(--border-color)' : '1px solid transparent',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {isEditingThisTab ? (
                                            <input
                                                type="text"
                                                value={editingTabName}
                                                onChange={e => setEditingTabName(e.target.value)}
                                                onBlur={() => handleSaveInlineTabRename(s.id, editingTabName)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        handleSaveInlineTabRename(s.id, editingTabName);
                                                    } else if (e.key === 'Escape') {
                                                        setEditingTabId(null);
                                                    }
                                                }}
                                                autoFocus
                                                onFocus={e => e.target.select()}
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: 3,
                                                    padding: '2px 6px',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    outline: 'none',
                                                    background: 'var(--bg-card)',
                                                    color: 'var(--text-primary)',
                                                    minWidth: 80,
                                                    width: `${Math.max(80, editingTabName.length * 10)}px`
                                                }}
                                            />
                                        ) : (
                                            <>
                                                <span title="Nhấp đúp để đổi tên">{s.name}</span>
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setTabContextMenu({ x: rect.left, y: rect.bottom + 4, sheetId: s.id, sheetName: s.name });
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        padding: 2,
                                                        borderRadius: 3,
                                                        opacity: isActive ? 1 : 0.6,
                                                        cursor: 'pointer'
                                                    }}
                                                    className="btn-icon-hover"
                                                >
                                                    <ChevronDown size={14} />
                                                </span>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ──────── Pinned Floating Cell Overlay (double-click to edit) ──────── */}
            {pinnedCell && (
                <PinnedCellOverlay
                    pinnedCell={pinnedCell}
                    rows={rows}
                    columns={columns}
                    onSave={(newVal) => {
                        handleSaveCell(pinnedCell.rowNum, pinnedCell.colName, newVal);
                        setPinnedCell(null);
                    }}
                    onClose={() => setPinnedCell(null)}
                    onStartEdit={() => setPinnedCell(p => ({ ...p, editing: true }))}
                />
            )}



            {/* ──────── Context Menu (Right-click) ──────── */}
            {contextMenu && (

                <div
                    onClick={() => setContextMenu(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 99990 }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'fixed',
                            top: Math.min(contextMenu.y, window.innerHeight - 240),
                            left: Math.min(contextMenu.x, window.innerWidth - 240),
                            zIndex: 99999,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                            minWidth: 220,
                            overflow: 'hidden',
                            fontSize: 13,
                        }}
                    >
                        {/* Title */}
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Ghim (Freeze Panes)
                        </div>

                        {/* Freeze row options */}
                        {(contextMenu.type === 'row' || contextMenu.type === 'cell') && contextMenu.rowNum && (
                            <>
                                <button
                                    onClick={() => {
                                        const colIdx = columns.findIndex(c => c.name === contextMenu.colName);
                                        setFreezeRows(contextMenu.rowNum);
                                        setContextMenu(null);
                                    }}
                                    style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <span style={{ fontSize: 16 }}>📌</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>Ghim đến hàng {contextMenu.rowNum}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Khóa {contextMenu.rowNum} hàng đầu tiên</div>
                                    </div>
                                </button>
                                {freezeRows > 0 && (
                                    <button
                                        onClick={() => { setFreezeRows(0); setContextMenu(null); }}
                                        style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <span style={{ fontSize: 16 }}>🔓</span>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Bỏ ghim tất cả hàng</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hiện đang ghim {freezeRows} hàng</div>
                                        </div>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Freeze col options */}
                        {(contextMenu.type === 'col' || contextMenu.type === 'cell') && contextMenu.colName && (
                            <>
                                <button
                                    onClick={() => {
                                        const colIdx = columns.findIndex(c => c.name === contextMenu.colName);
                                        if (colIdx !== -1) { setFreezeCols(colIdx + 1); setContextMenu(null); }
                                    }}
                                    style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <span style={{ fontSize: 16 }}>📌</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>Ghim đến cột {contextMenu.colName}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Khóa {(() => { const i = columns.findIndex(c => c.name === contextMenu.colName); return i + 1; })()} cột đầu tiên</div>
                                    </div>
                                </button>
                                {freezeCols > 0 && (
                                    <button
                                        onClick={() => { setFreezeCols(0); setContextMenu(null); }}
                                        style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <span style={{ fontSize: 16 }}>🔓</span>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Bỏ ghim tất cả cột</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hiện đang ghim {freezeCols} cột</div>
                                        </div>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Corner: unfreeze all */}
                        {contextMenu.type === 'corner' && (
                            <button
                                onClick={() => { setFreezeCols(0); setFreezeRows(0); setContextMenu(null); }}
                                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                <span style={{ fontSize: 16 }}>🔓</span>
                                <div>
                                    <div style={{ fontWeight: 600 }}>Bỏ ghim tất cả</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Xóa mọi thiết lập ghim hàng & cột</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ──────── Modals: Create Sheet (Table) ──────── */}

            {showCreateModal && (
                <div className="modal-backdrop" onClick={() => setShowCreateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 420, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>📊 Tạo bảng dữ liệu mới</span>
                            <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateSheet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tên bảng</span>
                                <input type="text" value={newSheetName} onChange={e => setNewSheetName(e.target.value)} placeholder="Nhập tên bảng, ví dụ: SEO Newland 07" required autoFocus
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cấu trúc cột mẫu</span>
                                <select value={newSheetTemplate} onChange={e => setNewSheetTemplate(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value="seo_sapo">Chuẩn SEO & Sapo (Cột A-L)</option>
                                    <option value="empty">Bảng trống (Chỉ có Cột A)</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={creatingSheet}>
                                    {creatingSheet ? <Loader2 size={14} className="spin" /> : 'Tạo bảng'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Create Sub-Tab ──────── */}
            {showCreateTabModal && (
                <div className="modal-backdrop" onClick={() => setShowCreateTabModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 420, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>➕ Tạo tab con mới</span>
                            <button onClick={() => setShowCreateTabModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateSubTab} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tên tab con</span>
                                <input type="text" value={newTabName} onChange={e => setNewTabName(e.target.value)} placeholder="Nhập tên tab con, ví dụ: Tab 2" required autoFocus
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cấu trúc cột mẫu</span>
                                <select value={newTabTemplate} onChange={e => setNewTabTemplate(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value="seo_sapo">Chuẩn SEO & Sapo (Cột A-L)</option>
                                    <option value="empty">Bảng trống (Chỉ có Cột A)</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateTabModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={creatingTab}>
                                    {creatingTab ? <Loader2 size={14} className="spin" /> : 'Tạo tab con'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Add Column ──────── */}
            {showAddColModal && (
                <div className="modal-backdrop" onClick={() => setShowAddColModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 380, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>➕ Thêm cột mới</span>
                            <button onClick={() => setShowAddColModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddColumn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tên tiêu đề cột</span>
                                <input type="text" value={newColLabel} onChange={e => setNewColLabel(e.target.value)} placeholder="Nhập tiêu đề, ví dụ: Link sản phẩm" required autoFocus
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Kiểu dữ liệu</span>
                                <select value={newColType} onChange={e => setNewColType(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value="text">Chữ thường (Text)</option>
                                    <option value="html">Bảng HTML (Specs Table)</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddColModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={addingCol}>
                                    {addingCol ? <Loader2 size={14} className="spin" /> : 'Thêm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Import Google Sheets ──────── */}
            {showImportGsModal && (
                <div className="modal-backdrop" onClick={() => setShowImportGsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 440, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>📥 Nhập dữ liệu từ Google Sheets</span>
                            <button onClick={() => setShowImportGsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        
                        {/* Credentials Status Section */}
                        <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Trạng thái Google API:</span>
                                {hasCredentials ? (
                                    <span style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Check size={14} /> Đã cấu hình
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 11.5, color: 'var(--danger)', fontWeight: 600 }}>
                                        ⚠️ Chưa kết nối
                                    </span>
                                )}
                            </div>
                            {hasCredentials && clientEmail && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 4 }}>
                                    Email: <code>{clientEmail}</code>
                                </div>
                            )}
                            <div style={{ marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => credsFileInputRef.current?.click()} disabled={uploadingCreds} style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {uploadingCreds ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                                    {hasCredentials ? 'Tải lên credentials khác' : 'Tải lên file credentials.json'}
                                </button>
                                <input type="file" ref={credsFileInputRef} onChange={handleUploadCredentials} accept=".json" style={{ display: 'none' }} />
                            </div>
                        </div>

                        <form onSubmit={handleImportGoogleSheets} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Google Spreadsheet ID</span>
                                <input type="text" value={gsSpreadsheetId} onChange={e => setGsSpreadsheetId(e.target.value)} placeholder="Nhập Spreadsheet ID..." required autoFocus
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={importAllTabs} onChange={e => setImportAllTabs(e.target.checked)} />
                                    Tự động nhập tất cả các tab con trong spreadsheet
                                </label>
                            </div>

                            {!importAllTabs && (
                                <div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tên Tab Sheet (Sheet Tab Name)</span>
                                    <input type="text" value={gsSheetName} onChange={e => setGsSheetName(e.target.value)} placeholder="VD: Sheet1" required
                                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowImportGsModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={importingGs || !hasCredentials}>
                                    {importingGs ? <Loader2 size={14} className="spin" /> : 'Nhập dữ liệu'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Edit HTML Spec Cell ──────── */}
            {/* ──────── Modals: Edit HTML Spec Cell ──────── */}
            {editingHtmlCell && (() => {
                const col = columns.find(c => c.name === editingHtmlCell.colName);
                const colLabel = col ? col.header_label : editingHtmlCell.colName;
                const isSpecTable = colLabel.toLowerCase().includes('thông số') || colLabel.toLowerCase().includes('spec');
                return (
                    <div className="modal-backdrop" onClick={() => setEditingHtmlCell(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 700, padding: 20, display: 'flex', flexDirection: 'column', height: '80vh', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <span style={{ fontWeight: 700, fontSize: 15 }}>👁 Soạn thảo HTML - Cột {colLabel} (Dòng {editingHtmlCell.rowNum})</span>
                                <button onClick={() => setEditingHtmlCell(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                            </div>
                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, overflow: 'hidden', marginBottom: 12 }}>
                                {/* Editor */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Mã HTML</span>
                                    <textarea
                                        value={editingHtmlCell.value}
                                        onChange={e => setEditingHtmlCell(p => ({ ...p, value: e.target.value }))}
                                        style={{ flex: 1, resize: 'none', padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                                    />
                                </div>
                                {/* Preview */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'hidden' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {isSpecTable ? 'Xem trước định dạng bảng' : 'Xem trước hiển thị'}
                                    </span>
                                    <div className="html-table-preview" style={{ flex: 1, overflowY: 'auto', padding: 12, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#fff', color: '#333' }}
                                        dangerouslySetInnerHTML={{ __html: editingHtmlCell.value || `<div style="color:#aaa;text-align:center;padding-top:60px">Chưa có dữ liệu ${isSpecTable ? 'bảng' : 'hiển thị'}</div>` }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setEditingHtmlCell(null)}>Đóng</button>
                                <button type="button" className="btn btn-secondary" onClick={() => {
                                    handleSaveCell(editingHtmlCell.rowNum, editingHtmlCell.colName, editingHtmlCell.value);
                                    setEditingHtmlCell(null);
                                }}>Lưu thay đổi</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ──────── Modals: Cell Value Inspector ──────── */}
            {showInspector && selectedCell && (
                <div className="modal-backdrop" onClick={() => setShowInspector(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, padding: 20, display: 'flex', flexDirection: 'column', height: '60vh', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>🔍 Chi tiết ô {selectedCell.colName}{selectedCell.rowNum}</span>
                            <button onClick={() => setShowInspector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Nội dung chi tiết (Có thể chỉnh sửa trực tiếp)</span>
                            <textarea
                                value={rows.find(r => r.row_number === selectedCell.rowNum)?.cells[selectedCell.colName] || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setRows(prev => prev.map(r => {
                                        if (r.row_number === selectedCell.rowNum) {
                                            return { ...r, cells: { ...r.cells, [selectedCell.colName]: val } };
                                        }
                                        return r;
                                    }));
                                    handleSaveCell(selectedCell.rowNum, selectedCell.colName, val);
                                }}
                                style={{ flex: 1, resize: 'none', padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'sans-serif', lineHeight: '1.5' }}
                                placeholder="(Trống)"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowInspector(false)}>Đóng</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Sync Crawler Configuration ──────── */}
            {showSyncModal && (
                <div className="modal-backdrop" onClick={() => setShowSyncModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 460, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>⚙️ Đồng bộ dữ liệu Crawler</span>
                            <button onClick={() => setShowSyncModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Chọn phương thức phân chia dữ liệu khi đồng bộ từ Crawler:</span>
                            
                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', border: '1px solid var(--border-color)', padding: 12, borderRadius: 'var(--radius-sm)', background: syncMode === 'direct' ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                <input type="radio" checked={syncMode === 'direct'} onChange={() => setSyncMode('direct')} style={{ marginTop: 3 }} />
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>Ghi đè trực tiếp vào bảng hiện tại</span>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Xóa dữ liệu cũ của bảng này và nạp toàn bộ sản phẩm cào được vào đây.</span>
                                </div>
                            </label>

                            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', border: '1px solid var(--border-color)', padding: 12, borderRadius: 'var(--radius-sm)', background: syncMode === 'hierarchical' ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                <input type="radio" checked={syncMode === 'hierarchical'} onChange={() => setSyncMode('hierarchical')} style={{ marginTop: 3 }} />
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>Tự động phân tab theo Danh mục lớn</span>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Chia tách sản phẩm của hãng thành các bảng con tương ứng theo Danh mục lớn (VD: Newland - Product Data - Handheld Scanners). Cột B sẽ tự động điền danh mục con tương ứng.</span>
                                </div>
                            </label>

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowSyncModal(false)}>Hủy</button>
                                <button type="button" className="btn btn-secondary" onClick={handleExecuteSyncCrawler} disabled={syncing}>
                                    {syncing ? <Loader2 size={14} className="spin" /> : 'Bắt đầu đồng bộ'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── Modals: Batch Merge Columns ──────── */}
            {showMergeColsModal && (
                <div className="modal-backdrop" onClick={() => setShowMergeColsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 520, padding: 22, boxShadow: '0 20px 40px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>🔗 Ghép cột dữ liệu hàng loạt</span>
                            <button onClick={() => setShowMergeColsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleBatchMergeCols} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Nhấp vào cột để chèn nhanh vào mẫu ghép:
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', maxHeight: 150, overflowY: 'auto' }}>
                                    {columns.map(col => (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() => insertColumnPlaceholder(col.name)}
                                            title={`Chèn {{${col.name}}}`}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-card)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                fontSize: 11.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontWeight: 500,
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.border = '1px solid #1a73e8';
                                                e.currentTarget.style.background = 'rgba(26, 115, 232, 0.04)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.border = '1px solid var(--border-color)';
                                                e.currentTarget.style.background = 'var(--bg-card)';
                                            }}
                                        >
                                            <span>+ {col.header_label} ({col.name})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Mẫu ghép (Tự gõ chữ, ký tự đặc biệt, hoặc xuống dòng tự do):
                                </span>
                                <textarea
                                    ref={templateInputRef}
                                    value={mergeTemplate}
                                    onChange={e => setMergeTemplate(e.target.value)}
                                    placeholder="Ví dụ: {{ten_sp}} - Giá: {{gia_ban}} VNĐ&#10;Chi tiết: {{thong_so}}"
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        fontFamily: 'Consolas, Courier New, monospace',
                                        fontSize: '13px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                        resize: 'vertical',
                                        lineHeight: '1.4'
                                    }}
                                />
                                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                                    * Sử dụng cấu trúc cú pháp <code>{"{{tên_cột}}"}</code> để đại diện cho giá trị của cột đó trong mỗi hàng.
                                </span>
                            </div>

                            <div>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Xem trước kết quả ghép {(rows.find(r => r.row_number === mergeStartRow) || rows[0]) ? `(Hàng ${(rows.find(r => r.row_number === mergeStartRow) || rows[0]).row_number})` : ''}:
                                </span>
                                <div style={{
                                    padding: '10px 12px',
                                    background: 'rgba(26, 115, 232, 0.04)',
                                    border: '1px dashed rgba(26, 115, 232, 0.3)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontFamily: 'Consolas, Courier New, monospace',
                                    fontSize: '12.5px',
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'pre-wrap',
                                    minHeight: '40px',
                                    maxHeight: '120px',
                                    overflowY: 'auto'
                                }}>
                                    {(() => {
                                        const previewRow = rows.find(r => r.row_number === mergeStartRow) || rows[0];
                                        if (!previewRow) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Không có dữ liệu hàng để xem trước</span>;
                                        const result = evaluateTemplate(mergeTemplate, previewRow, columns, rows);
                                        return result || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nhập nội dung mẫu ghép để xem trước kết quả...</span>;
                                    })()}
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cột đích (Ghi kết quả ghép)</span>
                                <select value={mergeTargetCol} onChange={e => setMergeTargetCol(e.target.value)} required
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 12.5 }}
                                >
                                    <option value="" disabled>-- Chọn cột ghi kết quả --</option>
                                    {columns.map(col => (
                                        <option key={col.id} value={col.name}>
                                            {col.header_label} ({col.name})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Bắt đầu từ hàng</span>
                                    <input type="number" min={1} value={mergeStartRow} onChange={e => setMergeStartRow(parseInt(e.target.value) || 1)} required
                                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 12.5 }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Đến hàng (bao gồm cả hàng này)</span>
                                    <input type="number" placeholder="Mặc định: Hàng cuối cùng" value={mergeEndRow} onChange={e => setMergeEndRow(e.target.value ? parseInt(e.target.value) : '')}
                                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 12.5 }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowMergeColsModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={mergeProcessing || !mergeTemplate.trim()}>
                                    {mergeProcessing ? <Loader2 size={14} className="spin" /> : 'Bắt đầu ghép cột'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── Tab Context Menu Dropdown ──────── */}
            {tabContextMenu && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                        onClick={() => setTabContextMenu(null)}
                    />
                    <div style={{
                        position: 'fixed',
                        top: Math.max(10, Math.min(tabContextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 135)),
                        left: Math.max(10, Math.min(tabContextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 170)),
                        zIndex: 99999,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        padding: '4px 0',
                        minWidth: 160
                    }}>
                        <div
                            onClick={() => {
                                const id = tabContextMenu.sheetId;
                                setTabContextMenu(null);
                                handleDuplicateSheet(id);
                            }}
                            style={{ padding: '8px 14px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}
                            className="btn-icon-hover"
                        >
                            <Copy size={14} /> Nhân bản tab
                        </div>
                        <div
                            onClick={() => {
                                const { sheetId, sheetName } = tabContextMenu;
                                setTabContextMenu(null);
                                setRenamingSheet({ id: sheetId, name: sheetName });
                                setShowRenameModal(true);
                            }}
                            style={{ padding: '8px 14px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)' }}
                            className="btn-icon-hover"
                        >
                            <Edit2 size={14} /> Đổi tên tab...
                        </div>
                        <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                        <div
                            onClick={() => {
                                const { sheetId, sheetName } = tabContextMenu;
                                setTabContextMenu(null);
                                handleDeleteSheetById(sheetId, sheetName);
                            }}
                            style={{ padding: '8px 14px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--danger)' }}
                            className="btn-icon-hover"
                        >
                            <Trash2 size={14} /> Xóa tab
                        </div>
                    </div>
                </>
            )}

            {/* ──────── Rename Sheet Modal ──────── */}
            {showRenameModal && (
                <div className="modal-backdrop" onClick={() => setShowRenameModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 380, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>✏️ Đổi tên trang tính</span>
                            <button onClick={() => setShowRenameModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleExecuteRenameSheet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tên trang tính mới</span>
                                <input
                                    type="text"
                                    value={renamingSheet.name}
                                    onChange={e => setRenamingSheet(p => ({ ...p, name: e.target.value }))}
                                    required
                                    autoFocus
                                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', fontSize: 12.5 }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowRenameModal(false)}>Hủy</button>
                                <button type="submit" className="btn btn-secondary" disabled={renamingProcessing || !renamingSheet.name.trim()}>
                                    {renamingProcessing ? <Loader2 size={14} className="spin" /> : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ──────── All Sheets List Modal ──────── */}
            {showTabListModal && (
                <div className="modal-backdrop" onClick={() => setShowTabListModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 420, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.3)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>📋 Trang tính của {activeParentTable?.name || ''} ({currentSubTabs.length})</span>
                            <button onClick={() => setShowTabListModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {currentSubTabs.map(s => {
                                const isActive = s.id === selectedSheetId;
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => {
                                            setSelectedSheetId(s.id);
                                            setShowTabListModal(false);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: isActive ? 'rgba(79, 142, 247, 0.15)' : 'var(--bg-secondary)',
                                            color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                                            fontWeight: isActive ? 700 : 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>{s.name}</span>
                                            {isActive && <Check size={16} style={{ color: 'var(--accent)' }} />}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteSheetById(s.id, s.name);
                                            }}
                                            title="Xóa tab này"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--danger)', display: 'inline-flex' }}
                                            className="btn-icon-hover"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── Toasts Container ──────── */}
            <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {toasts.map(t => (
                    <div key={t.id} style={{
                        padding: '11px 18px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)',
                        borderLeft: `4px solid ${t.type === 'danger' ? 'var(--danger)' : 'var(--success)'}`,
                        color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 500, minWidth: 260
                    }}>
                        {t.message}
                    </div>
                ))}
            </div>
        </div>
    );
}
