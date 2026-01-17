
# OAuth Provider Setup Checklist

Use this checklist to set up each authentication provider for POPNOW.

## Prerequisites

- [ ] Supabase project created (✅ Already done: spdsgmkirubngfdxxrzj)
- [ ] App deployed or have redirect URLs ready
- [ ] Email address for developer accounts

## Google Sign-In Setup

### Step 1: Google Cloud Console
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
- [ ] Create new project or select existing
- [ ] Note project ID: _______________

### Step 2: Enable APIs
- [ ] Navigate to "APIs & Services" > "Library"
- [ ] Search for "Google+ API"
- [ ] Click "Enable"

### Step 3: Create OAuth Credentials
- [ ] Go to "APIs & Services" > "Credentials"
- [ ] Click "Create Credentials" > "OAuth client ID"
- [ ] Configure consent screen if prompted
- [ ] Choose application type: "Web application"
- [ ] Add authorized redirect URIs:
  - [ ] `https://spdsgmkirubngfdxxrzj.supabase.co/auth/v1/callback`
- [ ] Click "Create"
- [ ] Copy Client ID: _______________
- [ ] Copy Client Secret: _______________

### Step 4: Configure in Supabase
- [ ] Go to [Supabase Dashboard](https://app.supabase.com)
- [ ] Select project: spdsgmkirubngfdxxrzj
- [ ] Navigate to Authentication > Providers
- [ ] Find "Google" and click to expand
- [ ] Enable Google provider
- [ ] Paste Client ID
- [ ] Paste Client Secret
- [ ] Click "Save"

### Step 5: Test
- [ ] Open POPNOW app
- [ ] Click "Continue with Google"
- [ ] Verify authentication works
- [ ] Check user created in Supabase

---

## Facebook Login Setup

### Step 1: Facebook Developers
- [ ] Go to [Facebook Developers](https://developers.facebook.com)
- [ ] Create account or log in
- [ ] Click "My Apps" > "Create App"
- [ ] Choose "Consumer" as app type
- [ ] Enter app name: POPNOW
- [ ] Enter contact email: _______________
- [ ] Click "Create App"
- [ ] Note App ID: _______________

### Step 2: Add Facebook Login
- [ ] In app dashboard, click "Add Product"
- [ ] Find "Facebook Login" and click "Set Up"
- [ ] Choose "Web" platform
- [ ] Enter site URL: `https://natively.dev`
- [ ] Click "Save" and "Continue"

### Step 3: Configure OAuth Settings
- [ ] Go to "Facebook Login" > "Settings"
- [ ] Add Valid OAuth Redirect URIs:
  - [ ] `https://spdsgmkirubngfdxxrzj.supabase.co/auth/v1/callback`
- [ ] Click "Save Changes"

### Step 4: Get App Secret
- [ ] Go to "Settings" > "Basic"
- [ ] Copy App ID: _______________
- [ ] Click "Show" next to App Secret
- [ ] Copy App Secret: _______________

### Step 5: Configure in Supabase
- [ ] Go to Supabase Dashboard
- [ ] Navigate to Authentication > Providers
- [ ] Find "Facebook" and click to expand
- [ ] Enable Facebook provider
- [ ] Paste App ID as Client ID
- [ ] Paste App Secret as Client Secret
- [ ] Click "Save"

### Step 6: App Review (For Production)
- [ ] Go to "App Review" in Facebook dashboard
- [ ] Request "email" permission
- [ ] Request "public_profile" permission
- [ ] Submit for review (required for production)

### Step 7: Test
- [ ] Open POPNOW app
- [ ] Click "Continue with Facebook"
- [ ] Verify authentication works
- [ ] Check user created in Supabase

---

## Instagram Login Setup

### Step 1: Use Facebook App
- [ ] Instagram uses Facebook Login
- [ ] Complete Facebook Login setup above first

### Step 2: Add Instagram Product
- [ ] In Facebook app dashboard
- [ ] Click "Add Product"
- [ ] Find "Instagram Basic Display"
- [ ] Click "Set Up"

### Step 3: Create Instagram App
- [ ] Click "Create New App"
- [ ] Enter Display Name: POPNOW
- [ ] Add Valid OAuth Redirect URIs:
  - [ ] `https://spdsgmkirubngfdxxrzj.supabase.co/auth/v1/callback`
- [ ] Click "Save Changes"
- [ ] Copy Instagram App ID: _______________
- [ ] Copy Instagram App Secret: _______________

### Step 4: Test
- [ ] Open POPNOW app
- [ ] Click "Continue with Instagram"
- [ ] Should redirect to Facebook login
- [ ] Verify authentication works

---

## TikTok Login Setup

### Step 1: TikTok Developers
- [ ] Go to [TikTok Developers](https://developers.tiktok.com)
- [ ] Create account or log in
- [ ] Click "Manage Apps"
- [ ] Click "Create an App"

### Step 2: Create App
- [ ] Enter app name: POPNOW
- [ ] Select app type: "Login Kit"
- [ ] Enter description
- [ ] Add redirect URL:
  - [ ] `https://spdsgmkirubngfdxxrzj.supabase.co/auth/v1/callback`
- [ ] Click "Submit"

### Step 3: Get Credentials
- [ ] Wait for app approval (may take 1-2 days)
- [ ] Once approved, go to app dashboard
- [ ] Copy Client Key: _______________
- [ ] Copy Client Secret: _______________

### Step 4: Configure in Supabase
- [ ] Check if TikTok provider is available in Supabase
- [ ] If available:
  - [ ] Enable TikTok provider
  - [ ] Paste Client Key
  - [ ] Paste Client Secret
  - [ ] Click "Save"
- [ ] If not available:
  - [ ] Use custom OAuth implementation
  - [ ] Or wait for Supabase to add support

### Step 5: Request Permissions
- [ ] In TikTok app dashboard
- [ ] Request "user.info.basic" permission
- [ ] May require additional app review

### Step 6: Test
- [ ] Open POPNOW app
- [ ] Click "Continue with TikTok"
- [ ] Verify authentication works
- [ ] Check user created in Supabase

---

## Email Authentication Setup

### Already Configured ✅
Email authentication is already set up in Supabase.

### Optional: Customize Email Templates
- [ ] Go to Supabase Dashboard
- [ ] Navigate to Authentication > Email Templates
- [ ] Customize "Confirm signup" template
- [ ] Customize "Magic Link" template
- [ ] Customize "Change Email Address" template
- [ ] Customize "Reset Password" template

### Optional: Custom SMTP
- [ ] Go to Project Settings > Auth
- [ ] Scroll to "SMTP Settings"
- [ ] Enable custom SMTP
- [ ] Enter SMTP host: _______________
- [ ] Enter SMTP port: _______________
- [ ] Enter SMTP username: _______________
- [ ] Enter SMTP password: _______________
- [ ] Click "Save"

---

## Testing Checklist

### Test Each Provider
- [ ] Google Sign-In works
- [ ] Facebook Login works
- [ ] Instagram Login works
- [ ] TikTok Login works
- [ ] Email Sign-Up works
- [ ] Email Sign-In works
- [ ] Email verification works

### Test User Flow
- [ ] New user can sign up
- [ ] User receives verification email
- [ ] User can verify email
- [ ] User can sign in after verification
- [ ] User profile created in database
- [ ] User can access main app
- [ ] User can upload videos
- [ ] User can sign out
- [ ] User can sign back in

### Test Edge Cases
- [ ] Sign up with existing email (should show error)
- [ ] Sign in with wrong password (should show error)
- [ ] Sign in before email verification (should show error)
- [ ] Cancel OAuth flow (should return to sign-in)
- [ ] Network error during sign-in (should show error)

---

## Troubleshooting

### Common Issues

**"Invalid redirect URI"**
- Check redirect URLs match exactly
- Ensure using HTTPS (not HTTP)
- Check for trailing slashes

**"App not verified"**
- Use test users during development
- Submit for app review for production

**"Email not confirmed"**
- Check spam folder
- Resend verification email
- Check SMTP configuration

**Social sign-in not working**
- Verify provider enabled in Supabase
- Check credentials are correct
- Check redirect URLs configured
- Check provider app is active

---

## Production Checklist

Before launching to production:

- [ ] All providers tested and working
- [ ] Facebook app reviewed and approved
- [ ] TikTok app reviewed and approved (if using)
- [ ] Email templates customized
- [ ] Privacy policy added to sign-in screen
- [ ] Terms of service added to sign-in screen
- [ ] Analytics tracking set up
- [ ] Error logging configured
- [ ] Rate limiting implemented
- [ ] CAPTCHA added to sign-up (optional)
- [ ] Custom domain configured (optional)
- [ ] SSL certificate valid
- [ ] Backup authentication method available

---

## Support Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Google OAuth Docs](https://developers.google.com/identity/protocols/oauth2)
- [Facebook Login Docs](https://developers.facebook.com/docs/facebook-login)
- [TikTok Developer Docs](https://developers.tiktok.com)
- [Supabase Discord](https://discord.supabase.com)

---

## Notes

Use this space for any additional notes or credentials:

```
Google Client ID: 
Google Client Secret: 

Facebook App ID: 
Facebook App Secret: 

Instagram App ID: 
Instagram App Secret: 

TikTok Client Key: 
TikTok Client Secret: 

Custom SMTP Host: 
Custom SMTP Port: 
```

---

**Last Updated**: [Current Date]
**Status**: Setup in progress
**Next Review**: After all providers configured
