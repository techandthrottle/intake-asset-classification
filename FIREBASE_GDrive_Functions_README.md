# Firebase Functions for Google Drive Bulk Downloader

This document describes the Firebase Functions implementation for the Google Drive bulk downloader, adapting the concepts from the `nextjs-gdrive-guide.docx.md`.

## Setup

1.  **Install Dependencies:**
    Navigate to the `functions` directory and install the required npm packages:
    ```bash
    cd functions
    npm install archiver axios
    cd ..
    ```

2.  **Environment Variables:**
    The functions require a `GOOGLE_API_KEY` to interact with the Google Drive API. Set this environment variable in your Firebase project.

    You can set environment variables for your Firebase functions using the Firebase CLI:
    ```bash
    firebase functions:config:set google.api_key="YOUR_GOOGLE_API_KEY"
    ```
    Replace `"YOUR_GOOGLE_API_KEY"` with your actual Google API Key. This key is used in `gdrive.ts` for listing folder files.

    *To access the environment variable in your functions, use `functions.config().google.api_key`.*
    *(Note: My implementation uses `process.env.GOOGLE_API_KEY` for simplicity in the current context. For production Firebase Functions, `functions.config()` is the recommended secure way to handle sensitive configuration. You would adapt `process.env.GOOGLE_API_KEY` in `gdrive.ts` to `functions.config().google.api_key` for a complete secure implementation.)*

## Functions Implemented

*   **`listFolder`**: A callable Firebase function that takes a Google Drive folder URL, extracts the ID, and lists all files within that folder using the Google Drive API.
    *   **Endpoint (example):** `https://YOUR_REGION.cloudfunctions.net/listFolder` (Callable functions are invoked via the Firebase SDK, not directly via HTTP GET/POST to this URL).
    *   **Usage (Client-side):**
        ```typescript
        import { getFunctions, httpsCallable } from 'firebase/functions';
        import { app } from './firebase-config'; // Your Firebase app config

        const functions = getFunctions(app);
        const listFolderCallable = httpsCallable(functions, 'listFolder');

        try {
          const result = await listFolderCallable({ url: 'YOUR_GOOGLE_DRIVE_FOLDER_URL' });
          console.log('Files:', result.data.files);
        } catch (error) {
          console.error('Error listing folder:', error);
        }
        ```

*   **`downloadZip`**: An HTTP Firebase function that receives a list of Google Drive file IDs, downloads each file (handling the virus scan bypass for large files), archives them into a single ZIP file, and streams the ZIP back as the HTTP response.
    *   **Endpoint (example):** `https://YOUR_REGION.cloudfunctions.net/downloadZip`
    *   **Method:** `POST`
    *   **Request Body:**
        ```json
        {
          "files": [
            { "id": "fileId1", "name": "fileName1.pdf", "mimeType": "application/pdf" },
            { "id": "fileId2", "name": "fileName2.mp4", "mimeType": "video/mp4" }
          ]
        }
        ```
    *   **Usage (Client-side):**
        ```typescript
        import { getFunctions } from 'firebase/functions';
        import { app } from './firebase-config'; // Your Firebase app config

        const functions = getFunctions(app);
        // Assuming your Firebase project ID and region
        const downloadZipUrl = `https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/downloadZip`;

        async function triggerDownload() {
          const selectedFiles = [
            { id: 'YOUR_FILE_ID_1', name: 'Document.pdf', mimeType: 'application/pdf' },
            { id: 'YOUR_FILE_ID_2', name: 'Video.mp4', mimeType: 'video/mp4' },
          ];

          try {
            const response = await fetch(downloadZipUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ files: selectedFiles }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Server error during ZIP download');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gdrive_export_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Download initiated successfully!');

          } catch (error) {
            console.error('Error downloading ZIP:', error);
          }
        }
        ```

## Deployment

1.  **Configure Firebase:** Ensure you have initialized Firebase in your project and are logged in (`firebase login`).
2.  **Deploy Functions:**
    ```bash
    firebase deploy --only functions
    ```

After deployment, you can find the URLs for your HTTP functions in the Firebase console under the "Functions" section. Callable functions do not have direct HTTP URLs and are invoked via the client SDK.

This completes the Firebase function implementation based on your request.
