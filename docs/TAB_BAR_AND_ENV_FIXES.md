
# Tab Bar and Environment Variables Fixes

This document summarizes the changes made to fix tab bar overlap issues, environment variable configuration, and tab bar layout.

## Changes Made

### 1. Environment Variables (.env.example)

**Updated:** `.env.example`

**Changes:**
- Added comprehensive comments for all Bunny.net configuration variables
- Added clear instructions about Hive AI API key placement in Supabase secrets
- Added optional configuration for Google Maps and Mapbox
- Improved organization and readability

**Key Points:**
- All Supabase keys are properly documented
- All Bunny.net keys (Storage, CDN, Stream) are included
- Hive AI key should be added to Supabase Edge Function secrets, NOT in .env file
- Optional map provider keys are documented

### 2. Video Overlay Component (components/VideoOverlay.tsx)

**Updated:** `components/VideoOverlay.tsx`

**Changes:**
- Increased `bottomInfo` bottom position from 140 to 200 pixels
- Increased `rightActions` bottom position from 180 to 220 pixels
- Extended `bottomGradient` height from 350 to 400 pixels
- All video information (description, tags, location, buttons) now visible above tab bar

**Before:**
```typescript
bottomInfo: {
  bottom: 140, // Too low, covered by tab bar
}
rightActions: {
  bottom: 180, // Too low, covered by tab bar
}
```

**After:**
```typescript
bottomInfo: {
  bottom: 200, // Now visible above tab bar
}
rightActions: {
  bottom: 220, // Now visible above tab bar
}
```

### 3. Tab Bar Configuration (app/(tabs)/_layout.tsx)

**Updated:** `app/(tabs)/_layout.tsx`

**Changes:**
- Configured tab bar with 5 tabs: Home, Map, Upload, Search, Profile
- Upload button is now the center tab with special styling (+ icon)
- Removed separate upload screen from tabs (it's now a modal route)
- Notifications moved to Profile tab

**Tab Order:**
1. Home - Video feed
2. Map - Location-based video discovery
3. Upload - Center button with gradient styling (+ icon)
4. Search - Search videos, users, tags
5. Profile - User profile with notifications

### 4. Removed Floating Upload Button

**Deleted:** References to `FloatingUploadButton` component

**Changes:**
- Removed from `app/(tabs)/map.tsx`
- Removed from `app/(tabs)/explore.tsx` (file deleted)
- Upload functionality now accessed via center tab bar button

### 5. Deleted Explore Screen

**Deleted:** `app/(tabs)/explore.tsx`

**Reason:**
- Redundant with new `map.tsx` screen
- Map functionality consolidated into dedicated Map tab

### 6. Updated Map Screen

**Updated:** `app/(tabs)/map.tsx`

**Changes:**
- Removed FloatingUploadButton import and usage
- Clean map interface without overlapping buttons
- All functionality accessible through tab bar

### 7. Updated Search Screen

**Updated:** `app/(tabs)/search.tsx`

**Changes:**
- Removed FloatingUploadButton import and usage
- Clean search interface
- Upload accessible via tab bar

## Tab Bar Layout Details

### Visual Structure

```
┌─────────────────────────────────────────┐
│                                         │
│         Video Content Area              │
│                                         │
│                                         │
│    [Description, Tags, Location]        │ ← Now visible (bottom: 200px)
│    [Like, Comment, Share buttons]       │ ← Now visible (bottom: 220px)
│                                         │
├─────────────────────────────────────────┤
│  🏠    🗺️    ➕    🔍    👤            │ ← Tab Bar (absolute bottom)
│ Home  Map  Upload Search Profile        │
└─────────────────────────────────────────┘
```

### Tab Bar Features

1. **Home Tab** - House icon, navigates to video feed
2. **Map Tab** - Map icon, shows location-based videos
3. **Upload Tab** - Plus icon with gradient background, elevated design
4. **Search Tab** - Magnifying glass icon, search functionality
5. **Profile Tab** - Person icon, includes notifications section

### Upload Button Styling

The upload button has special styling:
- Gradient background (primary to secondary color)
- Elevated position (marginTop: -20)
- Larger size (56x56 pixels)
- Box shadow for depth
- Rounded circle shape

## Testing Checklist

After these changes, verify:

- [ ] Video overlay content (description, tags, location) is fully visible
- [ ] Action buttons (like, comment, share) are fully visible
- [ ] Tab bar is at absolute bottom of screen
- [ ] No content is hidden behind tab bar
- [ ] Upload button in center of tab bar works correctly
- [ ] All 5 tabs navigate properly
- [ ] Notifications are accessible in Profile tab
- [ ] No floating upload buttons on any screen

## Environment Variables Checklist

Verify all keys are configured:

- [ ] `EXPO_PUBLIC_SUPABASE_URL`
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME`
- [ ] `EXPO_PUBLIC_BUNNY_STORAGE_API_KEY`
- [ ] `EXPO_PUBLIC_BUNNY_CDN_HOSTNAME`
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID`
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_API_KEY`
- [ ] `EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME`
- [ ] `HIVE_API_KEY` in Supabase Edge Function secrets

## Known Issues and Solutions

### Issue: Content still covered by tab bar
**Solution:** Increase bottom padding in VideoOverlay component further if needed

### Issue: Upload button not centered
**Solution:** Check that all 5 tabs are properly configured in _layout.tsx

### Issue: Hive AI moderation not working
**Solution:** Ensure HIVE_API_KEY is added to Supabase Edge Function secrets, not .env file

## Related Documentation

- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Complete environment setup guide
- [BUNNY_NET_INTEGRATION.md](./BUNNY_NET_INTEGRATION.md) - Bunny.net setup details
- [HIVE_AI_SETUP_GUIDE.md](./HIVE_AI_SETUP_GUIDE.md) - Hive AI moderation setup

## Next Steps

1. Copy `.env.example` to `.env` and fill in your actual API keys
2. Add `HIVE_API_KEY` to Supabase Edge Function secrets
3. Test video upload and playback
4. Test content moderation
5. Verify tab bar navigation on both iOS and Android
6. Test on different screen sizes to ensure proper spacing
