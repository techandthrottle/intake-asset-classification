import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI } from "npm:@google/genai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ClassifyRequest {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  downloadUrl: string;
}

interface ClassifyResponse {
  success: boolean;
  id: string;
  classification?: string;
  description?: string;
  error?: string;
  diagnostics?: {
    downloadSuccess: boolean;
    contentType?: string;
    fileSize?: number;
    usedVisualContent: boolean;
    modelUsed: string;
  };
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

interface DownloadResult {
  data: Uint8Array;
  contentType: string;
  size: number;
}

async function downloadFile(url: string, expectedMimeType: string, maxSize: number): Promise<DownloadResult> {
  console.log(`[DOWNLOAD] Starting download from: ${url}`);
  console.log(`[DOWNLOAD] Expected MIME type: ${expectedMimeType}`);

  const response = await fetch(url);

  console.log(`[DOWNLOAD] Response status: ${response.status}`);
  console.log(`[DOWNLOAD] Response headers:`, Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
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
    console.warn(`[DOWNLOAD] Warning: File is very small (${size} bytes), might be an error page`);
  }

  const isMediaType = contentType.startsWith('image/') ||
                      contentType.startsWith('video/') ||
                      contentType.includes('octet-stream');

  if (contentType.includes('text/html') || contentType.includes('text/plain')) {
    throw new Error(`Received HTML/text content instead of media file (content-type: ${contentType}). This usually indicates an authentication error or error page.`);
  }

  if (!isMediaType && contentType !== '') {
    console.warn(`[DOWNLOAD] Warning: Unexpected content-type "${contentType}", expected media type`);
  }

  const data = new Uint8Array(arrayBuffer);

  const previewBytes = data.slice(0, 20);
  console.log(`[DOWNLOAD] First 20 bytes: ${Array.from(previewBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

  const textDecoder = new TextDecoder('utf-8');
  const previewText = textDecoder.decode(data.slice(0, 100));
  if (previewText.toLowerCase().includes('<!doctype') ||
      previewText.toLowerCase().includes('<html') ||
      previewText.toLowerCase().includes('<head')) {
    throw new Error('Downloaded content appears to be HTML instead of media file. This indicates an authentication or access error.');
  }

  return { data, contentType, size };
}

function buildPrompt(file: ClassifyRequest, hasVisualContent: boolean): string {
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
    } else {
      return `Unable to access image content. Based only on filename: "${file.name}"

Provide your best estimate in JSON format:
{
  "classification": "a-roll|screenshot|logo|photo|graphic|diagram|text|other",
  "description": "estimation based on filename only (visual content unavailable)"
}`;
    }
  } else if (isVideo) {
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
    } else {
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

function validateResponse(parsed: any, hasVisualContent: boolean): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!parsed.classification || typeof parsed.classification !== 'string') {
    issues.push('Missing or invalid classification');
  }

  if (!parsed.description || typeof parsed.description !== 'string') {
    issues.push('Missing or invalid description');
  } else {
    const description = parsed.description.trim();
    const descriptionLower = description.toLowerCase();
    const wordCount = description.split(/\s+/).length;
    const sentenceCount = description.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

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

      const isGeneric = genericPhrases.some(phrase =>
        descriptionLower.startsWith(phrase) && description.length < 50
      );

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

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const chunkSize = 65536;
  let binary = '';

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function classifyFile(file: ClassifyRequest, apiKey: string): Promise<ClassifyResponse> {
  const modelName = "gemini-2.5-pro";
  let downloadSuccess = false;
  let contentType: string | undefined;
  let fileSize: number | undefined;
  let hasVisualContent = false;

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const isImage = file.mimeType.startsWith('image/');
    const isVideo = file.mimeType.startsWith('video/');

    let contentParts: any[] = [];

    try {
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
      console.log(`[CLASSIFY] Starting classification for: ${file.name} (${file.mimeType})`);

      const downloadResult = await downloadFile(file.downloadUrl, file.mimeType, maxSize);
      downloadSuccess = true;
      contentType = downloadResult.contentType;
      fileSize = downloadResult.size;

      console.log(`[CLASSIFY] Download successful: ${fileSize} bytes, content-type: ${contentType}`);

      let base64Data: string;
      try {
        base64Data = uint8ArrayToBase64(downloadResult.data);
        console.log(`[CLASSIFY] Base64 encoded successfully: ${base64Data.length} characters`);
      } catch (encodingError) {
        console.error('[CLASSIFY] Base64 encoding failed:', encodingError);
        throw new Error(`Failed to encode file content: ${encodingError instanceof Error ? encodingError.message : 'Unknown encoding error'}`);
      }

      contentParts = [
        {
          inlineData: {
            mimeType: file.mimeType,
            data: base64Data,
          },
        },
        {
          text: buildPrompt(file, true),
        },
      ];

      hasVisualContent = true;
      console.log(`[CLASSIFY] Using visual content for analysis`);
    } catch (downloadError) {
      console.error('[CLASSIFY] Failed to download file content, falling back to filename analysis:', downloadError);
      contentParts = [
        {
          text: buildPrompt(file, false),
        },
      ];
      console.log(`[CLASSIFY] Using filename-only analysis`);
    }

    console.log(`[CLASSIFY] Calling Gemini API with model: ${modelName}`);
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: contentParts,
    });

    const text = response.text;
    console.log(`[CLASSIFY] AI response received: ${text.substring(0, 200)}...`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validation = validateResponse(parsed, hasVisualContent);
    if (!validation.isValid) {
      console.warn('[CLASSIFY] Response validation issues:', validation.issues);

      if (hasVisualContent) {
        console.log('[CLASSIFY] Attempting retry with enhanced prompt due to validation failures');
        console.log('[CLASSIFY] Validation issues:', validation.issues);

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

        contentParts[contentParts.length - 1] = { text: retryPrompt };

        const retryResponse = await genAI.models.generateContent({
          model: modelName,
          contents: contentParts,
        });

        const retryText = retryResponse.text;
        const retryJsonMatch = retryText.match(/\{[\s\S]*\}/);

        if (retryJsonMatch) {
          const retryParsed = JSON.parse(retryJsonMatch[0]);
          const retryValidation = validateResponse(retryParsed, hasVisualContent);

          if (retryValidation.isValid || retryValidation.issues.length < validation.issues.length) {
            console.log('[CLASSIFY] Retry produced better results');
            return {
              success: true,
              id: file.id,
              classification: retryParsed.classification || null,
              description: retryParsed.description || null,
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
      classification: parsed.classification || null,
      description: parsed.description || null,
      diagnostics: {
        downloadSuccess,
        contentType,
        fileSize,
        usedVisualContent: hasVisualContent,
        modelUsed: modelName,
      },
    };
  } catch (error) {
    console.error('[CLASSIFY] Classification error:', error);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const file: ClassifyRequest = body;

    if (!file.id || !file.name || !file.mimeType || !file.downloadUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required file metadata' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const result = await classifyFile(file, geminiApiKey);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error in classify-asset function:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
