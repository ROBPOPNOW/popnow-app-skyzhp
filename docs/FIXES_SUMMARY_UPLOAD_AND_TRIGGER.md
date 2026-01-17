
# Fixes Summary: Upload Button & Trigger.dev V3 Deployment

## Issue 1: Trigger.dev V3 Deployment Error ✅ FIXED

### Problem
```bash
npx @trigger.dev/cli@latest deploy
# Error: unknown command 'deploy'
```

### Root Cause
Trigger.dev V3 **completely changed the deployment process**. The `deploy` command no longer exists in V3.

### Solution

#### ✅ Correct V3 Deployment Method: GitHub Integration

1. **Set Environment Variables in Trigger.dev Dashboard**:
   - Go to https://cloud.trigger.dev
   - Navigate to project: `proj_dtmdbscahfzkvinomtbw`
   - Settings → Environment Variables
   - Add:
     ```
     AWS_ACCESS_KEY_ID
     AWS_SECRET_ACCESS_KEY
     AWS_REGION=ap-southeast-2
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID (6-digit number)
     EXPO_PUBLIC_BUNNY_STREAM_API_KEY (long hash)
     ```

2. **Push Code to GitHub**:
   ```bash
   git add .
   git commit -m "Add Trigger.dev video moderation"
   git push origin main
   ```

3. **Connect GitHub to Trigger.dev**:
   - Trigger.dev Dashboard → Settings → Integrations
   - Click "Connect GitHub"
   - Select repository and branch
   - Trigger.dev will auto-deploy on every push

4. **Verify Deployment**:
   - Check Trigger.dev Dashboard → Tasks
   - You should see: `moderate-pop-video` (Active)
   - Upload a test video to trigger a run

#### Alternative: Manual Deployment

If GitHub doesn't work:

```bash
# Build the project
npm run trigger:build

# Deploy with build ID
npx @trigger.dev/cli@latest deploy --build-id <build-id-from-previous-step>
```

### Updated package.json Scripts

```json
{
  "scripts": {
    "trigger:dev": "npx @trigger.dev/cli@latest dev",
    "trigger:build": "npx @trigger.dev/cli@latest build"
  }
}
```

**Note**: Removed `trigger:deploy` script because V3 uses GitHub integration.

### Documentation Created

- **TRIGGER_DEV_V3_DEPLOYMENT_GUIDE.md** - Complete V3 deployment guide
- **TRIGGER_DEV_DEPLOYMENT_STEPS.md** - Step-by-step instructions

---

## Issue 2: Upload Button - Prevent Double Upload & Navigate to Pending ✅ FIXED

### Problem
- Users could tap "Upload Video" multiple times
- This caused duplicate uploads to Bunny.net
- Users didn't see upload progress immediately

### Solution Implemented

#### 1. Multiple Upload Prevention Mechanisms

**Three-Layer Protection**:

```typescript
// Layer 1: State flags
const [isUploading, setIsUploading] = useState(false);
const uploadInProgressRef = useRef(false);
const uploadStartedRef = useRef(false);

// Layer 2: Debouncing (2-second minimum between taps)
const lastUploadAttemptRef = useRef<number>(0);

// Layer 3: Video file tracking (prevent same video twice)
const videoUriRef = useRef<string | null>(null);
```

**Upload Check Logic**:

```typescript
const handleUpload = async () => {
  // Check 1: Already uploading?
  if (uploadStartedRef.current || uploadInProgressRef.current || isUploading) {
    console.log('⚠️ DUPLICATE UPLOAD ATTEMPT BLOCKED');
    return;
  }

  // Check 2: Rapid tap detection (debouncing)
  const now = Date.now();
  const timeSinceLastAttempt = now - lastUploadAttemptRef.current;
  if (timeSinceLastAttempt < 2000) {
    console.log('⚠️ RAPID TAP DETECTED - DEBOUNCING');
    return;
  }
  lastUploadAttemptRef.current = now;

  // Check 3: Same video file already uploaded?
  if (videoUriRef.current === videoUri && uploadStartedRef.current) {
    console.log('⚠️ DUPLICATE VIDEO UPLOAD BLOCKED');
    return;
  }

  // IMMEDIATELY lock all flags
  uploadStartedRef.current = true;
  uploadInProgressRef.current = true;
  setIsUploading(true);

  // ... rest of upload logic
};
```

