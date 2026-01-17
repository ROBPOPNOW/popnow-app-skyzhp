
# Environment Variables Checklist

## Quick Reference for .env File Setup

This checklist helps you verify that all environment variables are correctly configured.

## ✅ Supabase Configuration

**Status**: ✅ Already Configured

```env
EXPO_PUBLIC_SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZHNnbWtpcnVibmdmZHh4cnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMTMxNTksImV4cCI6MjA3NjY4OTE1OX0.1LzX5D49T5MU01Ew_JlY_5YXaeGlq3atHs0VIN1j7bM
```

- [x] Supabase URL is set
- [x] Supabase Anon Key is set
- [x] Project ID: `spdsgmkirubngfdxxrzj`
- [x] Region: `ap-southeast-2` (Sydney)

## ⚠️ Bunny.net Configuration

**Status**: ⚠️ Needs Configuration

### Storage Zone

```env
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=your-storage-zone-name
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key-here
```

**How to get these values:**

1. Go to https://dash.bunny.net/
2. Navigate to **Storage** → **Storage Zones**
3. Click **Add Storage Zone** (or select existing)
4. Copy the **Storage Zone Name**
5. Go to **FTP & API Access** → Copy the **Password/API Key**

**Checklist:**
- [ ] Storage Zone created in Bunny.net
- [ ] Storage Zone Name added to .env
- [ ] Storage API Key added to .env

### Pull Zone (CDN)

```env
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=your-cdn-hostname.b-cdn.net
```

**How to get this value:**

1. In Bunny.net dashboard, go to **CDN** → **Pull Zones**
2. Click **Add Pull Zone** (or select existing)
3. Link it to your Storage Zone
4. Copy the **CDN Hostname** (e.g., `popnow-cdn.b-cdn.net`)

**Checklist:**
- [ ] Pull Zone created in Bunny.net
- [ ] Pull Zone linked to Storage Zone
- [ ] CDN Hostname added to .env

### Stream Library

```env
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key-here
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=your-stream-cdn-hostname.b-cdn.net
```

**How to get these values:**

1. In Bunny.net dashboard, go to **Stream** → **Stream Libraries**
2. Click **Add Library** (or select existing)
3. Copy the **Library ID** (numeric value)
4. Go to **API** tab → Copy the **API Key**
5. Copy the **Stream CDN Hostname** (e.g., `vz-abc123.b-cdn.net`)

**Checklist:**
- [ ] Stream Library created in Bunny.net
- [ ] Library ID added to .env
- [ ] Stream API Key added to .env
- [ ] Stream CDN Hostname added to .env

## 🔐 Hive AI Configuration

**Status**: ⚠️ Needs Configuration

**IMPORTANT**: Hive AI key should NOT be in the `.env` file!

### Add to Supabase Edge Function Secrets

**Option 1: Using Supabase CLI**

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref spdsgmkirubngfdxxrzj

# Set the secret
supabase secrets set HIVE_API_KEY=your-hive-api-key-here
```

**Option 2: Using Supabase Dashboard**

1. Go to https://supabase.com/dashboard
2. Select project: **ROBPOPNOW's Project**
3. Navigate to **Edge Functions** → **Secrets**
4. Click **Add Secret**
5. Name: `HIVE_API_KEY`
6. Value: Your Hive AI API key
7. Click **Save**

**How to get Hive AI key:**

1. Go to https://thehive.ai/
2. Sign up or log in
3. Navigate to **API Keys** in dashboard
4. Create a new API key
5. Copy the key

**Checklist:**
- [ ] Hive AI account created
- [ ] API key generated
- [ ] API key added to Supabase Edge Function secrets
- [ ] Verified key is NOT in .env file

## 📋 Complete Checklist

### Required for App to Function

- [x] Supabase URL configured
- [x] Supabase Anon Key configured
- [ ] Bunny.net Storage Zone configured
- [ ] Bunny.net Pull Zone configured
- [ ] Bunny.net Stream Library configured
- [ ] Hive AI key in Supabase secrets

### Optional for Development

- [ ] `EXPO_PUBLIC_API_URL` set for local development

## 🧪 Testing Your Configuration

### Test Supabase Connection

```typescript
import { supabase } from '@/lib/supabase';

const testSupabase = async () => {
  const { data, error } = await supabase.from('videos').select('count');
  console.log('Supabase connection:', error ? 'Failed' : 'Success');
};
```

### Test Bunny.net Upload

```typescript
import { uploadVideoToBunny } from '@/utils/bunnynet';

const testBunny = async () => {
  try {
    const url = await uploadVideoToBunny('file:///test.mp4', 'test.mp4');
    console.log('Bunny.net upload: Success', url);
  } catch (error) {
    console.log('Bunny.net upload: Failed', error);
  }
};
```

### Test Hive AI Moderation

```typescript
import { supabase } from '@/lib/supabase';

const testHiveAI = async () => {
  const { data, error } = await supabase.functions.invoke('moderate-video', {
    body: {
      videoId: 'test-id',
      videoUrl: 'https://example.com/video.mp4',
    },
  });
  console.log('Hive AI moderation:', error ? 'Failed' : 'Success');
};
```

## 🚨 Common Issues

### Issue: "Upload failed: Unauthorized"

**Solution**: Check that your Bunny.net API keys are correct in the .env file.

### Issue: "Moderation failed: 401"

**Solution**: Verify that HIVE_API_KEY is set in Supabase Edge Function secrets, not in .env.

### Issue: "Video not playing"

**Solution**: 
1. Check that Bunny.net Stream CDN hostname is correct
2. Wait for video transcoding to complete (can take a few minutes)
3. Verify the video GUID is correct

### Issue: "Map not loading"

**Solution**: 
1. Check internet connection (Leaflet loads tiles from OpenStreetMap)
2. Grant location permissions
3. Check console logs for WebView errors

## 📚 Additional Resources

- **Bunny.net Setup**: See `docs/BUNNY_NET_SETUP_GUIDE.md`
- **Hive AI Setup**: See `docs/HIVE_AI_SETUP_GUIDE.md`
- **Environment Setup**: See `docs/ENVIRONMENT_SETUP.md`
- **Recent Updates**: See `docs/RECENT_UPDATES.md`

## 🎯 Quick Start

1. **Copy .env.example to .env** (already done)
2. **Fill in Bunny.net credentials** (see Bunny.net Setup Guide)
3. **Add Hive AI key to Supabase** (see Hive AI Setup Guide)
4. **Test the app** (run `npm run dev`)
5. **Upload a test video** (verify Bunny.net integration)
6. **Check moderation** (verify Hive AI integration)

## ✅ Final Verification

Before deploying to production, verify:

- [ ] All environment variables are set
- [ ] Hive AI key is in Supabase secrets (not .env)
- [ ] .env file is in .gitignore
- [ ] Test video upload works
- [ ] Test video playback works
- [ ] Test content moderation works
- [ ] Test map functionality works
- [ ] Test all 5 tabs work correctly
- [ ] Test notifications in Profile tab

## 🔒 Security Notes

1. **Never commit .env to Git** - It's already in .gitignore
2. **Hive AI key must be in Supabase secrets** - Not in .env
3. **Bunny.net keys are safe in .env** - They're scoped to your account
4. **Supabase anon key is safe to expose** - Protected by RLS policies

---

**Need Help?**

If you're stuck, check the detailed setup guides in the `docs/` folder or review the console logs for specific error messages.
