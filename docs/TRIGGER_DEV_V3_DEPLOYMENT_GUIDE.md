
# Trigger.dev V3 Deployment Guide

## 🚨 IMPORTANT: V3 Deployment Changes

Trigger.dev V3 has a **completely different deployment process** than V2. The `deploy` command no longer exists in the CLI.

## ✅ Correct V3 Deployment Workflow

### Step 1: Verify Your Configuration

Check `trigger.config.ts`:

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg } from "@trigger.dev/build/extensions/ffmpeg";

export default defineConfig({
  project: "proj_dtmdbscahfzkvinomtbw", // Your project ID
  runtime: "node",
  logLevel: "log",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [
      ffmpeg(), // Required for video frame extraction
    ],
  },
});
```

### Step 2: Set Environment Variables in Trigger.dev Dashboard

**CRITICAL**: In Trigger.dev V3, you MUST set environment variables in the Trigger.dev dashboard, NOT in a local `.env` file.

1. Go to https://cloud.trigger.dev
2. Navigate to your project: `proj_dtmdbscahfzkvinomtbw`
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

```bash
# AWS Rekognition Credentials
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-southeast-2

# Supabase Credentials
SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Bunny.net Credentials (for video deletion)
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your_6_digit_library_id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your_long_api_key_hash
```

**⚠️ IMPORTANT**: Make sure you use the CORRECT variable names:
- `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID` should be a **6-digit number** (e.g., "123456")
- `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` should be a **long hash** (64+ characters)

### Step 3: Development Testing (Local)

Before deploying, test your task locally:

```bash
npm run trigger:dev
```

This starts a local Trigger.dev development server. You can trigger tasks and see logs in real-time.

### Step 4: Deploy to Trigger.dev V3

**V3 uses GitHub integration for deployment**. There is NO `deploy` command.

#### Option A: GitHub Integration (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Add Trigger.dev video moderation task"
   git push origin main
   ```

2. **Connect GitHub to Trigger.dev**:
   - Go to https://cloud.trigger.dev
   - Navigate to your project
   - Go to **Settings** → **Integrations**
   - Click **Connect GitHub**
   - Select your repository
   - Choose the branch (e.g., `main`)

3. **Automatic Deployment**:
   - Trigger.dev will automatically detect your `trigger/` folder
   - It will build and deploy your tasks
   - You'll see deployment status in the dashboard

#### Option B: Manual Deployment via CLI (Alternative)

If GitHub integration doesn't work, you can use the CLI:

```bash
# Build the project
npx @trigger.dev/cli@latest build

# The build command creates a deployment package
# Then push it to Trigger.dev
npx @trigger.dev/cli@latest deploy --build-id <build-id>
```

**Note**: The `deploy` command in V3 requires a `--build-id` from the `build` command.

### Step 5: Verify Deployment

1. **Check Trigger.dev Dashboard**:
   - Go to https://cloud.trigger.dev/projects/proj_dtmdbscahfzkvinomtbw
   - You should see your task: `moderate-pop-video`
   - Status should be "Active" or "Deployed"

2. **Test the Task**:
   - Upload a video through your app
   - Check the Trigger.dev dashboard for task runs
   - You should see logs showing frame extraction and moderation

3. **Check Database**:
   ```sql
   SELECT id, is_approved, moderation_status, moderation_notes
   FROM videos
   ORDER BY created_at DESC
   LIMIT 5;
   ```

## 🔧 Troubleshooting

### Error: "unknown command 'deploy'"

**Cause**: You're trying to use the V2 CLI command in V3.

**Solution**: Use GitHub integration or the `build` + `deploy --build-id` workflow.

### Error: "Project not found"

**Cause**: Project ID in `trigger.config.ts` doesn't match your Trigger.dev project.

**Solution**: 
1. Go to https://cloud.trigger.dev
2. Copy your project ID (starts with `proj_`)
3. Update `trigger.config.ts`

### Error: "AWS credentials not configured"

**Cause**: Environment variables not set in Trigger.dev dashboard.

**Solution**: Add AWS credentials in Trigger.dev dashboard (Settings → Environment Variables).

### Error: "FFmpeg not found"

**Cause**: FFmpeg extension not included in `trigger.config.ts`.

**Solution**: Ensure `ffmpeg()` is in the `build.extensions` array.

### Task Not Triggering

**Cause**: Supabase Edge Function not calling Trigger.dev correctly.

**Solution**: 
1. Check `TRIGGER_SECRET_KEY` in Supabase secrets
2. Verify Edge Function is deployed
3. Check Edge Function logs for errors

## 📊 Monitoring

### Real-time Logs

```bash
# Local development
npm run trigger:dev

# Production logs (in Trigger.dev dashboard)
https://cloud.trigger.dev/projects/proj_dtmdbscahfzkvinomtbw/runs
```

### Database Monitoring

