const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const stream = require('stream');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SERVER_DATA_DIR = path.resolve(__dirname, '..', 'data');
const TOKEN_PATH = path.join(SERVER_DATA_DIR, 'token.json');
const CONFIG_PATH = path.join(SERVER_DATA_DIR, 'drive-config.json');
const SERVICE_ACCOUNT_PATH = path.join(SERVER_DATA_DIR, 'service-account.json');

const CREDENTIAL_PATHS = [
    path.join(ROOT_DIR, 'sick-pdf-api.json'),
    path.join(SERVER_DATA_DIR, 'sick-pdf-api.json'),
    path.join(SERVER_DATA_DIR, 'credentials.json')
];

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return { mode: 'oauth2', parentFolderId: '', shareEmail: '' };
    }
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        return { mode: 'oauth2', parentFolderId: '', shareEmail: '' };
    }
}

function saveConfig(cfg) {
    fs.mkdirSync(SERVER_DATA_DIR, { recursive: true });
    const current = getConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
}

function isServiceAccountJson(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);
        return json.type === 'service_account' && !!json.private_key && !!json.client_email;
    } catch (e) {
        return false;
    }
}

function getServiceAccountPath() {
    const saPaths = [
        SERVICE_ACCOUNT_PATH,
        path.join(ROOT_DIR, 'service-account.json'),
        path.join(ROOT_DIR, 'sick-pdf-api.json'),
        path.join(SERVER_DATA_DIR, 'sick-pdf-api.json')
    ];
    return saPaths.find(p => isServiceAccountJson(p)) || null;
}

function getOAuth2Client() {
    let credPath = CREDENTIAL_PATHS.find(p => fs.existsSync(p) && !isServiceAccountJson(p));
    if (!credPath) return null;

    try {
        const content = fs.readFileSync(credPath, 'utf8');
        const creds = JSON.parse(content);
        const keys = creds.installed || creds.web;
        if (!keys) return null;

        const { client_id, client_secret, redirect_uris } = keys;
        const redirect_uri = (redirect_uris && redirect_uris[0]) || 'http://localhost';

        const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

        oauth2Client.on('tokens', (tokens) => {
            try {
                const current = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')) : {};
                const updated = { ...current, ...tokens };
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
            } catch (err) {
                console.error('[GoogleDriveService] Error saving refreshed token:', err);
            }
        });

        if (fs.existsSync(TOKEN_PATH)) {
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            oauth2Client.setCredentials(token);
        }

        return oauth2Client;
    } catch (err) {
        console.error('[GoogleDriveService] Failed to initialize OAuth2 client:', err);
        return null;
    }
}

function getAuthClient() {
    const config = getConfig();

    if (config.mode === 'service_account') {
        const saPath = getServiceAccountPath();
        if (saPath) {
            try {
                const creds = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                const auth = new google.auth.JWT({
                    email: creds.client_email,
                    key: creds.private_key,
                    scopes: [
                        'https://www.googleapis.com/auth/drive',
                        'https://www.googleapis.com/auth/spreadsheets'
                    ]
                });
                return auth;
            } catch (err) {
                console.error('[GoogleDriveService] Failed to load Service Account:', err);
                return null;
            }
        }
        return null;
    }

    return getOAuth2Client();
}

function isConnected() {
    const config = getConfig();
    if (config.mode === 'service_account') {
        return !!getServiceAccountPath();
    }
    if (!fs.existsSync(TOKEN_PATH)) return false;
    try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        return !!(token.access_token || token.refresh_token);
    } catch (e) {
        return false;
    }
}

function getAuthUrl() {
    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) {
        throw new Error('Chưa tìm thấy file OAuth credentials (sick-pdf-api.json).');
    }
    const scopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ];
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes
    });
}

async function handleAuthCode(code) {
    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) {
        throw new Error('Chưa tìm thấy OAuth Client credentials.');
    }
    if (code && typeof code === 'string') {
        if (code.includes('code=')) {
            code = code.split('code=')[1].split('&')[0];
        }
        code = decodeURIComponent(code.trim());
    }
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.mkdirSync(SERVER_DATA_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    saveConfig({ mode: 'oauth2' });
    return tokens;
}

