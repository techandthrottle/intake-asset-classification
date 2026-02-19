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
// Removed unused imports and constants as they are now in classifyAssetFinal.ts
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { Storage } from '@google-cloud/storage';
// import * as path from 'path';
// import * as os from 'os';
// import * as fs from 'fs-extra';
// import ffmpeg from 'fluent-ffmpeg';
// import ffmpegPath from 'ffmpeg-static';
// import { Readable } from 'stream';
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
// Removed: All helper functions for classification and download/stream/extract (buildImagePrompt, buildVideoPrompt, classifyContentWithGemini,
// downloadGoogleDriveFileContent, streamDriveFileToGCS, extractFramesFromVideo, processGoogleDriveFile)
// These are now in classifyAssetFinal.ts
function detectGoogleDriveUrl(url) {
    try {
        const urlObj = new URL(url);
        console.log(`[PROCESS_GD] Detecting GDrive URL for: ${url}`);
        console.log(`[PROCESS_GD] URL Object:`, urlObj);
        // Prioritize specific file patterns
        const fileMatchDirect = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/); // Matches /file/d/{ID}
        if (fileMatchDirect) {
            console.log(`[PROCESS_GD] Detected direct file URL, ID: ${fileMatchDirect[1]}`);
            return { type: 'file', id: fileMatchDirect[1] };
        }
        const fileMatchUcId = urlObj.pathname === '/uc' && urlObj.searchParams.has('id'); // Matches /uc?id={ID}
        if (fileMatchUcId) {
            const id = urlObj.searchParams.get('id');
            if (id) {
                console.log(`[PROCESS_GD] Detected /uc?id= file URL, ID: ${id}`);
                return { type: 'file', id }; // Correctly identify as file
            }
        }
        // Then check for folder patterns
        const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/); // Matches /folders/{ID}
        if (folderMatch) {
            console.log(`[PROCESS_GD] Detected folder URL, ID: ${folderMatch[1]}`);
            return { type: 'folder', id: folderMatch[1] };
        }
        // Fallback for generic 'id' parameter, assume it's a file if other patterns not matched
        // This could still be ambiguous, but better than assuming folder
        if (urlObj.searchParams.has('id')) {
            const id = urlObj.searchParams.get('id');
            if (id) {
                console.log(`[PROCESS_GD] Detected generic 'id' param, assuming file. ID: ${id}`);
                return { type: 'file', id }; // Assume file for generic 'id' if other folder patterns not matched
            }
        }
        console.log(`[PROCESS_GD] No specific Google Drive URL pattern detected for: ${url}`);
        return { type: null, id: null };
    }
    catch (e) {
        console.error(`[PROCESS_GD] Error detecting Google Drive URL for ${url}:`, e);
        return { type: null, id: null };
    }
}
async function fetchFilesFromFolder(folderId, apiKey, visitedFolders = new Set(), depth = 0) {
    const MAX_DEPTH = 10;
    const filesMetadata = [];
    if (depth > MAX_DEPTH || visitedFolders.has(folderId)) {
        if (depth > MAX_DEPTH) {
            console.warn(`[PROCESS_GD] Max recursion depth (${MAX_DEPTH}) reached for folder ID: ${folderId}`);
        }
        else {
            console.warn(`[PROCESS_GD] Folder ID already visited: ${folderId}`);
        }
        return filesMetadata;
    }
    visitedFolders.add(folderId);
    console.log(`[PROCESS_GD] Fetching files from folder ID: ${folderId}, depth: ${depth}`);
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
        const apiUrl = `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`;
        console.log(`[PROCESS_GD] Google Drive API call (folder): ${apiUrl}`);
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            const error = await response.text();
            console.error(`[PROCESS_GD] Google Drive API error (folder fetch): ${response.status} - ${error}`);
            throw new Error(`Google Drive API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        console.log(`[PROCESS_GD] Raw GDrive API response data (folder files found in ${folderId}):`, JSON.stringify(data.files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })), null, 2));
        for (const file of data.files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                const subfolderResults = await fetchFilesFromFolder(file.id, apiKey, visitedFolders, depth + 1);
                filesMetadata.push(...subfolderResults);
            }
            else if (file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/')) {
                // Only return metadata for eligible files. Actual classification will be done by classifyAssetFinal
                filesMetadata.push(file);
                console.log(`[PROCESS_GD] Discovered eligible media file: ID=${file.id}, Name="${file.name}", MIME=${file.mimeType}`);
            }
            else {
                console.log(`[PROCESS_GD] Skipping non-media file in folder: ID=${file.id}, Name="${file.name}", MIME=${file.mimeType}`);
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return filesMetadata;
}
async function fetchSingleFile(fileId, apiKey) {
    console.log(`[PROCESS_GD] Fetching single file ID: ${fileId}`);
    const queryParams = new URLSearchParams({
        key: apiKey,
        fields: 'id,name,mimeType,size,thumbnailLink,webContentLink',
    });
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?${queryParams.toString()}`;
    console.log(`[PROCESS_GD] Google Drive API call (single file): ${apiUrl}`);
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    });
    if (!response.ok) {
        const error = await response.text();
        console.error(`[PROCESS_GD] Google Drive API error (single file fetch): ${response.status} - ${error}`);
        throw new Error(`Google Drive API error: ${response.status} - ${error}`);
    }
    const file = await response.json();
    console.log(`[PROCESS_GD] Fetched file details: ID=${file.id}, Name="${file.name}", MIME=${file.mimeType}`);
    console.log(`[PROCESS_GD] Raw GDrive API response data (single file):`, JSON.stringify({ id: file.id, name: file.name, mimeType: file.mimeType }, null, 2));
    if (!file.mimeType.startsWith('image/') && !file.mimeType.startsWith('video/')) {
        console.warn(`[PROCESS_GD] Single file is not a media type: ID=${file.id}, MIME=${file.mimeType}. Skipping.`);
        return [];
    }
    console.log(`[PROCESS_GD] Discovered eligible single media file: ID=${file.id}, Name="${file.name}", MIME=${file.mimeType}`);
    return [file]; // Return metadata
}
exports.processGoogleDrive = functions.https.onRequest(async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    try {
        const { url } = req.body;
        console.log(`[PROCESS_GD] Received request for URL: ${url}`);
        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }
        const googleApiKey = process.env.GOOGLE_API_KEY;
        console.log(`[PROCESS_GD] GOOGLE_API_KEY present: ${!!googleApiKey}`);
        if (!googleApiKey) {
            throw new Error('Missing Google API key configuration');
        }
        const { type, id } = detectGoogleDriveUrl(url);
        console.log(`[PROCESS_GD] Detected type: ${type}, ID: ${id} for URL: ${url}`);
        if (!type || !id) {
            res.status(400).json({ error: 'Not a valid Google Drive URL' });
            return;
        }
        let results = [];
        if (type === 'folder') {
            results = await fetchFilesFromFolder(id, googleApiKey);
        }
        else {
            results = await fetchSingleFile(id, googleApiKey);
        }
        res.status(200).json({
            success: true,
            filesDiscovered: results.length,
            files: results, // Return discovered files metadata
            message: 'File discovery complete. Ready for classification.'
        });
    }
    catch (error) {
        console.error('[PROCESS_GD] Error processing Google Drive URL:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});
//# sourceMappingURL=processGoogleDrive.js.map