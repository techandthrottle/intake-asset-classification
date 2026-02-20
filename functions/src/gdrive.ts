
export interface GDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
}

/** Extracts the ID and type from any GDrive URL format */
export function extractDriveId(url: string) {
  if (!url) return null;
  url = url.trim();

  // /folders/ID
  let m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return { id: m[1], type: 'folder' as const };

  // /d/ID/ (standard share link)
  m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { id: m[1], type: 'file' as const };

  // ?id=ID (direct download link)
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return { id: m[1], type: 'file' as const };

  return null;
}

/** Lists all files in a GDrive folder using API Key */
export async function listFolderFiles(
  folderId: string
): Promise<GDriveFile[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_API_KEY environment variable not set.');
  }

  const params = new URLSearchParams({
    q: `'${folderId}' in parents`,
    key: key!,
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',
    pageSize: '1000',
  });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'Drive API error');
  }

  const data = await res.json();
  return data.files || [];
}
