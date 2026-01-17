
# Integration Checklist

## 🔍 Quick Verification Guide

Use this checklist to verify all integrations are working correctly.

## 1. Environment Variables (.env)

### ✅ Verify Keys Are Set

Open `.env` file and check:

```bash
# Supabase (Already configured)
✅ EXPO_PUBLIC_SUPABASE_URL
✅ EXPO_PUBLIC_SUPABASE_ANON_KEY

# Bunny.net (Need to configure)
⚠️ EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME
⚠️ EXPO_PUBLIC_BUNNY_STORAGE_API_KEY
⚠️ EXPO_PUBLIC_BUNNY_CDN_HOSTNAME
⚠️ EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID
⚠️ EXPO_PUBLIC_BUNNY_STREAM_API_KEY
⚠️ EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME
```

### 🧪 Test Environment Variables

Add this to any component to test:

```typescript
console.log('Bunny Storage Zone:', process.env.EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME);
console.log('Bunny Stream Library:', process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID);
console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
```

## 2. Bunny.net Integration

### ✅ Storage Zone Setup

1. Create Storage Zone in Bunny.net dashboard
2. Copy Storage Zone Name → `.env`
3. Copy API Key → `.env`
4. Test upload: `utils/bunnynet.ts` → `uploadVideoToBunny()`

### ✅ Stream Library Setup

1. Create Stream Library in Bunny.net dashboard
2. Copy Library ID → `.env`
3. Copy API Key → `.env`
4. Copy Stream CDN Hostname → `.env`
5. Test: `utils/bunnynet.ts` → `createStreamVideo()`

### 🧪 Test Bunny.net

```typescript
// In app/upload.tsx, check console logs:
// ✅ "Creating video in Bunny Stream: [title]"
// ✅ "Video created in Stream: [guid]"
// ✅ "Uploading video to Stream for transcoding: [guid]"
// ✅ "Video uploaded to Stream successfully"
```

## 3. Hive AI Integration

### ✅ API Key Setup

1. Get API key from [Hive AI Dashboard](https://thehive.ai/)
2. Add to Supabase Edge Function secrets:
   ```bash
   supabase secrets set HIVE_API_KEY=your-key-here
   ```
3. Or via Supabase Dashboard → Edge Functions → Secrets

### 🧪 Test Hive AI

Check Supabase Edge Function logs:
```
✅ "Calling Hive AI API for moderation..."
✅ "Hive AI response: {...}"
✅ "Video [id] moderation complete: approved/flagged"
```

If you see "HIVE_API_KEY not set, using mock moderation", the key is not configured.

## 4. Leaflet Map Integration

### ✅ Map Tab Setup

1. Check `app/(tabs)/map.tsx` exists ✅
2. Check `app/(tabs)/_layout.tsx` includes map tab ✅
3. Check `components/LeafletMap.tsx` exists ✅

### 🧪 Test Map

1. Open app
2. Navigate to Map tab (3rd tab)
3. Should see:
   - ✅ OpenStreetMap tiles loading
   - ✅ Your location centered
   - ✅ Markers for video locations (if any)
   - ✅ Smooth pan and zoom

### 🐛 Map Troubleshooting

**Map not showing:**
- Check internet connection
- Check WebView console logs
- Verify location permissions granted

**Markers not showing:**
- Normal if no videos uploaded yet
- Check `videoLocations` state in `map.tsx`

## 5. Video Playback & Tab Bar

### ✅ Z-Index Hierarchy

```
Video Player (z-index: 1)
  ↓
Video Overlay (z-index: 100)
  ↓
Tab Bar (z-index: 10)
  ↓
Upload Button (z-index: 1000)
```

### 🧪 Test Video Playback

1. Open Home tab
2. Video should play full screen
3. Tab bar should be visible at bottom
4. Video should NOT be covered by tab bar
5. Upload button should float above everything

### ✅ Verify Styles

Check these files:
- `components/VideoPlayer.tsx` → `zIndex: 1`
- `components/VideoOverlay.tsx` → `zIndex: 100`
- `components/FloatingTabBar.tsx` → `zIndex: 10`
- `components/FloatingUploadButton.tsx` → `zIndex: 1000`

## 6. Database Tables

### ✅ Required Tables

Check Supabase Dashboard → Database → Tables:

```
✅ users
✅ videos
✅ likes
✅ comments
✅ follows
```

### ✅ RLS Policies

All tables should have RLS enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

## 7. Location Features

### ✅ Location Permissions

Check `app/(tabs)/(home)/index.tsx`:
```typescript
// Should request permissions on mount
const { status } = await Location.requestForegroundPermissionsAsync();
```

### 🧪 Test Location

1. Open app
2. Grant location permissions
3. Check console: "User location obtained: {...}"
4. Videos should show distance: "X km away from you"

## 8. Upload Flow

### ✅ Complete Upload Flow

1. Tap Upload button (floating +)
2. Grant location permission
3. Record video (≤ 30 seconds)
4. Add caption and tags
5. Tap "Upload Video"
6. Should see:
   - ✅ Progress bar (0% → 100%)
   - ✅ "Creating video in Bunny Stream"
   - ✅ "Video uploaded to stream"
   - ✅ "Video record created"
   - ✅ "Moderation result: {...}"
   - ✅ Success alert

## 9. Edge Functions

### ✅ Deployed Functions

Check Supabase Dashboard → Edge Functions:
```
✅ moderate-video (version 3)
```

### 🧪 Test Edge Function

```bash
# Via Supabase CLI
supabase functions invoke moderate-video --body '{"videoId":"test","videoUrl":"https://example.com/video.mp4","thumbnailUrl":"https://example.com/thumb.jpg"}'
```

## 10. Final Verification

### ✅ App Features Checklist

- [ ] Home feed shows videos sorted by distance
- [ ] Search tab works
- [ ] Map tab displays with markers
- [ ] Notifications tab loads
- [ ] Profile tab shows user info
- [ ] Upload button is visible and functional
- [ ] Videos play correctly
- [ ] Tab bar is always visible
- [ ] Location distance is shown on videos
- [ ] Upload to Bunny.net works
- [ ] Hive AI moderation runs automatically

## 🚨 Common Issues

### Issue: "Cannot read property 'EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME'"
**Solution**: Restart Expo dev server after updating `.env`

### Issue: Upload fails silently
**Solution**: Check console logs for specific error messages

### Issue: Map shows blank screen
**Solution**: Check internet connection and WebView permissions

### Issue: Videos don't play
**Solution**: Wait for Bunny.net transcoding (can take 1-2 minutes)

### Issue: Moderation always returns "mock"
**Solution**: Add HIVE_API_KEY to Supabase Edge Function secrets

## 📞 Support

If you encounter issues:
1. Check console logs first
2. Verify all environment variables are set
3. Check Supabase Edge Function logs
4. Review Bunny.net dashboard for upload status
5. Verify location permissions are granted

## ✅ Success Indicators

You'll know everything is working when:
- ✅ Videos upload successfully to Bunny.net
- ✅ Hive AI moderation runs automatically
- ✅ Map displays with your location
- ✅ Videos show distance from you
- ✅ Tab bar is always visible
- ✅ Upload button floats above everything
- ✅ No console errors
