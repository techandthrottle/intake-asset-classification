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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAssetFinal = void 0;
const https_1 = require("firebase-functions/v2/https");
const generative_ai_1 = require("@google/generative-ai");
const server_1 = require("@google/generative-ai/server");
const storage_1 = require("@google-cloud/storage");
const stream_1 = require("stream");
const google_auth_library_1 = require("google-auth-library");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
// Set ffmpeg path
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
// Configure Storage client
const storage = new storage_1.Storage({
    apiEndpoint: process.env.FIREBASE_STORAGE_EMULATOR_HOST || undefined,
});
const GEMINI_MODEL_NAME = "gemini-2.0-flash-001";
const GCS_UPLOAD_BUCKET = 'tmp-asset-classification';
const LARGE_FILE_THRESHOLD_MB = 200;
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
// Initialize JWT client globally
let jwtClient;
try {
    const serviceAccountKeyString = process.env.GCLOUD_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKeyString) {
        const serviceAccountKey = JSON.parse(serviceAccountKeyString);
        jwtClient = new google_auth_library_1.JWT({
            email: serviceAccountKey.client_email,
            key: serviceAccountKey.private_key,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
    }
}
catch (e) {
    console.error('[CLASSIFY_FINAL Init] Error initializing JWT client:', e);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function buildPrompt(fileName, isVideo, frameCount = 1, isFileApi = false) {
    const type = isVideo ? 'video' : 'image';
    const categories = isVideo
        ? '"a-roll", "b-roll", "animation", "screen-recording", "montage", "other"'
        : '"landscape", "portrait", "square", "a-roll", "screenshot", "logo", "photo", "graphic", "diagram", "text", "other"';
    let context = `You are analyzing a ${type} named "${fileName}".`;
    if (isVideo && !isFileApi) {
        context += ` I have provided ${frameCount} representative frames from throughout the video.`;
    }
    else if (isVideo && isFileApi) {
        context += ` I have provided the full video for analysis.`;
    }
    return `${context}
  Provide an ACCURATE, FACTUAL, and DETAILED description of EXACTLY what is visible.

  1. Classification: Select the MOST appropriate category from: [${categories}]
  2. Description: Provide a comprehensive, factual description (min 3 sentences). 
     Transcribe any visible text verbatim.

  Respond in this exact JSON format:
  {
    "classification": "selected_category",
    "description": "detailed description"
  }`;
}
async function extractVideoFrames(localFilePath, outputDir) {
    return new Promise((resolve, reject) => {
        const frames = [];
        // Get video duration
        fluent_ffmpeg_1.default.ffprobe(localFilePath, (err, metadata) => {
            if (err)
                return reject(err);
            const duration = metadata.format.duration || 0;
            const frameCount = 5;
            const timestamps = [];
            for (let i = 0; i < frameCount; i++) {
                timestamps.push((duration / (frameCount + 1)) * (i + 1));
            }
            console.log(`[CLASSIFY_FINAL] Extracting ${frameCount} frames from ${duration}s video...`);
            (0, fluent_ffmpeg_1.default)(localFilePath)
                .on('filenames', (filenames) => {
                filenames.forEach(f => frames.push(path.join(outputDir, f)));
            })
                .on('end', () => resolve(frames))
                .on('error', (err) => reject(err))
                .screenshots({
                timestamps: timestamps,
                filename: 'frame-%s.jpg',
                folder: outputDir,
                size: '640x?'
            });
        });
    });
}
async function classifyWithGemini(contentParts, geminiApiKey) {
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
    const result = await model.generateContent(contentParts);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
        throw new Error("No JSON found in response");
    return JSON.parse(jsonMatch[0]);
}
async function streamDriveToGCS(fileId, fileName, mimeType, accessToken) {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&confirm=t`;
    const gcsFileName = `tmp_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const gcsFile = storage.bucket(GCS_UPLOAD_BUCKET).file(gcsFileName);
    const gcsUri = `gs://${GCS_UPLOAD_BUCKET}/${gcsFileName}`;
    await sleep(500);
    const response = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok || !response.body) {
        throw new Error(`Drive download failed: ${response.status}`);
    }
    const writeStream = gcsFile.createWriteStream({ contentType: mimeType });
    await new Promise((resolve, reject) => {
        stream_1.Readable.fromWeb(response.body).pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
    });
    return gcsUri;
}
exports.classifyAssetFinal = (0, https_1.onRequest)({
    timeoutSeconds: 540,
    memory: '2GiB',
    concurrency: 1,
}, async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    let gcsUri;
    let localPath;
    let geminiFileUri;
    const tempDir = path.join(os.tmpdir(), `classify_${Date.now()}`);
    try {
        const { id, name, mimeType, size } = req.body;
        const fileSizeMB = size ? parseInt(size) / (1024 * 1024) : 0;
        const geminiApiKey = process.env.GOOGLE_API_KEY;
        if (!jwtClient)
            throw new Error('JWT client not initialized');
        const accessToken = (await jwtClient.authorize()).access_token;
        if (!accessToken)
            throw new Error('Failed to obtain access token');
        fs.mkdirSync(tempDir, { recursive: true });
        // 1. Stream from Drive to GCS
        console.log(`[CLASSIFY_FINAL] Streaming ${name} (${fileSizeMB.toFixed(1)}MB) to GCS...`);
        gcsUri = await streamDriveToGCS(id, name, mimeType, accessToken);
        // 2. Download from GCS to local /tmp
        const gcsFileName = gcsUri.split('/').pop();
        localPath = path.join(tempDir, name);
        console.log(`[CLASSIFY_FINAL] Downloading to local path: ${localPath}`);
        await storage.bucket(GCS_UPLOAD_BUCKET).file(gcsFileName).download({ destination: localPath });
        const isVideo = mimeType.startsWith('video/');
        const contentParts = [];
        let processingMethod = isVideo ? 'video_frames' : 'image_direct';
        let framesCount = 0;
        if (isVideo && fileSizeMB > LARGE_FILE_THRESHOLD_MB) {
            // Use Gemini File API for large videos
            console.log(`[CLASSIFY_FINAL] Large video detected. Using Gemini File API.`);
            processingMethod = 'gemini_file_api';
            const fileManager = new server_1.GoogleAIFileManager(geminiApiKey);
            const uploadResult = await fileManager.uploadFile(localPath, {
                mimeType,
                displayName: name,
            });
            // Wait for file to be active
            let file = await fileManager.getFile(uploadResult.file.name);
            while (file.state === 'PROCESSING') {
                await sleep(2000);
                file = await fileManager.getFile(uploadResult.file.name);
            }
            if (file.state === 'FAILED')
                throw new Error('Gemini File API processing failed');
            geminiFileUri = file.uri;
            contentParts.push(buildPrompt(name, true, 0, true));
            contentParts.push({
                fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.uri
                }
            });
        }
        else if (isVideo) {
            // 3. Extract frames for smaller videos
            const framePaths = await extractVideoFrames(localPath, tempDir);
            framesCount = framePaths.length;
            contentParts.push(buildPrompt(name, true, framesCount));
            for (const fPath of framePaths) {
                const base64Data = fs.readFileSync(fPath, { encoding: 'base64' });
                contentParts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Data
                    }
                });
            }
        }
        else {
            // 3. Just use the image
            contentParts.push(buildPrompt(name, false));
            contentParts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: fs.readFileSync(localPath).toString('base64')
                }
            });
        }
        // 4. Classify
        console.log(`[CLASSIFY_FINAL] Calling Gemini for ${name} using ${processingMethod}...`);
        const result = await classifyWithGemini(contentParts, geminiApiKey);
        res.status(200).json({
            success: true,
            id,
            name,
            classification: result.classification,
            description: result.description,
            diagnostics: {
                modelUsed: GEMINI_MODEL_NAME,
                processingMethod,
                framesExtracted: processingMethod === 'video_frames' ? framesCount : undefined,
                gcsUri
            }
        });
    }
    catch (error) {
        console.error(`[CLASSIFY_FINAL] Error:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        // Cleanup GCS
        if (gcsUri) {
            const gcsFileName = gcsUri.split('/').pop();
            await storage.bucket(GCS_UPLOAD_BUCKET).file(gcsFileName).delete().catch(() => { });
        }
        // Cleanup Gemini File API
        if (geminiFileUri) {
            try {
                const fileManager = new server_1.GoogleAIFileManager(process.env.GOOGLE_API_KEY);
                const fileName = geminiFileUri.split('/').pop();
                await fileManager.deleteFile(fileName);
            }
            catch (e) {
                console.error(`[CLASSIFY_FINAL] Gemini file cleanup error:`, e);
            }
        }
        // Cleanup local /tmp
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        }
        catch (err) {
            console.error(`[CLASSIFY_FINAL] Cleanup error:`, err);
        }
    }
});
//# sourceMappingURL=classifyAssetFinal.js.map