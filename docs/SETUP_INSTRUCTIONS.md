
# POPNOW Setup Instructions

## Quick Fix for Loading Screen Issue

The loading screen issue has been fixed! Here's what was changed:

### 1. **Removed Infinite Loop in Authentication**
- The `_layout.tsx` file was causing an infinite loop by checking auth and redirecting before the app was ready
- Now the app loads fonts first, then shows the sign-in screen
- Authentication is checked only in the sign-in screen

### 2. **Improved Error Handling**
- Added proper error handling for font loading
- Added loading states with visual feedback
- Better console logging to help debug issues

### 3. **Fixed Navigation**
- Removed automatic redirects from the root layout
- Sign-in screen now handles navigation after successful authentication
- Initial route is set to `auth/sign-in`

## Environment Variables Setup

You need to configure your `.env` file with the correct values. Here's what you need:

### Required Variables

1. **Supabase Configuration**
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```
   
   To get your anon key:
   - Go to your Supabase dashboard
   - Navigate to Settings > API
   - Copy the `anon` `public` key

2. **Bunny.net Configuration** (for video storage)
   ```
   EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=<your-storage-zone>
   EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=<your-storage-key>
   EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=<your-cdn>.b-cdn.net
   EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=<your-library-id>
   EXPO_PUBLIC_BUNNY_STREAM_API_KEY=<your-stream-key>
   EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=<your-stream-cdn>.b-cdn.net
   ```

3. **Hive AI Configuration** (for content moderation)
   - Add `HIVE_API_KEY` to your Supabase Edge Function secrets
   - Go to: Supabase Dashboard > Edge Functions > Manage secrets
   - Add: `HIVE_API_KEY=<your-hive-api-key>`

## Testing the App

### 1. **Start the Development Server**
```bash
npm run dev
```

### 2. **Test on Expo Go**
- Scan the QR code with your phone
- The app should now load properly and show the sign-in screen
- You can create an account or sign in with existing credentials

### 3. **Test on Web Preview**
- The web preview should now display correctly
- You should see the sign-in screen with all social login options

## What to Expect

1. **First Launch**
   - You'll see a loading screen briefly while fonts load
   - Then you'll be taken to the sign-in screen

2. **Sign In Screen**
   - Options for Google, Facebook, Instagram, TikTok, and Email sign-in
   - Create a new account or sign in with existing credentials

3. **After Sign In**
   - You'll be redirected to the home feed
   - If there are no videos yet, you'll see a prompt to upload your first video
   - Use the tab bar to navigate between Home, Map, Upload, Search, and Profile

## Troubleshooting

### App Still Shows Loading Screen
1. Check that your `.env` file exists and has the correct values
2. Restart the Expo development server
3. Clear the cache: `npx expo start -c`

### Can't Sign In
1. Verify your Supabase URL and anon key are correct
2. Check that OAuth providers are configured in Supabase dashboard
3. Make sure email confirmation is enabled in Supabase Auth settings

### Videos Not Loading
1. Check that the `videos` table exists in your Supabase database
2. Verify RLS policies are set up correctly
3. Make sure you have at least one approved video in the database

## OAuth Provider Setup

### Fees for Social Sign-In Options

- **Google Sign-In**: Free
- **Facebook Sign-In**: Free
- **Instagram Sign-In**: Uses Facebook Login (Free)
- **TikTok Sign-In**: Free (requires TikTok Developer account)
- **Email Sign-In**: Free

All social sign-in options are free to use, but you need to:
1. Create developer accounts with each provider
2. Register your app
3. Configure OAuth credentials in Supabase dashboard

See `docs/OAUTH_SETUP_CHECKLIST.md` for detailed setup instructions.

## Next Steps

1. Configure your environment variables
2. Set up OAuth providers (optional, but recommended)
3. Upload your first video to test the full flow
4. Invite users to test the app

## Support

If you continue to experience issues:
1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Make sure your Supabase project is active and not paused
4. Check that you have the latest version of Expo CLI
