**GDrive Bulk Downloader**

*Next.js \+ Node.js — Full Implementation Guide*

**Covers:** Virus scan bypass (UUID extraction)  •  Bulk ZIP download  •  Next.js API Routes  •  Progress tracking  •  React hooks

# **The Two Problems You Need to Solve**

## **Problem 1 — Google Drive Virus Scan Page (\>100MB)**

When a file exceeds \~100MB, Google does not serve it directly. Instead it returns an HTML page asking the user to confirm the download. This page contains a hidden form field called uuid that is generated per-session. Simply appending \&confirm=t to the URL no longer works reliably — Google now requires that uuid value to be submitted in a second request.

 

*The fix: Your backend makes 2 HTTP requests per large file. Request 1 fetches the HTML page and extracts the uuid. Request 2 re-submits with that uuid and receives the actual file bytes.*

 

## **Problem 2 — Bulk ZIP Download**

Browsers block direct fetch() calls to Google Drive due to CORS policy — Google does not set the Access-Control-Allow-Origin header needed for cross-origin requests. This means your React frontend cannot download GDrive files directly.

 

*The fix: Your Next.js API Route acts as a server-side proxy. The frontend POSTs a list of file IDs to your API route. The route downloads each file server-side (no CORS restriction), pipes them all into a ZIP using archiver, and streams the ZIP back to the browser.*

# **Architecture Overview**

Here is the complete flow for your Next.js app:

 

| 1 | Frontend (React) — User pastes GDrive folder URL or uploads Excel. Extract File IDs from links. |
| :---: | :---- |
| **2** | **Frontend → GDrive API —** Call Google Drive API with your GOOGLE\_API\_KEY to list files \+ get metadata (name, mimeType, size). |
| **3** | **Frontend (React) —** Render file list in table. User applies column filters. User checks rows to select. |
| **4** | **Frontend → API Route —** User clicks 'Download ZIP'. Frontend POSTs selected file IDs to /api/download-zip. |
| **5** | **API Route (server-side) —** Loop through file IDs. For each file, make first request to Google Drive download URL. |
| **6** | **API Route — UUID Check —** If response is HTML (virus scan page): regex-extract uuid from HTML body. Make second request with uuid. Receive actual file bytes. |
| **7** | **API Route — ZIP —** Pipe each file buffer into archiver ZIP stream. After all files are appended, finalize the archive. |
| **8** | **API Route → Browser —** Stream ZIP back as response with Content-Type: application/zip. Browser auto-downloads. |

 

*Never try to download GDrive files directly from your React components. CORS will block it every time. All downloading must go through your Next.js API Route (server-side).*

# **Recommended File Structure**

Add these files to your existing Next.js project:

 

  your-nextjs-app/  
  ├── app/  (or pages/ if using Pages Router)  
  │   └── api/  
  │       └── download-zip/  
  │           └── route.ts          ← ZIP streaming endpoint  
  ├── lib/  
  │   ├── gdrive.ts                 ← GDrive API \+ file listing  
  │   ├── gdrive-download.ts        ← UUID bypass download logic  
  │   ├── classify.ts               ← Asset type classification  
  │   └── filters.ts                ← Filter/search logic  
  └── components/  
      ├── FileTable.tsx             ← Table with checkboxes \+ filters  
      └── DownloadButton.tsx        ← Trigger ZIP \+ show progress  
 

# **Installation**

  **\# Terminal — install backend dependencies**  
  npm install archiver axios  
  npm install \-D @types/archiver  
 

 

*axios is used on the server-side only for its superior redirect \+ cookie handling compared to native fetch. archiver handles ZIP creation and streaming.*

# **Environment Variables**

  **.env.local**  
  \# Used server-side only (safe — never exposed to browser)  
  GOOGLE\_API\_KEY=your\_google\_api\_key\_here  
     
  \# If you need it client-side too (for direct API calls from React)  
  NEXT\_PUBLIC\_GOOGLE\_API\_KEY=your\_google\_api\_key\_here  
 

 

