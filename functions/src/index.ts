import * as dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production' || !process.env.FIREBASE_CONFIG) {
  dotenv.config();
}

export { processGoogleDrive } from './processGoogleDrive';
export { classifyAssetFinal } from './classifyAssetFinal'; // Export the new classification worker
