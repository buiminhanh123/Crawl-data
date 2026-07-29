'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { 
    X, 
    FileSpreadsheet, 
    Upload, 
    Link as LinkIcon, 
    CheckSquare, 
    Square, 
    Loader2, 
    CheckCircle2, 
    AlertCircle,
    Eye,
    Layers,
    Key,
    ShieldCheck,
    FileCode,
    ChevronDown,
    Pin,
    Edit3,
    Merge,
    Copy,
    Check,
    ExternalLink
} from 'lucide-react';

export default function ImportSheetModal({ isOpen, onClose, profileName = 'Profile', profileSlug = 'newland', onImportSuccess }) {
    const [importMode, setImportMode] = useState('file'); // 'file' | 'url'
    const [googleUrl, setGoogleUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // Tab dropdown & filter state
    const [showTabDropdown, setShowTabDropdown] = useState(false);
    const [tabSearchFilter, setTabSearchFilter] = useState('');

    // Active selected cell state (Google Sheets style border highlight)
    const [selectedCell, setSelectedCell] = useState(null); // { rIdx, cIdx }

    // Header & Data Row Selection
    const [headerRow, setHeaderRow] = useState(1);
    const [dataStartRow, setDataStartRow] = useState(2);

    // Feature 1: Freeze rows (Ghim hàng)
    const [freezeRows, setFreezeRows] = useState(1);


    // Feature 2: Double Click cell viewer / editor modal
    const [cellDetailModal, setCellDetailModal] = useState(null); // { rIdx, cIdx, val, isEditing }
    const [copiedCell, setCopiedCell] = useState(false);

    // Feature 3: Ghép Cột Hàng (Batch Merge Columns)
    const [showMergeColsModal, setShowMergeColsModal] = useState(false);
    const [mergeTemplate, setMergeTemplate] = useState('');
    const [mergeTargetColIndex, setMergeTargetColIndex] = useState(0);
    const [mergeStartRow, setMergeStartRow] = useState(1);
    const [mergeEndRow, setMergeEndRow] = useState('');
    
    // Credentials status state
    const [credStatus, setCredStatus] = useState({ hasCredentials: false, clientEmail: '' });
    const [uploadingCred, setUploadingCred] = useState(false);
    const credInputRef = useRef(null);

    // Parsed sheets data: Array of { name: string, data: Array<Array<any>> }
    const [allSheets, setAllSheets] = useState([]);
    const [selectedSheetNames, setSelectedSheetNames] = useState([]);
    const [activeTabName, setActiveTabName] = useState('');

    const fileInputRef = useRef(null);

    const checkCredentialsStatus = async () => {
        try {
            const data = await fetchApi('/api/sheets/settings');
            if (data) {
                setCredStatus({
                    hasCredentials: !!data.hasCredentials,
                    clientEmail: data.clientEmail || ''
                });
            }
        } catch (e) {
            console.error('Failed to fetch credentials status:', e);
        }
    };

    useEffect(() => {
        if (isOpen) {
            checkCredentialsStatus();
        }
    }, [isOpen]);

    // Helper: Column index to letter A, B, ... Z, AA, AB...
    const getColumnLetter = (colIndex) => {
        let temp, letter = '';
        while (colIndex >= 0) {
            temp = colIndex % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            colIndex = Math.floor(colIndex / 26) - 1;
        }
        return letter;
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setErrorMsg('');
        }
    };

    const handleCredentialsFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingCred(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const formData = new FormData();
            formData.append('credentials', file);
            const token = localStorage.getItem('token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

            const res = await fetch(`${apiUrl}/api/sheets/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi nạp file credentials.json');

            setCredStatus({ hasCredentials: true, clientEmail: data.clientEmail || '' });
            setSuccessMsg(`Đã nạp file credentials.json thành công! Service Account: ${data.clientEmail || ''}`);
        } catch (err) {
            setErrorMsg(err.message || 'Lỗi nạp credentials.json');
        } finally {
            setUploadingCred(false);
        }
    };

    const processSheetRows = (sheetsList, hRow, dStartRow) => {
        const hIdx = Math.max(0, (parseInt(hRow) || 1) - 1);
        const dStartIdx = Math.max(0, (parseInt(dStartRow) || 2) - 1);

        return sheetsList.map(s => {
            const rawData = s.data || [];
            if (rawData.length === 0) return s;

            // Pick header row
            const headerLine = rawData[hIdx] ? [...rawData[hIdx]] : (rawData[0] ? [...rawData[0]] : []);
            // Pick data rows starting from dStartIdx
            const dataLines = rawData.slice(dStartIdx);

            return {
                ...s,
                data: [headerLine, ...dataLines]
            };
        });
    };

    const handleLoadExcel = async () => {
        if (!selectedFile) {
            setErrorMsg('Vui lòng chọn file Excel hoặc CSV.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const token = localStorage.getItem('token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
            
            const res = await fetch(`${apiUrl}/api/sheets/parse-excel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi khi đọc file Excel');

            if (data?.sheets && data.sheets.length > 0) {
                const processedSheets = processSheetRows(data.sheets, headerRow, dataStartRow);
                setAllSheets(processedSheets);
                const sheetNames = processedSheets.map(s => s.name);
                setSelectedSheetNames(sheetNames);
                setActiveTabName(sheetNames[0]);
                setSuccessMsg(`Đã tải thành công ${processedSheets.length} tab từ file '${data.fileName}'. (Header: Hàng ${headerRow}, Dữ liệu từ: Hàng ${dataStartRow})`);
            } else {
                setErrorMsg('Không tìm thấy tab dữ liệu nào trong file.');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Lỗi đọc file Excel');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadGoogleUrl = async () => {
        if (!googleUrl.trim()) {
            setErrorMsg('Vui lòng nhập đường dẫn Google Sheets.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const data = await fetchApi('/api/sheets/parse-url', {
                method: 'POST',
                body: JSON.stringify({ url: googleUrl.trim() })
            });

            if (data?.sheets && data.sheets.length > 0) {
                const processedSheets = processSheetRows(data.sheets, headerRow, dataStartRow);
                setAllSheets(processedSheets);
                const sheetNames = processedSheets.map(s => s.name);
                setSelectedSheetNames(sheetNames);
                setActiveTabName(sheetNames[0]);
                setSuccessMsg(`Đã tải thành công ${processedSheets.length} tab từ Google Sheets. (Header: Hàng ${headerRow}, Dữ liệu từ: Hàng ${dataStartRow})`);
            } else {
                setErrorMsg('Không tìm thấy tab dữ liệu nào.');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Lỗi đọc Google Sheets');
        } finally {
            setLoading(false);
        }
    };


    const toggleSelectSheet = (name) => {
        if (selectedSheetNames.includes(name)) {
            if (selectedSheetNames.length === 1) return; // keep at least 1
            const next = selectedSheetNames.filter(n => n !== name);
            setSelectedSheetNames(next);
            if (activeTabName === name) {
                setActiveTabName(next[0]);
            }
        } else {
            setSelectedSheetNames([...selectedSheetNames, name]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedSheetNames.length === allSheets.length) {
            setSelectedSheetNames([allSheets[0]?.name].filter(Boolean));
            setActiveTabName(allSheets[0]?.name || '');
        } else {
            const allNames = allSheets.map(s => s.name);
            setSelectedSheetNames(allNames);
            if (!activeTabName && allNames.length > 0) {
                setActiveTabName(allNames[0]);
            }
        }
    };
    // Helper: evaluate merge template string (e.g. "{{A}} - {{B}}")
    const evaluateTemplate = (template, rowArray) => {
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

    const handleSaveCellDetail = (newVal) => {
        if (!cellDetailModal) return;
        const { rIdx, cIdx } = cellDetailModal;
        setAllSheets(prevSheets => {
            return prevSheets.map(s => {
                if (s.name !== activeTabName) return s;
                const newData = [...s.data];
                if (!newData[rIdx]) newData[rIdx] = [];
                const newRow = [...newData[rIdx]];
                newRow[cIdx] = newVal;
                newData[rIdx] = newRow;
                return { ...s, data: newData };
            });
        });
        setCellDetailModal(null);
    };

    const handleExecuteMergeCols = () => {
        if (!mergeTemplate.trim()) return;
        const start = Math.max(1, parseInt(mergeStartRow) || 1) - 1; // 0-indexed
        
        setAllSheets(prevSheets => {
            return prevSheets.map(s => {
                if (s.name !== activeTabName) return s;
                const end = mergeEndRow ? Math.min(s.data.length, parseInt(mergeEndRow)) : s.data.length;
                const newData = s.data.map((row, idx) => {
                    if (idx < start || idx >= end) return row;
                    const mergedVal = evaluateTemplate(mergeTemplate, row);
                    const newRow = Array.isArray(row) ? [...row] : [];
                    newRow[mergeTargetColIndex] = mergedVal;
                    return newRow;
                });
                return { ...s, data: newData };
            });
        });
        setShowMergeColsModal(false);
    };

    // Row limit state for 60fps instant UI response
    const [rowDisplayLimit, setRowDisplayLimit] = useState(100);

    // Reset row limit when active tab changes
    useEffect(() => {
        setRowDisplayLimit(100);
    }, [activeTabName]);

    // Memoized computations for lightning fast state updates
    const selectedSheetSet = useMemo(() => new Set(selectedSheetNames), [selectedSheetNames]);

    const visibleSheets = useMemo(() => {
        return allSheets.filter(s => selectedSheetSet.has(s.name));
    }, [allSheets, selectedSheetSet]);

    const activeSheetData = useMemo(() => {
        return allSheets.find(s => s.name === activeTabName)?.data || [];
    }, [allSheets, activeTabName]);

    const maxCols = useMemo(() => {
        if (!activeSheetData.length) return 0;
        const sample = activeSheetData.slice(0, 200);
        return sample.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    }, [activeSheetData]);

    const renderedRows = useMemo(() => {
        return activeSheetData.slice(0, rowDisplayLimit);
    }, [activeSheetData, rowDisplayLimit]);

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="sheet-viewer-modal" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileSpreadsheet style={{ color: 'var(--accent)' }} size={20} /> 
                            Xem & Nhập dữ liệu Excel / Google Sheets — {profileName}
                        </h3>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            Xem chi tiết tất cả hàng và cột dạng Google Sheets, tùy chọn lấy thông tin các tab con.
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Input Mode Selector & Import Form */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                        <button
                            type="button"
                            className={`btn ${importMode === 'file' ? 'btn-secondary' : 'btn-ghost'}`}
                            onClick={() => setImportMode('file')}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px' }}
                        >
                            <Upload size={14} /> File Excel / CSV (.xlsx, .csv)
                        </button>
                        <button
                            type="button"
                            className={`btn ${importMode === 'url' ? 'btn-secondary' : 'btn-ghost'}`}
                            onClick={() => setImportMode('url')}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px' }}
                        >
                            <LinkIcon size={14} /> Link Google Sheets
                        </button>
                    </div>

                    {importMode === 'file' ? (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                accept=".xlsx, .xls, .csv"
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                className="btn"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                            >
                                <Upload size={15} /> {selectedFile ? selectedFile.name : 'Chọn File Excel từ máy...'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleLoadExcel}
                                disabled={loading || !selectedFile}
                                style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '9px 18px', fontSize: 13 }}
                            >
                                {loading ? <Loader2 size={15} className="spin" /> : 'Tải & Xem tất cả Tab'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Google Credentials Status & Upload Box */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 12.5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Key size={15} style={{ color: credStatus.hasCredentials ? '#16a34a' : '#eab308' }} />
                                    {credStatus.hasCredentials ? (
                                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                            <strong style={{ color: '#16a34a' }}>Đã nạp credentials.json:</strong> {credStatus.clientEmail || 'Google Service Account'}
                                        </span>
                                    ) : (
                                        <span style={{ color: '#eab308', fontWeight: 500 }}>
                                            ⚠️ Chưa có file <code>credentials.json</code> cho Google Sheets API.
                                        </span>
                                    )}
                                </div>

                                <input
                                    type="file"
                                    ref={credInputRef}
                                    onChange={handleCredentialsFileSelect}
                                    accept=".json"
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => credInputRef.current?.click()}
                                    disabled={uploadingCred}
                                    style={{ background: 'none', border: '1px dashed var(--border-color)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {uploadingCred ? <Loader2 size={13} className="spin" /> : <FileCode size={13} />}
                                    {credStatus.hasCredentials ? 'Đổi Credentials JSON' : '+ Nạp Credentials JSON'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <input
                                    type="url"
                                    className="form-input"
                                    value={googleUrl}
                                    onChange={e => setGoogleUrl(e.target.value)}
                                    placeholder="Dán đường dẫn Google Sheets (https://docs.google.com/spreadsheets/d/...)"
                                    style={{ flex: 1, padding: '9px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleLoadGoogleUrl}
                                    disabled={loading || !googleUrl.trim()}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '9px 18px', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                    {loading ? <Loader2 size={15} className="spin" /> : 'Tải & Xem tất cả Tab'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Row selection configuration (Header Row & Data Start Row) */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-color)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                📌 Hàng chứa Header:
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={headerRow}
                                onChange={e => setHeaderRow(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: 64, padding: '5px 8px', fontSize: 13, fontWeight: 700, textAlign: 'center', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                📊 Dữ liệu bắt đầu từ hàng:
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={dataStartRow}
                                onChange={e => setDataStartRow(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: 64, padding: '5px 8px', fontSize: 13, fontWeight: 700, textAlign: 'center', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                            />
                        </div>

                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            (Mặc định: Hàng 1 làm Header, Dữ liệu từ Hàng 2)
                        </span>
                    </div>

                    {errorMsg && (

                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontSize: 13 }}>
                            <AlertCircle size={15} /> {errorMsg}
                        </div>
                    )}
                    {successMsg && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: 13, fontWeight: 500 }}>
                            <CheckCircle2 size={15} /> {successMsg}
                        </div>
                    )}
                </div>

                {/* Sub-Tab Filter Selection Control Bar (Dropdown & Check All Button) */}
                {allSheets.length > 0 && (
                    <div style={{ padding: '10px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Layers size={15} style={{ color: 'var(--accent)' }} /> Chọn tab con:
                            </span>

                            {/* Dropdown Toggle Button */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowTabDropdown(!showTabDropdown)}
                                    style={{
                                        padding: '6px 14px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                >
                                    <span>Danh sách Tab ({selectedSheetNames.length}/{allSheets.length} đã chọn)</span>
                                    <ChevronDown size={14} style={{ transform: showTabDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>

                                {/* Floating Multi-Select Dropdown Menu */}
                                {showTabDropdown && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            marginTop: 6,
                                            width: 340,
                                            maxHeight: 280,
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                                            zIndex: 999,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                                            <input
                                                type="text"
                                                value={tabSearchFilter}
                                                onChange={e => setTabSearchFilter(e.target.value)}
                                                placeholder="Lọc tên tab..."
                                                style={{ width: '100%', padding: '5px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                                            {allSheets
                                                .filter(s => s.name.toLowerCase().includes(tabSearchFilter.toLowerCase()))
                                                .map(s => {
                                                    const isChecked = selectedSheetNames.includes(s.name);
                                                    return (
                                                        <label
                                                            key={s.name}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                padding: '7px 12px',
                                                                cursor: 'pointer',
                                                                fontSize: 12.5,
                                                                background: isChecked ? '#fff7ed' : 'transparent',
                                                                color: isChecked ? 'var(--accent)' : 'var(--text-primary)',
                                                                fontWeight: isChecked ? 600 : 400
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => toggleSelectSheet(s.name)}
                                                                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                                                />
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                                            </div>
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, flexShrink: 0 }}>
                                                                {s.data?.length || 0} hàng
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Check All Button */}
                            <button
                                type="button"
                                onClick={toggleSelectAll}
                                style={{
                                    padding: '6px 14px',
                                    background: selectedSheetNames.length === allSheets.length ? '#fff7ed' : 'var(--bg-secondary)',
                                    border: `1px solid ${selectedSheetNames.length === allSheets.length ? '#ffedd5' : 'var(--border-color)'}`,
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    color: selectedSheetNames.length === allSheets.length ? 'var(--accent)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6
                                }}
                            >
                                {selectedSheetNames.length === allSheets.length ? <CheckSquare size={15} /> : <Square size={15} />}
                                <span>{selectedSheetNames.length === allSheets.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả tab'}</span>
                            </button>
                        </div>

                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                            Đã chọn <strong>{selectedSheetNames.length}</strong> / {allSheets.length} tab
                        </span>
                    </div>
                )}

                {/* Table Tool Bar: Ghim hàng, Ghép cột, Mẹo click đúp */}
                {allSheets.length > 0 && (
                    <div style={{ padding: '8px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            {/* Freeze Rows selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                                <Pin size={14} style={{ color: 'var(--accent)' }} />
                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Ghim hàng:</span>
                                <select
                                    value={freezeRows}
                                    onChange={e => setFreezeRows(parseInt(e.target.value) || 0)}
                                    style={{ padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                >
                                    <option value={0}>Không ghim</option>
                                    <option value={1}>Ghim Hàng 1 (Header)</option>
                                    <option value={2}>Ghim 2 hàng đầu</option>
                                    <option value={3}>Ghim 3 hàng đầu</option>
                                    <option value={5}>Ghim 5 hàng đầu</option>
                                </select>
                            </div>

                            {/* Batch Merge Columns Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    setMergeTemplate('');
                                    setMergeTargetColIndex(0);
                                    setMergeStartRow(1);
                                    setMergeEndRow('');
                                    setShowMergeColsModal(true);
                                }}
                                style={{
                                    padding: '4px 12px',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    color: 'var(--accent)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6
                                }}
                            >
                                <Merge size={14} /> 🔗 Ghép Cột / Hàng
                            </button>
                        </div>

                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                            💡 Click đúp (Double-click) vào bất kỳ ô nào để xem chi tiết & sửa nội dung
                        </span>
                    </div>
                )}

                {/* Google Sheets Interactive Data Table */}
                <div className="sheet-table-container">
                    {renderedRows.length > 0 ? (
                        <table className="sheet-grid-table">
                            <thead>
                                <tr style={freezeRows > 0 ? { position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' } : {}}>
                                    {/* Top-left row index corner header */}
                                    <th className="row-index-header">#</th>
                                    {/* Column letters headers A, B, C, D... */}
                                    {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => (
                                        <th key={cIdx}>
                                            {getColumnLetter(cIdx)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {renderedRows.map((row, rIdx) => {
                                    const isRowPinned = rIdx < freezeRows;
                                    const isLastPinnedRow = freezeRows > 0 && rIdx === freezeRows - 1;
                                    return (
                                        <tr
                                            key={rIdx}
                                            className={isLastPinnedRow ? 'pinned-row-last' : ''}
                                            style={isRowPinned ? { position: 'sticky', top: (rIdx + 1) * 32, zIndex: 9, background: '#fffbeb' } : {}}
                                        >
                                            {/* Row index number 1, 2, 3... */}
                                            <td className="row-index-cell" style={isRowPinned ? { background: '#fef3c7', fontWeight: 700, color: '#b45309' } : {}}>
                                                {rIdx + 1} {isRowPinned && '📌'}
                                            </td>
                                            {/* Row cells with Double Click Handler & URL Note */}
                                            {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => {
                                                const cellVal = Array.isArray(row) ? row[cIdx] : '';
                                                const valStr = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
                                                const trimmedVal = valStr.trim();
                                                const isUrl = trimmedVal.startsWith('http://') || trimmedVal.startsWith('https://') || trimmedVal.startsWith('www.');
                                                const targetUrl = trimmedVal.startsWith('www.') ? `https://${trimmedVal}` : trimmedVal;

                                                const isSelected = selectedCell?.rIdx === rIdx && selectedCell?.cIdx === cIdx;
                                                return (
                                                    <td
                                                        key={cIdx}
                                                        className={`${isSelected ? 'selected-cell' : ''} ${isUrl ? 'has-url-cell' : ''}`}
                                                        title="Click đúp để xem & sửa ô này"
                                                        onClick={() => setSelectedCell({ rIdx, cIdx })}
                                                        onDoubleClick={() => {
                                                            setSelectedCell({ rIdx, cIdx });
                                                            setCellDetailModal({
                                                                rIdx,
                                                                cIdx,
                                                                val: valStr,
                                                                newVal: valStr,
                                                                colLetter: getColumnLetter(cIdx)
                                                            });
                                                        }}
                                                        style={{ cursor: 'pointer' }}
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
                    ) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <FileSpreadsheet size={36} style={{ marginBottom: 10, opacity: 0.5 }} />
                            <p style={{ fontSize: 14 }}>Chưa có dữ liệu. Vui lòng tải file Excel hoặc link Google Sheets ở trên.</p>
                        </div>
                    )}

                    {activeSheetData.length > rowDisplayLimit && (
                        <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                                Đang hiển thị <strong>{renderedRows.length}</strong> / <strong>{activeSheetData.length.toLocaleString()}</strong> hàng (Tối ưu phản hồi mượt 60fps)
                            </span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setRowDisplayLimit(prev => prev + 200)}
                                    style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-card)' }}
                                >
                                    + Xem thêm 200 hàng
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setRowDisplayLimit(activeSheetData.length)}
                                    style={{ fontSize: 12, padding: '4px 10px', color: 'var(--accent)', fontWeight: 600 }}
                                >
                                    Xem tất cả ({activeSheetData.length.toLocaleString()} hàng)
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Sub-Tab Bar (Google Sheets Style) */}
                {visibleSheets.length > 0 && (
                    <div className="sheet-bottom-bar">
                        {visibleSheets.map(s => (
                            <div
                                key={s.name}
                                className={`sheet-bottom-tab ${activeTabName === s.name ? 'active' : ''}`}
                                onClick={() => setActiveTabName(s.name)}
                            >
                                <FileSpreadsheet size={14} />
                                <span>{s.name}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Modal Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {activeTabName ? `Đang hiển thị tab '${activeTabName}' (${activeSheetData.length} hàng, ${maxCols} cột)` : 'Sẵn sàng'}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={async () => {
                                if (visibleSheets.length === 0) return;
                                setSaving(true);
                                try {
                                    await fetchApi('/api/products/profile-sheet', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            profile: profileSlug,
                                            sheets: visibleSheets
                                        })
                                    });
                                    if (onImportSuccess) {
                                        onImportSuccess(visibleSheets);
                                    }
                                    onClose();
                                } catch (err) {
                                    alert(err.message || 'Lỗi khi lưu dữ liệu Sheet');
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            disabled={visibleSheets.length === 0 || saving}
                            style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                        >
                            {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Đồng ý & Nạp dữ liệu
                        </button>
                    </div>
                </div>

            </div>
        </div>

        {/* Sub-Modal 1: Cell Detail Viewer & Editor */}
            {cellDetailModal && (
                <div className="modal-backdrop" onClick={() => setCellDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Edit3 size={18} style={{ color: 'var(--accent)' }} /> 
                                Chi Tiết Ô [{cellDetailModal.colLetter}{cellDetailModal.rIdx + 1}] — Hàng {cellDetailModal.rIdx + 1}
                            </span>
                            <button type="button" onClick={() => setCellDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ marginBottom: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Nội dung ô:
                            </label>
                            <textarea
                                value={cellDetailModal.newVal}
                                onChange={e => setCellDetailModal(p => ({ ...p, newVal: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                                        // Plain Enter → Save
                                        e.preventDefault();
                                        handleSaveCellDetail(cellDetailModal.newVal);
                                    } else if (e.key === 'Enter' && e.ctrlKey) {
                                        // Ctrl+Enter → insert newline manually
                                        e.preventDefault();
                                        const ta = e.target;
                                        const start = ta.selectionStart;
                                        const end = ta.selectionEnd;
                                        const val = cellDetailModal.newVal;
                                        const newVal = val.slice(0, start) + '\n' + val.slice(end);
                                        setCellDetailModal(p => ({ ...p, newVal }));
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
                                    navigator.clipboard.writeText(cellDetailModal.newVal);
                                    setCopiedCell(true);
                                    setTimeout(() => setCopiedCell(false), 2000);
                                }}
                                style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {copiedCell ? <Check size={15} style={{ color: '#16a34a' }} /> : <Copy size={15} />}
                                {copiedCell ? 'Đã sao chép!' : 'Sao chép nội dung'}
                            </button>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setCellDetailModal(null)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleSaveCellDetail(cellDetailModal.newVal)}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <CheckCircle2 size={15} /> Lưu chỉnh sửa ô
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Modal 2: Batch Merge Columns Modal */}
            {showMergeColsModal && (
                <div className="modal-backdrop" onClick={() => setShowMergeColsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 540, maxWidth: '95%', padding: 24, borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Merge size={18} style={{ color: 'var(--accent)' }} /> 🔗 Ghép Cột Hàng (Batch Merge Columns)
                            </span>
                            <button type="button" onClick={() => setShowMergeColsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    1. Chọn Cột Đích (Nơi lưu kết quả ghép):
                                </label>
                                <select
                                    value={mergeTargetColIndex}
                                    onChange={e => setMergeTargetColIndex(parseInt(e.target.value))}
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                >
                                    {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => (
                                        <option key={cIdx} value={cIdx}>
                                            Cột {getColumnLetter(cIdx)} ({activeSheetData[0]?.[cIdx] || `Cột ${getColumnLetter(cIdx)}`})
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
                                    value={mergeTemplate}
                                    onChange={e => setMergeTemplate(e.target.value)}
                                    placeholder="Ví dụ: {{A}} - {{B}} (Model: {{D}})"
                                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Chèn nhanh tag cột:</span>
                                    {Array.from({ length: Math.min(maxCols, 12) }).map((_, cIdx) => {
                                        const letter = getColumnLetter(cIdx);
                                        return (
                                            <button
                                                key={letter}
                                                type="button"
                                                onClick={() => setMergeTemplate(prev => prev + '{{' + letter + '}}')}
                                                style={{ padding: '2px 7px', fontSize: 11.5, background: '#fff7ed', border: '1px solid #ffedd5', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                + {'{{' + letter + '}}'}
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
                                        value={mergeStartRow}
                                        onChange={e => setMergeStartRow(e.target.value)}
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
                                        value={mergeEndRow}
                                        onChange={e => setMergeEndRow(e.target.value)}
                                        style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                            </div>

                            {/* Live Preview Box */}
                            {mergeTemplate.trim() && (
                                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
                                    <strong style={{ color: '#16a34a', display: 'block', marginBottom: 2 }}>
                                        🔍 Xem trước kết quả mẫu (Hàng 1):
                                    </strong>
                                    <span style={{ color: '#15803d', fontFamily: 'monospace' }}>
                                        {evaluateTemplate(mergeTemplate, activeSheetData[0] || []) || '(Rỗng)'}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowMergeColsModal(false)}>Hủy</button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleExecuteMergeCols}
                                    disabled={!mergeTemplate.trim()}
                                    style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                                >
                                    <Merge size={15} /> Bắt đầu Ghép Cột
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
