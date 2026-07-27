'use client';
import { useState, useRef } from 'react';
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
    Layers
} from 'lucide-react';

export default function ImportSheetModal({ isOpen, onClose, profileName = 'Profile' }) {
    const [importMode, setImportMode] = useState('file'); // 'file' | 'url'
    const [googleUrl, setGoogleUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    // Parsed sheets data: Array of { name: string, data: Array<Array<any>> }
    const [allSheets, setAllSheets] = useState([]);
    const [selectedSheetNames, setSelectedSheetNames] = useState([]);
    const [activeTabName, setActiveTabName] = useState('');

    const fileInputRef = useRef(null);

    if (!isOpen) return null;

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
                setAllSheets(data.sheets);
                const sheetNames = data.sheets.map(s => s.name);
                setSelectedSheetNames(sheetNames);
                setActiveTabName(sheetNames[0]);
                setSuccessMsg(`Đã tải thành công ${data.sheets.length} tab từ file '${data.fileName}'.`);
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
                setAllSheets(data.sheets);
                const sheetNames = data.sheets.map(s => s.name);
                setSelectedSheetNames(sheetNames);
                setActiveTabName(sheetNames[0]);
                setSuccessMsg(`Đã tải thành công ${data.sheets.length} tab từ Google Sheets.`);
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

    // Filter sheets to render based on selectedSheetNames
    const visibleSheets = allSheets.filter(s => selectedSheetNames.includes(s.name));
    const activeSheetData = allSheets.find(s => s.name === activeTabName)?.data || [];

    // Calculate maximum columns in active sheet
    const maxCols = activeSheetData.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

    return (
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
                    )}

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

                {/* Sub-Tab Filter Selection Checkboxes */}
                {allSheets.length > 0 && (
                    <div style={{ padding: '10px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Layers size={15} style={{ color: 'var(--accent)' }} /> Chọn tab con để xem:
                        </span>
                        
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            {selectedSheetNames.length === allSheets.length ? <CheckSquare size={15} /> : <Square size={15} />}
                            Chọn tất cả ({allSheets.length} tab)
                        </button>

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            {allSheets.map((s, idx) => {
                                const isChecked = selectedSheetNames.includes(s.name);
                                return (
                                    <label
                                        key={s.name}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontSize: 12.5,
                                            cursor: 'pointer',
                                            padding: '4px 10px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: isChecked ? '#fff7ed' : 'var(--bg-secondary)',
                                            border: `1px solid ${isChecked ? '#ffedd5' : 'var(--border-color)'}`,
                                            color: isChecked ? 'var(--accent)' : 'var(--text-secondary)',
                                            fontWeight: isChecked ? 600 : 400
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleSelectSheet(s.name)}
                                            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                        />
                                        <span>{s.name} ({s.data?.length || 0} hàng)</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Google Sheets Interactive Data Table */}
                <div className="sheet-table-container">
                    {activeSheetData.length > 0 ? (
                        <table className="sheet-grid-table">
                            <thead>
                                <tr>
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
                                {activeSheetData.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {/* Row index number 1, 2, 3... */}
                                        <td className="row-index-cell">{rIdx + 1}</td>
                                        {/* Row cells */}
                                        {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => {
                                            const cellVal = Array.isArray(row) ? row[cIdx] : '';
                                            return (
                                                <td key={cIdx} title={String(cellVal || '')}>
                                                    {cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <FileSpreadsheet size={36} style={{ marginBottom: 10, opacity: 0.5 }} />
                            <p style={{ fontSize: 14 }}>Chưa có dữ liệu. Vui lòng tải file Excel hoặc link Google Sheets ở trên.</p>
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
                            onClick={() => {
                                alert(`Đã ghi nhận dữ liệu từ ${visibleSheets.length} tab cho Profile ${profileName}!`);
                                onClose();
                            }}
                            disabled={visibleSheets.length === 0}
                            style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 18px', fontSize: 13 }}
                        >
                            <CheckCircle2 size={15} /> Đồng ý & Nạp dữ liệu
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
