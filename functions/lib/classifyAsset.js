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
exports.classifyAsset = void 0;
const functions = __importStar(require("firebase-functions"));
const generative_ai_1 = require("@google/generative-ai");
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
async function downloadFile(url, expectedMimeType, maxSize) {
    console.log(`[DOWNLOAD] Attempting download from: ${url}`);
    console.log(`[DOWNLOAD] Expected MIME type: ${expectedMimeType}`);
    let response;
    try {
        response = await fetch(url);
    }
    catch (networkError) {
        console.error(`[DOWNLOAD] Network error during fetch from ${url}:`, networkError);
        throw new Error(`Network error during download: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
    }
    console.log(`[DOWNLOAD] Response status: ${response.status}`);
    console.log(`[DOWNLOAD] Response headers:`, response.headers); // Fixed: changed .raw() to direct object
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[DOWNLOAD] Server responded with error status ${response.status}: ${errorBody}`);
        throw new Error(`Failed to download file: ${response.status} ${response.statusText} - ${errorBody}`);
    }
    const contentType = response.headers.get('content-type') || '';
    console.log(`[DOWNLOAD] Content-Type: ${contentType}`);
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) {
        throw new Error(`File too large: ${contentLength} bytes (max: ${maxSize} bytes)`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const size = arrayBuffer.byteLength;
    console.log(`[DOWNLOAD] Downloaded ${size} bytes`);
    if (size > maxSize) {
        throw new Error(`File too large: ${size} bytes (max: ${maxSize} bytes)`);
    }
    if (size < 100) {
        console.warn(`[DOWNLOAD] Warning: File is very small (${size} bytes), might be an error page or redirect.`);
    }
    const isMediaType = contentType.startsWith('image/') ||
        contentType.startsWith('video/') ||
        contentType.includes('octet-stream');
    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
        const preview = Buffer.from(arrayBuffer).toString('utf-8', 0, Math.min(arrayBuffer.byteLength, 500));
        console.error(`[DOWNLOAD] Received HTML/text content preview: ${preview}`);
        throw new Error(`Received HTML/text content instead of media file (content-type: ${contentType}). This usually indicates an authentication error or error page.`);
    }
    if (!isMediaType && contentType !== '') {
        console.warn(`[DOWNLOAD] Warning: Unexpected content-type "${contentType}", expected media type`);
    }
    const data = Buffer.from(arrayBuffer);
    const previewBytes = data.slice(0, 20);
    console.log(`[DOWNLOAD] First 20 bytes: ${previewBytes.toString('hex')}`);
    const previewText = data.slice(0, 100).toString('utf-8', 0, 100);
    if (previewText.toLowerCase().includes('<!doctype') ||
        previewText.toLowerCase().includes('<html') ||
        previewText.toLowerCase().includes('<head')) {
        console.error(`[DOWNLOAD] Downloaded content appears to be HTML preview: ${previewText}`);
        throw new Error('Downloaded content appears to be HTML instead of media file. This indicates an authentication or access error.');
    }
    return { data, contentType, size };
}
function buildPrompt(file, hasVisualContent) {
    const isImage = file.mimeType.startsWith('image/');
    const isVideo = file.mimeType.startsWith('video/');
    if (isImage) {
        if (hasVisualContent) {
            return `You are analyzing visual media content. Your task is to provide an ACCURATE, FACTUAL, and DETAILED description of EXACTLY what you observe in the visual content displayed to you.

CRITICAL INSTRUCTIONS:
- Describe ONLY what you see in the visual content in front of you
- Be LITERAL and SPECIFIC - describe exactly what is visible, not what might be implied
- AVOID assumptions, interpretations, or generalizations
- If there is text visible in the image, TRANSCRIBE it verbatim in your description
- Focus on observable visual elements: objects, people, colors, composition, text, logos, UI elements
- Do NOT discuss file formats, filenames, technical metadata, or naming conventions

ANALYSIS REQUIREMENTS:

1. Classification: Examine the actual visual content and select the MOST appropriate category:
   - "a-roll": Photos or images of people speaking, presenting to camera, interviews, or direct-to-camera content
   - "screenshot": Screen captures of software interfaces, apps, websites, desktop, or digital UI elements
   - "logo": Brand logos, icons, symbols, or brand marks (typically simple, recognizable designs)
   - "photo": General photography including landscapes, objects, scenes, nature, or documentary-style images
   - "graphic": Digital illustrations, artwork, design compositions, or stylized graphics
   - "diagram": Charts, infographics, technical diagrams, flowcharts, or data visualizations
   - "text": Text-heavy images like documents, slides, quotes, or typography-focused content
   - "other": Content that clearly doesn't fit any of the above categories

2. Description: Provide a comprehensive, factual description that includes:

   FOR ALL IMAGES:
   - Main subject(s) and what they are doing
   - Prominent colors and color palette
   - Composition and layout (centered, left-aligned, grid, etc.)
   - Visual style (realistic, illustrated, minimalist, etc.)

   IF TEXT IS VISIBLE:
   - Transcribe the main text content word-for-word
   - Note the text styling (font style, size, emphasis)
   - Describe text placement and hierarchy

   IF PEOPLE ARE PRESENT:
   - Number of people and their appearance
   - Their actions, expressions, or poses
   - Clothing, setting, and context

   IF UI/SCREENSHOT:
   - Application or platform name if visible
   - Main UI elements (buttons, menus, windows)
   - What functionality or screen is being shown

   IF LOGO/BRANDING:
   - Shape, colors, and design elements
   - Any text or symbols in the logo
   - Style characteristics (modern, vintage, minimalist)

   IF DIAGRAM/CHART:
   - Type of visualization (bar chart, flowchart, etc.)
   - Main data points or information shown
   - Labels and key elements

QUALITY STANDARDS:
- Minimum 3 sentences of detailed observation
- Be specific with colors (e.g., "navy blue" not just "blue")
- Include precise counts (e.g., "3 people" not "several people")
- Describe spatial relationships (e.g., "text centered at top, image below")

EXAMPLE OF GOOD DESCRIPTION:
"A minimalist logo design featuring a stylized bird silhouette in deep teal (#2C7A7B) against a white background. The bird faces right with geometric angular wings. Below the icon, the text 'FlyRight' appears in a modern sans-serif font in dark gray."

EXAMPLE OF BAD DESCRIPTION:
"A logo with a bird and some text."

Respond in this exact JSON format:
{
  "classification": "a-roll|screenshot|logo|photo|graphic|diagram|text|other",
  "description": "detailed, factual description of exactly what is visible in the image"
}`;
        }
        else {
            return `Unable to access image content. Based only on filename: "${file.name}"

Provide your best estimate in JSON format:
{
  "classification": "a-roll|screenshot|logo|photo|graphic|diagram|text|other",
  "description": "estimation based on filename only (visual content unavailable)"
}`;
        }
    }
    else if (isVideo) {
        if (hasVisualContent) {
            return `You are analyzing visual media content. Your task is to provide an ACCURATE, FACTUAL, and DETAILED description of EXACTLY what you observe in the visual content displayed to you.

CRITICAL INSTRUCTIONS:
- Describe ONLY what you see in the visual content in front of you
- Be LITERAL and SPECIFIC - describe exactly what is visible, not what might be implied
- AVOID assumptions, interpretations, or generalizations
- Analyze the video throughout its duration (beginning, middle, end)
- If there is visible text, speech, or audio content, mention it in your description
- Do NOT discuss file formats, filenames, technical metadata, or naming conventions

ANALYSIS REQUIREMENTS:

1. Classification: Examine the actual visual content and select the MOST appropriate category:
   - "a-roll": Primary footage with people speaking directly to camera, interviews, presentations, or main narrative content
   - "b-roll": Supplementary footage like scenery, establishing shots, cutaways, ambient footage, or supporting visuals
   - "animation": Animated content including motion graphics, 2D/3D animation, or animated explainers
   - "screen-recording": Screen captures showing software interfaces, desktop, applications, or gameplay
   - "montage": Multiple clips edited together in sequence, compilations, or fast-paced sequences
   - "other": Content that clearly doesn't fit any of the above categories

2. Description: Provide a comprehensive, factual description that includes:

   FOR ALL VIDEOS:
   - What happens throughout the video (opening, progression, ending)
   - Main subjects and their actions
   - Visual style and production quality
   - Camera movement and angles (static, panning, handheld, etc.)
   - Prominent colors and lighting

   IF PEOPLE ARE SPEAKING (A-ROLL):
   - Who is speaking and their appearance
   - Setting and background
   - Whether they're looking at camera or off-screen
   - Their tone and presentation style

   IF B-ROLL FOOTAGE:
   - Specific scenes and locations shown
   - Type of shots (wide, close-up, aerial, etc.)
   - Subject matter and context
   - Pacing and editing style

   IF ANIMATION:
   - Animation style (2D, 3D, motion graphics, etc.)
   - Characters, objects, or elements animated
   - Visual effects and transitions
   - Narrative or message conveyed

   IF SCREEN RECORDING:
   - Application or platform being demonstrated
   - Specific actions or workflows shown
   - UI elements and interactions
   - What functionality is being demonstrated

   IF MONTAGE:
   - Number and types of clips included
   - Editing pace and transitions
   - Common theme or connection between clips
   - Visual coherence

QUALITY STANDARDS:
- Minimum 4 sentences covering the video's progression
- Be specific about timing (e.g., "opens with..., then transitions to..., ends with...")
- Include precise details about subjects, actions, and scenes
- Describe both visual and audio elements if notable

EXAMPLE OF GOOD DESCRIPTION:
"The video opens with a person in a navy blazer speaking directly to the camera in a well-lit home office with bookshelves in the background. They maintain eye contact with the camera while gesturing occasionally with their hands. The video is shot in 16:9 format with professional lighting. After 5 seconds, the video cuts to a screen recording showing a browser with multiple tabs open, demonstrating a workflow."

EXAMPLE OF BAD DESCRIPTION:
"A video of someone talking and showing their screen."

Respond in this exact JSON format:
{
  "classification": "a-roll|b-roll|animation|screen-recording|montage|other",
  "description": "detailed, factual description of exactly what is visible in the video"
}`;
        }
        else {
            return `Unable to access video content. Based only on filename: "${file.name}"

Provide your best estimate in JSON format:
{
  "classification": "a-roll|b-roll|animation|screen-recording|montage|other",
  "description": "estimation based on filename only (visual content unavailable)"
}`;
        }
    }
    return "";
}
function validateResponse(parsed, hasVisualContent) {
    const issues = [];
    if (!parsed.classification || typeof parsed.classification !== 'string') {
        issues.push('Missing or invalid classification');
    }
    if (!parsed.description || typeof parsed.description !== 'string') {
        issues.push('Missing or invalid description');
    }
    else {
        const description = parsed.description.trim();
        const descriptionLower = description.toLowerCase();
        const wordCount = description.split(/\s+/).length;
        const sentenceCount = description.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        if (hasVisualContent) {
            if (wordCount < 25) {
                issues.push(`Description too short (${wordCount} words, minimum 25 required for visual content)`);
            }
            if (sentenceCount < 3) {
                issues.push(`Description lacks detail (${sentenceCount} sentences, minimum 3 required)`);
            }
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            if (uuidPattern.test(description)) {
                issues.push('Description contains UUID/GUID - should describe visual content, not filename');
            }
            const forbiddenPhrases = [
                'based on filename',
                'unavailable',
                'cannot access',
                'filename',
                'file name',
                'uuid',
                'guid',
                'universally unique identifier',
                'globally unique identifier',
                'machine-generated',
                'naming convention',
                'file format',
                'impossible to determine',
                'contains no descriptive information',
            ];
            const hasForbiddenPhrase = forbiddenPhrases.some(phrase => descriptionLower.includes(phrase));
            if (hasForbiddenPhrase) {
                issues.push('Description discusses filename/metadata instead of visual content');
            }
            const genericPhrases = [
                'an image',
                'a video',
                'a picture',
                'some content',
                'various elements',
            ];
            const isGeneric = genericPhrases.some(phrase => descriptionLower.startsWith(phrase) && description.length < 50);
            if (isGeneric) {
                issues.push('Description is too generic and lacks specific details');
            }
        }
    }
    return {
        isValid: issues.length === 0,
        issues,
    };
}
async function classifyFile(file, apiKey) {
    const modelName = "gemini-2.0-flash-001";
    let downloadSuccess = false;
    let contentType;
    let fileSize;
    let hasVisualContent = false;
    try {
        console.log(`[CLASSIFY] Gemini API Key present: ${!!apiKey}`); // Log presence, not key itself
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const isImage = file.mimeType.startsWith('image/');
        let contentParts = [];
        try {
            const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
            console.log(`[CLASSIFY] Starting classification for: ${file.name} (${file.mimeType})`);
            console.log(`[CLASSIFY] Download URL: ${file.downloadUrl}`); // Log the download URL
            const downloadResult = await downloadFile(file.downloadUrl, file.mimeType, maxSize);
            downloadSuccess = true;
            contentType = downloadResult.contentType;
            fileSize = downloadResult.size;
            console.log(`[CLASSIFY] Download successful: ${fileSize} bytes, content-type: ${contentType}`);
            const base64Data = downloadResult.data.toString('base64');
            console.log(`[CLASSIFY] Base64 encoded successfully: ${base64Data.length} characters (first 100 chars: ${base64Data.substring(0, 100)}...)`);
            contentParts = [
                {
                    text: buildPrompt(file, true),
                },
                {
                    inlineData: {
                        mimeType: file.mimeType,
                        data: base64Data,
                    },
                },
            ];
            hasVisualContent = true;
            console.log(`[CLASSIFY] Using visual content for analysis`);
        }
        catch (downloadError) {
            console.error('[CLASSIFY] Failed to download file content, falling back to filename analysis:', downloadError);
            contentParts = [
                {
                    text: buildPrompt(file, false),
                },
            ];
            console.log(`[CLASSIFY] Using filename-only analysis`);
        }
        console.log(`[CLASSIFY] Calling Gemini API with model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await model.generateContent(contentParts);
        const text = response.response.text();
        console.log(`[CLASSIFY] Raw AI response text: ${text}`); // Log raw text for debugging JSON parse errors
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Invalid response format from AI: No JSON found in response. Raw text: ${text}`);
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const validation = validateResponse(parsed, hasVisualContent);
        if (!validation.isValid) {
            console.warn('[CLASSIFY] Response validation issues:', validation.issues);
            if (hasVisualContent) {
                console.log('[CLASSIFY] Attempting retry with enhanced prompt due to validation failures');
                const retryPrompt = `You are analyzing visual media content displayed to you right now. Your previous response was insufficient.

CRITICAL REQUIREMENTS:
- You MUST describe ONLY what you see in the visual content in front of you
- Minimum 25 words and 3 complete sentences
- Specific, observable details (exact colors, objects, text, people, actions, composition)
- NO generic phrases like "an image of" or "a video showing"
- Do NOT discuss: filenames, file formats, UUIDs, GUIDs, naming conventions, technical metadata, or identifiers
- Do NOT say content is unavailable or inaccessible - you can see it right now

WHAT TO DESCRIBE:
- Exact visual elements you observe (what objects, people, text are visible)
- Specific colors using descriptive terms (e.g., "navy blue", "forest green")
- Composition and layout (placement, alignment, spacing)
- Text content (transcribe any visible text word-for-word)
- Actions, expressions, or movement if present

EXAMPLE OF CORRECT DESCRIPTION:
"A person wearing a dark gray hoodie sits at a wooden desk in a bright room with white walls. They are looking at a laptop screen displaying code with syntax highlighting. To the left, a potted succulent plant sits near a window with natural daylight streaming in."

EXAMPLE OF INCORRECT DESCRIPTION:
"The filename is a UUID which provides no information about the content."

Now provide a detailed, factual description of what you actually see in the visual content.

Respond in this exact JSON format:
{
  "classification": "appropriate category",
  "description": "detailed factual description of exactly what is visible"
}`;
                contentParts[0] = { text: retryPrompt };
                const retryResponse = await genAI.getGenerativeModel({ model: modelName }).generateContent(contentParts);
                const retryText = retryResponse.response.text();
                console.log(`[CLASSIFY] Raw AI retry response text: ${retryText}`);
                const retryJsonMatch = retryText.match(/\{[\s\S]*\}/);
                if (retryJsonMatch) {
                    const retryParsed = JSON.parse(retryJsonMatch[0]);
                    const retryValidation = validateResponse(retryParsed, hasVisualContent);
                    if (retryValidation.isValid || retryValidation.issues.length < validation.issues.length) {
                        console.log('[CLASSIFY] Retry produced better results');
                        return {
                            success: true,
                            id: file.id,
                            classification: retryParsed.classification || undefined,
                            description: retryParsed.description || undefined,
                            diagnostics: {
                                downloadSuccess,
                                contentType,
                                fileSize,
                                usedVisualContent: hasVisualContent,
                                modelUsed: `${modelName} (retry)`,
                            },
                        };
                    }
                }
            }
        }
        return {
            success: true,
            id: file.id,
            classification: parsed.classification || undefined,
            description: parsed.description || undefined,
            diagnostics: {
                downloadSuccess,
                contentType,
                fileSize,
                usedVisualContent: hasVisualContent,
                modelUsed: modelName,
            },
        };
    }
    catch (error) {
        console.error('[CLASSIFY] Classification error:', error);
        // Add specific logging for GoogleGenerativeAI errors
        if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('Error fetching from')) {
            console.error('[CLASSIFY] GoogleGenerativeAI API Error details:', error);
        }
        return {
            success: false,
            id: file.id,
            error: error instanceof Error ? error.message : 'Classification failed',
            diagnostics: {
                downloadSuccess,
                contentType,
                fileSize,
                usedVisualContent: hasVisualContent,
                modelUsed: modelName,
            },
        };
    }
}
exports.classifyAsset = functions.https.onRequest(async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
        res.status(200).send();
        return;
    }
    try {
        const file = req.body;
        if (!file.id || !file.name || !file.mimeType || !file.downloadUrl) {
            res.status(400).json({ error: 'Missing required file metadata' });
            return;
        }
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            res.status(503).json({ error: 'AI service not configured' });
            return;
        }
        const result = await classifyFile(file, geminiApiKey);
        res.status(result.success ? 200 : 500).json(result);
    }
    catch (error) {
        console.error('Error in classify-asset function:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});
//# sourceMappingURL=classifyAsset.js.map