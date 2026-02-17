"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGoogleDrive = void 0;
const functions = __importStar(require("firebase-functions"));
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
function detectGoogleDriveUrl(url) {
    try {
        const urlObj = new URL(url);
        const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (folderMatch) {
            return { type: 'folder', id: folderMatch[1] };
        }
        const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileMatch) {
            return { type: 'file', id: fileMatch[1] };
        }
        if (urlObj.searchParams.has('id')) {
            const id = urlObj.searchParams.get('id');
            if (id) {
                return { type: 'folder', id };
            }
        }
        return { type: null, id: null };
    }
    catch {
        return { type: null, id: null };
    }
}
async function fetchFilesFromFolder(folderId, apiKey, visitedFolders = new Set(), depth = 0) {
    const MAX_DEPTH = 10;
    const files = [];
    if (depth > MAX_DEPTH || visitedFolders.has(folderId)) {
        return files;
    }
    visitedFolders.add(folderId);
    let pageToken;
    do {
        const queryParams = new URLSearchParams({
            key: apiKey,
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id,name,mimeType,size,thumbnailLink,webContentLink),nextPageToken',
            pageSize: '100',
        });
        if (pageToken) {
            queryParams.set('pageToken', pageToken);
        }
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Google Drive API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        for (const file of data.files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                const subfolderFiles = await fetchFilesFromFolder(file.id, apiKey, visitedFolders, depth + 1);
                files.push(...subfolderFiles);
            }
            else if (file.mimeType.startsWith('image/') ||
                file.mimeType.startsWith('video/')) {
                const downloadUrl = file.webContentLink ||
                    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
                files.push({
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    size: file.size || '0',
                    thumbnailLink: file.thumbnailLink,
                    downloadUrl,
                });
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
}
async function fetchSingleFile(fileId, apiKey) {
    const queryParams = new URLSearchParams({
        key: apiKey,
        fields: 'id,name,mimeType,size,thumbnailLink,webContentLink',
    });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Drive API error: ${response.status} - ${error}`);
    }
    const file = await response.json();
    if (!file.mimeType.startsWith('image/') && !file.mimeType.startsWith('video/')) {
        return [];
    }
    const downloadUrl = file.webContentLink ||
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
    return [{
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size || '0',
            thumbnailLink: file.thumbnailLink,
            downloadUrl,
        }];
}
exports.processGoogleDrive = functions.https.onRequest(async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    try {
        const { url } = req.body;
        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }
        const googleApiKey = process.env.GOOGLE_API_KEY;
        if (!googleApiKey) {
            throw new Error('Missing Google API key configuration');
        }
        const { type, id } = detectGoogleDriveUrl(url);
        if (!type || !id) {
            res.status(400).json({ error: 'Not a valid Google Drive URL' });
            return;
        }
        let extractedFiles = [];
        if (type === 'folder') {
            extractedFiles = await fetchFilesFromFolder(id, googleApiKey);
        }
        else {
            extractedFiles = await fetchSingleFile(id, googleApiKey);
        }
        res.status(200).json({
            success: true,
            filesCount: extractedFiles.length,
            files: extractedFiles,
        });
    }
    catch (error) {
        console.error('Error processing Google Drive URL:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});
//# sourceMappingURL=processGoogleDrive.js.map