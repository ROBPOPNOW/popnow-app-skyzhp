
# Supabase Edge Function Secrets Setup

This guide explains how to properly configure secrets for Supabase Edge Functions, specifically for the Hive AI content moderation integration.

## Why Use Supabase Secrets?

Supabase Edge Function secrets provide a secure way to store sensitive API keys that should never be exposed in your client-side code or committed to version control.

**Benefits:**
- Secrets are encrypted at rest
- Not accessible from client-side code
- Can be updated without redeploying functions
- Separate secrets for different environments

## Setting Up Hive AI Secret

### Method 1: Using Supabase Dashboard (Recommended)

1. **Navigate to Edge Functions**
   - Go to your Supabase project dashboard
   - Click on "Edge Functions" in the left sidebar

2. **Manage Secrets**
   - Click on "Manage secrets" or "Secrets" tab
   - Click "Add new secret"

3. **Add Hive AI Key**
   - Name: `HIVE_API_KEY`
   - Value: Your Hive AI API key (get it from https://thehive.ai/)
   - Click "Save"

4. **Verify**
   - The secret should now appear in your secrets list
   - It will be available to all Edge Functions in this project

### Method 2: Using Supabase CLI

If you prefer using the command line:

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Set the secret
supabase secrets set HIVE_API_KEY=your-hive-api-key-here
```

## Accessing Secrets in Edge Functions

Once configured, access the secret in your Edge Function code:

```typescript
// In your Edge Function (e.g., supabase/functions/moderate-video/index.ts)

Deno.serve(async (req) => {
  // Access the secret
  const hiveApiKey = Deno.env.get('HIVE_API_KEY');
  
  if (!hiveApiKey) {
    return new Response(
      JSON.stringify({ error: 'Hive API key not configured' }),
      { status: 500 }
    );
  }
  
  // Use the key to call Hive AI API
  const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${hiveApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Your moderation request
    }),
  });
  
  // Process response...
});
```

## Other Secrets You Might Need

Depending on your app's features, you might want to add other secrets:

### OpenAI API Key (for AI features)
```bash
supabase secrets set OPENAI_API_KEY=your-openai-key
```

### SendGrid API Key (for emails)
```bash
supabase secrets set SENDGRID_API_KEY=your-sendgrid-key
```

### Stripe Secret Key (for payments)
```bash
supabase secrets set STRIPE_SECRET_KEY=your-stripe-key
```

## Listing All Secrets

To see all configured secrets:

```bash
supabase secrets list
```

This will show secret names but NOT their values (for security).

## Updating Secrets

To update an existing secret:

**Dashboard Method:**
1. Go to Edge Functions > Secrets
2. Find the secret you want to update
3. Click "Edit" or "Update"
4. Enter the new value
5. Save

**CLI Method:**
```bash
supabase secrets set HIVE_API_KEY=new-value-here
```

## Deleting Secrets

To remove a secret:

**Dashboard Method:**
1. Go to Edge Functions > Secrets
2. Find the secret
3. Click "Delete"
4. Confirm deletion

**CLI Method:**
```bash
supabase secrets unset HIVE_API_KEY
```

## Environment-Specific Secrets

For different environments (development, staging, production):

1. **Create separate Supabase projects** for each environment
2. **Configure different secrets** in each project
3. **Use different project refs** in your app configuration

Example:
```typescript
// config.ts
const config = {
  development: {
    supabaseUrl: 'https://dev-project.supabase.co',
    supabaseKey: 'dev-anon-key',
  },
  production: {
    supabaseUrl: 'https://prod-project.supabase.co',
    supabaseKey: 'prod-anon-key',
  },
};
```

## Security Best Practices

1. **Never commit secrets to version control**
   - Secrets should only be in Supabase dashboard or CLI
   - Never in `.env` files that get committed

2. **Use different keys for different environments**
   - Development keys for testing
   - Production keys for live app

3. **Rotate secrets regularly**
   - Change API keys periodically
   - Update in Supabase when you rotate

4. **Limit secret access**
   - Only give team members access who need it
   - Use Supabase's team permissions

5. **Monitor secret usage**
   - Check Edge Function logs for unauthorized access
   - Set up alerts for suspicious activity

## Troubleshooting

### Secret not available in Edge Function

**Problem:** `Deno.env.get('HIVE_API_KEY')` returns `undefined`

**Solutions:**
1. Verify secret is set in Supabase dashboard
2. Check spelling of secret name (case-sensitive)
3. Redeploy your Edge Function after adding secret
4. Check Edge Function logs for errors

### Secret value incorrect

**Problem:** API calls fail with authentication errors

**Solutions:**
1. Verify the secret value in your API provider's dashboard
2. Check for extra spaces or characters when setting secret
3. Ensure you're using the correct API key type (some services have multiple key types)

### Can't access secrets via CLI

**Problem:** `supabase secrets list` fails

**Solutions:**
1. Ensure you're logged in: `supabase login`
2. Link your project: `supabase link --project-ref your-ref`
3. Check your internet connection
4. Verify you have access to the project

## Testing Your Secrets

Create a test Edge Function to verify secrets are working:

```typescript
// supabase/functions/test-secrets/index.ts

Deno.serve(async (req) => {
  const hiveApiKey = Deno.env.get('HIVE_API_KEY');
  
  return new Response(
    JSON.stringify({
      hiveApiKeyConfigured: !!hiveApiKey,
      hiveApiKeyLength: hiveApiKey?.length || 0,
      // Never return the actual key value!
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
```

Deploy and test:
```bash
supabase functions deploy test-secrets
curl https://your-project.supabase.co/functions/v1/test-secrets
```

## Getting Your Hive AI API Key

1. **Sign up for Hive AI**
   - Go to https://thehive.ai/
   - Create an account
   - Verify your email

2. **Access Dashboard**
   - Log in to your Hive AI account
   - Navigate to the dashboard

3. **Create API Key**
   - Go to "API Keys" section
   - Click "Create New Key"
   - Give it a descriptive name (e.g., "POPNOW Production")
   - Copy the key immediately (you won't see it again)

4. **Add to Supabase**
   - Follow the steps above to add it as a secret
   - Name it `HIVE_API_KEY`

5. **Test the Integration**
   - Upload a test video
   - Check Edge Function logs to verify moderation is working

## Support

For issues with:
- **Supabase Secrets**: https://supabase.com/docs/guides/functions/secrets
- **Hive AI**: https://docs.thehive.ai/
- **Edge Functions**: https://supabase.com/docs/guides/functions

## Summary

✅ **Do:**
- Store sensitive API keys in Supabase secrets
- Use different keys for different environments
- Rotate keys regularly
- Test secrets after configuration

❌ **Don't:**
- Commit secrets to version control
- Share secrets in plain text
- Use production keys in development
- Expose secrets in client-side code

## Next Steps

1. Get your Hive AI API key from https://thehive.ai/
2. Add it to Supabase Edge Function secrets as `HIVE_API_KEY`
3. Deploy your moderation Edge Function
4. Test video upload with moderation
5. Monitor Edge Function logs for any issues