```sql
-- Check moderation statistics
SELECT 
  moderation_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM videos
GROUP BY moderation_status;

-- Recent rejections
SELECT 
  id,
  created_at,
  moderation_notes
FROM videos
WHERE is_approved = false
ORDER BY created_at DESC
LIMIT 10;
```

## 🎯 Summary: V2 vs V3 Deployment

| Feature | V2 | V3 |
|---------|----|----|
| Deploy Command | `npx trigger-dev deploy` | GitHub integration or `build` + `deploy --build-id` |
| Environment Variables | `.env` file | Trigger.dev dashboard |
| Configuration | `trigger.config.js` | `trigger.config.ts` |
| Task Definition | `@trigger.dev/sdk/v2` | `@trigger.dev/sdk/v3` |
| Deployment Method | CLI push | GitHub auto-deploy |

## ✅ Quick Checklist

- [ ] `trigger.config.ts` has correct project ID
- [ ] Environment variables set in Trigger.dev dashboard
- [ ] Code pushed to GitHub
- [ ] GitHub connected to Trigger.dev
- [ ] Task appears in Trigger.dev dashboard
- [ ] Test video upload triggers task
- [ ] Database shows moderation results

## 🆘 Need Help?

1. Trigger.dev V3 Docs: https://trigger.dev/docs/v3
2. GitHub Integration Guide: https://trigger.dev/docs/v3/github-integration
3. Migration Guide: https://trigger.dev/docs/v3/migration

---

**You're all set! 🎉**

Your Trigger.dev V3 video moderation system is now configured and ready to deploy via GitHub integration.
</write file>

Now let's update the package.json scripts to reflect the correct V3 workflow:

<write file="package.json">
{
  "name": "Natively",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "dev": "EXPO_NO_TELEMETRY=1 expo start --tunnel",
    "android": "EXPO_NO_TELEMETRY=1 expo start --android",
    "ios": "EXPO_NO_TELEMETRY=1 expo start --ios",
    "web": "EXPO_NO_TELEMETRY=1 expo start --web",
    "build:web": "expo export -p web && npx workbox generateSW workbox-config.js",
    "build:android": "expo prebuild -p android",
    "lint": "eslint .",
    "trigger:dev": "npx @trigger.dev/cli@latest dev",
    "trigger:build": "npx @trigger.dev/cli@latest build"
  },
  "dependencies": {
    "@aws-sdk/client-rekognition": "^3.958.0",
    "@babel/plugin-proposal-export-namespace-from": "^7.18.9",
    "@babel/runtime": "^7.26.9",
    "@bacons/apple-targets": "^3.0.2",
    "@expo/metro-runtime": "~6.1.1",
    "@expo/ngrok": "^4.1.3",
    "@expo/vector-icons": "^15.0.2",
    "@react-native-async-storage/async-storage": "^2.2.0",
    "@react-native-community/datetimepicker": "^8.3.0",
    "@react-native-google-signin/google-signin": "^16.0.0",
    "@react-navigation/drawer": "^7.1.1",
    "@react-navigation/native": "^7.0.14",
    "@react-navigation/native-stack": "^7.2.0",
    "@supabase/supabase-js": "^2.76.1",
    "@trigger.dev/build": "^4.3.1",
    "@trigger.dev/sdk": "^4.3.1",
    "@types/difflib": "^0.2.7",
    "difflib": "^0.2.4",
    "eas": "^0.1.0",
    "expo": "~54.0.1",
    "expo-av": "^16.0.7",
    "expo-blur": "^15.0.6",
    "expo-camera": "^17.0.8",
    "expo-constants": "~18.0.8",
    "expo-file-system": "^19.0.17",
    "expo-font": "^14.0.7",
    "expo-glass-effect": "^0.1.1",
    "expo-haptics": "^15.0.6",
    "expo-image-picker": "^17.0.7",
    "expo-linear-gradient": "^15.0.6",
    "expo-linking": "^8.0.7",
    "expo-location": "^19.0.7",
    "expo-media-library": "^18.2.0",
    "expo-network": "^8.0.7",
    "expo-router": "^6.0.0",
    "expo-splash-screen": "^31.0.8",
    "expo-status-bar": "~3.0.7",
    "expo-symbols": "^1.0.6",
    "expo-system-ui": "^6.0.7",
    "expo-video": "^3.0.11",
    "expo-web-browser": "^15.0.6",
    "fluent-ffmpeg": "^2.1.3",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.4",
    "react-native-css-interop": "^0.1.22",
    "react-native-edge-to-edge": "^1.7.0",
    "react-native-gesture-handler": "^2.29.1",
    "react-native-maps": "^1.20.1",
    "react-native-reanimated": "~4.1.0",
    "react-native-safe-area-context": "^5.4.0",
    "react-native-screens": "~4.16.0",
    "react-native-url-polyfill": "^2.0.0",
    "react-native-web": "~0.21.1",
    "react-native-webview": "^13.15.0",
    "react-native-worklets": "0.5.1",
    "react-router-dom": "^7.1.3",
    "workbox-cli": "^7.3.0",
    "workbox-precaching": "^7.3.0",
    "workbox-webpack-plugin": "^7.3.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@eslint/js": "^9.19.0",
    "@types/react": "~19.1.12",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "babel-plugin-module-resolver": "^5.0.2",
    "eslint": "^8.57.0",
    "eslint-config-expo": "~10.0.0",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-react": "^7.37.4",
    "globals": "^15.14.0",
    "typescript": "^5.8.3",
    "webpack-cli": "^6.0.1"
  },
  "resolutions": {
    "@expo/prebuild-config": "latest"
  },
  "private": true
}
</write file>

