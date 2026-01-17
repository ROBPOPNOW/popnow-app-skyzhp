
# Fixing Bunny.net Stream 403 Error

## Problem
Videos are showing as "Not Accessible" with a 403 status code in the Video Diagnostics. This indicates that Bunny.net Stream is blocking access to your videos due to security settings.

## Root Cause
Bunny.net Stream has security features that can restrict video access:
1. **Token Authentication** - Requires signed URLs with time-limited tokens
2. **Referrer Restrictions** - Blocks requests from unauthorized domains
3. **Geographic Restrictions** - Blocks access from certain countries
4. **IP Restrictions** - Blocks access from certain IP addresses

## Solution Options

### Option 1: Disable Token Authentication (Recommended for POPNOW)

This is the simplest solution for a public social media app where videos should be accessible to everyone.

#### Steps:
1. **Go to Bunny.net Dashboard**
   - Navigate to: https://dash.bunny.net/
   - Click on **Stream** in the left sidebar

2. **Select Your Stream Library**
   - Click on your library (the one matching your `BUNNY_STREAM_LIBRARY_ID`)

3. **Go to Security Settings**
   - Click on the **Security** tab

4. **Disable Token Authentication**
   - Find the **"Token Authentication"** section
   - Toggle it to **OFF** or **Disabled**
   - Click **Save Changes**

5. **Configure Allowed Referrers (Optional)**
   - In the **"Allowed Referrer Domains"** section
   - Either:
     - Leave it empty to allow all domains
     - Add your app's domain (e.g., `natively.dev`, `localhost`)
   - Click **Save Changes**

6. **Test the Fix**
   - Restart your app
   - Click the 🔍 diagnostic button on the home screen
   - All videos should now show as "✅ Accessible"

### Option 2: Enable Token Authentication (More Secure)

If you want to keep token authentication enabled for better security, you need to:

1. **Get Your Token Authentication Key**
   - Go to Bunny.net Dashboard → Stream → Your Library → Security
   - Copy the **"Token Authentication Key"**

2. **Add to Environment Variables**
   - Open your `.env` file
   - Add: `EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY=your-token-key-here`
   - Save the file

3. **Restart Your App**
   - Stop the Expo dev server
   - Run `npm run dev` again
   - The app will now generate signed URLs with tokens

4. **Update Video Player (if needed)**
   - The `getVideoPlaybackUrl()` function now supports token authentication
   - It will automatically detect if token auth is needed based on 403 errors

### Option 3: Configure Referrer Restrictions

If you want to allow specific domains only:

1. **Go to Security Settings**
   - Bunny.net Dashboard → Stream → Your Library → Security

2. **Add Allowed Referrers**
   - In the **"Allowed Referrer Domains"** section
   - Add your domains (one per line):
     ```
     natively.dev
     localhost
     *.natively.dev
     ```
   - Click **Save Changes**

## Verification Steps

After applying any of the above solutions:

1. **Check Configuration**
   ```bash
   # Make sure your .env file has:
   EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net
   EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
   EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-api-key
   ```

2. **Restart the App**
   ```bash
   # Stop the dev server (Ctrl+C)
   npm run dev
   ```

3. **Run Diagnostics**
   - Open the app
   - Click the 🔍 button in the top-right corner
   - Check if videos show as "✅ Accessible"

4. **Test Video Playback**
   - Try playing a video in the feed
   - It should load and play without errors

## Common Issues

### Issue 1: Still Getting 403 After Disabling Token Auth
**Solution:**
- Clear your browser cache
- Wait 5-10 minutes for CDN cache to clear
- Try accessing the video URL directly in a browser
- Check if there are other security restrictions enabled

### Issue 2: Videos Work in Browser But Not in App
**Solution:**
- Check if "Allowed Referrer Domains" is restricting access
- Add `localhost` and your app's domain to allowed referrers
- Or disable referrer restrictions entirely

### Issue 3: Token Authentication Not Working
**Solution:**
- Verify the token key is correct in your `.env` file
- Make sure you're using the **Token Authentication Key**, not the API Key
- Check that the key doesn't have extra spaces or quotes

### Issue 4: Some Videos Work, Others Don't
**Solution:**
- Check if videos are still processing (status should be 3 or 4)
- Verify all videos are in the same library
- Check if some videos have individual security settings

## Testing Video URLs Manually

You can test if a video URL is accessible by opening it in a browser:

```
https://vz-60af4a59-0b4.b-cdn.net/YOUR-VIDEO-GUID/playlist.m3u8
```

**Expected Results:**
- ✅ **200 OK**: Video is accessible (you'll see the HLS playlist)
- ❌ **403 Forbidden**: Security settings are blocking access
- ❌ **404 Not Found**: Video doesn't exist or wrong CDN hostname

## Additional Resources

- [Bunny.net Stream Documentation](https://docs.bunny.net/docs/stream)
- [Bunny.net Stream Security](https://docs.bunny.net/docs/stream-security)
- [Token Authentication Guide](https://docs.bunny.net/docs/stream-token-authentication)

## Need More Help?

If you're still experiencing issues:

1. **Check Bunny.net Status**
   - Visit: https://status.bunny.net/

2. **Contact Bunny.net Support**
   - Email: support@bunny.net
   - Include your library ID and video GUID

3. **Check App Logs**
   - Look for error messages in the console
   - Share the diagnostic results from the 🔍 button

## Summary

**For POPNOW (Public Social Media App):**
- **Recommended**: Disable token authentication in Bunny.net Stream settings
- This allows all videos to be publicly accessible
- Simplest solution with no code changes needed

**For Private/Secure Apps:**
- Enable token authentication
- Add `EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY` to `.env`
- The app will automatically generate signed URLs