async function findExistingProfileFolder(profileName) {
    const authClient = getAuthClient();
    if (!authClient || !isConnected() || !profileName) return null;

    try {
        const drive = google.drive({ version: 'v3', auth: authClient });
        const config = getConfig();

        let parentQuery = '';
        if (config.parentFolderId && config.parentFolderId.trim()) {
            parentQuery = `'${config.parentFolderId.trim()}' in parents and `;
        }

        const safeName = profileName.trim().replace(/'/g, "\\'");
        const q = `${parentQuery}mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;

        const res = await drive.files.list({
            q,
            fields: 'files(id, name, webViewLink)'
        });

        if (res.data.files && res.data.files.length > 0) {
            const profileFolderId = res.data.files[0].id;
            const profileFolderLink = res.data.files[0].webViewLink;

            let datasheetFolderId = null;
            let datasheetFolderLink = null;

            try {
                const dsQ = `'${profileFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='Datasheet' and trashed=false`;
                const dsRes = await drive.files.list({ q: dsQ, fields: 'files(id, name, webViewLink)' });
                if (dsRes.data.files && dsRes.data.files.length > 0) {
                    datasheetFolderId = dsRes.data.files[0].id;
                    datasheetFolderLink = dsRes.data.files[0].webViewLink;
                }
            } catch (e) {}

            if (!datasheetFolderId) {
                try {
                    const dsFolder = await drive.files.create({
                        resource: {
                            name: 'Datasheet',
                            mimeType: 'application/vnd.google-apps.folder',
                            parents: [profileFolderId]
                        },
                        fields: 'id, name, webViewLink'
                    });
                    datasheetFolderId = dsFolder.data.id;
                    datasheetFolderLink = dsFolder.data.webViewLink;
                } catch (e) {}
            }

            return {
                profileFolderId,
                datasheetFolderId,
                profileFolderLink,
                datasheetFolderLink,
                isExisting: true
            };
        }
    } catch (err) {
        console.error('[GoogleDriveService] Error searching existing folder:', err);
    }

    return null;
}

async function createProfileFolders(profileName) {
    const authClient = getAuthClient();
    if (!authClient || !isConnected()) {
        console.log('[GoogleDriveService] Drive not connected. Skipping drive folder creation.');
        return { profileFolderId: null, datasheetFolderId: null };
    }

    try {
        // 1. First search Google Drive to see if folder already exists (prevent duplicate folders!)
        const existing = await findExistingProfileFolder(profileName);
        if (existing) {
            console.log(`[GoogleDriveService] Linked existing Drive folder for '${profileName}': Folder=${existing.profileFolderId}, Datasheet=${existing.datasheetFolderId}`);
            return existing;
        }

        // 2. Otherwise create new folder
        const drive = google.drive({ version: 'v3', auth: authClient });
        const config = getConfig();

        const fileMetadata = {
            name: profileName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (config.parentFolderId && config.parentFolderId.trim()) {
            fileMetadata.parents = [config.parentFolderId.trim()];
        }

        const profileFolder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink'
        });
        const profileFolderId = profileFolder.data.id;

        if (config.shareEmail && config.shareEmail.includes('@')) {
            try {
                await drive.permissions.create({
                    fileId: profileFolderId,
                    requestBody: {
                        role: 'writer',
                        type: 'user',
                        emailAddress: config.shareEmail.trim()
                    }
                });
                console.log(`[GoogleDriveService] Shared folder '${profileName}' with ${config.shareEmail}`);
            } catch (sErr) {
                console.error('[GoogleDriveService] Failed to share folder with email:', sErr);
            }
        }

        const datasheetMetadata = {
            name: 'Datasheet',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [profileFolderId]
        };
        const datasheetFolder = await drive.files.create({
            resource: datasheetMetadata,
            fields: 'id, name, webViewLink'
        });
        const datasheetFolderId = datasheetFolder.data.id;

        console.log(`[GoogleDriveService] Created new Drive folders for Profile '${profileName}': Folder=${profileFolderId}, DatasheetFolder=${datasheetFolderId}`);
        return {
            profileFolderId,
            datasheetFolderId,
            profileFolderLink: profileFolder.data.webViewLink,
            datasheetFolderLink: datasheetFolder.data.webViewLink
        };
    } catch (err) {
        console.error('[GoogleDriveService] Failed to create Profile drive folders:', err);
        return { profileFolderId: null, datasheetFolderId: null };
    }
}

