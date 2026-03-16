"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadZip = void 0;
// functions/src/downloadZip.ts
const https_1 = require("firebase-functions/v2/https");
const archiver_1 = __importDefault(require("archiver"));
const gdrive_download_1 = require("./gdrive-download"); // Assuming it's in the same directory or accessible via path
exports.downloadZip = (0, https_1.onRequest)({
    timeoutSeconds: 300,
    memory: '1GiB', // Adjust memory as needed for large zips
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const { files } = req.body;
    if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files selected' });
        return;
    }
    // Set headers for ZIP download
    const fileName = `gdrive_export_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const archive = (0, archiver_1.default)('zip', { zlib: { level: 6 } });
    // Handle archive errors
    archive.on('error', (err) => {
        console.error('[ZIP] Archive error:', err);
        res.status(500).send({ error: `Archive error: ${err.message}` });
    });
    // Pipe the archive to the response
    archive.pipe(res);
    const seenNames = new Map();
    for (const file of files) {
        try {
            console.log(`[ZIP] Downloading: ${file.name}`);
            const result = await (0, gdrive_download_1.downloadGDriveFile)(file.id, file.name);
            // Handle duplicate filenames in ZIP
            const safeName = deduplicateName(file.name, seenNames);
            archive.append(result.buffer, { name: sanitize(safeName) });
            console.log(`[ZIP] ✓ Appended: ${safeName}`);
        }
        catch (err) {
            console.error(`[ZIP] ✗ Failed: ${file.name} — ${err.message}`);
            // Append a .txt error note instead of silently skipping
            archive.append(`Failed to download: ${file.name}
Error: ${err.message}`, { name: `_errors/${sanitize(file.name)}.txt` });
        }
        // Throttle to avoid GDrive rate limits
        await sleep(300);
    }
    // Finalize the archive (this is where the ZIP is actually written to the response)
    await archive.finalize();
});
// ── Utilities ────────────────────────────────────────
function sanitize(name) {
    return name.replace(/[/\?%*:|"<>]/g, '_').substring(0, 100);
}
function deduplicateName(name, seen) {
    if (!seen.has(name)) {
        seen.set(name, 0);
        return name;
    }
    const count = seen.get(name) + 1;
    seen.set(name, count);
    const dot = name.lastIndexOf('.');
    return dot > -1
        ? `${name.slice(0, dot)}_${count}${name.slice(dot)}`
        : `${name}_${count}`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
//# sourceMappingURL=downloadZip.js.map