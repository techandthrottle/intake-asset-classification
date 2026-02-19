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
const functions = __importStar(require("firebase-functions"));
const generative_ai_1 = require("@google/generative-ai");
const storage_1 = require("@google-cloud/storage");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs-extra")); // For temporary file operations
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const stream_1 = require("stream"); // Import Readable for stream piping
// Removed: import { google } from 'googleapis'; // Not needed if using JWT directly
const google_auth_library_1 = require("google-auth-library"); // Import JWT for service account
// Set FFmpeg path from ffmpeg-static
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
else {
    console.error('[CLASSIFY_FINAL] ffmpeg-static did not provide a path for FFmpeg! Falling back to "ffmpeg".');
    fluent_ffmpeg_1.default.setFfmpegPath('ffmpeg');
}
// Configure Storage client to use emulator if FIREBASE_STORAGE_EMULATOR_HOST is set
const storage = new storage_1.Storage({
    apiEndpoint: process.env.FIREBASE_STORAGE_EMULATOR_HOST || undefined,
});
console.log(`[CLASSIFY_FINAL] Storage client initialized with apiEndpoint: ${storage.apiEndpoint || 'default (production)'}`);
const GEMINI_MODEL_NAME = "gemini-2.0-flash-001";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIRECT_DOWNLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200MB threshold for direct download vs. GCS registration
const GCS_UPLOAD_BUCKET = 'tmp-asset-classification'; // The bucket for GCS registration
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
// Initialize JWT client globally to reuse across invocations (cold start friendly)
let jwtClient;
try {
    const serviceAccountKeyString = process.env.GCLOUD_SERVICE_ACCOUNT_KEY;
    console.log(`[CLASSIFY_FINAL Init] GCLOUD_SERVICE_ACCOUNT_KEY present: ${!!serviceAccountKeyString}`);
    // Temporarily log a snippet of the secret for debugging - REMOVE IN PRODUCTION
    // if (serviceAccountKeyString) {
    //   console.log(`[CLASSIFY_FINAL Init] Secret snippet: ${serviceAccountKeyString.substring(0, Math.min(serviceAccountKeyString.length, 50))}...`);
    // }
    if (!serviceAccountKeyString) {
        throw new Error('GCLOUD_SERVICE_ACCOUNT_KEY secret is not set.');
    }
    const serviceAccountKey = JSON.parse(serviceAccountKeyString);
    console.log('[CLASSIFY_FINAL Init] Service Account Key JSON parsed successfully.');
    jwtClient = new google_auth_library_1.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    console.log('[CLASSIFY_FINAL Init] JWT client for Service Account initialized.');
}
catch (e) {
    console.error('[CLASSIFY_FINAL Init] Error initializing JWT client for Service Account:', e);
    // Log the specific error if JSON parsing fails or credentials are bad
    if (e instanceof Error) {
        console.error(`[CLASSIFY_FINAL Init] Specific Error: ${e.message}`);
    }
}
// Helper to introduce a delay
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Builds a prompt for Gemini for a single image.
 */
function buildImagePrompt(fileName) {
    return `You are analyzing an image named "${fileName}".
  Your task is to provide an ACCURATE, FACTUAL, and DETAILED description of EXACTLY what you observe in the image.

  CRITICAL INSTRUCTIONS:
  - Describe ONLY what you see in the image.
  - Be LITERAL and SPECIFIC - describe exactly what is visible, not what might be implied.
  - AVOID assumptions, interpretations, or generalizations.
  - If there is text visible in the image, TRANSCRIBE it verbatim in your description.
  - Focus on observable visual elements: objects, people, colors, composition, text, logos, UI elements.
  - Do NOT discuss file formats, technical metadata, or filenames (except for the provided image name).

  ANALYSIS REQUIREMENTS:

  1. Classification: Examine the visual content and select the MOST appropriate category:
     - "a-roll": Photos or images of people speaking, presenting to camera, interviews, or direct-to-camera content.
     - "screenshot": Screen captures of software interfaces, apps, websites, desktop, or digital UI elements.
     - "logo": Brand logos, icons, symbols, or brand marks (typically simple, recognizable designs).
     - "photo": General photography including landscapes, objects, scenes, nature, or documentary-style images.
     - "graphic": Digital illustrations, artwork, design compositions, or stylized graphics.
     - "diagram": Charts, infographics, technical diagrams, flowcharts, or data visualizations.
     - "text": Text-heavy images like documents, slides, quotes, or typography-focused content.
     - "other": Content that clearly doesn't fit any of the above categories.

  2. Description: Provide a comprehensive, factual description that includes:
     - Main subject(s) and what they are doing.
     - Prominent colors and color palette.
     - Composition and layout (centered, left-aligned, grid, etc.).
     - Visual style (realistic, illustrated, minimalist, etc.).
     - If text is visible, transcribe it word-for-word.

  QUALITY STANDARDS:
  - Minimum 3 sentences of detailed observation.
  - Be specific with colors (e.g., "navy blue" not just "blue").
  - Include precise counts (e.g., "3 people" not "several people").

  Respond in this exact JSON format:
  {
    "classification": "a-roll|screenshot|logo|photo|graphic|diagram|text|other",
    "description": "detailed, factual description of exactly what is visible in the image"
  }`;
}
/**
 * Builds a prompt for Gemini for a video.
 */