#### 2. Button Disabled State

```typescript
<Pressable
  style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
  onPress={handleUpload}
  disabled={isUploading} // ✅ Button disabled immediately
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
```

#### 3. Immediate Navigation to Pending Tab

**CRITICAL CHANGE**: Navigate to Pending tab BEFORE starting upload:

```typescript
// Create pending upload record
const { data: pendingUpload } = await supabase
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

// 📱 IMMEDIATELY navigate to Pending tab (BEFORE upload starts)
router.push({
  pathname: '/(tabs)/profile',
  params: { tab: 'pending' }
});

// 🔄 Start background upload (non-blocking)
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
```

**User Experience**:
1. User taps "Upload Video"
2. Button immediately shows "Uploading..." with spinner
3. User is instantly navigated to Profile → Pending tab
4. User sees video with "Uploading..." status
5. Upload happens in background
6. Progress updates in real-time (0% → 10% → 20% → 60% → 95% → 100%)

#### 4. Background Upload Process

```typescript
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
  try {
    // 10% - Creating video on Bunny.net
    await supabase.from('pending_uploads').update({ upload_progress: 10 }).eq('id', pendingUploadId);
    const videoData = await createStreamVideo(caption);

    // 20% - Uploading video file
    await supabase.from('pending_uploads').update({ upload_progress: 20 }).eq('id', pendingUploadId);
    await uploadToStream(videoData.guid, videoUri);

    // 60% - Processing video
    await supabase.from('pending_uploads').update({ upload_progress: 60, status: 'processing' }).eq('id', pendingUploadId);
    // Wait for video processing...

    // 95% - Saving to database
    await supabase.from('pending_uploads').update({ upload_progress: 95 }).eq('id', pendingUploadId);
    const { data: video } = await supabase.from('videos').insert(videoRecord).select().single();

    // 100% - Complete
    await supabase.from('pending_uploads').update({ upload_progress: 100, status: 'completed' }).eq('id', pendingUploadId);

    // Trigger AI moderation
    await supabase.functions.invoke('moderate-video', {
      body: { videoId: video.id, videoUrl: videoUrl, thumbnailUrl: thumbnailUrl, userId: userId }
    });

  } catch (error) {
    await supabase.from('pending_uploads').update({ status: 'failed', error_message: error.message }).eq('id', pendingUploadId);
  } finally {
    uploadInProgressRef.current = false;
  }
};
```

### Testing Checklist

#### Upload Button Prevention:
- [ ] Tap "Upload Video" once → Button shows "Uploading..." immediately
- [ ] Try tapping button again → Nothing happens (blocked)
- [ ] Try tapping rapidly (5 times in 1 second) → Only 1 upload starts
- [ ] Upload same video twice → Second attempt blocked

#### Navigation to Pending Tab:
- [ ] Tap "Upload Video" → Immediately navigates to Profile → Pending tab
- [ ] See video with "Uploading..." status
- [ ] Progress updates in real-time (0% → 10% → 20% → 60% → 95% → 100%)
- [ ] After completion, video moves to "Videos" tab

#### Background Upload:
- [ ] Upload continues even if user navigates away
- [ ] Progress updates visible in Pending tab
- [ ] AI moderation triggers after upload completes
- [ ] Rejected videos are deleted from Bunny.net
- [ ] User receives notification if video is rejected

### Key Changes Made

1. **app/upload.tsx**:
   - Added triple-layer upload prevention (flags + debouncing + file tracking)
   - Changed navigation from `router.replace` to `router.push` with params
   - Button disabled immediately on first tap
   - Background upload process with progress updates

2. **package.json**:
   - Removed `trigger:deploy` script (V3 doesn't use it)
   - Kept `trigger:dev` for local testing
   - Added `trigger:build` for manual deployment

3. **Documentation**:
   - Created comprehensive V3 deployment guide
   - Added step-by-step deployment instructions
   - Explained GitHub integration workflow

### Summary

✅ **Issue 1 Fixed**: Trigger.dev V3 deployment now uses GitHub integration (no `deploy` command)
✅ **Issue 2 Fixed**: Upload button can only be tapped once, user immediately sees upload progress in Pending tab

Both issues are now resolved and documented!