async function syncGoogleSheetData(profileFolderId, profileName, sheetTitle, rowsData) {
    const authClient = getAuthClient();
    if (!authClient || !isConnected() || !profileFolderId) {
        return null;
    }

    try {
        const drive = google.drive({ version: 'v3', auth: authClient });
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const dataSheetTitle = `${profileName}_${sheetTitle || 'Sheet1'}_DATA`;

        const q = `'${profileFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name='${dataSheetTitle}' and trashed=false`;
        const res = await drive.files.list({ q, fields: 'files(id, name, webViewLink)' });

        let spreadsheetId = null;
        let webViewLink = null;

        if (res.data.files && res.data.files.length > 0) {
            spreadsheetId = res.data.files[0].id;
            webViewLink = res.data.files[0].webViewLink;
        } else {
            const fileMetadata = {
                name: dataSheetTitle,
                mimeType: 'application/vnd.google-apps.spreadsheet',
                parents: [profileFolderId]
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                fields: 'id, webViewLink'
            });
            spreadsheetId = file.data.id;
            webViewLink = file.data.webViewLink;
        }

        if (rowsData && rowsData.length > 0) {
            try {
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: 'A1:AE1000'
                });
            } catch (cErr) {}
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'A1',
                valueInputOption: 'USER_ENTERED',
                resource: { values: rowsData }
            });
        }

        console.log(`[GoogleDriveService] Synced Google Sheet '${dataSheetTitle}' (${spreadsheetId}) in Drive folder.`);
        return { spreadsheetId, webViewLink, title: dataSheetTitle };
    } catch (err) {
        console.error('[GoogleDriveService] Error syncing Google Sheet _DATA:', err);
        return null;
    }
}

async function uploadExcelToDrive(profileFolderId, fileName, fileBuffer) {
    const authClient = getAuthClient();
    if (!authClient || !isConnected() || !profileFolderId) {
        return null;
    }

    try {
        const drive = google.drive({ version: 'v3', auth: authClient });

        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileBuffer);

        const fileMetadata = {
            name: fileName,
            parents: [profileFolderId]
        };
        const media = {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: bufferStream
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink'
        });

        console.log(`[GoogleDriveService] Uploaded Excel file '${fileName}' (${file.data.id}) to Drive.`);
        return { fileId: file.data.id, webViewLink: file.data.webViewLink };
    } catch (err) {
        console.error('[GoogleDriveService] Error uploading Excel to Drive:', err);
        return null;
    }
}

async function verifyDriveFolderExists(folderId) {
    if (!folderId) return false;
    const authClient = getAuthClient();
    if (!authClient || !isConnected()) return false;
    try {
        const drive = google.drive({ version: 'v3', auth: authClient });
        const res = await drive.files.get({ fileId: folderId, fields: 'id, name, trashed' });
        return res.data && !res.data.trashed;
    } catch (e) {
        return false;
    }
}

module.exports = {
    getConfig,
    saveConfig,
    getOAuth2Client,
    getAuthClient,
    getServiceAccountPath,
    isServiceAccountJson,
    isConnected,
    getAuthUrl,
    handleAuthCode,
    createProfileFolders,
    findExistingProfileFolder,
    syncGoogleSheetData,
    uploadExcelToDrive,
    verifyDriveFolderExists
};