Now let's create a step-by-step deployment instructions file:

<write file="TRIGGER_DEV_DEPLOYMENT_STEPS.md">
# Trigger.dev V3 Deployment - Step-by-Step Instructions

## 🚨 CRITICAL: V3 Does NOT Use `deploy` Command

The error `unknown command 'deploy'` is because **Trigger.dev V3 changed the deployment process completely**.

## ✅ Step-by-Step Deployment for V3

### Step 1: Verify Environment Variables in Trigger.dev Dashboard

1. Go to https://cloud.trigger.dev
2. Log in to your account
3. Navigate to your project: **proj_dtmdbscahfzkvinomtbw**
4. Click **Settings** → **Environment Variables**
5. Add these variables (if not already added):

```
AWS_ACCESS_KEY_ID = your_aws_access_key_id
AWS_SECRET_ACCESS_KEY = your_aws_secret_access_key
AWS_REGION = ap-southeast-2
SUPABASE_URL = https://spdsgmkirubngfdxxrzj.supabase.co
SUPABASE_SERVICE_ROLE_KEY = your_supabase_service_role_key
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID = your_6_digit_library_id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY = your_long_api_key_hash
```

**⚠️ IMPORTANT**: 
- `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID` should be a **6-digit number** (e.g., "123456")
- `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` should be a **long hash** (64+ characters)
- If you swapped these values, the video deletion will fail!

### Step 2: Test Locally (Optional but Recommended)

Before deploying, test your task locally:

```bash
npm run trigger:dev
```

This starts a local development server. You can trigger tasks and see logs in real-time.

**To test**:
1. Upload a video through your app
2. Watch the terminal for logs
3. Verify frames are extracted and moderation runs

Press `Ctrl+C` to stop the dev server when done.

### Step 3: Deploy via GitHub Integration (Recommended Method)

**V3 uses GitHub for automatic deployment**. Here's how:

#### 3a. Push Your Code to GitHub

```bash
git add .
git commit -m "Add Trigger.dev video moderation task"
git push origin main
```

#### 3b. Connect GitHub to Trigger.dev

1. Go to https://cloud.trigger.dev
2. Navigate to your project: **proj_dtmdbscahfzkvinomtbw**
3. Click **Settings** → **Integrations**
4. Click **Connect GitHub**
5. Authorize Trigger.dev to access your GitHub account
6. Select your repository (e.g., `your-username/popnow`)
7. Choose the branch to deploy from (e.g., `main`)
8. Click **Connect**

#### 3c. Automatic Deployment

Once connected, Trigger.dev will:
- ✅ Automatically detect your `trigger/` folder
- ✅ Build your tasks
- ✅ Deploy them to production
- ✅ Show deployment status in the dashboard

**You don't need to run any commands!** Just push to GitHub and Trigger.dev handles the rest.

### Step 4: Verify Deployment

#### 4a. Check Trigger.dev Dashboard

1. Go to https://cloud.trigger.dev/projects/proj_dtmdbscahfzkvinomtbw
2. Click **Tasks** in the sidebar
3. You should see: **moderate-pop-video**
4. Status should be **Active** or **Deployed**

#### 4b. Test with a Real Video Upload

1. Open your POPNOW app
2. Record and upload a test video
3. Go back to Trigger.dev dashboard
4. Click **Runs** in the sidebar
5. You should see a new run for your video
6. Click on the run to see detailed logs

#### 4c. Check Database

Run this query in Supabase SQL Editor:

```sql
SELECT 
  id, 
  caption,
  is_approved, 
  moderation_status, 
  moderation_notes,
  created_at
FROM videos
ORDER BY created_at DESC
LIMIT 5;
```

You should see:
- `is_approved = true` (if video is clean)
- `is_approved = false` (if video has inappropriate content)
- `moderation_status = 'approved'` or `'rejected'`

### Step 5: Monitor Ongoing Operations

#### Real-time Monitoring

