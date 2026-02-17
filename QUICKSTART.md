# Quick Start Guide

This guide will help you quickly set up and deploy your application with Firebase Cloud Functions.

## Step 1: Update Firebase Configuration

### 1. Edit `.firebaserc`

Replace `your-firebase-project-id` with your actual Firebase Project ID:

```json
{
  "projects": {
    "default": "YOUR_ACTUAL_PROJECT_ID"
  }
}
```

### 2. Edit `.env`

Update these lines with your Firebase project details:

```env
VITE_FIREBASE_PROJECT_ID=YOUR_ACTUAL_PROJECT_ID
VITE_FIREBASE_REGION=us-central1
```

## Step 2: Set Up API Keys in Firebase

Run these commands to configure your API keys:

```bash
firebase functions:config:set google.api_key="YOUR_GOOGLE_DRIVE_API_KEY"
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

**Don't have API keys yet?**

- **Google Drive API Key:** [Get it here](https://console.cloud.google.com/apis/credentials)
- **Gemini API Key:** [Get it here](https://aistudio.google.com/apikey)

## Step 3: Deploy Firebase Functions

From the project root, run:

```bash
npm run deploy
```

This will:
1. Build the TypeScript functions
2. Deploy both Cloud Functions to Firebase

## Step 4: Run Your Application

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:5173` to use the application!

## What Was Changed?

### Before (Supabase Edge Functions)
- ❌ Edge Functions consumed quota quickly
- ❌ Limited free tier
- ✅ Database storage (still used!)

### After (Firebase Cloud Functions)
- ✅ Firebase handles compute-intensive operations
- ✅ Paid plan with higher quotas
- ✅ Database stays on Supabase (free tier)
- ✅ Best of both worlds!

## Architecture

```
Frontend (React/Vite)
    ↓
Firebase Cloud Functions (Paid Plan)
    ├─ processGoogleDrive → Google Drive API
    └─ classifyAsset → Gemini AI API

Supabase Database (Free Tier)
    └─ Stores all data
```

## Common Issues

### "Firebase project not found"
- Make sure you've updated `.firebaserc` with your actual project ID
- Run `firebase use --add` to select your project

### "API key not configured"
- Verify API keys are set: `firebase functions:config:get`
- Set them using the commands in Step 2 above

### "CORS error"
- Functions already include CORS headers
- Clear browser cache and try again

## Need More Help?

See the full setup guide: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

## Testing Your Deployment

After deploying, test your functions:

1. Visit your app at `http://localhost:5173`
2. Enter a Google Drive folder or file URL
3. Click "Extract Files"
4. Watch as files are extracted and classified!

Your Firebase Functions URLs will be:
- `https://REGION-PROJECT_ID.cloudfunctions.net/processGoogleDrive`
- `https://REGION-PROJECT_ID.cloudfunctions.net/classifyAsset`

## Monitoring

View your function logs:

```bash
firebase functions:log
```

Or check the Firebase Console: [Functions Dashboard](https://console.firebase.google.com/u/0/project/_/functions/list)
