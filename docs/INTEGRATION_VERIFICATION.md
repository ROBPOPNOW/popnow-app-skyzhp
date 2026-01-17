
# Integration Verification Guide

This guide helps you verify that all integrations (Supabase, Bunny.net, Hive AI) are working correctly.

## Pre-Verification Checklist

Before testing, ensure:
- [ ] All environment variables are set in `.env`
- [ ] `HIVE_API_KEY` is added to Supabase Edge Function secrets
- [ ] Expo dev server is running
- [ ] You have test video files ready (< 50MB, < 30 seconds)

## 1. Supabase Integration Verification

### Test Database Connection

```typescript
// Add this to a test screen or component
import { supabase } from '@/lib/supabase';

const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('count');
    
    if (error) {
      console.error('Supabase connection failed:', error);
      return false;
    }
    
    console.log('✅ Supabase connected successfully');
    return true;
  } catch (error) {
    console.error('Supabase connection error:', error);
    return false;
  }
};
```

### Test Authentication

```typescript
const testSupabaseAuth = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Auth check failed:', error);
      return false;
    }
    
    console.log('✅ Supabase auth working');
    console.log('Session:', data.session ? 'Active' : 'No session');
    return true;
  } catch (error) {
    console.error('Auth error:', error);
    return false;
  }
};
```

### Expected Results
- ✅ Connection successful
- ✅ Can query database
- ✅ Auth system responds

## 2. Bunny.net Storage Verification

### Test Storage Upload

```typescript
import { uploadVideoToBunny } from '@/utils/bunnynet';

const testBunnyStorage = async (testVideoUri: string) => {
  try {
    console.log('Testing Bunny.net storage upload...');
    
    const result = await uploadVideoToBunny(
      testVideoUri,
      `test-${Date.now()}.mp4`
    );
    
    if (result.success) {
      console.log('✅ Bunny.net storage upload successful');
      console.log('File URL:', result.url);
      return true;
    } else {
      console.error('❌ Upload failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('Storage test error:', error);
    return false;
  }
};
```

### Expected Results
- ✅ File uploads successfully
- ✅ Returns valid CDN URL
- ✅ File accessible via URL

### Common Issues

**Issue:** "Storage zone not found"
- **Fix:** Check `EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME` is correct

**Issue:** "Authentication failed"
- **Fix:** Verify `EXPO_PUBLIC_BUNNY_STORAGE_API_KEY` is correct

**Issue:** "File too large"
- **Fix:** Ensure test file is < 50MB

## 3. Bunny.net Stream Verification

### Test Stream Creation

```typescript
import { createStreamVideo, uploadToStream } from '@/utils/bunnynet';

const testBunnyStream = async (testVideoUri: string) => {
  try {
    console.log('Testing Bunny.net stream...');
    
    // Step 1: Create stream video
    const createResult = await createStreamVideo('Test Video');
    
    if (!createResult.success) {
      console.error('❌ Stream creation failed:', createResult.error);
      return false;
    }
    
    console.log('✅ Stream video created:', createResult.videoId);
    
    // Step 2: Upload video to stream
    const uploadResult = await uploadToStream(
      createResult.videoId,
      testVideoUri
    );
    
    if (!uploadResult.success) {
      console.error('❌ Stream upload failed:', uploadResult.error);
      return false;
    }
    
    console.log('✅ Video uploaded to stream successfully');
    return true;
  } catch (error) {
    console.error('Stream test error:', error);
    return false;
  }
};
```

### Expected Results
- ✅ Stream video created with ID
- ✅ Video uploaded successfully
- ✅ Video begins transcoding

### Common Issues

**Issue:** "Library not found"
- **Fix:** Check `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID` is correct

**Issue:** "Invalid API key"
- **Fix:** Verify `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` is correct

**Issue:** "Upload timeout"
- **Fix:** Check internet connection, try smaller file

## 4. Hive AI Moderation Verification

### Test Content Moderation

First, ensure you have an Edge Function for moderation. Here's a test function:

```typescript
// supabase/functions/test-moderation/index.ts

Deno.serve(async (req) => {
  const hiveApiKey = Deno.env.get('HIVE_API_KEY');
  
  if (!hiveApiKey) {
    return new Response(
      JSON.stringify({ error: 'HIVE_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    // Test with a sample image URL
    const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${hiveApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0',
      }),
    });
    
    const data = await response.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        hiveApiKeyConfigured: true,
        moderationResponse: data,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### Test from App

```typescript
import { supabase } from '@/lib/supabase';

