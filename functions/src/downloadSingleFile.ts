// functions/src/downloadSingleFile.ts
import { onRequest } from 'firebase-functions/v2/https';
import axios from 'axios';

const BASE_URL = 'https://drive.usercontent.google.com/download';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Proxies a single Google Drive file download to allow CORS and streaming.
 * This supports client-side zipping.
 */
export const downloadSingleFile = onRequest(
  {
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (req, res) => {
    res.set(corsHeaders);
    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }

    const { id, name } = req.query;

    if (!id) {
      res.status(400).send('Missing file ID');
      return;
    }

    try {
      console.log(`[PROXY] Streaming download for: ${name || id}`);
      
      const session = axios.create({
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        maxRedirects: 5,
        timeout: 120_000,
      });

      // Request 1: check for virus scan
      const res1 = await session.get(BASE_URL, {
        params: { id, export: 'download', authuser: '0', confirm: 't' },
        responseType: 'stream',
      });

      const contentType = res1.headers['content-type'] || '';

      if (!contentType.includes('text/html')) {
        // Direct stream
        res.setHeader('Content-Type', contentType);
        if (name) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res1.data.pipe(res);
        return;
      }

      // Handle virus scan page
      const chunks: any[] = [];
      for await (const chunk of res1.data) {
        chunks.push(chunk);
      }
      const html = Buffer.concat(chunks).toString('utf-8');

      const uuidMatch =
        html.match(/name=["']uuid["']\s+value=["']([^"']+)["']/) ||
        html.match(/[&]uuid=([a-zA-Z0-9_-]+)[&]/);

      let uuid: string | undefined;
      if (uuidMatch) {
        uuid = uuidMatch[1];
      } else {
        const confirmMatch = html.match(/confirm=([0-9A-Za-z_]+)/);
        if (confirmMatch) uuid = confirmMatch[1];
      }

      if (!uuid) {
        throw new Error(`Cannot bypass virus scan for ${name || id}`);
      }

      // Request 2: with UUID
      const res2 = await session.get(BASE_URL, {
        params: { id, export: 'download', authuser: '0', confirm: 't', uuid },
        responseType: 'stream',
      });

      res.setHeader('Content-Type', res2.headers['content-type'] || 'application/octet-stream');
      if (name) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res2.data.pipe(res);

    } catch (error: any) {
      console.error('[PROXY] Error:', error.message);
      res.status(500).send(error.message);
    }
  }
);