function buildVideoPrompt(fileName) {
    return `You are analyzing a video file named "${fileName}".
  Your task is to provide an ACCURATE, FACTUAL, and DETAILED description of the overall content and context of the video.

  CRITICAL INSTRUCTIONS:
  - Describe ONLY what you observe in the video.
  - Be LITERAL and SPECIFIC - describe exactly what is visible, not what might be implied.
  - AVOID assumptions, interpretations, or generalizations.
  - If there is text visible in the video, TRANSCRIBE it verbatim in your description.
  - Focus on observable visual elements: objects, people, colors, composition, text, logos, UI elements, progression over time.
  - Do NOT discuss file formats, technical metadata, or filenames (except for the provided video name).

  ANALYSIS REQUIREMENTS:

  1. Classification: Examine the overall content of the video and select the MOST appropriate category:
     - "a-roll": Primary footage with people speaking directly to camera, interviews, presentations, or main narrative content.
     - "b-roll": Supplementary footage like scenery, establishing shots, cutaways, ambient footage, or supporting visuals.
     - "animation": Animated animated content including motion graphics, 2D/3D animation, or animated explainers.
     - "screen-recording": Screen captures showing software interfaces, desktop, applications, or gameplay.
     - "montage": Multiple clips edited together in sequence, compilations, or fast-paced sequences.
     - "other": Content that clearly doesn't fit any of the above categories.

  2. Description: Provide a comprehensive, factual description that captures the essence of the video. Include:

     FOR ALL VIDEOS:
     - Overall subject(s) and their actions/progression.
     - Changes in scene, subjects, or context over time.
     - Prominent colors and visual style.
     - If text is visible, transcribe it word-for-word.

  QUALITY STANDARDS:
  - Minimum 4 sentences of detailed observation.
  - Be specific with colors (e.g., "navy blue" not just "blue").
  - Include precise counts (e.g., "3 people" not "several people").

  Respond in this exact JSON format:
  {
    "classification": "a-roll|b-roll|animation|screen-recording|montage|other",
    "description": "detailed, factual description of the video content"
  }`;
}
/**
 * Helper to call Gemini API with image(s) or a GCS URI.
 */
async function classifyContentWithGemini(content, mimeType, fileName, geminiApiKey, // Changed from apiKey to geminiApiKey
processingMethod) {
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey); // Use geminiApiKey
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
        let prompt;
        if (processingMethod === 'image_direct' || processingMethod === 'video_frames') {
            prompt = processingMethod === 'image_direct' ? buildImagePrompt(fileName) : buildVideoPrompt(fileName);
        }
        else { // gcs_registration
            prompt = buildVideoPrompt(fileName); // Use video prompt for GCS registered videos
        }
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        if ('inlineData' in content && content.inlineData) {
            requestBody.contents[0].parts.push(...content.inlineData.map(data => ({ inlineData: data })));
        }
        else if ('fileData' in content && content.fileData) {
            requestBody.contents[0].parts.push({ fileData: content.fileData });
        }
        else {
            throw new Error("Invalid content provided for Gemini API call.");
        }
        console.log(`[CLASSIFY_FINAL] Calling Gemini API with ${processingMethod} for ${fileName}`);
        const apiResponse = await model.generateContent(requestBody);
        const text = apiResponse.response.text();
        console.log(`[CLASSIFY_FINAL] Raw AI response text for ${fileName}: ${text}`);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Invalid response format from AI: No JSON found in response. Raw text: ${text}`);
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Basic validation
        const isValid = parsed.classification && typeof parsed.classification === 'string' &&
            parsed.description && typeof parsed.description === 'string';
        if (!isValid) {
            console.warn(`[CLASSIFY_FINAL] Gemini response validation issues for ${fileName}: Missing classification or description.`);
            throw new Error(`Gemini response lacked required fields: classification or description. Raw: ${text}`);
        }
        return {
            success: true,
            classification: parsed.classification,
            description: parsed.description,
            diagnostics: {
                modelUsed: GEMINI_MODEL_NAME,
                processingMethod,
                framesExtracted: processingMethod === 'video_frames' ? content.inlineData.length : undefined,
                gcsUri: processingMethod === 'gcs_registration' ? content.fileData.fileUri : undefined,
            },
        };
    }
    catch (error) {
        console.error(`[CLASSIFY_FINAL] Gemini classification error for ${fileName}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gemini classification failed',
            diagnostics: {
                modelUsed: GEMINI_MODEL_NAME,
                processingMethod,
                framesExtracted: processingMethod === 'video_frames' ? content?.inlineData?.length : undefined,
                gcsUri: processingMethod === 'gcs_registration' ? content?.fileData?.fileUri : undefined,
            },
        };
    }
}
/**
 * Downloads a file from Google Drive.
 */
