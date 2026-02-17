import * as functions from 'firebase-functions';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractedFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  downloadUrl: string;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webContentLink?: string;
}

interface GoogleDriveResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

function detectGoogleDriveUrl(url: string): { type: 'folder' | 'file' | null; id: string | null } {
  try {
    const urlObj = new URL(url);

    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) {
      return { type: 'folder', id: folderMatch[1] };
    }

    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) {
      return { type: 'file', id: fileMatch[1] };
    }

    if (urlObj.searchParams.has('id')) {
      const id = urlObj.searchParams.get('id');
      if (id) {
        return { type: 'folder', id };
      }
    }

    return { type: null, id: null };
  } catch {
    return { type: null, id: null };
  }
}

async function fetchFilesFromFolder(
  folderId: string,
  apiKey: string,
  visitedFolders: Set<string> = new Set(),
  depth: number = 0
): Promise<ExtractedFile[]> {
  const MAX_DEPTH = 10;
  const files: ExtractedFile[] = [];

  if (depth > MAX_DEPTH || visitedFolders.has(folderId)) {
    return files;
  }

  visitedFolders.add(folderId);

  let pageToken: string | undefined;

  do {
    const queryParams = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,thumbnailLink,webContentLink),nextPageToken',
      pageSize: '100',
    });

    if (pageToken) {
      queryParams.set('pageToken', pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Drive API error: ${response.status} - ${error}`);
    }

    const data: GoogleDriveResponse = await response.json();

    for (const file of data.files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subfolderFiles = await fetchFilesFromFolder(
          file.id,
          apiKey,
          visitedFolders,
          depth + 1
        );
        files.push(...subfolderFiles);
      } else if (
        file.mimeType.startsWith('image/') ||
        file.mimeType.startsWith('video/')
      ) {
        const downloadUrl = file.webContentLink ||
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;

        files.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size || '0',
          thumbnailLink: file.thumbnailLink,
          downloadUrl,
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function fetchSingleFile(fileId: string, apiKey: string): Promise<ExtractedFile[]> {
  const queryParams = new URLSearchParams({
    key: apiKey,
    fields: 'id,name,mimeType,size,thumbnailLink,webContentLink',
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Drive API error: ${response.status} - ${error}`);
  }

  const file: GoogleDriveFile = await response.json();

  if (!file.mimeType.startsWith('image/') && !file.mimeType.startsWith('video/')) {
    return [];
  }

  const downloadUrl = file.webContentLink ||
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;

  return [{
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size || '0',
    thumbnailLink: file.thumbnailLink,
    downloadUrl,
  }];
}

export const processGoogleDrive = functions.https.onRequest(async (req, res) => {
  res.set(corsHeaders);

  if (req.method === "OPTIONS") {
    res.status(200).send();
    return;
  }

  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;

    if (!googleApiKey) {
      throw new Error('Missing Google API key configuration');
    }

    const { type, id } = detectGoogleDriveUrl(url);

    if (!type || !id) {
      res.status(400).json({ error: 'Not a valid Google Drive URL' });
      return;
    }

    let extractedFiles: ExtractedFile[] = [];

    if (type === 'folder') {
      extractedFiles = await fetchFilesFromFolder(id, googleApiKey);
    } else {
      extractedFiles = await fetchSingleFile(id, googleApiKey);
    }

    res.status(200).json({
      success: true,
      filesCount: extractedFiles.length,
      files: extractedFiles,
    });

  } catch (error) {
    console.error('Error processing Google Drive URL:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    res.status(500).json({ error: errorMessage });
  }
});
