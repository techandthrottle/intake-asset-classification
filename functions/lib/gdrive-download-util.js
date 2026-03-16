"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadGDriveFile = downloadGDriveFile;
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'https://drive.usercontent.google.com/download';
// Helper to introduce a delay
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Downloads a Google Drive file, handling the virus scan page (UUID bypass) for large files.
 * Uses Service Account accessToken for authentication.
 */
async function downloadGDriveFile(fileId, fileName, accessToken) {
    // Shared axios session — preserves cookies across requests, handles auth
    const session = axios_1.default.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Authorization': `Bearer ${accessToken}`, // Use Service Account accessToken
        },
        maxRedirects: 5,
        timeout: 120_000, // 2 min timeout for large files
        responseType: 'arraybuffer', // Always get response as arraybuffer
        validateStatus: (status) => (status >= 200 && status < 300) || status === 403 // Allow 403 to check for virus scan page
    });
    // ── Request 1: attempt direct download ─────────────
    // Add a small delay to mitigate rate limits/bot detection
    await sleep(500);
    let res1;
    try {
        res1 = await session.get(BASE_URL, {
            params: {
                id: fileId,
                export: 'download',
                authuser: '0',
                confirm: 't',
            },
        });
    }
    catch (error) {
        // Axios throws for non-2xx statuses, but we might expect 403 for virus scan
        if (axios_1.default.isAxiosError(error) && error.response) {
            res1 = error.response; // Capture the response even if it's an error status
        }
        else {
            throw new Error(`Network error during GDrive download: ${error.message}`);
        }
    }
    const ct1 = res1.headers['content-type'] || '';
    // ── Small file: got binary directly ─────────────────
    // If status is 200 OK and not HTML, it's the direct file
    if (res1.status === 200 && !ct1.includes('text/html')) {
        return {
            buffer: Buffer.from(res1.data),
            contentType: ct1,
            fileName,
        };
    }
    // ── Large file: got virus scan confirmation HTML or other non-200 ─────
    // If it's HTML, we need to bypass
    if (ct1.includes('text/html')) {
        const html = Buffer.from(res1.data).toString('utf-8');
        // Extract the uuid hidden field from the confirmation form
        // Regex adapted from guide, being robust with quotes
        let uuidMatch = html.match(/name=["']uuid["']\s+value=["']([^"']+)["']/) ||
            html.match(/&uuid=([a-zA-Z0-9_-]+)/);
        let uuid;
        if (uuidMatch && uuidMatch[1]) {
            uuid = uuidMatch[1];
        }
        else {
            // Fallback: try confirm token (older GDrive format, or if UUID not found)
            const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
            if (confirmMatch && confirmMatch[1]) {
                uuid = confirmMatch[1];
                console.warn(`[GDrive Download] UUID not found, falling back to confirm token: ${uuid}`);
            }
        }
        if (!uuid) {
            throw new Error(`Cannot extract download token (UUID or confirm) for file: ${fileName} (${fileId}). HTML content suggests an issue.`);
        }
        console.log(`[GDrive Download] Large file detected. UUID/Token: ${uuid} — ${fileName}`);
        // Add a small delay before the second request
        await sleep(500);
        // ── Request 2: submit with uuid/token to get real file ─────
        let res2;
        try {
            res2 = await session.get(BASE_URL, {
                params: {
                    id: fileId,
                    export: 'download',
                    authuser: '0',
                    confirm: 't',
                    uuid: uuid, // Pass the extracted UUID/token
                },
            });
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response) {
                res2 = error.response;
            }
            else {
                throw new Error(`Network error during GDrive UUID download: ${error.message}`);
            }
        }
        if (res2.status !== 200) {
            const errorBody = Buffer.from(res2.data).toString('utf-8');
            throw new Error(`Failed to download GDrive file with UUID bypass for ${fileName}: ${res2.status} - ${errorBody}`);
        }
        return {
            buffer: Buffer.from(res2.data),
            contentType: res2.headers['content-type'] || 'application/octet-stream',
            fileName,
        };
    }
    else {
        // If not 200 OK and not HTML, it's an unexpected error
        const errorBody = Buffer.from(res1.data).toString('utf-8');
        throw new Error(`Unexpected GDrive download response for ${fileName}: ${res1.status} - ${errorBody}`);
    }
}
//# sourceMappingURL=gdrive-download-util.js.map