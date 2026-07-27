'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import { 
    FileSpreadsheet, 
    Upload, 
    Settings, 
    Database, 
    Loader2, 
    CheckCircle2, 
    AlertTriangle, 
    Copy,
    Info,
    RefreshCw
} from 'lucide-react';

export default function GoogleSheetsPage() {
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

    const [settings, setSettings] = useState({
        spreadsheetId: '',
        sheetName: 'Sheet1',
        hasCredentials: false,
        clientEmail: ''
    });
    
    const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');
    const [sheetNameInput, setSheetNameInput] = useState('Sheet1');
    const [selectedFile, setSelectedFile] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    
    const [syncLog, setSyncLog] = useState('');
    const [toasts, setToasts] = useState([]);
    
    const fileInputRef = useRef(null);

    const toast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message: msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    };

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await fetchApi('/api/sheets/settings');
            if (data) {
                setSettings(data);
                setSpreadsheetIdInput(data.spreadsheetId || '');
                setSheetNameInput(data.sheetName || 'Sheet1');
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
            toast('Failed to load settings from server.', 'danger');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetchApi('/api/sheets/settings', {
                method: 'POST',
                body: JSON.stringify({
                    spreadsheetId: spreadsheetIdInput.trim(),
                    sheetName: sheetNameInput.trim()
                })
            });
            
            toast(res.message || 'Settings saved successfully!', 'success');
            setSettings(p => ({
                ...p,
                spreadsheetId: spreadsheetIdInput.trim(),
                sheetName: sheetNameInput.trim()
            }));
        } catch (err) {
            toast(err.message || 'Failed to save settings.', 'danger');
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json')) {
            toast('Please upload a JSON file.', 'danger');
            return;
        }

        setSelectedFile(file);
        setUploading(true);
        
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

            toast(data.message || 'Credentials uploaded successfully!', 'success');
            setSettings(p => ({
                ...p,
                hasCredentials: true,
                clientEmail: data.clientEmail || ''
            }));
            setSelectedFile(null);
        } catch (err) {
            toast(err.message || 'Credentials upload failed.', 'danger');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true);
        setSyncLog('Initializing connection to Google Sheets API...\n');
        
        try {
            setSyncLog(p => p + 'Reading local products database...\n');
            const res = await fetchApi('/api/sheets/sync', { method: 'POST' });
            
            setSyncLog(p => p + 'Preparing row headers and formatting...\n');
            setSyncLog(p => p + 'Writing records starting from Row 3 (A3:P)...\n');
            setSyncLog(p => p + `Success: ${res.message}\n`);
            toast('Synchronization completed successfully!', 'success');
        } catch (err) {
            setSyncLog(p => p + `Error: ${err.message || 'Sync failed'}\n`);
            if (err.details) {
                setSyncLog(p => p + `Details: ${err.details}\n`);
            }
            toast(err.message || 'Failed to synchronize with Google Sheets.', 'danger');
        } finally {
            setSyncing(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast('Email address copied to clipboard!', 'success');
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, border: '4px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading Sheets integration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content">
            {/* Custom Toast Alert */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileSpreadsheet style={{ color: 'var(--accent)' }} /> Google Sheets Integration
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                    Push crawled product data directly to your online Google Sheets spreadsheet.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
                
                {/* Left Card: Settings & Config */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Settings Panel */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Settings size={18} style={{ color: 'var(--accent)' }} /> Sheet Settings
                        </h3>
                        
                        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Google Spreadsheet ID
                                </label>
                                <input 
                                    className="form-input"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13,
                                        outline: 'none'
                                    }}
                                    placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                                    value={spreadsheetIdInput}
                                    onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                                    required
                                />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                                    Found in your Google Sheet URL: https://docs.google.com/spreadsheets/d/<strong>[SPREADSHEET_ID]</strong>/edit
                                </span>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Sheet Tab Name
                                </label>
                                <input 
                                    className="form-input"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13,
                                        outline: 'none'
                                    }}
                                    placeholder="e.g. Sheet1"
                                    value={sheetNameInput}
                                    onChange={(e) => setSheetNameInput(e.target.value)}
                                    required
                                />
                            </div>

                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={saving}
                                style={{
                                    background: 'var(--gradient-primary)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '10px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    marginTop: 8
                                }}
                            >
                                {saving ? <Loader2 className="spin" size={16} /> : null}
                                Save Configuration
                            </button>
                        </form>
                    </div>

                    {/* Google Service Account Credentials Panel */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Upload size={18} style={{ color: 'var(--accent)' }} /> API Credentials (.json)
                        </h3>

                        {/* Status Alert Banner */}
                        <div style={{ 
                            background: settings.hasCredentials ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${settings.hasCredentials ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: 12,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            marginBottom: 16
                        }}>
                            {settings.hasCredentials ? (
                                <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
                            ) : (
                                <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                            )}
                            <div>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {settings.hasCredentials ? 'API key loaded successfully' : 'Missing Google API credentials'}
                                </span>
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {settings.hasCredentials 
                                        ? `Authorized via: ${settings.clientEmail}`
                                        : 'Please upload the Service Account JSON credentials key file to enable synchronization.'}
                                </span>
                            </div>
                        </div>

                        {/* File Upload Zone */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                padding: '24px 16px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s',
                                background: 'var(--bg-secondary)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 10
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            {uploading ? (
                                <Loader2 className="spin" size={32} style={{ color: 'var(--accent)' }} />
                            ) : (
                                <Upload size={32} style={{ color: 'var(--text-muted)' }} />
                            )}
                            <div>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Click to upload credentials.json
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Only Google Cloud Service Account JSON keys are accepted
                                </span>
                            </div>
                            <input 
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".json"
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Card: Sync & Instructions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Share Instructions Panel */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Info size={18} style={{ color: 'var(--accent)' }} /> Sharing Requirement
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
                            For the synchronizer to access your Google Sheet, you <strong>must share the sheet with the Service Account email address</strong> as an <strong>Editor</strong>.
                        </p>

                        {settings.hasCredentials && settings.clientEmail ? (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 10, 
                                background: 'var(--bg-secondary)', 
                                padding: '10px 12px', 
                                borderRadius: 'var(--radius-md)', 
                                border: '1px solid var(--border-color)'
                            }}>
                                <span style={{ 
                                    flex: 1, 
                                    fontSize: 12, 
                                    fontFamily: 'monospace', 
                                    color: 'var(--text-primary)', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap' 
                                }}>
                                    {settings.clientEmail}
                                </span>
                                <button 
                                    onClick={() => copyToClipboard(settings.clientEmail)}
                                    title="Copy email to clipboard"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        padding: 4
                                    }}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontStyle: 'italic' }}>
                                Upload credentials.json to view Service Account email.
                            </div>
                        )}
                    </div>

                    {/* Sync Trigger Panel */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Database size={18} style={{ color: 'var(--accent)' }} /> Synchronize Data
                        </h3>

                        <button
                            onClick={handleSync}
                            disabled={syncing || !settings.hasCredentials || !settings.spreadsheetId}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                background: settings.hasCredentials && settings.spreadsheetId ? 'var(--gradient-primary)' : 'var(--border-color)',
                                color: settings.hasCredentials && settings.spreadsheetId ? 'white' : 'var(--text-muted)',
                                border: 'none',
                                padding: '14px',
                                borderRadius: 'var(--radius-md)',
                                cursor: settings.hasCredentials && settings.spreadsheetId ? 'pointer' : 'not-allowed',
                                fontWeight: 600,
                                fontSize: 14,
                                marginBottom: 16
                            }}
                        >
                            {syncing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
                            Sync to Google Sheets
                        </button>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Sync Output Log
                            </label>
                            <div 
                                style={{ 
                                    background: '#0f172a', 
                                    color: '#38bdf8', 
                                    fontFamily: 'Consolas, Monaco, monospace', 
                                    fontSize: 12, 
                                    padding: 12, 
                                    borderRadius: 'var(--radius-md)', 
                                    flex: 1,
                                    minHeight: 150,
                                    maxHeight: 250,
                                    overflowY: 'auto',
                                    border: '1px solid #1e293b',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5
                                }}
                            >
                                {syncLog || 'Ready for sync. Log results will stream here.'}
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}
