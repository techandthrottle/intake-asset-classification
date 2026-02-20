// No longer directly importing ExtractedFile as it's not the primary input type for the new flow here.
// import { ExtractedFile } from './supabase';

// Interface matching the ClassificationResult from the backend's classifyAssetFinal
export interface ClassificationResult {
  success: boolean;
  id: string;
  name?: string;
  mimeType?: string;
  classification?: string;
  description?: string;
  error?: string;
  diagnostics?: {
    modelUsed?: string;
    processingMethod?: 'image_direct' | 'video_frames' | 'gcs_registration';
    framesExtracted?: number;
    gcsUri?: string;
  };
}

// Interface for Google Drive file metadata, matching what processGoogleDrive now returns
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string; // size is a string from Drive API, need to convert to number
  thumbnailLink?: string;
  webContentLink?: string;
}

// Interface matching the overall response from processGoogleDrive function (file discovery)
interface ProcessGoogleDriveDiscoveryResponse {
  success: boolean;
  filesDiscovered: number; // Renamed from filesProcessed
  files: GoogleDriveFile[]; // Changed from classificationResults
  message: string;
  error?: string; // Add top-level error for consistency
}

/**
 * Initiates file discovery for a Google Drive URL by calling the `processGoogleDrive` Firebase Function.
 * This function now only discovers files and returns their metadata, it does NOT classify them.
 */
export async function discoverGoogleDriveFiles(
  googleDriveUrl: string,
  firebaseProjectId: string,
  firebaseRegion: string,
  maxRetries: number = 3 // Retries for network issues
): Promise<ProcessGoogleDriveDiscoveryResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minute timeout for discovery

  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log(`[Frontend] Retrying discoverGoogleDriveFiles (attempt ${attempt + 1}/${maxRetries})`);
      }

      const emulatorUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_URL;
      let apiUrl: string;

      if (emulatorUrl) {
        apiUrl = `${emulatorUrl}/${firebaseProjectId}/${firebaseRegion}/processGoogleDrive`;
        console.log(`[Frontend] Using local emulator for processGoogleDrive (discovery): ${apiUrl}`);
      } else {
        apiUrl = `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/processGoogleDrive`;
        console.log(`[Frontend] Using deployed function for processGoogleDrive (discovery): ${apiUrl}`);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: googleDriveUrl }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result: ProcessGoogleDriveDiscoveryResponse = await response.json();

      if (!response.ok || !result.success) {
        lastError = result.message || result.error || 'Failed to discover Google Drive files';
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          console.warn(`[Frontend] Unrecoverable client error ${response.status} for discoverGoogleDriveFiles. Breaking retries.`);
          break;
        }
        if (lastError.includes('auth/access issue')) {
          console.warn(`[Frontend] Google Drive authentication/access issue. Breaking retries.`);
          break;
        }
        continue;
      }

      return result; // Success!

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = 'File discovery timed out';
        console.error(`[Frontend] discoverGoogleDriveFiles timed out after ${timeoutId}ms.`);
        break;
      }
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[Frontend] Network or unexpected error calling discoverGoogleDriveFiles:`, error);
    }
  }

  // If retries exhausted or broke early
  return {
    success: false,
    filesDiscovered: 0,
    files: [],
    message: lastError || 'File discovery failed after multiple retries',
    error: lastError,
  };
}

/**
 * Classifies a single Google Drive asset by calling the `classifyAssetFinal` Firebase Function.
 * This is the "worker" function called by the classification queue.
 */
export async function classifySingleAsset(
  fileMetadata: GoogleDriveFile,
  firebaseProjectId: string,
  firebaseRegion: string,
  maxRetries: number = 3
): Promise<ClassificationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout for processing a single large file

  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log(`[Frontend] Retrying classifySingleAsset (attempt ${attempt + 1}/${maxRetries}) for ${fileMetadata.name}`);
      }

      const emulatorUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_URL;
      let apiUrl: string;

      if (emulatorUrl) {
        apiUrl = `${emulatorUrl}/${firebaseProjectId}/${firebaseRegion}/classifyAssetFinal`;
        console.log(`[Frontend] Using local emulator for classifyAssetFinal: ${apiUrl}`);
      } else {
        apiUrl = `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/classifyAssetFinal`;
        console.log(`[Frontend] Using deployed function for classifyAssetFinal: ${apiUrl}`);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileMetadata), // Send just the metadata
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result: ClassificationResult = await response.json();

      if (!response.ok || !result.success) {
        lastError = result.error || 'Failed to classify asset';
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          console.warn(`[Frontend] Unrecoverable client error ${response.status} for classifyAssetFinal. Breaking retries.`);
          break;
        }
        continue;
      }

      return result; // Success!

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = 'Classification timed out';
        console.error(`[Frontend] classifySingleAsset timed out after ${timeoutId}ms for ${fileMetadata.name}.`);
        break;
      }
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[Frontend] Network or unexpected error calling classifySingleAsset for ${fileMetadata.name}:`, error);
    }
  }

  // If retries exhausted or broke early
  return {
    success: false,
    id: fileMetadata.id,
    name: fileMetadata.name,
    mimeType: fileMetadata.mimeType,
    error: lastError || 'Classification failed after multiple retries',
  };
}

export interface DownloadPayload {
  files: Array<{ id: string; name: string; mimeType: string }>;
}

/**
 * Calls the `downloadZip` Firebase Function to download multiple files as a single ZIP archive.
 */
export async function downloadAsZip(
  payload: DownloadPayload,
  firebaseProjectId: string,
  firebaseRegion: string
): Promise<void> {
  const emulatorUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_URL;
  let apiUrl: string;

  if (emulatorUrl) {
    apiUrl = `${emulatorUrl}/${firebaseProjectId}/${firebaseRegion}/downloadZip`;
  } else {
    apiUrl = `https://${firebaseRegion}-${firebaseProjectId}.cloudfunctions.net/downloadZip`;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download ZIP: ${response.status} ${errorText}`);
  }

  // Handle the streamed response
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', `gdrive_assets_${Date.now()}.zip`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
