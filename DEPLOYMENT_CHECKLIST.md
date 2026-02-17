# Firebase Deployment Checklist

Use this checklist to ensure your Firebase Cloud Functions are properly configured and deployed.

## Pre-Deployment Checklist

### ✅ Firebase Project Setup

- [ ] Created Firebase project at [Firebase Console](https://console.firebase.google.com/)
- [ ] Upgraded to Blaze (Pay as you go) plan
- [ ] Noted Firebase Project ID

### ✅ API Keys Obtained

- [ ] **Google Drive API Key**
  - Go to [Google Cloud Console](https://console.cloud.google.com/)
  - Navigate to APIs & Services > Credentials
  - Create API Key and restrict to Google Drive API v3
  - Copy the key

- [ ] **Gemini API Key**
  - Go to [Google AI Studio](https://aistudio.google.com/apikey)
  - Create new API key
  - Copy the key

### ✅ Configuration Files Updated

- [ ] **`.firebaserc`** - Updated with your Firebase Project ID
  ```json
  {
    "projects": {
      "default": "YOUR_PROJECT_ID"
    }
  }
  ```

- [ ] **`.env`** - Updated with Firebase details
  ```env
  VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
  VITE_FIREBASE_REGION=us-central1
  ```

### ✅ API Keys Configured in Firebase

- [ ] Set Google API Key:
  ```bash
  firebase functions:config:set google.api_key="YOUR_GOOGLE_API_KEY"
  ```

- [ ] Set Gemini API Key:
  ```bash
  firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
  ```

- [ ] Verify configuration:
  ```bash
  firebase functions:config:get
  ```

### ✅ Firebase CLI Setup

- [ ] Firebase CLI installed globally:
  ```bash
  npm install -g firebase-tools
  ```

- [ ] Logged in to Firebase:
  ```bash
  firebase login
  ```

- [ ] Correct project selected:
  ```bash
  firebase use --add
  ```

## Deployment Steps

### 1. Build Functions

```bash
cd functions
npm install
npm run build
cd ..
```

**Expected Output:** TypeScript should compile without errors

### 2. Deploy Functions

```bash
npm run deploy
```

Or deploy individually:

```bash
firebase deploy --only functions:processGoogleDrive
firebase deploy --only functions:classifyAsset
```

**Expected Output:**
```
✔  functions[us-central1-processGoogleDrive]: Successful update operation.
✔  functions[us-central1-classifyAsset]: Successful update operation.
```

### 3. Note Your Function URLs

After deployment, you'll see URLs like:

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/processGoogleDrive
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/classifyAsset
```

These are automatically used by your frontend based on your `.env` configuration.

## Post-Deployment Verification

### ✅ Test Functions

- [ ] Start local development server:
  ```bash
  npm run dev
  ```

- [ ] Visit `http://localhost:5173`

- [ ] Test Google Drive extraction:
  - Enter a public Google Drive folder URL
  - Click "Extract Files"
  - Verify files are extracted

- [ ] Test classification:
  - Files should automatically be classified
  - Check for classification and description

### ✅ Monitor Logs

- [ ] View function logs:
  ```bash
  firebase functions:log
  ```

- [ ] Check for errors or warnings

- [ ] Verify successful invocations

### ✅ Check Firebase Console

- [ ] Go to [Firebase Console](https://console.firebase.google.com/)
- [ ] Navigate to Functions section
- [ ] Verify both functions are deployed
- [ ] Check invocation counts and execution times

## Troubleshooting

### Functions Not Deploying

**Symptom:** Deployment fails or hangs

**Solutions:**
1. Check you're logged in: `firebase login`
2. Verify project is selected: `firebase projects:list`
3. Ensure Node.js version is 20+: `node --version`
4. Try building functions manually: `cd functions && npm run build`

### API Key Errors

**Symptom:** Functions return "API key not configured" or "401" errors

**Solutions:**
1. Verify keys are set: `firebase functions:config:get`
2. Re-set keys if needed
3. Redeploy functions after setting keys

### CORS Errors

**Symptom:** Browser console shows CORS errors

**Solutions:**
1. Functions already include CORS headers - no changes needed
2. Clear browser cache
3. Try in incognito/private mode
4. Check browser console for actual error

### Classification Failing

**Symptom:** Files extracted but classification fails

**Solutions:**
1. Check Gemini API key is valid
2. Verify files are publicly accessible
3. Check Firebase Functions logs: `firebase functions:log`
4. Ensure Gemini API quota is not exceeded

## Cost Monitoring

### Set Up Budget Alerts

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to Billing > Budgets & Alerts
3. Create a budget alert (recommended: $20/month)
4. Set email notifications

### Monitor Usage

- Check Firebase Console > Functions > Dashboard
- Review invocation counts
- Check execution times
- Monitor errors

### Typical Costs

For 1000 operations per day:
- **Estimated:** $5-20/month
- **Factors:** File sizes, classification complexity, execution time

## Rollback Plan

If something goes wrong, you can rollback:

```bash
firebase functions:rollback
```

Or redeploy previous version:

```bash
git checkout <previous-commit>
npm run deploy
```

## Support Resources

- **Firebase Documentation:** https://firebase.google.com/docs/functions
- **Firebase Status:** https://status.firebase.google.com/
- **Community Support:** https://stackoverflow.com/questions/tagged/firebase

## Success Criteria

Your deployment is successful when:

- ✅ Both functions deployed without errors
- ✅ Function URLs accessible and returning responses
- ✅ Google Drive extraction working
- ✅ File classification working
- ✅ No errors in Firebase Functions logs
- ✅ Frontend connects to functions successfully

---

**Congratulations!** 🎉 Your Firebase Cloud Functions are now live and handling the compute-intensive operations, while your Supabase database continues storing data on the free tier!
