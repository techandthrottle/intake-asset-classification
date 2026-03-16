"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGoogleDrive = void 0;
const https_1 = require("firebase-functions/v2/https");
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
function detectGoogleDriveUrl(url) {
    try {
        const urlObj = new URL(url);
        const fileMatchDirect = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileMatchDirect)
            return { type: 'file', id: fileMatchDirect[1] };
        const fileMatchUcId = urlObj.pathname === '/uc' && urlObj.searchParams.has('id');
        if (fileMatchUcId)
            return { type: 'file', id: urlObj.searchParams.get('id') };
        const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (folderMatch)
            return { type: 'folder', id: folderMatch[1] };
        if (urlObj.searchParams.has('id'))
            return { type: 'file', id: urlObj.searchParams.get('id') };
        return { type: null, id: null };
    }
    catch (e) {
        return { type: null, id: null };
    }
}
async function fetchFilesFromFolder(folderId, apiKey, visitedFolders = new Set(), depth = 0) {
    const MAX_DEPTH = 10;
    const filesMetadata = [];
    if (depth > MAX_DEPTH || visitedFolders.has(folderId))
        return filesMetadata;
    visitedFolders.add(folderId);
    let pageToken;
    do {
        const params = new URLSearchParams({
            key: apiKey,
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id,name,mimeType,size,thumbnailLink,webContentLink),nextPageToken',
            pageSize: '100',
        });
        if (pageToken)
            params.set('pageToken', pageToken);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
        if (!response.ok)
            throw new Error(`Drive API error: ${response.status}`);
        const data = await response.json();
        for (const file of data.files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                filesMetadata.push(...await fetchFilesFromFolder(file.id, apiKey, visitedFolders, depth + 1));
            }
            else if (file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/')) {
                filesMetadata.push(file);
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return filesMetadata;
}
async function fetchSingleFile(fileId, apiKey) {
    const params = new URLSearchParams({ key: apiKey, fields: 'id,name,mimeType,size,thumbnailLink,webContentLink' });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`);
    if (!response.ok)
        throw new Error(`Drive API error: ${response.status}`);
    const file = await response.json();
    return (file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/')) ? [file] : [];
}
exports.processGoogleDrive = (0, https_1.onRequest)({
    timeoutSeconds: 300,
    memory: '512MiB',
}, async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    try {
        const { url } = req.body;
        const googleApiKey = process.env.GOOGLE_API_KEY;
        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }
        if (!googleApiKey)
            throw new Error('Missing Google API key');
        const { type, id } = detectGoogleDriveUrl(url);
        if (!type || !id) {
            res.status(400).json({ error: 'Invalid GDrive URL' });
            return;
        }
        const results = type === 'folder'
            ? await fetchFilesFromFolder(id, googleApiKey)
            : await fetchSingleFile(id, googleApiKey);
        res.status(200).json({
            success: true,
            filesDiscovered: results.length,
            files: results,
            message: 'File discovery complete.'
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=processGoogleDrive.js.map