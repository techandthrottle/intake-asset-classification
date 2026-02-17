import { ExtractedFile } from './supabase';

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

export async function classifyAsset(
  file: ExtractedFile,
  firebaseProjectId: string,
  firebaseRegion: string
): Promise<ClassifyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const apiUrl = `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/classifyAsset`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink,
        downloadUrl: file.downloadUrl,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        id: file.id,
        error: result.error || 'Classification failed',
        diagnostics: result.diagnostics,
      };
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        id: file.id,
        error: 'Classification timeout',
      };
    }

    return {
      success: false,
      id: file.id,
      error: error instanceof Error ? error.message : 'Classification failed',
    };
  }
}

export async function classifyAssetWithRetry(
  file: ExtractedFile,
  firebaseProjectId: string,
  firebaseRegion: string,
  maxRetries: number = 3
): Promise<ClassifyResponse> {
  let lastError: string | undefined;

  let lastResult: ClassifyResponse | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await classifyAsset(file, firebaseProjectId, firebaseRegion);
    lastResult = result;

    if (result.success) {
      return result;
    }

    lastError = result.error;

    if (result.error?.includes('not configured') ||
        result.error?.includes('401') ||
        result.error?.includes('authentication') ||
        result.error?.includes('HTML')) {
      break;
    }
  }

  return {
    success: false,
    id: file.id,
    error: lastError || 'Classification failed after retries',
    diagnostics: lastResult?.diagnostics,
  };
}
