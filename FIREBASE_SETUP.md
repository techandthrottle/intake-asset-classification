# Firebase Cloud Functions Setup Guide

This application uses Firebase Cloud Functions for processing Google Drive URLs and classifying media assets. The database remains on Supabase (free tier), while Firebase handles the compute-intensive operations.

## Prerequisites

1. A Firebase account (paid plan recommended for higher quotas)
2. Node.js 20 or higher installed
3. Firebase CLI installed globally: `npm install -g firebase-tools`

## Initial Firebase Setup

### 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard
4. Note your **Project ID** (you'll need this later)

### 2. Configure Firebase Project Settings

1. In the Firebase Console, go to **Project Settings** (gear icon)
2. Note your **Project ID**
3. Choose a region for your Cloud Functions (e.g., `us-central1`)

### 3. Set Up API Keys

#### Google Drive API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project (Firebase projects are also Google Cloud projects)
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **API Key**
5. Restrict the key to Google Drive API v3
6. Copy the API key

#### Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Copy the API key

### 4. Configure Environment Variables in Firebase

Set the API keys in Firebase Functions configuration:

```bash
firebase functions:config:set google.api_key="YOUR_GOOGLE_API_KEY"
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

## Local Environment Configuration

### 1. Update `.firebaserc`

Edit the `.firebaserc` file in the project root and replace `your-firebase-project-id` with your actual Firebase Project ID:

```json
{
  "projects": {
    "default": "your-actual-firebase-project-id"
  }
}
```

### 2. Update `.env`

Edit the `.env` file in the project root and update these variables:

```env
VITE_FIREBASE_PROJECT_ID=your-actual-firebase-project-id
VITE_FIREBASE_REGION=us-central1
```

Keep the existing Supabase environment variables as they are needed for the database:

```env
VITE_SUPABASE_URL=https://xlfdjwgwitrskvzztiul.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3. Set Up Local Environment Variables for Functions

Create a `.env` file in the `functions` directory with your API keys:

```bash
cd functions
cat > .env << EOF
GOOGLE_API_KEY=your_google_api_key
GEMINI_API_KEY=your_gemini_api_key
EOF
```

**Important:** Never commit this file to version control!

## Deploying Cloud Functions

### 1. Login to Firebase

```bash
firebase login
```

### 2. Build and Deploy Functions

```bash
npm run deploy
```

Or deploy functions individually:

```bash
firebase deploy --only functions:processGoogleDrive
firebase deploy --only functions:classifyAsset
```

### 3. Verify Deployment

After deployment, you should see URLs for your functions:

```
https://us-central1-your-project-id.cloudfunctions.net/processGoogleDrive
https://us-central1-your-project-id.cloudfunctions.net/classifyAsset
```

## Testing Locally

### 1. Start Firebase Emulators (Optional)

```bash
cd functions
npm run serve
```

This starts the Firebase Functions emulator on `http://localhost:5001`.

### 2. Update Frontend to Use Emulator (Optional)

If testing with emulators, temporarily update the API URLs in your `.env`:

```env
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_REGION=localhost:5001
```

## Monitoring and Logs

### View Function Logs

```bash
firebase functions:log
```

Or view logs in the Firebase Console under **Functions** > **Logs**.

### Monitor Usage and Quotas

1. Go to Firebase Console
2. Navigate to **Functions** > **Dashboard**
3. Monitor invocations, execution time, and errors

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│   (Vite/React)  │
└────────┬────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────────┐         ┌──────────────────────┐
│ Firebase Cloud      │         │ Supabase Database    │
│ Functions           │         │ (Free Tier)          │
│ (Paid Plan)         │         │                      │
│                     │         │ - Stores links       │
│ - processGoogleDrive│         │ - Stores metadata    │
│ - classifyAsset     │         │ - RLS enabled        │
└─────────┬───────────┘         └──────────────────────┘
          │
          ├──────────────────┐
          │                  │
          ▼                  ▼
  ┌───────────────┐  ┌──────────────┐
  │ Google Drive  │  │ Gemini AI    │
  │ API           │  │ API          │
  └───────────────┘  └──────────────┘
```

## Troubleshooting

### CORS Errors

If you encounter CORS errors, verify that the Cloud Functions include proper CORS headers. The functions already include CORS configuration.

### Authentication Errors

Ensure your API keys are properly set in Firebase Functions configuration:

```bash
firebase functions:config:get
```

### Quota Exceeded

If you hit Firebase quotas:
1. Check your Firebase plan (upgrade if needed)
2. Monitor usage in Firebase Console
3. Optimize function execution (already implemented with timeouts and error handling)

### Functions Not Deploying

1. Ensure you're logged in: `firebase login`
2. Check your project is selected: `firebase use --add`
3. Verify Node.js version: `node --version` (should be 20 or higher)
4. Build functions first: `cd functions && npm run build`

## Cost Considerations

### Firebase Pricing

Firebase Cloud Functions on the **Blaze (Pay as you go)** plan includes:
- First 2 million invocations/month free
- First 400,000 GB-seconds free
- First 200,000 CPU-seconds free
- Additional usage billed at low rates

### Estimated Costs

For typical usage:
- Processing 1000 Google Drive files/day
- Classifying 1000 assets/day

Estimated monthly cost: **$5-20/month** (depending on file sizes and processing time)

### Cost Optimization

The application includes several optimizations:
- File size limits (10MB images, 50MB videos)
- Request timeouts (120 seconds)
- Retry logic with exponential backoff
- Efficient batch processing

## Support

For issues specific to:
- **Firebase setup:** Check [Firebase Documentation](https://firebase.google.com/docs/functions)
- **Google Drive API:** Check [Google Drive API Documentation](https://developers.google.com/drive)
- **Gemini AI:** Check [Gemini API Documentation](https://ai.google.dev/docs)
