const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setCors() {
  const bucketName = 'tmp-asset-classification';
  
  // Load credentials from environment
  const keyJson = process.env.GCLOUD_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    console.error('GCLOUD_SERVICE_ACCOUNT_KEY not set in .env file.');
    process.exit(1);
  }

  try {
    const credentials = JSON.parse(keyJson);
    const storage = new Storage({ credentials });

    const cors = [
      {
        origin: ['*'],
        method: ['PUT', 'POST', 'GET', 'OPTIONS'],
        responseHeader: ['Content-Type', 'x-goog-resumable'],
        maxAgeSeconds: 3600,
      },
    ];

    await storage.bucket(bucketName).setCorsConfiguration(cors);
    console.log(`CORS configuration successfully set for bucket: ${bucketName}`);
  } catch (error) {
    console.error('Error setting CORS:', error);
    process.exit(1);
  }
}

setCors();
