import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { extractDriveId, listFolderFiles } from './gdrive';

export const listFolder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { url } = request.data as { url?: string };

  if (!url) {
    throw new HttpsError(
      'invalid-argument',
      'The "url" parameter is required.'
    );
  }

  const parsed = extractDriveId(url);
  if (!parsed || parsed.type !== 'folder') {
    throw new HttpsError(
      'invalid-argument',
      'Invalid or non-folder GDrive URL'
    );
  }

  try {
    const files = await listFolderFiles(parsed.id);
    return { files };
  } catch (err: any) {
    throw new HttpsError(
      'internal',
      err.message || 'Error listing folder files.'
    );
  }
});