const testHiveModeration = async () => {
  try {
    console.log('Testing Hive AI moderation...');
    
    const { data, error } = await supabase.functions.invoke('test-moderation');
    
    if (error) {
      console.error('❌ Moderation test failed:', error);
      return false;
    }
    
    if (data.success) {
      console.log('✅ Hive AI moderation working');
      console.log('Response:', data.moderationResponse);
      return true;
    } else {
      console.error('❌ Moderation failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Moderation test error:', error);
    return false;
  }
};
```

### Expected Results
- ✅ Edge Function responds
- ✅ Hive API key is configured
- ✅ Moderation analysis returned

### Common Issues

**Issue:** "HIVE_API_KEY not configured"
- **Fix:** Add key to Supabase Edge Function secrets (NOT .env)

**Issue:** "Invalid API key"
- **Fix:** Verify key from Hive AI dashboard is correct

**Issue:** "Insufficient credits"
- **Fix:** Add credits to your Hive AI account

## 5. Complete Integration Test

### Full Upload Flow Test

```typescript
const testCompleteUploadFlow = async (videoUri: string) => {
  console.log('🧪 Starting complete upload flow test...\n');
  
  // Test 1: Supabase
  console.log('1️⃣ Testing Supabase...');
  const supabaseOk = await testSupabaseConnection();
  if (!supabaseOk) {
    console.error('❌ Supabase test failed');
    return;
  }
  
  // Test 2: Bunny.net Storage
  console.log('\n2️⃣ Testing Bunny.net Storage...');
  const storageOk = await testBunnyStorage(videoUri);
  if (!storageOk) {
    console.error('❌ Storage test failed');
    return;
  }
  
  // Test 3: Bunny.net Stream
  console.log('\n3️⃣ Testing Bunny.net Stream...');
  const streamOk = await testBunnyStream(videoUri);
  if (!streamOk) {
    console.error('❌ Stream test failed');
    return;
  }
  
  // Test 4: Hive AI Moderation
  console.log('\n4️⃣ Testing Hive AI Moderation...');
  const moderationOk = await testHiveModeration();
  if (!moderationOk) {
    console.error('❌ Moderation test failed');
    return;
  }
  
  console.log('\n✅ All integration tests passed!');
  console.log('🎉 Your app is ready to go!');
};
```

## 6. Manual Testing Checklist

### Upload Flow
- [ ] Open app and navigate to Upload tab
- [ ] Record or select a video (< 30 seconds)
- [ ] Add caption and location
- [ ] Tap upload button
- [ ] See upload progress
- [ ] Video appears in feed after upload
- [ ] Video plays smoothly from CDN

### Moderation Flow
- [ ] Upload a test video
- [ ] Check Supabase Edge Function logs
- [ ] Verify moderation API was called
- [ ] Check video status in database
- [ ] Confirm appropriate videos are approved
- [ ] Confirm inappropriate content is flagged

### Playback Flow
- [ ] Videos load quickly
- [ ] Smooth playback without buffering
- [ ] Can like/comment/share videos
- [ ] Location info displays correctly
- [ ] User profiles load properly

## 7. Monitoring and Logs

### Check Supabase Logs

1. Go to Supabase Dashboard
2. Navigate to Logs
3. Select "Edge Functions"
4. Look for moderation function calls
5. Check for errors or warnings

### Check Bunny.net Stats

1. Go to Bunny.net Dashboard
2. Navigate to Statistics
3. Check storage usage
4. Check bandwidth usage
5. Verify video transcoding status

### Check Hive AI Usage

1. Go to Hive AI Dashboard
2. Check API usage statistics
3. Verify credit balance
4. Review moderation results

## 8. Performance Benchmarks

### Expected Performance

**Upload Times:**
- 10 MB video: ~5-10 seconds
- 30 MB video: ~15-30 seconds
- 50 MB video: ~30-60 seconds

**Transcoding Times:**
- 10 second video: ~30-60 seconds
- 20 second video: ~60-90 seconds
- 30 second video: ~90-120 seconds

**Moderation Times:**
- Image analysis: ~1-2 seconds
- Video analysis: ~5-10 seconds per video

**Playback:**
- Initial load: < 2 seconds
- Buffering: Minimal on 4G/5G
- Quality: Adaptive based on connection

## 9. Troubleshooting Guide

### All Tests Failing

**Possible Causes:**
1. Internet connection issues
2. Environment variables not loaded
3. Expo dev server needs restart

**Solutions:**
```bash
# Restart Expo with cache clear
expo start -c

# Check .env file exists
ls -la .env

# Verify environment variables are loaded
console.log(process.env.EXPO_PUBLIC_SUPABASE_URL);
```

### Specific Service Failing

**Supabase Issues:**
- Check project is not paused
- Verify API keys are correct
- Check database tables exist

**Bunny.net Issues:**
- Verify account is active
- Check storage zone is enabled
- Ensure API keys have correct permissions

**Hive AI Issues:**
- Verify account has credits
- Check API key is in Supabase secrets
- Ensure Edge Function is deployed

## 10. Success Criteria

Your integration is successful when:

✅ **Supabase:**
- Can connect to database
- Can authenticate users
- Can store video metadata

✅ **Bunny.net:**
- Can upload videos to storage
- Can create stream videos
- Videos play from CDN

✅ **Hive AI:**
- Moderation API responds
- Content is analyzed
- Results are stored

✅ **Complete Flow:**
- User can upload video
- Video is moderated automatically
- Approved videos appear in feed
- Videos play smoothly

## Next Steps

Once all verifications pass:

1. ✅ Test on physical device (not just simulator)
2. ✅ Test with different video formats
3. ✅ Test with poor network conditions
4. ✅ Test with multiple concurrent uploads
5. ✅ Set up error monitoring (Sentry, etc.)
6. ✅ Configure analytics
7. ✅ Prepare for production deployment

## Support

If tests fail:
1. Check the specific error messages
2. Review the troubleshooting section
3. Check service dashboards for issues
4. Review documentation files
5. Contact service support if needed

---

**Remember:** Test thoroughly before deploying to production!