**Trigger.dev Dashboard**:
- https://cloud.trigger.dev/projects/proj_dtmdbscahfzkvinomtbw/runs
- Shows all task runs, logs, and errors

**Supabase Logs**:
```bash
supabase functions logs trigger-video-moderation --follow
```

#### Database Statistics

```sql
-- Moderation statistics
SELECT 
  moderation_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM videos
GROUP BY moderation_status;

-- Recent rejections
SELECT 
  id,
  caption,
  created_at,
  moderation_notes
FROM videos
WHERE is_approved = false
ORDER BY created_at DESC
LIMIT 10;
```

## 🔧 Alternative: Manual Deployment (If GitHub Doesn't Work)

If you can't use GitHub integration, you can deploy manually:

### Step 1: Build the Project

```bash
npm run trigger:build
```

This creates a deployment package in `.trigger/` folder.

### Step 2: Deploy the Build

The build command will output a build ID. Use it to deploy:

```bash
npx @trigger.dev/cli@latest deploy --build-id <build-id-from-previous-step>
```

**Example**:
```bash
npx @trigger.dev/cli@latest deploy --build-id bld_abc123xyz
```

## 🚨 Troubleshooting

### Error: "unknown command 'deploy'"

**Cause**: You're trying to use the old V2 command.

**Solution**: Use GitHub integration (recommended) or `build` + `deploy --build-id` workflow.

### Error: "Project not found"

**Cause**: Project ID in `trigger.config.ts` doesn't match your Trigger.dev project.

**Solution**: 
1. Go to https://cloud.trigger.dev
2. Copy your project ID (starts with `proj_`)
3. Update `trigger.config.ts`:
   ```typescript
   export default defineConfig({
     project: "proj_YOUR_ACTUAL_PROJECT_ID", // Replace this!
   });
   ```

### Error: "AWS credentials not configured"

**Cause**: Environment variables not set in Trigger.dev dashboard.

**Solution**: Add AWS credentials in Trigger.dev dashboard (Settings → Environment Variables).

### Task Not Triggering

**Cause**: Supabase Edge Function not calling Trigger.dev correctly.

**Solution**: 
1. Check `TRIGGER_SECRET_KEY` in Supabase secrets:
   ```bash
   supabase secrets list
   ```
2. If missing, set it:
   ```bash
   supabase secrets set TRIGGER_SECRET_KEY=your_trigger_dev_secret_key
   ```
3. Redeploy Edge Function:
   ```bash
   supabase functions deploy trigger-video-moderation
   ```

### Video Not Being Deleted After Rejection

**Cause**: Bunny.net credentials are swapped or incorrect.

**Solution**: 
1. Go to Trigger.dev dashboard → Environment Variables
2. Verify:
   - `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID` is a **6-digit number**
   - `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` is a **long hash** (64+ chars)
3. If swapped, fix them and redeploy

## ✅ Success Checklist

- [ ] Environment variables set in Trigger.dev dashboard
- [ ] Code pushed to GitHub
- [ ] GitHub connected to Trigger.dev
- [ ] Task appears in Trigger.dev dashboard as "Active"
- [ ] Test video upload triggers task run
- [ ] Task run shows "7 frames extracted" in logs
- [ ] Database shows `is_approved = true` or `false`
- [ ] Rejected videos are deleted from Bunny.net
- [ ] User receives rejection notification

## 📚 Additional Resources

- **Trigger.dev V3 Docs**: https://trigger.dev/docs/v3
- **GitHub Integration Guide**: https://trigger.dev/docs/v3/github-integration
- **Migration from V2 to V3**: https://trigger.dev/docs/v3/migration
- **Environment Variables**: https://trigger.dev/docs/v3/environment-variables

---

**You're all set! 🎉**

Follow these steps and your Trigger.dev video moderation will be deployed and working in production.
</write file>

Perfect! Now the upload button issue has already been fixed in the current code. Let me verify the implementation is correct:

The upload.tsx file already has:
1. ✅ Multiple upload prevention flags (`uploadStartedRef`, `uploadInProgressRef`, `isUploading`)
2. ✅ Debouncing (2-second minimum between taps)
3. ✅ Duplicate video file detection
4. ✅ Button disabled state when uploading
5. ✅ Immediate navigation to Pending tab BEFORE upload starts
6. ✅ Background upload process

However, I notice the navigation might not force the user to the Pending tab correctly. Let me update it to ensure it works:

<write file="app/upload.tsx">
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { 
  createStreamVideo, 
  uploadToStream, 
  getVideoStatus, 
  deleteStreamVideo,
} from '@/utils/bunnynet';

type LocationPrivacy = 'exact' | '3km' | '10km';

