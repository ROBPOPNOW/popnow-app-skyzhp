
# Video Resolution Guide for POPNOW

## Current Video Quality Settings

The app currently uses the following video quality settings:

### Recording Quality (app/upload.tsx)
```typescript
const result = await ImagePicker.launchCameraAsync({
  mediaTypes: ['videos'],
  videoMaxDuration: 30,
  quality: 1,  // Maximum quality (0-1 scale)
  allowsEditing: false,
});
```

## Improving Video Resolution

### 1. Camera Recording Quality

The `quality: 1` parameter in `ImagePicker.launchCameraAsync()` already sets the maximum quality. This means:
- **Quality: 1** = Highest quality (least compression)
- **Quality: 0** = Lowest quality (most compression)

### 2. Bunny.net Stream Encoding

Bunny.net Stream automatically transcodes videos to multiple resolutions:
- **1080p** (Full HD)
- **720p** (HD)
- **480p** (SD)
- **360p** (Mobile)

The player automatically selects the best quality based on:
- User's internet speed
- Device capabilities
- Screen size

### 3. Recommended Settings for Best Quality

#### For Recording:
```typescript
const result = await ImagePicker.launchCameraAsync({
  mediaTypes: ['videos'],
  videoMaxDuration: 30,
  quality: 1,  // Keep at maximum
  allowsEditing: false,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.High, // iOS specific
});
```

#### For Upload:
The current implementation already uploads at maximum quality to Bunny.net Stream, which then handles transcoding.

### 4. Video Player Quality

The video player uses HLS (HTTP Live Streaming) which automatically adapts quality based on:
- Network conditions
- Device performance
- Screen resolution

### 5. Troubleshooting Blurry Videos

If videos appear blurry, check:

1. **Source Video Quality**
   - Ensure good lighting when recording
   - Keep camera steady
   - Record in well-lit environments

2. **Network Connection**
   - Slow connections may cause lower quality playback
   - The HLS player automatically reduces quality on slow networks

3. **Bunny.net Stream Settings**
   - Check your Bunny.net Stream library settings
   - Ensure "Enable MP4 Fallback" is enabled
   - Verify encoding presets are set to "High Quality"

4. **Device Performance**
   - Older devices may struggle with high-resolution playback
   - The player automatically adjusts to device capabilities

### 6. Bunny.net Stream Configuration

To ensure maximum quality in Bunny.net:

1. Go to your Stream Library settings
2. Navigate to "Encoding" tab
3. Set these options:
   - **Video Codec**: H.264
   - **Quality Preset**: High Quality
   - **Resolutions**: Enable 1080p, 720p, 480p, 360p
   - **Bitrate Mode**: Variable (VBR)
   - **Target Bitrate**: 5000 kbps for 1080p

### 7. Testing Video Quality

Use the diagnostic tool in the app:
1. Open the home feed
2. Tap the 🔍 button in the top right
3. Check video accessibility and quality

### 8. Best Practices

- **Record in good lighting**: Natural light is best
- **Stable camera**: Use both hands or a tripod
- **Clean lens**: Wipe camera lens before recording
- **Avoid digital zoom**: Move closer instead
- **Record in landscape**: For better quality (optional)

### 9. File Size vs Quality

Current settings balance quality and file size:
- **Max duration**: 30 seconds
- **Max file size**: ~50 MB (enforced by Bunny.net)
- **Quality**: Maximum (quality: 1)

This provides excellent quality while keeping upload times reasonable.

### 10. Future Improvements

Consider implementing:
- Manual quality selection for users
- Quality preview before upload
- Compression settings based on network speed
- HDR video support (for compatible devices)

## Summary

The app is already configured for maximum video quality. If videos appear blurry:
1. Check recording conditions (lighting, stability)
2. Verify network connection
3. Check Bunny.net Stream encoding settings
4. Test on different devices

The quality parameter is already set to maximum (1), and Bunny.net Stream handles professional-grade transcoding automatically.
