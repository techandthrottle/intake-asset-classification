// functions/src/downloadZip.ts
import { onRequest } from 'firebase-functions/v2/https';
import archiver from 'archiver';
import { downloadGDriveFile } from './gdrive-download'; // Assuming it's in the same directory or accessible via path

export interface DownloadPayload {
  files: Array<{ id: string; name: string; mimeType: string }>;
}

export const downloadZip = onRequest(
  {
    timeoutSeconds: 300,
    memory: '1GiB', // Adjust memory as needed for large zips
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { files }: DownloadPayload = req.body;

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files selected' });
      return;
    }

    // Set headers for ZIP download
    const fileName = `gdrive_export_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });

    // Handle archive errors
    archive.on('error', (err: Error) => {
      console.error('[ZIP] Archive error:', err);
      res.status(500).send({ error: `Archive error: ${err.message}` });
    });

    // Pipe the archive to the response
    archive.pipe(res);

    const seenNames = new Map<string, number>();

    for (const file of files) {
      try {
        console.log(`[ZIP] Downloading: ${file.name}`);
        const result = await downloadGDriveFile(file.id, file.name);

        // Handle duplicate filenames in ZIP
        const safeName = deduplicateName(file.name, seenNames);

        archive.append(result.buffer, { name: sanitize(safeName) });
        console.log(`[ZIP] ✓ Appended: ${safeName}`);

      } catch (err: any) {
        console.error(`[ZIP] ✗ Failed: ${file.name} — ${err.message}`);
        // Append a .txt error note instead of silently skipping
        archive.append(
          `Failed to download: ${file.name}
Error: ${err.message}`,
          { name: `_errors/${sanitize(file.name)}.txt` }
        );
      }

      // Throttle to avoid GDrive rate limits
      await sleep(300);
    }

    // Finalize the archive (this is where the ZIP is actually written to the response)
    await archive.finalize();
  });

// ── Utilities ────────────────────────────────────────
function sanitize(name: string): string {
  return name.replace(/[/\?%*:|"<>]/g, '_').substring(0, 100);
}

function deduplicateName(name: string, seen: Map<string, number>): string {
  if (!seen.has(name)) { seen.set(name, 0); return name; }
  const count = seen.get(name)! + 1;
  seen.set(name, count);
  const dot = name.lastIndexOf('.');
  return dot > -1
    ? `${name.slice(0, dot)}_${count}${name.slice(dot)}`
    : `${name}_${count}`;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
