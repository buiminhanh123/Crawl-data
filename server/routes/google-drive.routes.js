const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const googleDriveService = require('../services/google-drive.service');
const { profileQueries } = require('../db');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// GET /api/google-drive/status — Check connection status & current config
router.get('/status', (req, res) => {
    try {
        const connected = googleDriveService.isConnected();
        const config = googleDriveService.getConfig();
        res.json({ connected, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/google-drive/config — Get current Drive mode and settings
router.get('/config', (req, res) => {
    try {
        const config = googleDriveService.getConfig();
        res.json({ config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/google-drive/config — Save Drive mode and settings
router.post('/config', (req, res) => {
    try {
        const { mode, parentFolderId, shareEmail } = req.body;
        const config = googleDriveService.saveConfig({
            mode: mode || 'oauth2',
            parentFolderId: parentFolderId !== undefined ? parentFolderId.trim() : undefined,
            shareEmail: shareEmail !== undefined ? shareEmail.trim() : undefined
        });
        const connected = googleDriveService.isConnected();
        res.json({ success: true, config, connected });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/google-drive/auth-url — Get OAuth authorization URL
router.get('/auth-url', (req, res) => {
    try {
        const url = googleDriveService.getAuthUrl();
        res.json({ url });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/google-drive/auth-code — Exchange OAuth code for tokens
router.post('/auth-code', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Mã xác thực code không được để trống.' });
        }
        await googleDriveService.handleAuthCode(code);
        res.json({ success: true, message: 'Kết nối Google Drive thành công!' });
    } catch (err) {
        console.error('[GoogleDriveRoute] Auth code exchange error:', err);
        res.status(500).json({ error: err.message || 'Lỗi xác thực OAuth với Google.' });
    }
});

// POST /api/google-drive/upload-credentials — Upload Credentials JSON (OAuth or Service Account)
router.post('/upload-credentials', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Vui lòng chọn file JSON để tải lên.' });
        }
        const content = req.file.buffer.toString('utf-8');
        const json = JSON.parse(content);

        const dataDir = path.resolve(__dirname, '..', 'data');
        const rootDir = path.resolve(__dirname, '..', '..');
        fs.mkdirSync(dataDir, { recursive: true });

        if (json.type === 'service_account' && json.private_key && json.client_email) {
            // Service Account JSON
            const saPath = path.join(dataDir, 'service-account.json');
            fs.writeFileSync(saPath, content, 'utf-8');

            googleDriveService.saveConfig({ mode: 'service_account' });

            return res.json({
                success: true,
                type: 'service_account',
                client_email: json.client_email,
                message: `✅ Đã tải file Service Account thành công (${json.client_email})! Đã tự động chuyển sang chế độ Service Account.`
            });
        } else if (json.installed || json.web) {
            // OAuth 2.0 Client ID JSON
            const targetPath = path.join(rootDir, 'sick-pdf-api.json');
            fs.writeFileSync(targetPath, content, 'utf-8');

            const dataPath = path.join(dataDir, 'sick-pdf-api.json');
            fs.writeFileSync(dataPath, content, 'utf-8');

            googleDriveService.saveConfig({ mode: 'oauth2' });

            return res.json({
                success: true,
                type: 'oauth2',
                message: '✅ Đã tải file OAuth API JSON thành công! Giờ hãy bấm Kết nối & Xác thực.'
            });
        } else {
            return res.status(400).json({ error: 'File JSON không hợp lệ. Phải là file OAuth 2.0 Client ID hoặc Service Account Key từ Google Cloud Console.' });
        }
    } catch (err) {
        console.error('[GoogleDriveRoute] Upload credentials error:', err);
        res.status(400).json({ error: 'File JSON không hợp lệ hoặc bị lỗi cú pháp: ' + err.message });
    }
});

// GET /api/google-drive/check-profile-folders — Check Drive folder status for all profiles
router.get('/check-profile-folders', async (req, res) => {
    try {
        const connected = googleDriveService.isConnected();
        const profiles = profileQueries.getAll() || [];

        const results = [];
        for (const p of profiles) {
            let hasFolder = false;
            let folderValid = false;

            if (p.drive_folder_id) {
                hasFolder = true;
                if (connected) {
                    folderValid = await googleDriveService.verifyDriveFolderExists(p.drive_folder_id);
                } else {
                    folderValid = true;
                }
            }

            results.push({
                id: p.id,
                name: p.name,
                slug: p.slug,
                drive_folder_id: p.drive_folder_id,
                datasheet_folder_id: p.datasheet_folder_id,
                hasFolder,
                folderValid,
                status: (!hasFolder || (connected && !folderValid)) ? 'missing' : 'ok'
            });
        }

        const missingCount = results.filter(r => r.status === 'missing').length;

        res.json({
            connected,
            total: results.length,
            missingCount,
            okCount: results.length - missingCount,
            profiles: results
        });
    } catch (err) {
        console.error('[GoogleDriveRoute] Error checking profile folders:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/google-drive/create-missing-folders — Batch create Drive folders for profiles that don't have one
router.post('/create-missing-folders', async (req, res) => {
    try {
        if (!googleDriveService.isConnected()) {
            return res.status(400).json({ error: 'Chưa kết nối Google Drive! Vui lòng hoàn tất cấu hình để kết nối Drive.' });
        }

        const profiles = profileQueries.getAll() || [];
        const createdProfiles = [];
        const errors = [];

        for (const p of profiles) {
            let needsCreation = false;
            if (!p.drive_folder_id) {
                needsCreation = true;
            } else {
                const exists = await googleDriveService.verifyDriveFolderExists(p.drive_folder_id);
                if (!exists) {
                    needsCreation = true;
                }
            }

            if (needsCreation) {
                try {
                    const folders = await googleDriveService.createProfileFolders(p.name);
                    if (folders.profileFolderId) {
                        profileQueries.updateDriveInfo(p.slug, folders.profileFolderId, folders.datasheetFolderId, null);
                        createdProfiles.push({
                            name: p.name,
                            slug: p.slug,
                            profileFolderId: folders.profileFolderId,
                            datasheetFolderId: folders.datasheetFolderId
                        });
                    } else {
                        errors.push(`Không tạo được folder cho Profile '${p.name}'`);
                    }
                } catch (e) {
                    errors.push(`Lỗi tạo folder cho Profile '${p.name}': ${e.message}`);
                }
            }
        }

        res.json({
            success: true,
            totalProfiles: profiles.length,
            createdCount: createdProfiles.length,
            createdProfiles,
            errors
        });
    } catch (err) {
        console.error('[GoogleDriveRoute] Error creating missing folders:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
