
# AWS Rekognition Setup - Quick Start

## Prerequisites

1. AWS Account with Rekognition access
2. Supabase CLI installed
3. Access to your POPNOW Supabase project

## Step 1: Get AWS Credentials

### Option A: Create IAM User (Recommended)

1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Go to **IAM** → **Users** → **Create user**
3. User name: `popnow-rekognition`
4. Select **Attach policies directly**
5. Search and attach: `AmazonRekognitionFullAccess`
6. Click **Next** → **Create user**
7. Click on the user → **Security credentials** → **Create access key**
8. Select **Application running outside AWS**
9. Copy the **Access key ID** and **Secret access key**

### Option B: Use Existing Credentials

If you already have AWS credentials with Rekognition permissions, you can use those.

## Step 2: Set Environment Variables in Supabase

### Using Supabase CLI

```bash
# Navigate to your project directory
cd /path/to/popnow

# Set AWS Access Key ID
supabase secrets set AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE

# Set AWS Secret Access Key
supabase secrets set AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Set AWS Region (Sydney, Australia)
supabase secrets set AWS_REGION=ap-southeast-2
```

### Using Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your POPNOW project
3. Go to **Edge Functions** → **Secrets**
4. Add the following secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key ID
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key
   - `AWS_REGION`: `ap-southeast-2`

## Step 3: Verify Setup

### Test Avatar Moderation

```bash
# Get your project URL and anon key
supabase status

# Test with a sample image
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/moderate-avatar \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "imageUrl": "https://images.unsplash.com/photo-1494790108377-be9c29b29330"
  }'
```

Expected response (if image is safe):
```json
{
  "safe": true,
  "message": "Avatar approved and saved successfully!"
}
```

### Test Video Moderation

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/moderate-video \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "test-video-id",
    "videoUrl": "https://example.com/video.mp4",
    "thumbnailUrl": "https://images.unsplash.com/photo-1494790108377-be9c29b29330"
  }'
```

Expected response (if video is safe):
```json
{
  "approved": true,
  "message": "Video approved successfully!"
}
```

## Step 4: Check Logs

```bash
# Check avatar moderation logs
supabase functions logs moderate-avatar --tail

# Check video moderation logs
supabase functions logs moderate-video --tail
```

Look for:
- ✅ "AWS Rekognition Authentication Setup" with all credentials configured
- ✅ "Image approved by AWS Rekognition moderation"
- ❌ Any error messages

## Troubleshooting

### Error: "AWS credentials not configured"

**Solution:** Verify secrets are set correctly:
```bash
supabase secrets list
```

You should see:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

### Error: "The security token included in the request is invalid"

**Solution:** 
- Check that your AWS credentials are correct
- Verify the IAM user has `AmazonRekognitionFullAccess` policy
- Ensure credentials haven't expired

### Error: "Failed to download image"

**Solution:**
- Verify the image URL is publicly accessible
- Check that the URL is not expired (for signed URLs)
- Ensure the image format is supported (JPEG, PNG)

### Error: "AccessDeniedException"

**Solution:**
- Verify IAM user has Rekognition permissions
- Check AWS region is correct (`ap-southeast-2`)
- Ensure AWS account is not restricted

## AWS Regions

POPNOW is configured to use `ap-southeast-2` (Sydney, Australia) for optimal performance in the Asia-Pacific region.

Other available regions:
- `us-east-1` (US East - N. Virginia)
- `us-west-2` (US West - Oregon)
- `eu-west-1` (Europe - Ireland)
- `ap-northeast-1` (Asia Pacific - Tokyo)

To change region, update the `AWS_REGION` secret.

## Cost Monitoring

Monitor your AWS Rekognition usage:
1. Go to [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home)
2. Filter by service: **Amazon Rekognition**
3. Set up billing alerts if needed

Current pricing (ap-southeast-2):
- First 1M images/month: $1.00 per 1,000 images
- Over 1M images/month: $0.80 per 1,000 images

## Security Best Practices

1. **Use IAM User (not root account)**
   - Create a dedicated IAM user for POPNOW
   - Only grant Rekognition permissions

2. **Rotate credentials regularly**
   - Update AWS credentials every 90 days
   - Update Supabase secrets when credentials change

3. **Monitor usage**
   - Set up AWS CloudWatch alarms
   - Review Rekognition API calls regularly

4. **Restrict permissions**
   - Only grant `AmazonRekognitionFullAccess` (or more restrictive)
   - Don't grant unnecessary AWS permissions

## Next Steps

1. ✅ Test with real user uploads
2. ✅ Monitor logs for any issues
3. ✅ Set up AWS billing alerts
4. 🔄 Plan for video frame sampling implementation (future)

## Support

If you encounter issues:
1. Check Edge Function logs: `supabase functions logs moderate-avatar`
2. Review AWS CloudWatch logs
3. Verify IAM permissions
4. Check AWS service health status

## References

- [AWS IAM User Guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/)
- [AWS Rekognition Pricing](https://aws.amazon.com/rekognition/pricing/)
- [Supabase Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)
