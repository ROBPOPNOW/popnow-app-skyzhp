
# Environment Setup Guide for POPNOW

This guide will help you set up all the required API keys and environment variables for the POPNOW app.

## 📋 Prerequisites

Before you begin, make sure you have:
- A Supabase account and project
- A Bunny.net account
- A Hive AI account (for content moderation)

## 🔑 Environment Variables

The app uses a `.env` file to store all API keys and configuration. This file is already created in the root directory.

### 1. Supabase Configuration

These are already configured for your project:

```env
EXPO_PUBLIC_SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

✅ **Status**: Already configured

### 2. Bunny.net Configuration

You need to set up three Bunny.net services:

#### A. Storage Zone (for video files)

1. Go to [Bunny.net Dashboard](https://dash.bunny.net/)
2. Navigate to **Storage** → **Storage Zones**
3. Click **Add Storage Zone**
4. Name it (e.g., `popnow-videos`)
5. Select a region close to your users
6. Copy the **Storage Zone Name** and **API Key**

Update in `.env`:
```env
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=your-storage-zone-name
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key-here
```

#### B. Pull Zone (CDN for video delivery)

1. In Bunny.net Dashboard, go to **CDN** → **Pull Zones**
2. Click **Add Pull Zone**
3. Link it to your Storage Zone
4. Copy the **CDN Hostname** (e.g., `yourzone.b-cdn.net`)

Update in `.env`:
```env
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=your-cdn-hostname.b-cdn.net
```

#### C. Stream Library (for video transcoding)

1. In Bunny.net Dashboard, go to **Stream** → **Stream Libraries**
2. Click **Add Stream Library**
3. Name it (e.g., `popnow-stream`)
4. Copy the **Library ID** and **API Key**
5. Copy the **Stream CDN Hostname**

Update in `.env`:
```env
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key-here
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=your-stream-cdn-hostname.b-cdn.net
```

### 3. Hive AI Configuration

Hive AI is used for content moderation.

1. Go to [Hive AI](https://thehive.ai/)
2. Sign up for an account
3. Navigate to **API Keys** in your dashboard
4. Create a new API key
5. Copy the API key

**Important**: This key should be added to Supabase Edge Function secrets, NOT in the `.env` file.

To add it to Supabase:

```bash
# Using Supabase CLI
supabase secrets set HIVE_API_KEY=your-hive-api-key-here
```

Or via Supabase Dashboard:
1. Go to your project dashboard
2. Navigate to **Edge Functions** → **Secrets**
3. Add a new secret: `HIVE_API_KEY` with your API key

## 🧪 Testing the Integration

### Test Bunny.net Connection

1. Open the app
2. Navigate to the Upload screen
3. Record a short video
4. Try uploading it
5. Check the console logs for:
   - "Creating video in Bunny Stream"
   - "Video uploaded to stream"
   - "Video record created"

### Test Hive AI Moderation

1. After uploading a video, check the Supabase Edge Function logs
2. Look for:
   - "Calling Hive AI API for moderation..."
   - "Hive AI response: ..."
   - "Video moderation complete: approved/flagged"

### Test Leaflet Map

1. Open the app
2. Navigate to the **Map** tab (third tab in the bottom navigation)
3. You should see:
   - A Leaflet map with OpenStreetMap tiles
   - Your current location centered on the map
   - Video location markers (if any videos exist)

## 🐛 Troubleshooting

### Bunny.net Issues

**Problem**: Upload fails with "Upload failed: Unauthorized"
- **Solution**: Check that your `BUNNY_STORAGE_API_KEY` and `BUNNY_STREAM_API_KEY` are correct

**Problem**: Video doesn't play after upload
- **Solution**: Wait a few minutes for Bunny.net to transcode the video. Check the video status using the Bunny.net dashboard.

### Hive AI Issues

**Problem**: Moderation always returns "mock" results
- **Solution**: Make sure `HIVE_API_KEY` is set in Supabase Edge Function secrets

**Problem**: Hive AI API returns 401 Unauthorized
- **Solution**: Verify your API key is correct and has not expired

### Map Issues

**Problem**: Map doesn't display
- **Solution**: 
  - Check that you have internet connection (Leaflet loads tiles from OpenStreetMap)
  - Check console logs for WebView errors
  - Make sure location permissions are granted

**Problem**: Map shows but no markers
- **Solution**: This is normal if no videos have been uploaded yet. The map will show markers once videos with locations are added.

## 📱 App Features

### Bottom Navigation Tabs

The app now has 5 tabs:
1. **Home** - Video feed sorted by proximity to your location
2. **Search** - Search for videos, users, and tags
3. **Map** - Interactive map showing video locations
4. **Notifications** - Likes, comments, and follows
5. **Profile** - Your profile and uploaded videos

### Video Playback

- Videos play on top of the tab bar (z-index: 1)
- Tab bar is fixed at the bottom (z-index: 10)
- Upload button floats above everything (z-index: 1000)

### Location Features

- Videos show distance from your current location
- Format: "City, Region, Country • X km away from you"
- Home feed prioritizes nearby videos

## 🔒 Security Notes

1. **Never commit `.env` file to git** - It's already in `.gitignore`
2. **Hive AI key** should only be in Supabase Edge Function secrets
3. **Bunny.net keys** are safe to use in the app (they're scoped to your account)
4. **Supabase anon key** is safe to expose (it's protected by RLS policies)

## 📚 Additional Resources

- [Bunny.net Documentation](https://docs.bunny.net/)
- [Hive AI Documentation](https://docs.thehive.ai/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Leaflet Documentation](https://leafletjs.com/)

## ✅ Checklist

Before running the app in production, make sure:

- [ ] All Bunny.net keys are configured in `.env`
- [ ] Hive AI key is set in Supabase Edge Function secrets
- [ ] Supabase database tables are created (users, videos, likes, comments, follows)
- [ ] RLS policies are enabled on all tables
- [ ] Location permissions are requested in the app
- [ ] Map tab is visible in the bottom navigation
- [ ] Videos play correctly on top of the tab bar
- [ ] Upload functionality works with Bunny.net
- [ ] Content moderation runs automatically after upload

## 🎉 You're All Set!

Once you've completed all the steps above, your POPNOW app should be fully functional with:
- ✅ Video upload to Bunny.net
- ✅ AI content moderation with Hive AI
- ✅ Interactive map with Leaflet
- ✅ Location-based video feed
- ✅ Proper video playback above tab bar