async function downloadGoogleDriveFileContent(fileId, accessToken, maxSizeBytes) {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&confirm=t`;
    console.log(`[CLASSIFY_FINAL] Attempting direct download of GDrive file ${fileId} from: ${downloadUrl}`);
    let response;
    try {
        // Add a small delay as requested, might help with bot detection
        await sleep(500);
        response = await fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Use accessToken
            },
        });
    }
    catch (networkError) {
        console.error(`[CLASSIFY_FINAL] Network error during GDrive direct download of ${fileId}:`, networkError);
        throw new Error(`Network error downloading Google Drive file: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
    }
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[CLASSIFY_FINAL] GDrive direct download failed for ${fileId}: ${response.status} - ${errorBody}`);
        throw new Error(`Failed to download GDrive file ${fileId}: ${response.status} ${response.statusText} - ${errorBody}`);
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    console.log(`[CLASSIFY_FINAL] Downloaded ${data.byteLength} bytes for GDrive file ${fileId}, Content-Type: ${contentType}`);
    if (data.byteLength > maxSizeBytes) {
        throw new Error(`File too large for direct download: ${data.byteLength} bytes (max: ${maxSizeBytes} bytes)`);
    }
    // Basic check for HTML content if download fails
    const previewText = data.slice(0, 500).toString('utf-8', 0, 500);
    if (contentType.includes('text/html') || previewText.toLowerCase().includes('<!doctype') || previewText.toLowerCase().includes('<html')) {
        console.error(`[CLASSIFY_FINAL] Downloaded content for ${fileId} appears to be HTML (e.g., error page) for direct download. Preview: ${previewText.substring(0, 200)}...`);
        throw new Error(`Downloaded content for ${fileId} is HTML, not media. Possible auth/access issue for direct download.`);
    }
    return { data, contentType };
}
/**
 * Streams a Google Drive file directly to a GCS bucket.
 */
async function streamDriveFileToGCS(fileId, fileName, mimeType, accessToken) {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&confirm=t`;
    const gcsFileName = `${Date.now()}_${fileName}`;
    const gcsFile = storage.bucket(GCS_UPLOAD_BUCKET).file(gcsFileName);
    const gcsUri = `gs://${GCS_UPLOAD_BUCKET}/${gcsFileName}`;
    console.log(`[CLASSIFY_FINAL] Attempting to stream GDrive file ${fileId} to GCS: ${gcsUri}`);
    let response;
    try {
        // Add a small delay as requested, might help with bot detection
        await sleep(500);
        response = await fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Use accessToken
            },
        });
    }
    catch (networkError) {
        console.error(`[CLASSIFY_FINAL] Network error during GDrive stream for ${fileId}:`, networkError);
        throw new Error(`Network error streaming Google Drive file: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
    }
    if (!response.ok || !response.body) {
        const errorBody = await response.text();
        console.error(`[CLASSIFY_FINAL] GDrive stream failed for ${fileId}: ${response.status} - ${errorBody}`);
        throw new Error(`Failed to stream GDrive file ${fileId}: ${response.status} ${response.statusText} - ${errorBody}`);
    }
    const writeStream = gcsFile.createWriteStream({
        contentType: mimeType,
    });
    console.log(`[CLASSIFY_FINAL] Piping GDrive response stream to GCS for ${fileName}`);
    await new Promise((resolve, reject) => {
        // Correct way to pipe Web ReadableStream to Node.js WritableStream
        // Using `as any` to bypass TypeScript's strict type checking for stream compatibility
        stream_1.Readable.fromWeb(response.body).pipe(writeStream)
            .on('error', reject)
            .on('finish', () => {
            console.log(`[CLASSIFY_FINAL] Successfully streamed ${fileName} to GCS: ${gcsUri}`);
            resolve();
        });
    });
    return gcsUri;
}
/**
 * Extracts keyframes from a video file using FFmpeg.
 * Returns an array of image buffers.
 */
async function extractFramesFromVideo(videoFilePath, videoFileName) {
    const framesDir = path.join(os.tmpdir(), `frames_${Date.now()}_${path.basename(videoFileName, path.extname(videoFileName))}`);
    await fs.ensureDir(framesDir);
    console.log(`[CLASSIFY_FINAL] Extracting frames for ${videoFileName}. Temp dir: ${framesDir}`);
    try {
        const videoProbe = await new Promise((resolve, reject) => {
            fluent_ffmpeg_1.default.ffprobe(videoFilePath, (err, metadata) => {
                if (err)
                    reject(err);
                resolve(metadata);
            });
        });
        const duration = videoProbe.format.duration;
        console.log(`[CLASSIFY_FINAL] Video duration for ${videoFileName}: ${duration} seconds`);
        const timestamps = [];
        const numFrames = 3; // Number of frames to extract (e.g., beginning, middle, end)
        if (duration && duration > 0) {
            for (let i = 1; i <= numFrames; i++) {
                const timestamp = (duration / (numFrames + 1)) * i;
                timestamps.push(timestamp.toFixed(2));
            }
        }
        else {
            // Fallback for very short videos or unknown duration
            timestamps.push('0%'); // Get one frame at the beginning
            console.warn(`[CLASSIFY_FINAL] Could not determine video duration for ${videoFileName}, extracting frame at 0%.`);
        }
        console.log(`[CLASSIFY_FINAL] Extracting frames at timestamps for ${videoFileName}: ${timestamps.join(', ')}`);
        await new Promise((resolve, reject) => {
            (0, fluent_ffmpeg_1.default)(videoFilePath)
                .on('end', () => {
                console.log(`[CLASSIFY_FINAL] Frame extraction complete for ${videoFileName}.`);
                resolve();
            })
                .on('error', (err) => {
                console.error(`[CLASSIFY_FINAL] FFmpeg error extracting frames for ${videoFileName}:`, err);
                reject(err);
            })
                .screenshots({
                timestamps: timestamps,
                filename: 'frame-%s.jpeg',
                folder: framesDir,
                size: '640x360' // Standard size, adjust as needed for Gemini API limits
            });
        });
        const extractedFrameFiles = await fs.readdir(framesDir);
        const frameBuffers = await Promise.all(extractedFrameFiles.sort().map(async (frameFileName) => {
            const frameFilePath = path.join(framesDir, frameFileName);
            return await fs.readFile(frameFilePath);
        }));
        console.log(`[CLASSIFY_FINAL] Read ${frameBuffers.length} frames into buffers for ${videoFileName}.`);
        return frameBuffers;
    }
    finally {
        // Ensure cleanup of temporary frames directory
        await fs.remove(framesDir).catch((e) => console.error(`[CLASSIFY_FINAL] Error removing temp frames dir ${framesDir}:`, e));
    }
}
exports.classifyAssetFinal = functions.https.onRequest(async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    try {
        const { id, name, mimeType, size } = req.body; // Expect single file metadata
        if (!id || !name || !mimeType) {
            res.status(400).json({ success: false, error: 'Missing required file metadata (id, name, mimeType)' });
            return;
        }
        const geminiApiKey = process.env.GOOGLE_API_KEY; // Get Gemini API Key
        if (!geminiApiKey) {
            throw new Error('Missing GOOGLE_API_KEY configuration for Gemini.');
        }
        if (!jwtClient) {
            throw new Error('JWT client for Service Account is not initialized.');
        }
        const accessToken = (await jwtClient.authorize()).access_token;
        if (!accessToken) {
            throw new Error('Failed to obtain access token from Service Account.');
        }
        const file = { id, name, mimeType, size };
        const result = await processGoogleDriveFile(file, accessToken, geminiApiKey); // Pass geminiApiKey
        res.status(200).json(result);
    }
    catch (error) {
        console.error('[CLASSIFY_FINAL] Error classifying asset:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during asset classification';
        res.status(500).json({ success: false, error: errorMessage });
    }
});
/**
 * Processes a single Google Drive file (downloads/streams, extracts frames/images, classifies with Gemini).
 */
async function processGoogleDriveFile(file, accessToken, geminiApiKey) {
    const classificationResult = {
        success: false,
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        error: "Unknown error during processing."
    };
    try {
        console.log(`[CLASSIFY_FINAL] Starting processing for GDrive file: ID=${file.id}, Name="${file.name}", MIME=${file.mimeType}, Size=${file.size}`);
        if (!file.mimeType.startsWith('image/') && !file.mimeType.startsWith('video/')) {
            classificationResult.error = `Unsupported MIME type: ${file.mimeType}. Only image/ and video/ are supported.`;
            console.warn(`[CLASSIFY_FINAL] ${classificationResult.error}`);
            return classificationResult;
        }
        const fileSize = file.size ? parseInt(file.size) : 0;
        // --- Large File (GCS Registration) Path ---
        if (file.mimeType.startsWith('video/') && fileSize > MAX_DIRECT_DOWNLOAD_SIZE_BYTES) {
            console.log(`[CLASSIFY_FINAL] File ${file.name} is a large video (${fileSize} bytes), initiating GCS registration.`);
            let gcsUri;
            try {
                gcsUri = await streamDriveFileToGCS(file.id, file.name, file.mimeType, accessToken);
                const geminiRes = await classifyContentWithGemini({ fileData: { fileUri: gcsUri } }, file.mimeType, file.name, geminiApiKey, 'gcs_registration'); // Pass geminiApiKey
                return { ...classificationResult, ...geminiRes, diagnostics: { ...geminiRes.diagnostics, gcsUri } };
            }
            finally {
                if (gcsUri) {
                    // Clean up GCS file after classification (or error)
                    await storage.bucket(GCS_UPLOAD_BUCKET).file(path.basename(gcsUri)).delete()
                        .then(() => console.log(`[CLASSIFY_FINAL] Cleaned up GCS file: ${gcsUri}`))
                        .catch((e) => console.error(`[CLASSIFY_FINAL] Error cleaning up GCS file ${gcsUri}:`, e));
                }
            }
        }
        // --- Small File (Direct Download/Frame Extraction) Path ---
        else {
            console.log(`[CLASSIFY_FINAL] File ${file.name} is a small file or image, initiating direct download/processing.`);
            const maxSizeBytes = file.mimeType.startsWith('image/') ? MAX_IMAGE_SIZE_BYTES : MAX_DIRECT_DOWNLOAD_SIZE_BYTES;
            const { data: fileBuffer, contentType } = await downloadGoogleDriveFileContent(file.id, accessToken, maxSizeBytes);
            if (file.mimeType.startsWith('image/')) {
                // Direct image classification
                console.log(`[CLASSIFY_FINAL] Classifying image directly: ${file.name}`);
                const geminiRes = await classifyContentWithGemini({ inlineData: [{ mimeType: contentType, data: fileBuffer.toString('base64') }] }, contentType, file.name, geminiApiKey, 'image_direct'); // Pass geminiApiKey
                return { ...classificationResult, ...geminiRes };
            }
            else if (file.mimeType.startsWith('video/')) {
                // Video frame extraction and classification
                console.log(`[CLASSIFY_FINAL] Processing video for frame extraction: ${file.name}`);
                const tempVideoFilePath = path.join(os.tmpdir(), `${Date.now()}_${file.name}`);
                await fs.writeFile(tempVideoFilePath, fileBuffer); // Save video to temp file for FFmpeg
                console.log(`[CLASSIFY_FINAL] Video saved temporarily to: ${tempVideoFilePath}`);
                try {
                    const frames = await extractFramesFromVideo(tempVideoFilePath, file.name);
                    if (frames.length === 0) {
                        throw new Error("No frames could be extracted from the video.");
                    }
                    const inlineFrameData = frames.map(buffer => ({ mimeType: 'image/jpeg', data: buffer.toString('base64') }));
                    const geminiRes = await classifyContentWithGemini({ inlineData: inlineFrameData }, file.mimeType, file.name, geminiApiKey, 'video_frames'); // Pass geminiApiKey
                    return { ...classificationResult, ...geminiRes };
                }
                finally {
                    await fs.remove(tempVideoFilePath).catch((e) => console.error(`[CLASSIFY_FINAL] Error removing temp video file ${tempVideoFilePath}:`, e));
                }
            }
        }
    }
    catch (error) {
        console.error(`[CLASSIFY_FINAL] Error in processGoogleDriveFile for ${file.name}:`, error);
        classificationResult.error = error instanceof Error ? error.message : String(error);
        return classificationResult;
    }
    return classificationResult; // Should not reach here if all types handled
}
//# sourceMappingURL=classifyAssetFinal.js.map