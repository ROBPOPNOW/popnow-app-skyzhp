
# Authentication Setup Guide

## Overview

POPNOW now includes comprehensive authentication with multiple sign-in options:
- Google Sign-In
- Facebook Login
- Instagram Login (via Facebook)
- TikTok Login
- Email/Password Authentication

## Sign-In Provider Fees

### Free Providers (No Direct Costs)

1. **Google Sign-In**
   - Free to use for OAuth authentication
   - No direct fees from Google
   - May require Google Cloud Console setup
   - Rate limits apply for high-volume usage

2. **Facebook Login**
   - Free to use for authentication
   - No direct fees from Facebook
   - Requires Facebook Developer account
   - App review may be required for production

3. **Instagram Login**
   - Uses Facebook Login (Meta platform)
   - Free to use
   - Same requirements as Facebook Login

4. **TikTok Login**
   - Free for basic authentication
   - More limited OAuth implementation
   - May require app review before going live
   - Check TikTok Developer documentation for latest requirements

5. **Email Sign-In**
   - Free with Supabase (included in your plan)
   - Email verification required
   - No additional costs

### Important Considerations

- **Supabase Pricing**: You pay based on Monthly Active Users (MAU)
  - Check your Supabase plan for MAU limits
  - Third-party auth users count toward your MAU
  
- **Rate Limits**: Each provider has rate limits
  - High-volume apps may need to request higher limits
  - Monitor usage to avoid hitting limits

- **App Review**: Some providers require app review
  - Facebook/Instagram: Required for production
  - TikTok: May require review
  - Google: Generally no review needed

## Setup Instructions

### 1. Supabase Configuration

#### Enable Authentication Providers

1. Go to your Supabase Dashboard
2. Navigate to Authentication > Providers
3. Enable the providers you want to use:

**Google:**
```
- Enable Google provider
- Add your Google Client ID
- Add your Google Client Secret
- Configure redirect URLs
```

**Facebook:**
```
- Enable Facebook provider
- Add your Facebook App ID
- Add your Facebook App Secret
- Configure redirect URLs
```

**TikTok:**
```
- Enable TikTok provider (if available)
- Add your TikTok Client Key
- Add your TikTok Client Secret
- Configure redirect URLs
```

#### Configure Redirect URLs

Add these redirect URLs in your Supabase project:
```
https://natively.dev/auth/callback
https://natively.dev/email-confirmed
```

### 2. Google Sign-In Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing one

2. **Enable Google+ API**
   - Navigate to APIs & Services > Library
   - Search for "Google+ API"
   - Enable it

3. **Create OAuth Credentials**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Choose application type (Web, Android, iOS)
   - Add authorized redirect URIs

4. **Configure in Supabase**
   - Copy Client ID and Client Secret
   - Add to Supabase Authentication > Providers > Google

5. **Install Dependencies**
   ```bash
   npm install @react-native-google-signin/google-signin
   ```

6. **Configure in app.json**
   ```json
   {
     "expo": {
       "android": {
         "googleServicesFile": "./google-services.json"
       },
       "ios": {
         "googleServicesFile": "./GoogleService-Info.plist"
       }
     }
   }
   ```

### 3. Facebook Login Setup

1. **Create Facebook App**
   - Go to [Facebook Developers](https://developers.facebook.com)
   - Create a new app
   - Choose "Consumer" as app type

2. **Add Facebook Login Product**
   - In your app dashboard, add "Facebook Login"
   - Configure OAuth redirect URIs

3. **Get App Credentials**
   - Copy App ID and App Secret
   - Add to Supabase Authentication > Providers > Facebook

4. **Configure Valid OAuth Redirect URIs**
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

5. **App Review (for Production)**
   - Submit app for review
   - Request necessary permissions (email, public_profile)

### 4. Instagram Login Setup

Instagram uses Facebook Login:
1. Follow Facebook Login setup above
2. In Facebook App Dashboard:
   - Add Instagram Basic Display product
   - Configure Instagram App ID
   - Add redirect URIs

3. Users will authenticate via Facebook
4. Instagram data access requires additional permissions

### 5. TikTok Login Setup

1. **Register TikTok Developer Account**
   - Go to [TikTok Developers](https://developers.tiktok.com)
   - Create developer account

2. **Create App**
   - Create a new app in TikTok Developer Portal
   - Get Client Key and Client Secret

3. **Configure in Supabase**
   - Enable TikTok provider
   - Add Client Key and Client Secret
   - Configure redirect URLs

4. **Request Permissions**
   - Request user.info.basic permission
   - May require app review

### 6. Email Authentication Setup

Email authentication is already configured in Supabase:

1. **Email Templates**
   - Customize email templates in Supabase Dashboard
   - Go to Authentication > Email Templates
   - Edit confirmation, magic link, and password reset emails

2. **Email Verification**
   - Users must verify email before signing in
   - Confirmation link redirects to: `https://natively.dev/email-confirmed`

3. **SMTP Configuration (Optional)**
   - Configure custom SMTP in Supabase
   - Go to Project Settings > Auth > SMTP Settings

## Testing Authentication

### Test Email Sign-Up
1. Open the app
2. Click "Sign Up with Email"
3. Enter email and password
4. Check email for verification link
5. Click verification link
6. Return to app and sign in

### Test Social Sign-In
1. Open the app
2. Click on social provider button
3. Authenticate with provider
4. Grant permissions
5. Redirected back to app

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**
   - Check redirect URLs in provider console
   - Ensure URLs match exactly in Supabase

2. **"App not verified"**
   - Complete app review process
   - Use test users during development

3. **"Email not confirmed"**
   - Check spam folder for verification email
   - Resend verification email
   - Check SMTP configuration

4. **Social sign-in not working**
   - Verify provider is enabled in Supabase
   - Check client ID and secret are correct
   - Ensure redirect URLs are configured

### Debug Mode

Enable debug logging:
```typescript
// In lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    debug: true, // Enable debug mode
  },
});
```

## Security Best Practices

1. **Never commit credentials**
   - Use environment variables
   - Add .env to .gitignore

2. **Use HTTPS only**
   - All redirect URLs must use HTTPS
   - No HTTP in production

3. **Implement rate limiting**
   - Monitor authentication attempts
   - Implement CAPTCHA for sign-up

4. **Regular security audits**
   - Review authentication logs
   - Monitor for suspicious activity

5. **Keep dependencies updated**
   - Regularly update Supabase client
   - Update social sign-in libraries

## Next Steps

1. **Customize Sign-In UI**
   - Update colors and branding
   - Add custom logos for providers

2. **Add Profile Setup**
   - Create onboarding flow
   - Collect username and avatar

3. **Implement Deep Linking**
   - Handle email verification redirects
   - Handle OAuth callbacks

4. **Add Social Features**
   - Import contacts from social providers
   - Share to social media

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google Sign-In Documentation](https://developers.google.com/identity)
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login)
- [TikTok Developer Documentation](https://developers.tiktok.com)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
