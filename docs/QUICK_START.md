
# POPNOW Quick Start Guide

Welcome to POPNOW! This guide will help you get your app up and running quickly.

## What Changed?

### ✅ Removed Features
- Explore tab with map view
- Heatmap functionality

### ✅ New Features
- Location-based video feed (sorted by distance)
- Distance display on videos (e.g., "Auckland, New Zealand • 10 km away from you")
- Fixed bottom navigation (Home, Search, Notifications, Profile)
- Bunny.net integration for video hosting
- Hive AI integration for content moderation

## Prerequisites

Before you start, make sure you have:

- [ ] Node.js installed (v18 or higher)
- [ ] Expo CLI installed (`npm install -g expo-cli`)
- [ ] A Supabase account and project
- [ ] A Bunny.net account (sign up at https://bunny.net)
- [ ] A Hive AI account (sign up at https://thehive.ai)

## Step-by-Step Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Set Up Bunny.net

Follow the detailed guide in `docs/BUNNY_NET_SETUP_GUIDE.md` or follow these quick steps:

1. **Create Storage Zone**
   - Go to Bunny.net Dashboard → Storage
   - Click "Add Storage Zone"
   - Name: `popnow-videos`
   - Region: Choose closest to your users
   - Copy the Storage Zone name and API key

2. **Create Pull Zone (CDN)**
   - Go to CDN → Add Pull Zone
   - Name: `popnow-cdn`
   - Origin: Select your Storage Zone
   - Copy the CDN hostname (e.g., `popnow-cdn.b-cdn.net`)

3. **Create Stream Library**
   - Go to Stream → Add Library
   - Name: `popnow-stream`
   - Enable "Direct Upload" and "Allow Early Play"
   - Copy Library ID, API key, and Stream CDN hostname

### Step 3: Set Up Hive AI

Follow the detailed guide in `docs/HIVE_AI_SETUP_GUIDE.md` or follow these quick steps:

1. **Create Account**
   - Go to https://thehive.ai
   - Sign up for an account
   - Choose a plan (Free tier available)

2. **Get API Key**
   - Go to Dashboard → API Keys
   - Create new key
   - Copy the API key

3. **Add to Supabase**
   ```bash
   supabase secrets set HIVE_API_KEY=your-hive-api-key
   ```

### Step 4: Configure Environment Variables

Create a `.env` file in your project root:

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Bunny.net Storage
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=popnow-videos
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key

# Bunny.net CDN
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=popnow-cdn.b-cdn.net

# Bunny.net Stream
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=12345
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-abc123.b-cdn.net
```

### Step 5: Deploy Supabase Edge Function

The moderation Edge Function code is provided in `docs/HIVE_AI_SETUP_GUIDE.md`.

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref spdsgmkirubngfdxxrzj

# Deploy the function
supabase functions deploy moderate-video
```

### Step 6: Run the App

```bash
# Start the development server
npm run dev

# Or for specific platforms
npm run ios      # iOS
npm run android  # Android
npm run web      # Web
```

## Testing Your Setup

### Test 1: Location Permissions

1. Open the app
2. You should be prompted for location permissions
3. Grant permissions
4. The Home feed should load videos sorted by distance

### Test 2: Video Upload

1. Tap the + button (floating upload button)
2. Grant camera permissions
3. Record a short video (≤ 30 seconds)
4. Choose location privacy (Exact, 3km, or 10km)
5. Add caption and tags
6. Tap "Upload Video"
7. Wait for upload to complete

### Test 3: Video Playback

1. Go to Home feed
2. Videos should play automatically
3. Swipe up/down to navigate between videos
4. Check that distance is displayed correctly

### Test 4: Navigation

1. Tap each tab in the bottom navigation
2. All tabs should work correctly
3. Upload button should be visible on all tabs

## Troubleshooting

### Videos Not Uploading

**Problem**: Upload fails or gets stuck

**Solutions**:
- Check Bunny.net API keys in `.env`
- Verify Storage Zone and Stream Library exist
- Check console logs for errors
- Try with a smaller video file

### Location Not Working

**Problem**: Location permissions denied or not working

**Solutions**:
- Check device location settings
- Grant location permissions in app settings
- Test on a real device (not simulator)
- Check console logs for location errors

### Videos Not Playing

**Problem**: Videos don't play or show black screen

**Solutions**:
- Wait for transcoding to complete (check Bunny.net dashboard)
- Verify Stream CDN hostname is correct
- Check video status with `getVideoStatus()`
- Ensure video was approved by moderation

### Moderation Not Working

**Problem**: Videos stay in "pending" status

**Solutions**:
- Verify Hive AI API key is set in Supabase secrets
- Check Edge Function logs in Supabase dashboard
- Ensure Edge Function is deployed
- Test with a known safe video

## App Structure

```
POPNOW/
├── Home Tab
│   ├── Location-based video feed
│   ├── Videos sorted by distance
│   └── Distance display on each video
│
├── Search Tab
│   ├── Search videos by caption/tags
│   ├── Search users
│   └── Search tags
│
├── Notifications Tab
│   ├── Likes notifications
│   ├── Comments notifications
│   └── Follow notifications
│
├── Profile Tab
│   ├── User profile info
│   ├── User's videos grid
│   └── Liked videos grid
│
└── Upload (Floating Button)
    ├── Record video (≤ 30 seconds)
    ├── Add caption and tags
    ├── Choose location privacy
    └── Upload to Bunny.net
```

## Key Features

### 1. Location-Based Feed

Videos are automatically sorted by distance from your current location. The closest videos appear first.

### 2. Distance Display

Each video shows:
- Location name (City, Region, Country)
- Distance from you (e.g., "10 km away from you")

### 3. Location Privacy

When uploading, users can choose:
- **Exact**: Show exact location
- **3km radius**: Show approximate location
- **10km radius**: Show approximate location

### 4. Content Moderation

All videos are automatically scanned by Hive AI for:
- Adult/NSFW content
- Violence and gore
- Hate symbols
- Inappropriate content

### 5. Video Processing

Videos are:
- Uploaded to Bunny.net Stream
- Automatically transcoded to multiple qualities
- Delivered via CDN for fast playback
- Thumbnails generated automatically

## Next Steps

1. **Customize Branding**
   - Update colors in `styles/commonStyles.ts`
   - Add your logo
   - Customize app name in `app.json`

2. **Build Admin Dashboard**
   - Create web interface for reviewing flagged videos
   - Add user management
   - Add analytics

3. **Add More Features**
   - Comments system
   - User profiles
   - Follow/unfollow
   - Push notifications
   - Video sharing

4. **Deploy to Production**
   - Build for iOS: `eas build --platform ios`
   - Build for Android: `eas build --platform android`
   - Submit to App Store and Google Play

## Resources

- **Bunny.net Setup**: `docs/BUNNY_NET_SETUP_GUIDE.md`
- **Hive AI Setup**: `docs/HIVE_AI_SETUP_GUIDE.md`
- **Full Setup Summary**: `docs/SETUP_SUMMARY.md`
- **Bunny.net Docs**: https://docs.bunny.net
- **Hive AI Docs**: https://docs.thehive.ai
- **Supabase Docs**: https://supabase.com/docs

## Support

If you encounter any issues:

1. Check the documentation in the `docs/` folder
2. Review console logs for errors
3. Check Bunny.net dashboard for upload status
4. Check Supabase dashboard for database records
5. Review Edge Function logs for moderation errors

## Summary

You've successfully set up POPNOW with:

- ✅ Location-based video feed
- ✅ Distance display on videos
- ✅ Fixed bottom navigation
- ✅ Bunny.net video hosting
- ✅ Hive AI content moderation
- ✅ Video upload with privacy options

Now you're ready to start building your social video app! 🚀
