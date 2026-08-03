import { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api';
import { X, HardDrive, CheckCircle2, Upload, ExternalLink, Key, RefreshCw, AlertCircle, FolderPlus, Search, FolderCheck, UserCheck, Bot, Save, FolderTree, Mail } from 'lucide-react';

export default function GoogleDriveModal({ isOpen, onClose, toast }) {
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [driveMode, setDriveMode] = useState('oauth2'); // 'oauth2' | 'service_account'
    const [parentFolderId, setParentFolderId] = useState('');
    const [shareEmail, setShareEmail] = useState('');
    const [authUrl, setAuthUrl] = useState('');
    const [authCode, setAuthCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [uploadingCreds, setUploadingCreds] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [checkingFolders, setCheckingFolders] = useState(false);
    const [creatingFolders, setCreatingFolders] = useState(false);
    const [folderCheckData, setFolderCheckData] = useState(null);

    const callDriveApi = async (subPath, options) => {
        try {
            return await fetchApi(`/api/google-drive${subPath}`, options);
        } catch (err) {
            if (err.message && (err.message.includes('404') || err.message.includes('not found'))) {
                return await fetchApi(`/api/products/google-drive${subPath}`, options);
            }
            throw err;
        }
    };

    const checkStatus = async () => {
        setLoading(true);
        try {
            const res = await callDriveApi('/status');
            if (res) {
                setConnected(!!res.connected);
                if (res.config) {
                    setDriveMode(res.config.mode || 'oauth2');
                    setParentFolderId(res.config.parentFolderId || '');
                    setShareEmail(res.config.shareEmail || '');
                }
            }
        } catch (err) {
            console.error('Failed to check Drive status:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSwitchMode = async (mode) => {
        setDriveMode(mode);
        setMsg({ text: '', type: '' });
        try {
            const res = await callDriveApi('/config', {
                method: 'POST',
                body: JSON.stringify({ mode, parentFolderId, shareEmail })
            });
            if (res) {
                setConnected(!!res.connected);
                const modeName = mode === 'service_account' ? 'Service Account' : 'OAuth 2.0 Cá Nhân';
                setMsg({ text: `⚙️ Đã chuyển sang chế độ kết nối: ${modeName}`, type: 'success' });
            }
        } catch (err) {
            console.error('Failed to switch mode:', err);
        }
    };

    const handleSaveConfig = async (e) => {
        if (e) e.preventDefault();
        setSavingConfig(true);
        setMsg({ text: '', type: '' });
        try {
            const res = await callDriveApi('/config', {
                method: 'POST',
                body: JSON.stringify({ mode: driveMode, parentFolderId, shareEmail })
            });
            if (res) {
                setConnected(!!res.connected);
                setMsg({ text: '✅ Đã lưu cấu hình Google Drive thành công!', type: 'success' });
                if (toast) toast('✅ Đã lưu cấu hình Google Drive!', 'success');
            }
        } catch (err) {
            setMsg({ text: '❌ Lỗi lưu cấu hình: ' + (err.message || 'Lỗi không xác định'), type: 'error' });
        } finally {
            setSavingConfig(false);
        }
    };

    const fetchAuthUrl = async () => {
        setMsg({ text: '', type: '' });
        try {
            const res = await callDriveApi('/auth-url');
            if (res?.url) {
                setAuthUrl(res.url);
                window.open(res.url, '_blank', 'width=600,height=700');
            }
        } catch (err) {
            setMsg({ text: err.message || 'Lỗi khi lấy Auth URL. Hãy tải file JSON API credentials trước.', type: 'error' });
        }
    };

    const handleVerifyCode = async (e) => {
        if (e) e.preventDefault();
        if (!authCode.trim()) return;
        setVerifying(true);
        setMsg({ text: '', type: '' });
        try {
            await callDriveApi('/auth-code', {
                method: 'POST',
                body: JSON.stringify({ code: authCode.trim() })
            });
            setConnected(true);
            setMsg({ text: '🎉 Kết nối Google Drive thành công! Các Profile mới, Sheet _DATA & file Excel sẽ tự động đồng bộ.', type: 'success' });
            if (toast) toast('🎉 Kết nối Google Drive thành công!', 'success');
        } catch (err) {
            setMsg({ text: '❌ Lỗi xác thực: ' + (err.message || 'Mã xác thực không hợp lệ.'), type: 'error' });
        } finally {
            setVerifying(false);
        }
    };

    const handleUploadJsonFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingCreds(true);
        setMsg({ text: '', type: '' });
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await callDriveApi('/upload-credentials', {
                method: 'POST',
                body: formData,
                headers: {}
            });

            if (res?.type === 'service_account') {
                setDriveMode('service_account');
                setConnected(true);
                setMsg({ text: res.message || '✅ Đã nạp file Service Account thành công!', type: 'success' });
            } else {
                setDriveMode('oauth2');
                setMsg({ text: res.message || '✅ Đã tải file OAuth API JSON thành công! Giờ hãy bấm Kết nối & Xác thực.', type: 'success' });
                await fetchAuthUrl();
            }
            await checkStatus();
        } catch (err) {
            setMsg({ text: '❌ Lỗi tải file JSON: ' + (err.message || 'File không hợp lệ.'), type: 'error' });
        } finally {
            setUploadingCreds(false);
        }
    };

    const handleCheckFolders = async () => {
        setCheckingFolders(true);
        setMsg({ text: '', type: '' });
        try {
            const data = await callDriveApi('/check-profile-folders');
            setFolderCheckData(data);
            if (data.missingCount === 0) {
                setMsg({ text: `✅ Tất cả ${data.total} Profile đều đã có Folder Drive hợp lệ!`, type: 'success' });
            } else {
                setMsg({ text: `⚠️ Phát hiện ${data.missingCount}/${data.total} Profile chưa có hoặc bị thiếu Folder Drive.`, type: 'error' });
            }
        } catch (err) {
            setMsg({ text: '❌ Lỗi khi kiểm tra Folder Drive: ' + (err.message || 'Lỗi không xác định'), type: 'error' });
        } finally {
            setCheckingFolders(false);
        }
    };

    const handleCreateMissingFolders = async () => {
        setCreatingFolders(true);
        setMsg({ text: '', type: '' });
        try {
            const res = await callDriveApi('/create-missing-folders', { method: 'POST' });
            if (res.createdCount > 0) {
                const names = res.createdProfiles.map(p => p.name).join(', ');
                setMsg({ text: `🎉 Đã tạo thành công ${res.createdCount} Folder Drive mới cho các Profile: ${names}`, type: 'success' });
                if (toast) toast(`🎉 Đã tạo ${res.createdCount} Folder Drive mới!`, 'success');
            } else {
                setMsg({ text: `ℹ️ Tất cả các Profile đều đã có Folder Drive. Không cần tạo thêm!`, type: 'success' });
            }
            await handleCheckFolders();
        } catch (err) {
            setMsg({ text: '❌ Lỗi khi tạo Folder Drive: ' + (err.message || 'Vui lòng kiểm tra lại kết nối Drive.'), type: 'error' });
        } finally {
            setCreatingFolders(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            checkStatus();
            setMsg({ text: '', type: '' });
            setAuthCode('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
            <div style={{
                background: '#ffffff', borderRadius: 16, maxWidth: 580, width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden',
                animation: 'modalSlideUp 0.25s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <HardDrive size={20} style={{ color: '#38bdf8' }} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kết Nối Google Drive</h3>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, marginTop: 2 }}>Đồng bộ Folder Hãng, Sheet _DATA & File Excel</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
                    {/* Status Badge */}
                    <div style={{
                        padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                        background: connected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                        border: `1px solid ${connected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {connected ? (
                                <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
                            ) : (
                                <AlertCircle size={20} style={{ color: '#d97706' }} />
                            )}
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: connected ? '#15803d' : '#b45309' }}>
                                    {connected 
                                        ? `🟢 Đã Kết Nối Google Drive (${driveMode === 'service_account' ? 'Service Account' : 'OAuth 2.0'})` 
                                        : '🟠 Chưa Kết Nối Google Drive'
                                    }
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {connected 
                                        ? (driveMode === 'service_account' ? 'Tài khoản dịch vụ tự động đã sẵn sàng lưu trữ.' : 'Tài khoản Google cá nhân của bạn đã sẵn sàng đồng bộ.')
                                        : 'Vui lòng chọn chế độ kết nối và nạp file JSON API để bắt đầu.'
                                    }
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={checkStatus}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Làm mới
                        </button>
                    </div>

                    {msg.text && (
                        <div style={{
                            padding: '12px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
                            background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: msg.type === 'success' ? '#15803d' : '#991b1b',
                            border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                        }}>
                            {msg.text}
                        </div>
                    )}

                    {/* Mode Selector Switcher */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8 }}>
                            Chọn Chế Độ Kết Nối Google Drive:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => handleSwitchMode('oauth2')}
                                style={{
                                    padding: '10px 14px', borderRadius: 10,
                                    border: `2px solid ${driveMode === 'oauth2' ? '#0284c7' : '#cbd5e1'}`,
                                    background: driveMode === 'oauth2' ? '#f0f9ff' : '#ffffff',
                                    color: driveMode === 'oauth2' ? '#0369a1' : '#64748b',
                                    fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <UserCheck size={16} /> Cách 1: OAuth 2.0 (Cá nhân)
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSwitchMode('service_account')}
                                style={{
                                    padding: '10px 14px', borderRadius: 10,
                                    border: `2px solid ${driveMode === 'service_account' ? '#8b5cf6' : '#cbd5e1'}`,
                                    background: driveMode === 'service_account' ? '#f5f3ff' : '#ffffff',
                                    color: driveMode === 'service_account' ? '#6d28d9' : '#64748b',
                                    fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Bot size={16} /> Cách 2: Service Account (Robot)
                            </button>
                        </div>
                    </div>

                    {/* MODE 1: OAuth 2.0 Personal Google Account */}
                    {driveMode === 'oauth2' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Step 1: Upload OAuth JSON credentials */}
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Key size={15} style={{ color: '#0284c7' }} /> Bước 1: Nạp File API OAuth JSON (sick-pdf-api.json)
                                </div>
                                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                                    Tải file OAuth 2.0 Client Credentials (dạng JSON) lấy từ Google Cloud Console.
                                </p>
                                <label style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                                    background: '#ffffff', border: '1px dashed #0284c7', borderRadius: 8,
                                    fontSize: 13, fontWeight: 600, color: '#0284c7', cursor: 'pointer'
                                }}>
                                    <Upload size={15} /> {uploadingCreds ? 'Đang tải file...' : 'Tải Lên File sick-pdf-api.json'}
                                    <input type="file" accept=".json" onChange={handleUploadJsonFile} style={{ display: 'none' }} />
                                </label>
                            </div>

                            {/* Step 2: Authenticate via Google */}
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ExternalLink size={15} style={{ color: '#16a34a' }} /> Bước 2: Đăng Nhập & Xác Thực Google Account
                                </div>
                                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                                    Bấm nút bên dưới để mở cửa sổ Đăng nhập Google, cấp quyền truy cập Drive & lấy Mã Code xác thực.
                                </p>

                                <button
                                    type="button"
                                    onClick={fetchAuthUrl}
                                    style={{
                                        width: '100%', padding: '10px 16px', background: '#0284c7', color: 'white',
                                        border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        marginBottom: 14
                                    }}
                                >
                                    <ExternalLink size={15} /> 🔗 Mở Trang Đăng Nhập Xác Thực Google Drive
                                </button>

                                <form onSubmit={handleVerifyCode}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                                        Dán Mã Xác Thực (hoặc URL Redirect code=...):
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="text"
                                            value={authCode}
                                            onChange={e => setAuthCode(e.target.value)}
                                            placeholder="Dán mã code hoặc link redirect tại đây..."
                                            style={{
                                                flex: 1, padding: '8px 12px', fontSize: 12.5, borderRadius: 8,
                                                border: '1px solid #cbd5e1', outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={verifying || !authCode.trim()}
                                            style={{
                                                padding: '8px 16px', background: '#16a34a', color: 'white',
                                                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12.5,
                                                cursor: 'pointer', opacity: (verifying || !authCode.trim()) ? 0.6 : 1
                                            }}
                                        >
                                            {verifying ? 'Đang xác minh...' : '⚡ Xác Minh'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* MODE 2: Service Account (Automated Bot) */}
                    {driveMode === 'service_account' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Step 1: Upload Service Account JSON */}
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Bot size={16} style={{ color: '#8b5cf6' }} /> Bước 1: Nạp File Key Service Account (.json)
                                </div>
                                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                                    Tải file Service Account Key (dạng JSON có <code>type: "service_account"</code>) lấy từ Google Cloud IAM Console.
                                </p>
                                <label style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                                    background: '#ffffff', border: '1px dashed #8b5cf6', borderRadius: 8,
                                    fontSize: 13, fontWeight: 600, color: '#8b5cf6', cursor: 'pointer'
                                }}>
                                    <Upload size={15} /> {uploadingCreds ? 'Đang tải file...' : 'Tải Lên File service-account.json'}
                                    <input type="file" accept=".json" onChange={handleUploadJsonFile} style={{ display: 'none' }} />
                                </label>
                            </div>

                            {/* Step 2: Service Account Settings (Parent Folder ID & Share Email) */}
                            <form onSubmit={handleSaveConfig} style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FolderTree size={16} style={{ color: '#0284c7' }} /> Bước 2: Tùy Chỉnh Folder Mẹ & Tự Động Chia Sẻ (Shared Drive)
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <FolderTree size={14} style={{ color: '#64748b' }} /> ID Folder Mẹ Trên Drive Cá Nhân (Tùy chọn):
                                    </label>
                                    <input
                                        type="text"
                                        value={parentFolderId}
                                        onChange={e => setParentFolderId(e.target.value)}
                                        placeholder="Ví dụ: 1a2b3c4d5e6f7g8h9i0j... (Lấy từ URL của Folder Mẹ)"
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 12.5, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'block' }}>
                                        Nhập ID nếu muốn tất cả Folder Hãng tạo ra chui vào đúng 1 Folder Mẹ cụ thể trên Drive của bạn.
                                    </span>
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <Mail size={14} style={{ color: '#64748b' }} /> Email Cá Nhân Để Tự Động Share Quyền Xem/Sửa (Tùy chọn):
                                    </label>
                                    <input
                                        type="email"
                                        value={shareEmail}
                                        onChange={e => setShareEmail(e.target.value)}
                                        placeholder="Ví dụ: yourname@gmail.com"
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 12.5, borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'block' }}>
                                        Service Account sẽ tự động chia sẻ (Share Editor) các Folder vừa tạo tới Email này.
                                    </span>
                                </div>

                                <button
                                    type="submit"
                                    disabled={savingConfig}
                                    style={{
                                        width: '100%', padding: '9px 16px', background: '#8b5cf6', color: 'white',
                                        border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12.5,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                    }}
                                >
                                    <Save size={15} /> {savingConfig ? 'Đang lưu...' : '💾 Lưu Cấu Hình Service Account'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Step 3: Check & Create Missing Profile Folders */}
                    <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FolderCheck size={15} style={{ color: '#8b5cf6' }} /> Bước 3: Đồng Bộ & Kiểm Tra Folder Drive Của Profile
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                            Kiểm tra danh sách các Profile xem đã có Folder Drive chưa, hoặc tự động tạo bổ sung cho các Profile chưa có Folder.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: folderCheckData ? 14 : 0 }}>
                            <button
                                type="button"
                                onClick={handleCheckFolders}
                                disabled={checkingFolders || creatingFolders}
                                style={{
                                    padding: '9px 12px', background: '#ffffff', color: '#475569',
                                    border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 700, fontSize: 12.5,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    opacity: (checkingFolders || creatingFolders) ? 0.6 : 1
                                }}
                            >
                                <Search size={14} className={checkingFolders ? 'spin' : ''} />
                                {checkingFolders ? 'Đang kiểm tra...' : '🔍 Kiểm Tra Status Profile'}
                            </button>

                            <button
                                type="button"
                                onClick={handleCreateMissingFolders}
                                disabled={creatingFolders || checkingFolders || !connected}
                                title={!connected ? 'Cần hoàn tất cấu hình kết nối Google Drive ở trên trước' : ''}
                                style={{
                                    padding: '9px 12px', background: connected ? '#8b5cf6' : '#94a3b8', color: 'white',
                                    border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12.5,
                                    cursor: connected ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    boxShadow: connected ? '0 2px 4px rgba(139, 92, 246, 0.25)' : 'none',
                                    opacity: (creatingFolders || checkingFolders || !connected) ? 0.6 : 1
                                }}
                            >
                                <FolderPlus size={14} className={creatingFolders ? 'spin' : ''} />
                                {creatingFolders ? 'Đang tạo Folder...' : '➕ Tạo Folder Drive Thiếu'}
                            </button>
                        </div>

                        {/* Folder Check Result List */}
                        {folderCheckData && (
                            <div style={{ marginTop: 12, padding: 12, background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontWeight: 700, color: '#334155' }}>
                                    <span>Tổng số Profile: {folderCheckData.total}</span>
                                    <span style={{ color: folderCheckData.missingCount > 0 ? '#dc2626' : '#16a34a' }}>
                                        {folderCheckData.okCount} Đã có | {folderCheckData.missingCount} Bị thiếu
                                    </span>
                                </div>
                                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {folderCheckData.profiles.map(p => (
                                        <div key={p.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: p.status === 'ok' ? '#f0fdf4' : '#fef2f2', borderRadius: 6, border: `1px solid ${p.status === 'ok' ? '#dcfce7' : '#fee2e2'}` }}>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                {p.name} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>({p.slug})</span>
                                            </div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: p.status === 'ok' ? '#15803d' : '#b91c1c' }}>
                                                {p.status === 'ok' ? (
                                                    <>🟢 Đã có Folder {p.drive_folder_id ? `(${p.drive_folder_id.slice(0, 8)}...)` : ''}</>
                                                ) : (
                                                    <>🔴 Chưa có Folder Drive</>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '8px 18px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, fontSize: 13, color: '#334155', cursor: 'pointer' }}
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
