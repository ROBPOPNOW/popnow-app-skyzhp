
# Environment Variables Configuration Guide

This document provides a comprehensive guide to all environment variables required for the POPNOW app.

## Overview

The app uses environment variables to configure integrations with:
- **Supabase** - Authentication, database, and storage
- **Bunny.net** - Video storage, CDN, and streaming
- **Hive AI** - Content moderation (configured in Supabase Edge Functions)

## Setup Instructions

### 1. Create Your .env File

Copy the `.env.example` file to create your own `.env` file:

```bash
cp .env.example .env
```

### 2. Configure Supabase

Get these values from your Supabase project dashboard:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Where to find these:**
- Go to your Supabase project dashboard
- Navigate to Settings > API
- Copy the "Project URL" and "anon/public" key

### 3. Configure Bunny.net Storage

Set up video file storage:

```env
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=your-storage-zone-name
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key
```

**Where to find these:**
- Log in to Bunny.net dashboard
- Go to Storage > Your Storage Zone
- Copy the "Storage Zone Name"
- Go to "FTP & API Access" to get your API key

### 4. Configure Bunny.net CDN

Set up content delivery network for fast video playback:

```env
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=your-cdn-hostname.b-cdn.net
```

**Where to find this:**
- In Bunny.net dashboard
- Go to Pull Zones
- Copy the "CDN Hostname" (should end with .b-cdn.net)

### 5. Configure Bunny.net Stream

Set up video transcoding and adaptive streaming:

```env
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-stream-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=your-stream-cdn-hostname.b-cdn.net
```

**Where to find these:**
- In Bunny.net dashboard
- Go to Stream > Video Library
- Copy the "Library ID"
- Go to "API" tab to get the API key
- Copy the "Video Library Hostname"

### 6. Configure Hive AI (Content Moderation)

**IMPORTANT:** For security reasons, the Hive AI API key should NOT be stored in the `.env` file. Instead, add it to your Supabase Edge Function secrets.

**Steps to add Hive AI key to Supabase:**

1. Go to your Supabase project dashboard
2. Navigate to Edge Functions > Manage secrets
3. Add a new secret:
   - Key: `HIVE_API_KEY`
   - Value: Your Hive AI API key

**Where to get your Hive AI key:**
- Sign up at https://thehive.ai/
- Go to your dashboard
- Navigate to API Keys
- Create a new API key or copy an existing one

## Optional Configuration

### Development API URL

```env
EXPO_PUBLIC_API_URL=http://localhost:54321
```

Use this for local development with Supabase CLI.

### Google Maps (Optional)

If you want to use Google Maps instead of Leaflet:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### Mapbox (Optional)

If you want to use Mapbox instead of Leaflet:

```env
EXPO_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

## Verification Checklist

Use this checklist to ensure all required variables are configured:

- [ ] `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- [ ] `EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME` - Bunny.net storage zone
- [ ] `EXPO_PUBLIC_BUNNY_STORAGE_API_KEY` - Bunny.net storage API key
- [ ] `EXPO_PUBLIC_BUNNY_CDN_HOSTNAME` - Bunny.net CDN hostname
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID` - Bunny.net stream library ID
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_API_KEY` - Bunny.net stream API key
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME` - Bunny.net stream CDN hostname
- [ ] `HIVE_API_KEY` - Added to Supabase Edge Function secrets (NOT in .env)

## Testing Your Configuration

### Test Supabase Connection

```typescript
import { supabase } from '@/lib/supabase';

// Test connection
const { data, error } = await supabase.from('videos').select('count');
console.log('Supabase connected:', !error);
```

### Test Bunny.net Storage

```typescript
import { uploadVideoToBunny } from '@/utils/bunnynet';

// Test upload (use a small test file)
const result = await uploadVideoToBunny(testVideoUri, 'test.mp4');
console.log('Bunny.net storage working:', result.success);
```

### Test Bunny.net Stream

```typescript
import { createStreamVideo } from '@/utils/bunnynet';

// Test stream creation
const result = await createStreamVideo('Test Video');
console.log('Bunny.net stream working:', result.success);
```

### Test Hive AI (via Edge Function)

The Hive AI integration is tested through your Supabase Edge Function. Make sure you've deployed the moderation function and added the `HIVE_API_KEY` to your Supabase secrets.

## Security Best Practices

1. **Never commit .env files** - The `.gitignore` file already excludes `.env` files
2. **Use Supabase secrets for sensitive keys** - Store API keys like Hive AI in Supabase Edge Function secrets
3. **Rotate keys regularly** - Change your API keys periodically for security
4. **Use different keys for development and production** - Keep separate API keys for each environment
5. **Limit API key permissions** - Only grant necessary permissions to each API key

## Troubleshooting

### "Supabase URL is not defined"

- Check that `EXPO_PUBLIC_SUPABASE_URL` is set in your `.env` file
- Restart your Expo development server after adding the variable

### "Bunny.net upload failed"

- Verify your storage zone name and API key are correct
- Check that your storage zone is active in the Bunny.net dashboard
- Ensure your API key has write permissions

### "Video streaming not working"

- Confirm your stream library ID and API key are correct
- Check that your stream library is active
- Verify the CDN hostname is correct (should end with .b-cdn.net)

### "Content moderation not working"

- Ensure `HIVE_API_KEY` is added to Supabase Edge Function secrets
- Check that your Hive AI account is active and has API credits
- Verify your Edge Function is deployed and accessible

## Support

For issues with:
- **Supabase**: https://supabase.com/docs
- **Bunny.net**: https://docs.bunny.net/
- **Hive AI**: https://docs.thehive.ai/

## Next Steps

After configuring all environment variables:

1. Test each integration individually
2. Deploy your Supabase Edge Functions
3. Test the complete upload flow with moderation
4. Monitor your API usage in each service's dashboard
