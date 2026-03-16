"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadGDriveFile = downloadGDriveFile;
// functions/src/gdrive-download.ts
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'https://drive.usercontent.google.com/download';
async function downloadGDriveFile(fileId, fileName) {
    // Shared axios session — preserves cookies across requests
    const session = axios_1.default.create({
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        maxRedirects: 5,
        timeout: 120_000, // 2 min timeout for large files
    });
    // ── Request 1: attempt direct download ─────────────
    const res1 = await session.get(BASE_URL, {
        params: {
            id: fileId,
            export: 'download',
            authuser: '0',
            confirm: 't',
        },
        responseType: 'arraybuffer',
    });
    const ct1 = res1.headers['content-type'] || '';
    // ── Small file: got binary directly ─────────────────
    if (!ct1.includes('text/html')) {
        return {
            buffer: Buffer.from(res1.data),
            contentType: ct1,
            fileName,
        };
    }
    // ── Large file: got virus scan confirmation HTML ─────
    const html = Buffer.from(res1.data).toString('utf-8');
    // Extract the uuid hidden field from the confirmation form
    const uuidMatch = html.match(/name=["']uuid["']\s+value=["']([^"']+)["']/) ||
        html.match(/[&]uuid=([a-zA-Z0-9_-]+)[&]/);
    if (!uuidMatch) {
        // Fallback: try confirm token (older GDrive format)
        const confirmMatch = html.match(/confirm=([0-9A-Za-z_]+)/);
        if (!confirmMatch) {
            throw new Error(`Cannot extract download token for file: ${fileName} (${fileId})`);
        }
    }
    const uuid = uuidMatch[1];
    console.log(`[GDrive] Large file detected. UUID: ${uuid} — ${fileName}`);
    // ── Request 2: submit with uuid to get real file ─────
    const res2 = await session.get(BASE_URL, {
        params: {
            id: fileId,
            export: 'download',
            authuser: '0',
            confirm: 't',
            uuid,
        },
        responseType: 'arraybuffer',
    });
    return {
        buffer: Buffer.from(res2.data),
        contentType: res2.headers['content-type'] || 'application/octet-stream',
        fileName,
    };
}
//# sourceMappingURL=gdrive-download.js.map