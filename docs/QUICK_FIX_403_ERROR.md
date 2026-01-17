
# Quick Fix: 403 Error on Videos

## The Problem
Your videos are showing "Not Accessible, Status: 403" in the Video Diagnostics.

## The Solution (Takes 2 minutes)

### Step 1: Go to Bunny.net Dashboard
1. Open https://dash.bunny.net/
2. Log in to your account

### Step 2: Navigate to Your Stream Library
1. Click **"Stream"** in the left sidebar
2. Click on your library (should match your library ID: check your `.env` file for `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID`)

### Step 3: Disable Token Authentication
1. Click on the **"Security"** tab
2. Find **"Token Authentication"** section
3. Toggle it to **OFF** or **Disabled**
4. Click **"Save Changes"**

### Step 4: Configure Referrer Settings (Optional)
1. In the same Security tab
2. Find **"Allowed Referrer Domains"**
3. Either:
   - Leave it **empty** (allows all domains) ✅ Recommended
   - Or add: `localhost`, `natively.dev`
4. Click **"Save Changes"**

### Step 5: Test the Fix
1. **Restart your app** (stop and run `npm run dev` again)
2. Open the app
3. Click the **🔍 button** in the top-right corner
4. All videos should now show **"✅ Accessible"**

## Why This Works
- Bunny.net Stream has token authentication enabled by default
- This requires signed URLs with time-limited tokens
- For a public social media app like POPNOW, you want videos to be publicly accessible
- Disabling token authentication allows direct access to video URLs

## Alternative: Keep Token Authentication Enabled
If you want to keep token authentication for security:

1. Get your **Token Authentication Key** from Bunny.net (Security tab)
2. Add to your `.env` file:
   ```
   EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY=your-token-key-here
   ```
3. Restart the app
4. The app will automatically generate signed URLs

## Still Not Working?

### Check Your CDN Hostname
Make sure your `.env` file has the correct Stream CDN hostname:
```
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net
```

**Note:** This should be your **Stream CDN hostname**, NOT your Pull Zone hostname!

### Clear CDN Cache
After making changes in Bunny.net:
1. Wait 5-10 minutes for changes to propagate
2. Or manually purge the CDN cache in Bunny.net dashboard

### Test Video URL Directly
Open this URL in your browser (replace with your video GUID):
```
https://vz-60af4a59-0b4.b-cdn.net/YOUR-VIDEO-GUID/playlist.m3u8
```

**Expected:**
- ✅ You see the HLS playlist (text file with video segments)
- ❌ 403 Forbidden = Security settings still blocking
- ❌ 404 Not Found = Wrong CDN hostname or video doesn't exist

## Need More Help?
See the detailed guide: `docs/BUNNY_NET_403_FIX.md`