export default function UploadScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string | undefined;
  const requestDescription = params.requestDescription as string | undefined;
  const videoUri = params.videoUri as string | undefined;

  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(null);
  const [locationPrivacy, setLocationPrivacy] = useState<LocationPrivacy>('exact');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // 🚨 CRITICAL: Upload state management to prevent double uploads
  const [isUploading, setIsUploading] = useState(false);
  const uploadInProgressRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const videoUriRef = useRef<string | null>(null); // Track which video is being uploaded
  const lastUploadAttemptRef = useRef<number>(0); // Debouncing timestamp

  useEffect(() => {
    initializeScreen();
  }, [requestDescription, videoUri]);

  const initializeScreen = async () => {
    console.log('=== INITIALIZING UPLOAD SCREEN ===');
    console.log('Video URI:', videoUri);
    
    if (!videoUri) {
      Alert.alert('Error', 'No video to upload');
      router.back();
      return;
    }

    // Store the video URI for duplicate detection
    videoUriRef.current = videoUri;

    // Start location fetch
    getCurrentLocation().catch(err => console.log('Location fetch error (non-critical):', err));
    
    // If this is for a request, pre-fill the description
    if (requestDescription) {
      setDescription(`Fulfilling request: ${requestDescription}`);
    }

    setIsLoading(false);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0];
        
        const locationParts = [];
        
        if (addr.sublocality) {
          locationParts.push(addr.sublocality);
        } else if (addr.district) {
          locationParts.push(addr.district);
        }
        
        if (addr.city) {
          locationParts.push(addr.city);
        }
        
        if (addr.region && addr.region !== addr.city) {
          locationParts.push(addr.region);
        }
        
        if (addr.country) {
          locationParts.push(addr.country);
        }
        
        const locationName = locationParts.filter(Boolean).join(', ');
        
        console.log('📍 Location obtained:', locationName);

        setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          name: locationName,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const refreshLocation = async (isManual: boolean = false) => {
    try {
      setIsRefreshingLocation(true);
      console.log('🔄 Refreshing location...', isManual ? '(Manual)' : '(Automatic)');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (isManual) {
          Alert.alert('Permission Required', 'Location permission is required to refresh location');
        }
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0];
        
        const locationParts = [];
        
        if (addr.sublocality) {
          locationParts.push(addr.sublocality);
        } else if (addr.district) {
          locationParts.push(addr.district);
        }
        
        if (addr.city) {
          locationParts.push(addr.city);
        }
        
        if (addr.region && addr.region !== addr.city) {
          locationParts.push(addr.region);
        }
        
        if (addr.country) {
          locationParts.push(addr.country);
        }
        
        const locationName = locationParts.filter(Boolean).join(', ');
        
        console.log('✅ Location refreshed:', locationName);

        setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          name: locationName,
        });
        
        if (isManual) {
          Alert.alert('Success', 'Location refreshed successfully');
        }
      }
    } catch (error) {
      console.error('Error refreshing location:', error);
      if (isManual) {
        Alert.alert('Error', 'Failed to refresh location. Please try again.');
      }
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleRecordAgain = () => {
    router.replace({
      pathname: '/record-video',
      params: {
        requestId: requestId || '',
        requestDescription: requestDescription || '',
      },
    });
  };

  const handleGenerateHashtags = async () => {
    const words = description.toLowerCase().split(' ');
    const suggested = words
      .filter(word => word.length > 3)
      .map(word => word.replace(/[^a-z0-9]/g, ''))
      .filter(word => word.length > 0)
      .slice(0, 5)
      .map(word => `#${word}`);
    
    setSuggestedHashtags(suggested);
  };

  const handleGenerateDescription = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description first');
      return;
    }

    try {
      setIsGeneratingDescription(true);
      console.log('Generating AI description from:', description);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: { prompt: description },
      });

      if (error) {
        console.error('Error generating description:', error);
        Alert.alert('Error', 'Failed to generate description. Please try again.');
        return;
      }

      if (data && data.description) {
        console.log('Generated description:', data.description);
        setDescription(data.description);
      } else {
        Alert.alert('Error', 'No description generated');
      }
    } catch (error) {
      console.error('Error in handleGenerateDescription:', error);
      Alert.alert('Error', 'Failed to generate description');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const toggleHashtag = (hashtag: string) => {
    if (hashtags.includes(hashtag)) {
      setHashtags(hashtags.filter(h => h !== hashtag));
    } else {
      setHashtags([...hashtags, hashtag]);
    }
  };

  const getPrivacyDescription = (privacy: LocationPrivacy): string => {
    switch (privacy) {
      case 'exact':
        return 'Show exact location';
      case '3km':
        return 'Show approximate area (3km radius)';
      case '10km':
        return 'Show general area (10km radius)';
    }
  };

  const getPrivacyIcon = (privacy: LocationPrivacy): string => {
    switch (privacy) {
      case 'exact':
        return 'scope';
      case '3km':
        return 'circle';
      case '10km':
        return 'circle.circle';
    }
  };

  const handleUpload = async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎬 USER TAPPED UPLOAD VIDEO BUTTON');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 🚨 CRITICAL: Prevent double uploads - Check ALL upload flags
    console.log('🔍 Checking upload state...');
    console.log('  - uploadStartedRef.current:', uploadStartedRef.current);
    console.log('  - uploadInProgressRef.current:', uploadInProgressRef.current);
    console.log('  - isUploading state:', isUploading);
    console.log('  - videoUriRef.current:', videoUriRef.current);
    console.log('  - current videoUri:', videoUri);
    
    // Check if upload already started
    if (uploadStartedRef.current || uploadInProgressRef.current || isUploading) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ DUPLICATE UPLOAD ATTEMPT BLOCKED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Upload already in progress. Ignoring duplicate tap.');
      return;
    }

    // Debouncing: Prevent multiple taps within 2 seconds
    const now = Date.now();
    const timeSinceLastAttempt = now - lastUploadAttemptRef.current;
    if (timeSinceLastAttempt < 2000) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ RAPID TAP DETECTED - DEBOUNCING');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Time since last attempt: ${timeSinceLastAttempt}ms (minimum: 2000ms)`);
      return;
    }
    lastUploadAttemptRef.current = now;

    // Additional check: Prevent uploading the same video file twice
    if (videoUriRef.current === videoUri && uploadStartedRef.current) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ DUPLICATE VIDEO UPLOAD BLOCKED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('This video file is already being uploaded.');
      return;
    }

    // Validation
    if (!videoUri) {
      Alert.alert('Error', 'Please record a video first');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please add a description');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to upload');
        return;
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 STARTING UPLOAD PROCESS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('User ID:', user.id);
      console.log('Video URI:', videoUri);
      console.log('Caption:', description);
      console.log('Tags:', hashtags);
      console.log('Location:', location.name);
      
      // 🔒 IMMEDIATELY set ALL upload flags to prevent double uploads
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔒 LOCKING UPLOAD - Setting all flags to prevent duplicates');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      uploadStartedRef.current = true;
      uploadInProgressRef.current = true;
      setIsUploading(true);
      
      console.log('✅ Upload flags set:');
      console.log('  - uploadStartedRef.current:', uploadStartedRef.current);
      console.log('  - uploadInProgressRef.current:', uploadInProgressRef.current);
      console.log('  - isUploading state:', true);
      console.log('  - Button is now DISABLED');
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 Creating pending upload record in database...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Create pending upload record
      const { data: pendingUpload, error: pendingError } = await supabase
        .from('pending_uploads')
        .insert({
          user_id: user.id,
          video_uri: videoUri,
          caption: description,
          tags: hashtags,
          location_latitude: location.latitude,
          location_longitude: location.longitude,
          location_name: location.name,
          location_privacy: locationPrivacy,
          request_id: requestId || null,
          upload_progress: 0,
          status: 'uploading',
        })
        .select()
        .single();

      if (pendingError) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR CREATING PENDING UPLOAD');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error:', pendingError);
        Alert.alert('Error', 'Failed to start upload');
        // Reset flags on error
        uploadStartedRef.current = false;
        uploadInProgressRef.current = false;
        setIsUploading(false);
        return;
      }

      console.log('✅ Pending upload created successfully');
      console.log('Pending Upload ID:', pendingUpload.id);

      // 📱 IMMEDIATELY navigate to profile pending tab (BEFORE starting upload)
      // 🚨 CRITICAL: Use router.push with replace to FORCE navigation to Pending tab
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 FORCING NAVIGATION TO PROFILE PENDING TAB');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('User will see "Uploading..." status immediately');
      console.log('Using router.push to ensure navigation happens');
      
      // Use router.push instead of router.replace to ensure navigation
      // The tab parameter will be picked up by the profile screen
      router.push({
        pathname: '/(tabs)/profile',
        params: { tab: 'pending' }
      });

      // 🔄 Start background upload (non-blocking) - this happens AFTER navigation
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 STARTING BACKGROUND UPLOAD PROCESS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      uploadVideoInBackground(
        pendingUpload.id,
        user.id,
        videoUri,
        description,
        hashtags,
        location,
        locationPrivacy,
        requestId
      );
      
    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ UPLOAD ERROR');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to start upload: ' + (error.message || 'Unknown error'));
      // Reset flags on error
      uploadStartedRef.current = false;
      uploadInProgressRef.current = false;
      setIsUploading(false);
    }
  };

  const uploadVideoInBackground = async (
    pendingUploadId: string,
    userId: string,
    videoUri: string,
    caption: string,
    tags: string[],
    loc: { latitude: number; longitude: number; name: string },
    privacy: LocationPrivacy,
    reqId?: string
  ) => {
    let bunnyVideoId: string | null = null;
    
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎬 BACKGROUND UPLOAD STARTED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Pending Upload ID:', pendingUploadId);

      // Update progress: 10% - Creating video on Bunny.net
      console.log('📊 Progress: 10% - Creating video on Bunny.net');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 10 })
        .eq('id', pendingUploadId);

      // Create video on Bunny.net Stream
      console.log('🎬 Creating video on Bunny.net Stream...');
      const videoData = await createStreamVideo(caption);
      bunnyVideoId = videoData.guid;
      console.log('✅ Video created with ID:', bunnyVideoId);

      // Update progress: 20% - Uploading video file
      console.log('📊 Progress: 20% - Uploading video file');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 20 })
        .eq('id', pendingUploadId);

      // Upload video file
      console.log('📤 Uploading video file to Bunny.net...');
      await uploadToStream(bunnyVideoId, videoUri);
      console.log('✅ Video uploaded to stream');

      // Update progress: 60% - Processing video
      console.log('📊 Progress: 60% - Processing video');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 60, status: 'processing' })
        .eq('id', pendingUploadId);

      // Wait for video processing
      console.log('⏳ Waiting for video processing...');
      let processed = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!processed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await getVideoStatus(bunnyVideoId);
        console.log(`Video status check ${attempts + 1}/${maxAttempts}:`, status);
        
        // Update progress incrementally during processing
        const processingProgress = 60 + Math.min(attempts * 1, 30);
        await supabase
          .from('pending_uploads')
          .update({ upload_progress: processingProgress })
          .eq('id', pendingUploadId);
        
        if (status.status === 4) {
          processed = true;
          console.log('✅ Video processing complete!');
        }
        attempts++;
      }

      if (!processed) {
        throw new Error('Video processing timeout');
      }

      console.log('✅ Video processed successfully');

      // Update progress: 95% - Saving to database
      console.log('📊 Progress: 95% - Saving to database');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 95 })
        .eq('id', pendingUploadId);

      const videoUrl = bunnyVideoId;
      const thumbnailUrl = `https://${process.env.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME}/${bunnyVideoId}/thumbnail.jpg`;

      console.log('💾 Saving video to database...');
      const videoRecord: any = {
        user_id: userId,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption,
        tags: tags,
        location_latitude: loc.latitude,
        location_longitude: loc.longitude,
        location_name: loc.name,
        location_privacy: privacy,
        moderation_status: 'pending',
        is_approved: false, // Start as not approved until moderation completes
      };

      const { data: video, error: dbError } = await supabase
        .from('videos')
        .insert(videoRecord)
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        throw dbError;
      }

      console.log('✅ Video saved to database:', video.id);

      // If this fulfills a request, create fulfillment record
      if (reqId) {
        console.log('📝 Creating request fulfillment record...');
        const { error: fulfillmentError } = await supabase
          .from('request_fulfillments')
          .insert({
            request_id: reqId,
            video_id: video.id,
            user_id: userId,
          });

        if (fulfillmentError) {
          console.error('❌ Error creating fulfillment:', fulfillmentError);
        } else {
          console.log('✅ Request fulfillment created successfully');
        }
      }

      // Update progress: 100% - Complete
      console.log('📊 Progress: 100% - Complete');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 100, status: 'completed' })
        .eq('id', pendingUploadId);

      // Delete pending upload record after a short delay
      setTimeout(async () => {
        console.log('🧹 Cleaning up pending upload record...');
        await supabase
          .from('pending_uploads')
          .delete()
          .eq('id', pendingUploadId);
        console.log('✅ Pending upload record deleted');
      }, 3000);

      // 🚨 CRITICAL: Call moderate-video Edge Function to trigger AI moderation
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 TRIGGERING AWS REKOGNITION MODERATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Video ID:', video.id);
      console.log('Video URL:', videoUrl);
      console.log('User ID:', userId);
      
      try {
        const { data: moderationData, error: moderationError } = await supabase.functions.invoke(
          'moderate-video',
          {
            body: {
              videoId: video.id,
              videoUrl: videoUrl,
              thumbnailUrl: thumbnailUrl,
              userId: userId,
            },
          }
        );

        if (moderationError) {
          console.error('❌ Moderation invocation error:', moderationError);
          console.error('Error details:', JSON.stringify(moderationError, null, 2));
        } else {
          console.log('✅ AWS Rekognition moderation triggered successfully');
          console.log('Moderation response:', moderationData);
        }
      } catch (moderationError: any) {
        console.error('❌ Error calling moderation function:', moderationError);
        console.error('Error message:', moderationError.message);
        console.error('Error stack:', moderationError.stack);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ BACKGROUND UPLOAD COMPLETED SUCCESSFULLY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ BACKGROUND UPLOAD ERROR');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      
      await supabase
        .from('pending_uploads')
        .update({ 
          status: 'failed',
          error_message: error.message || 'Unknown error'
        })
        .eq('id', pendingUploadId);
    } finally {
      // Reset upload flags after completion or error
      console.log('🔓 Resetting upload flags...');
      uploadInProgressRef.current = false;
      // Note: We don't reset uploadStartedRef because the user has already navigated away
      // This prevents them from uploading the same video again if they come back to this screen
    }
  };

  const handleCancelUpload = () => {
    if (isUploading) {
      Alert.alert(
        'Upload in Progress',
        'Your video is being uploaded. Are you sure you want to cancel?',
        [
          { text: 'Continue Upload', style: 'cancel' },
          {
            text: 'Cancel Upload',
            style: 'destructive',
            onPress: () => {
              console.log('User cancelled upload');
              uploadStartedRef.current = false;
              uploadInProgressRef.current = false;
              setIsUploading(false);
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {requestId ? 'Fulfill Request' : 'Upload Video'}
          </Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={handleCancelUpload} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {requestId ? 'Fulfill Request' : 'Upload Video'}
        </Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Video Ready</Text>
            <View style={styles.videoPreview}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={48} color={colors.primary} />
              <Text style={styles.videoPreviewText}>Video recorded successfully</Text>
              <Pressable onPress={handleRecordAgain} style={styles.rerecordButton}>
                <Text style={styles.rerecordButtonText}>Record Again</Text>
              </Pressable>
            </View>
          </View>

          {requestId && (
            <View style={styles.warningSection}>
              <View style={styles.warningHeader}>
                <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={24} color={colors.primary} />
                <Text style={styles.warningTitle}>Important Notice</Text>
              </View>
              <Text style={styles.warningText}>
                Please note, by taking this request, your video will be downloadable for the requester for 3 days.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Pressable 
                onPress={handleGenerateDescription} 
                style={styles.generateButton}
                disabled={isGeneratingDescription}
              >
                {isGeneratingDescription ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                    <Text style={styles.generateButtonText}>AI Generate</Text>
                  </>
                )}
              </Pressable>
            </View>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="E.g., my dog friend"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.helperText}>
              Type a short description, then tap AI Generate to make it more vivid
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Hashtags</Text>
              <Pressable onPress={handleGenerateHashtags} style={styles.generateButton}>
                <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                <Text style={styles.generateButtonText}>Suggest</Text>
              </Pressable>
            </View>
            
            {suggestedHashtags.length > 0 && (
              <View style={styles.hashtagsContainer}>
                {suggestedHashtags.map((tag, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.hashtagChip,
                      hashtags.includes(tag) && styles.hashtagChipActive,
                    ]}
                    onPress={() => toggleHashtag(tag)}
                  >
                    <Text
                      style={[
                        styles.hashtagChipText,
                        hashtags.includes(tag) && styles.hashtagChipTextActive,
                      ]}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Pressable 
                onPress={() => refreshLocation(true)} 
                style={styles.refreshButton}
                disabled={isRefreshingLocation}
              >
                {isRefreshingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={16} color={colors.primary} />
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </>
                )}
              </Pressable>
            </View>
            <View style={styles.locationCard}>
              <IconSymbol ios_icon_name="location.fill" android_material_icon_name="location-on" size={24} color={colors.primary} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{location?.name || 'Unknown'}</Text>
                <Text style={styles.locationCoords}>
                  {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.helperText}>
              Location is automatically refreshed when you record a video. Tap Refresh to update it manually.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location Privacy</Text>
            <View style={styles.privacyOptions}>
              {(['exact', '3km', '10km'] as LocationPrivacy[]).map((privacy) => (
                <Pressable
                  key={privacy}
                  style={[
                    styles.privacyOption,
                    locationPrivacy === privacy && styles.privacyOptionActive,
                  ]}
                  onPress={() => setLocationPrivacy(privacy)}
                >
                  <IconSymbol
                    ios_icon_name={getPrivacyIcon(privacy)}
                    android_material_icon_name="circle"
                    size={24}
                    color={locationPrivacy === privacy ? '#FFFFFF' : colors.text}
                  />
                  <Text
                    style={[
                      styles.privacyOptionText,
                      locationPrivacy === privacy && styles.privacyOptionTextActive,
                    ]}
                  >
                    {getPrivacyDescription(privacy)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
            onPress={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : (
              <>
                <IconSymbol ios_icon_name="arrow.up.circle.fill" android_material_icon_name="upload" size={24} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Upload Video</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'center',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
    minWidth: 90,
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  videoPreview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  videoPreviewText: {
    fontSize: 16,
    color: colors.text,
  },
  rerecordButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  rerecordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  descriptionInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hashtagChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hashtagChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hashtagChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  hashtagChipTextActive: {
    color: '#FFFFFF',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  privacyOptions: {
    gap: 12,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
  },
  privacyOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  privacyOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  privacyOptionTextActive: {
    color: '#FFFFFF',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningSection: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  warningText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
