"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAsset = classifyAsset;
const MIME_MAP = {
    // Video
    'video/mp4': 'VIDEO', 'video/quicktime': 'VIDEO',
    'video/x-msvideo': 'VIDEO', 'video/x-matroska': 'VIDEO',
    // Image
    'image/jpeg': 'IMAGE', 'image/png': 'IMAGE',
    'image/gif': 'IMAGE', 'image/webp': 'IMAGE', 'image/svg+xml': 'IMAGE',
    // Audio
    'audio/mpeg': 'AUDIO', 'audio/wav': 'AUDIO', 'audio/aac': 'AUDIO',
    // Documents
    'application/pdf': 'DOCUMENT',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
    'application/vnd.google-apps.document': 'DOCUMENT',
    // Spreadsheets
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'SPREADSHEET',
    'application/vnd.google-apps.spreadsheet': 'SPREADSHEET',
    // Folder
    'application/vnd.google-apps.folder': 'FOLDER',
};
const EXT_MAP = {
    mp4: 'VIDEO', mov: 'VIDEO', avi: 'VIDEO', mkv: 'VIDEO', webm: 'VIDEO',
    jpg: 'IMAGE', jpeg: 'IMAGE', png: 'IMAGE', gif: 'IMAGE', webp: 'IMAGE',
    mp3: 'AUDIO', wav: 'AUDIO', aac: 'AUDIO', ogg: 'AUDIO',
    pdf: 'DOCUMENT', doc: 'DOCUMENT', docx: 'DOCUMENT',
    xls: 'SPREADSHEET', xlsx: 'SPREADSHEET', csv: 'SPREADSHEET',
};
function classifyAsset(mimeType = '', fileName = '') {
    if (MIME_MAP[mimeType])
        return MIME_MAP[mimeType];
    // Partial match for subtypes
    if (mimeType.startsWith('video/'))
        return 'VIDEO';
    if (mimeType.startsWith('image/'))
        return 'IMAGE';
    if (mimeType.startsWith('audio/'))
        return 'AUDIO';
    // Fallback: extension
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return EXT_MAP[ext] || 'UNKNOWN';
}
//# sourceMappingURL=classify.js.map