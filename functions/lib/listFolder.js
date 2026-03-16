"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFolder = void 0;
const https_1 = require("firebase-functions/v2/https");
const gdrive_1 = require("./gdrive");
exports.listFolder = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const { url } = request.data;
    if (!url) {
        throw new https_1.HttpsError('invalid-argument', 'The "url" parameter is required.');
    }
    const parsed = (0, gdrive_1.extractDriveId)(url);
    if (!parsed || parsed.type !== 'folder') {
        throw new https_1.HttpsError('invalid-argument', 'Invalid or non-folder GDrive URL');
    }
    try {
        const files = await (0, gdrive_1.listFolderFiles)(parsed.id);
        return { files };
    }
    catch (err) {
        throw new https_1.HttpsError('internal', err.message || 'Error listing folder files.');
    }
});
//# sourceMappingURL=listFolder.js.map