*Only use NEXT\_PUBLIC\_ prefix if you truly need the key in browser code. For server-side API routes, use GOOGLE\_API\_KEY (no prefix) to keep it private.*

# **lib/gdrive.ts — File Listing**

This handles extracting the folder ID from any GDrive URL format, and listing all files inside using the Drive API:

 

  **// lib/gdrive.ts**  
  export interface GDriveFile {  
    id: string;  
    name: string;  
    mimeType: string;  
    size: string;  
    createdTime: string;  
    modifiedTime: string;  
  }  
     
  /\*\* Extracts the ID and type from any GDrive URL format \*/  
  export function extractDriveId(url: string) {  
    if (\!url) return null;  
    url \= url.trim();  
     
    // /folders/ID  
    let m \= url.match(/\\/folders\\/(\[a-zA-Z0-9\_-\]+)/);  
    if (m) return { id: m\[1\], type: 'folder' as const };  
     
    // /d/ID/ (standard share link)  
    m \= url.match(/\\/d\\/(\[a-zA-Z0-9\_-\]+)/);  
    if (m) return { id: m\[1\], type: 'file' as const };  
     
    // ?id=ID (direct download link)  
    m \= url.match(/\[?&\]id=(\[a-zA-Z0-9\_-\]+)/);  
    if (m) return { id: m\[1\], type: 'file' as const };  
     
    return null;  
  }  
     
  /\*\* Lists all files in a GDrive folder using API Key \*/  
  export async function listFolderFiles(  
    folderId: string  
  ): Promise\<GDriveFile\[\]\> {  
    const key \= process.env.GOOGLE\_API\_KEY;  
    const params \= new URLSearchParams({  
      q: \`'${folderId}' in parents\`,  
      key: key\!,  
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',  
      pageSize: '1000',  
    });  
     
    const res \= await fetch(  
      \`https://www.googleapis.com/drive/v3/files?${params}\`  
    );  
     
    if (\!res.ok) {  
      const err \= await res.json();  
      throw new Error(err?.error?.message || 'Drive API error');  
    }  
     
    const data \= await res.json();  
    return data.files || \[\];  
  }  
 

# **lib/gdrive-download.ts — UUID Bypass**

This is the core piece that solves the virus scan problem. It handles both small files (direct binary) and large files (HTML confirmation page → extract UUID → second request):

 

  **// lib/gdrive-download.ts**  
  import axios from 'axios';  
     
  const BASE\_URL \= 'https://drive.usercontent.google.com/download';  
     
  export interface DownloadResult {  
    buffer: Buffer;  
    contentType: string;  
    fileName: string;  
  }  
     
  export async function downloadGDriveFile(  
    fileId: string,  
    fileName: string  
  ): Promise\<DownloadResult\> {  
     
    // Shared axios session — preserves cookies across requests  
    const session \= axios.create({  
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },  
      maxRedirects: 5,  
      timeout: 120\_000, // 2 min timeout for large files  
    });  
     
    // ── Request 1: attempt direct download ─────────────  
    const res1 \= await session.get(BASE\_URL, {  
      params: {  
        id: fileId,  
        export: 'download',  
        authuser: '0',  
        confirm: 't',  
      },  
      responseType: 'arraybuffer',  
    });  
     
    const ct1 \= res1.headers\['content-type'\] || '';  
     
    // ── Small file: got binary directly ─────────────────  
    if (\!ct1.includes('text/html')) {  
      return {  
        buffer: Buffer.from(res1.data),  
        contentType: ct1,  
        fileName,  
      };  
    }  
     
    // ── Large file: got virus scan confirmation HTML ─────  
    const html \= Buffer.from(res1.data).toString('utf-8');  
     
    // Extract the uuid hidden field from the confirmation form  
    const uuidMatch \=  
      html.match(/name=\["'\]uuid\["'\]\\s+value=\["'\](\[^"'\]+)\["'\]/) ||  
      html.match(/\["&\]uuid=(\[a-zA-Z0-9\_-\]+)\["&\]/);  
     
    if (\!uuidMatch) {  
      // Fallback: try confirm token (older GDrive format)  
      const confirmMatch \= html.match(/confirm=(\[0-9A-Za-z\_\]+)/);  
      if (\!confirmMatch) {  
        throw new Error(  
          \`Cannot extract download token for file: ${fileName} (${fileId})\`  
        );  
      }  
    }  
     
    const uuid \= uuidMatch\!\[1\];  
    console.log(\`\[GDrive\] Large file detected. UUID: ${uuid} — ${fileName}\`);  
     
    // ── Request 2: submit with uuid to get real file ─────  
    const res2 \= await session.get(BASE\_URL, {  
      params: {  
        id: fileId,  
        export: 'download',  
        authuser: '0',  
        confirm: 't',  
        uuid,  
      },  
      responseType: 'arraybuffer',  
    });  
     
    return {  
      buffer: Buffer.from(res2.data),  
      contentType: res2.headers\['content-type'\] || 'application/octet-stream',  
      fileName,  
    };  
  }  
 

# **app/api/download-zip/route.ts — The ZIP Endpoint**

This is the Next.js App Router API route that receives selected file IDs from your React frontend, downloads each file server-side, and streams a ZIP back:

 

  **// app/api/download-zip/route.ts**  
  import { NextRequest, NextResponse } from 'next/server';  
  import archiver from 'archiver';  
  import { Readable } from 'stream';  
  import { downloadGDriveFile } from '@/lib/gdrive-download';  
     
  export interface DownloadPayload {  
    files: Array\<{ id: string; name: string; mimeType: string }\>;  
  }  
     
  export async function POST(req: NextRequest) {  
    const { files }: DownloadPayload \= await req.json();  
     
    if (\!files || files.length \=== 0\) {  
      return NextResponse.json({ error: 'No files selected' }, { status: 400 });  
    }  
     
    // ── Set up ZIP streaming response ───────────────────  
    const { readable, writable } \= new TransformStream();  
    const writer \= writable.getWriter();  
     
    const archive \= archiver('zip', { zlib: { level: 6 } });  
     
    // Bridge archiver (Node stream) to Web Streams API  
    archive.on('data', (chunk: Buffer) \=\> {  
      writer.write(chunk);  
    });  
    archive.on('end', () \=\> writer.close());  
    archive.on('error', (err: Error) \=\> {  
      console.error('\[ZIP\] Archive error:', err);  
      writer.abort(err);  
    });  
     
    // ── Start downloading files in background ───────────  
    (async () \=\> {  
      const seenNames \= new Map\<string, number\>();  
     
      for (const file of files) {  
        try {  
          console.log(\`\[ZIP\] Downloading: ${file.name}\`);  
          const result \= await downloadGDriveFile(file.id, file.name);  
     
          // Handle duplicate filenames in ZIP  
          const safeName \= deduplicateName(file.name, seenNames);  
     
          archive.append(result.buffer, { name: sanitize(safeName) });  
          console.log(\`\[ZIP\] ✓ Appended: ${safeName}\`);  
     
        } catch (err: any) {  
          console.error(\`\[ZIP\] ✗ Failed: ${file.name} — ${err.message}\`);  
          // Append a .txt error note instead of silently skipping  
          archive.append(  
            \`Failed to download: ${file.name}\\nError: ${err.message}\`,  
            { name: \`\_errors/${sanitize(file.name)}.txt\` }  
          );  
        }  
     
        // Throttle to avoid GDrive rate limits  
        await sleep(300);  
      }  
     
      await archive.finalize();  
    })();  
     
    const fileName \= \`gdrive\_export\_${Date.now()}.zip\`;  
     
    return new NextResponse(readable, {  
      headers: {  
        'Content-Type': 'application/zip',  
        'Content-Disposition': \`attachment; filename="${fileName}"\`,  
      },  
    });  
  }  
     
  // ── Utilities ────────────────────────────────────────  
  function sanitize(name: string): string {  
    return name.replace(/\[\\/\\\\?%\*:|"\<\>\]/g, '\_').substring(0, 100);  
  }  
     
  function deduplicateName(name: string, seen: Map\<string, number\>): string {  
    if (\!seen.has(name)) { seen.set(name, 0); return name; }  
    const count \= seen.get(name)\! \+ 1;  
    seen.set(name, count);  
    const dot \= name.lastIndexOf('.');  
    return dot \> \-1  
      ? \`${name.slice(0, dot)}\_${count}${name.slice(dot)}\`  
      : \`${name}\_${count}\`;  
  }  
     
  function sleep(ms: number) { return new Promise(r \=\> setTimeout(r, ms)); }  
 

# **app/api/list-folder/route.ts — Folder Listing**

A separate API route to list folder contents server-side (keeps your API key off the client if you prefer):

 

  **// app/api/list-folder/route.ts**  
  import { NextRequest, NextResponse } from 'next/server';  
  import { listFolderFiles, extractDriveId } from '@/lib/gdrive';  
     
  export async function POST(req: NextRequest) {  
    const { url } \= await req.json();  
     
    const parsed \= extractDriveId(url);  
    if (\!parsed || parsed.type \!== 'folder') {  
      return NextResponse.json(  
        { error: 'Invalid or non-folder GDrive URL' },  
        { status: 400 }  
      );  
    }  
     
    try {  
      const files \= await listFolderFiles(parsed.id);  
      return NextResponse.json({ files });  
    } catch (err: any) {  
      return NextResponse.json({ error: err.message }, { status: 500 });  
    }  
  }  
 

# **lib/classify.ts — Asset Classification**

Classify files by their mimeType from the Drive API. This is more reliable than guessing from the filename extension:

 

  **// lib/classify.ts**  
  export type AssetType \=  
    | 'VIDEO' | 'IMAGE' | 'AUDIO'  
    | 'DOCUMENT' | 'SPREADSHEET' | 'FOLDER' | 'UNKNOWN';  
     
  const MIME\_MAP: Record\<string, AssetType\> \= {  
    // Video  
    'video/mp4': 'VIDEO', 'video/quicktime': 'VIDEO',  
    'video/x-msvideo': 'VIDEO', 'video/x-matroska': 'VIDEO',  
    // Image  
    'image/jpeg': 'IMAGE', 'image/png': 'IMAGE',  
    'image/gif': 'IMAGE', 'image/webp': 'IMAGE', 'image/svg+xml': 'IMAGE',  
    // Audio  
    'audio/mpeg': 'AUDIO', 'audio/wav': 'AUDIO', 'audio/aac': 'AUDIO',  
    // Documents  
    'application/pdf': 'DOCUMENT',  
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',  
    'application/vnd.google-apps.document': 'DOCUMENT',  
    // Spreadsheets  
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'SPREADSHEET',  
    'application/vnd.google-apps.spreadsheet': 'SPREADSHEET',  
    // Folder  
    'application/vnd.google-apps.folder': 'FOLDER',  
  };  
     
  const EXT\_MAP: Record\<string, AssetType\> \= {  
    mp4: 'VIDEO', mov: 'VIDEO', avi: 'VIDEO', mkv: 'VIDEO', webm: 'VIDEO',  
    jpg: 'IMAGE', jpeg: 'IMAGE', png: 'IMAGE', gif: 'IMAGE', webp: 'IMAGE',  
    mp3: 'AUDIO', wav: 'AUDIO', aac: 'AUDIO', ogg: 'AUDIO',  
    pdf: 'DOCUMENT', doc: 'DOCUMENT', docx: 'DOCUMENT',  
    xls: 'SPREADSHEET', xlsx: 'SPREADSHEET', csv: 'SPREADSHEET',  
  };  
     
  export function classifyAsset(  
    mimeType \= '',  
    fileName \= ''  
  ): AssetType {  
    if (MIME\_MAP\[mimeType\]) return MIME\_MAP\[mimeType\];  
     
    // Partial match for subtypes  
    if (mimeType.startsWith('video/'))  return 'VIDEO';  
    if (mimeType.startsWith('image/'))  return 'IMAGE';  
    if (mimeType.startsWith('audio/'))  return 'AUDIO';  
     
    // Fallback: extension  
    const ext \= fileName.split('.').pop()?.toLowerCase() || '';  
    return EXT\_MAP\[ext\] || 'UNKNOWN';  
  }  
 

# **lib/filters.ts — Filter Logic**

 

  **// lib/filters.ts**  
  import type { GDriveFile } from './gdrive';  
     
  export interface Filter {  
    field: keyof GDriveFile | string;  
    op: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'notEmpty' | 'gt' | 'lt';  
    value: string;  
  }  
     
  export function applyFilters(  
    files: GDriveFile\[\],  
    filters: Filter\[\]  
  ): GDriveFile\[\] {  
    return files.filter(file \=\>  
      filters.every(({ field, op, value }) \=\> {  
        const raw  \= String((file as any)\[field\] ?? '');  
        const cell \= raw.toLowerCase();  
        const val  \= value.toLowerCase();  
     
        switch (op) {  
          case 'contains':   return cell.includes(val);  
          case 'equals':     return cell \=== val;  
          case 'startsWith': return cell.startsWith(val);  
          case 'endsWith':   return cell.endsWith(val);  
          case 'notEmpty':   return cell.length \> 0;  
          case 'gt':         return Number(raw) \> Number(value);  
          case 'lt':         return Number(raw) \< Number(value);  
          default:           return true;  
        }  
      })  
    );  
  }  
 

# **React Hook — useBulkDownload**

A clean React hook that your components can call to trigger the ZIP download and track progress:

 

  **// hooks/useBulkDownload.ts**  
  'use client';  
  import { useState, useCallback } from 'react';  
  import type { GDriveFile } from '@/lib/gdrive';  
     
  export interface DownloadState {  
    status: 'idle' | 'downloading' | 'done' | 'error';  
    progress: number;   // 0–100  
    message: string;  
    error?: string;  
  }  
     
  export function useBulkDownload() {  
    const \[state, setState\] \= useState\<DownloadState\>({  
      status: 'idle',  
      progress: 0,  
      message: '',  
    });  
     
    const download \= useCallback(async (selectedFiles: GDriveFile\[\]) \=\> {  
      if (selectedFiles.length \=== 0\) return;  
     
      setState({ status: 'downloading', progress: 5, message: 'Starting download...' });  
     
      try {  
        setState(s \=\> ({ ...s, progress: 10, message: \`Sending ${selectedFiles.length} files to server...\` }));  
     
        const response \= await fetch('/api/download-zip', {  
          method: 'POST',  
          headers: { 'Content-Type': 'application/json' },  
          body: JSON.stringify({  
            files: selectedFiles.map(f \=\> ({  
              id: f.id,  
              name: f.name,  
              mimeType: f.mimeType,  
            })),  
          }),  
        });  
     
        if (\!response.ok) {  
          const err \= await response.json();  
          throw new Error(err.error || 'Server error');  
        }  
     
        setState(s \=\> ({ ...s, progress: 50, message: 'Packaging ZIP...' }));  
     
        // Stream response into blob  
        const blob \= await response.blob();  
     
        setState(s \=\> ({ ...s, progress: 90, message: 'Preparing download...' }));  
     
        // Trigger browser download  
        const url \= URL.createObjectURL(blob);  
        const a   \= document.createElement('a');  
        a.href     \= url;  
        a.download \= \`gdrive\_export\_${Date.now()}.zip\`;  
        document.body.appendChild(a);  
        a.click();  
        document.body.removeChild(a);  
        URL.revokeObjectURL(url);  
     
        setState({ status: 'done', progress: 100, message: \`Downloaded ${selectedFiles.length} files successfully\!\` });  
     
      } catch (err: any) {  
        setState({ status: 'error', progress: 0, message: '', error: err.message });  
      }  
    }, \[\]);  
     
    const reset \= useCallback(() \=\> {  
      setState({ status: 'idle', progress: 0, message: '' });  
    }, \[\]);  
     
    return { ...state, download, reset };  
  }  
 

# **Component Usage Example**

How to wire everything together in your existing page or component:

 

  **// app/page.tsx (or your existing page component)**  
  'use client';  
  import { useState } from 'react';  
  import { extractDriveId, type GDriveFile } from '@/lib/gdrive';  
  import { classifyAsset } from '@/lib/classify';  
  import { applyFilters, type Filter } from '@/lib/filters';  
  import { useBulkDownload } from '@/hooks/useBulkDownload';  
     
  export default function DownloaderPage() {  
    const \[url, setUrl\]               \= useState('');  
    const \[allFiles, setAllFiles\]     \= useState\<GDriveFile\[\]\>(\[\]);  
    const \[filters, setFilters\]       \= useState\<Filter\[\]\>(\[\]);  
    const \[selected, setSelected\]     \= useState\<Set\<string\>\>(new Set());  
    const { download, status, progress, message, error, reset } \= useBulkDownload();  
     
    const filteredFiles \= applyFilters(allFiles, filters);  
    const selectedFiles \= filteredFiles.filter(f \=\> selected.has(f.id));  
     
    // Load folder from URL  
    async function loadFolder() {  
      const res \= await fetch('/api/list-folder', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({ url }),  
      });  
      const data \= await res.json();  
      setAllFiles(data.files || \[\]);  
      setSelected(new Set());  
    }  
     
    function toggleSelect(id: string) {  
      setSelected(prev \=\> {  
        const next \= new Set(prev);  
        next.has(id) ? next.delete(id) : next.add(id);  
        return next;  
      });  
    }  
     
    function selectAll() {  
      setSelected(new Set(filteredFiles.map(f \=\> f.id)));  
    }  
     
    return (  
      \<div\>  
        {/\* URL Input \*/}  
        \<input value={url} onChange={e \=\> setUrl(e.target.value)}  
          placeholder='Paste GDrive folder URL...' /\>  
        \<button onClick={loadFolder}\>Load Files\</button\>  
     
        {/\* File Table \*/}  
        \<button onClick={selectAll}\>Select All\</button\>  
        \<table\>  
          \<thead\>\<tr\>  
            \<th\>✓\</th\>\<th\>Name\</th\>\<th\>Type\</th\>\<th\>Size\</th\>  
          \</tr\>\</thead\>  
          \<tbody\>  
            {filteredFiles.map(file \=\> (  
              \<tr key={file.id}\>  
                \<td\>\<input type='checkbox'  
                  checked={selected.has(file.id)}  
                  onChange={() \=\> toggleSelect(file.id)} /\>\</td\>  
                \<td\>{file.name}\</td\>  
                \<td\>{classifyAsset(file.mimeType, file.name)}\</td\>  
                \<td\>{(Number(file.size) / 1e6).toFixed(1)} MB\</td\>  
              \</tr\>  
            ))}  
          \</tbody\>  
        \</table\>  
     
        {/\* Download Button \*/}  
        \<button  
          disabled={selected.size \=== 0 || status \=== 'downloading'}  
          onClick={() \=\> download(selectedFiles)}\>  
          {status \=== 'downloading'  
            ? \`${progress}% — ${message}\`  
            : \`Download ${selected.size} files as ZIP\`}  
        \</button\>  
     
        {status \=== 'error' && \<p\>Error: {error}\</p\>}  
        {status \=== 'done'  && \<p\>✓ {message} \<button onClick={reset}\>Reset\</button\>\</p\>}  
      \</div\>  
    );  
  }  
 

# **Common Gotchas & Fixes**

 

| Issue | Fix |
| :---- | :---- |
| **UUID pattern not found in HTML** | GDrive occasionally changes the HTML. Add multiple regex patterns as fallbacks: try name="uuid" value="...", then try the URL param \&uuid= pattern. |
| **archiver ZIP is empty** | You must await archive.finalize() only after all appends are done. Calling finalize() too early closes the archive before files are added. |
| **TransformStream bridging error** | If archiver (Node stream) conflicts with Next.js Web Streams, use a PassThrough buffer approach: collect all buffers first, then respond. See note below. |
| **Timeout on very large batches** | Next.js serverless functions have a 10s default timeout. Increase in next.config.js: api: { responseLimit: false, bodyParser: { sizeLimit: '100mb' } } and deploy with longer timeout (e.g. Vercel maxDuration: 300). |
| **Rate limiting (429 from GDrive)** | Increase the sleep() delay between downloads to 500–1000ms. For huge batches (50+ files), consider a queue with concurrency limiting. |
| **Files from Excel links** | Parse the Excel client-side with SheetJS (xlsx package), extract the link column, then pass those URLs through extractDriveId() before sending to the API. |
| **Folder links in the column** | Folder IDs return metadata, not downloadable content. Detect them with mimeType \=== 'application/vnd.google-apps.folder' and either skip or recursively list them. |

 

*ALTERNATIVE for TransformStream issues: Instead of streaming, collect all file buffers in memory first, then call archiver.finalize() and convert to a Buffer, and return it as a NextResponse with the zip content-type. This is simpler but uses more server memory for large batches.*

# **next.config.js — Required Settings**

 

  **// next.config.js**  
  /\*\* @type {import('next').NextConfig} \*/  
  const nextConfig \= {  
    api: {  
      // Disable body size limit for ZIP streaming  
      responseLimit: false,  
      bodyParser: {  
        sizeLimit: '10mb', // Increase if sending many file IDs  
      },  
    },  
    // If using App Router, this goes in route config instead:  
    // export const maxDuration \= 300; // in the route.ts file  
  };  
     
  module.exports \= nextConfig;  
 

 

  **// Add to the top of app/api/download-zip/route.ts for Vercel**  
  // Increase serverless function timeout (Vercel Pro: up to 300s)  
  export const maxDuration \= 300;  
  export const dynamic \= 'force-dynamic';  
 

# **Integration Checklist**

 

* **Install packages:** npm install archiver axios && npm install \-D @types/archiver

* **Add GOOGLE\_API\_KEY** to .env.local (no NEXT\_PUBLIC\_ prefix needed for server routes)

* **Create lib/gdrive.ts** — extractDriveId() \+ listFolderFiles()

* **Create lib/gdrive-download.ts** — the 2-request UUID bypass function

* **Create app/api/download-zip/route.ts** — ZIP streaming endpoint

* **Create app/api/list-folder/route.ts** — folder listing endpoint

* **Create lib/classify.ts** — asset type classification

* **Create hooks/useBulkDownload.ts** — React hook for your components

* **Wire up your component** using the hook's download(), status, progress, message

* **Set maxDuration \= 300** in your route.ts if deploying to Vercel

 

*Start by testing the UUID bypass in isolation: create a simple test script that calls downloadGDriveFile() with one of your \>100MB video file IDs and logs the result. Once that works, the ZIP endpoint will work automatically.*

 

*— End of Guide —*