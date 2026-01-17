
# AWS Rekognition Deployment Checklist

## Pre-Deployment

### 1. AWS Account Setup
- [ ] AWS account created and active
- [ ] IAM user created with Rekognition permissions
- [ ] Access Key ID and Secret Access Key generated
- [ ] Credentials stored securely (password manager)

### 2. Supabase Configuration
- [ ] Supabase project accessible
- [ ] Supabase CLI installed and configured
- [ ] Project ID confirmed: `spdsgmkirubngfdxxrzj`

### 3. Environment Variables
- [ ] `AWS_ACCESS_KEY_ID` set in Supabase secrets
- [ ] `AWS_SECRET_ACCESS_KEY` set in Supabase secrets
- [ ] `AWS_REGION` set to `ap-southeast-2`
- [ ] Verify secrets with: `supabase secrets list`

## Deployment

### 4. Edge Functions
- [x] `moderate-avatar` deployed (Version 25)
- [x] `moderate-video` deployed (Version 57)
- [ ] Both functions showing as ACTIVE
- [ ] JWT verification enabled

### 5. Database Schema
- [x] `is_approved` column added to `videos` table
- [x] `moderation_notes` column added to `videos` table
- [ ] Verify columns exist: `SELECT * FROM videos LIMIT 1;`

## Testing

### 6. Avatar Moderation Tests
- [ ] Test with safe image (should approve)
  ```bash
  curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/moderate-avatar \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"userId":"test","imageUrl":"https://images.unsplash.com/photo-1494790108377-be9c29b29330"}'
  ```
- [ ] Test with inappropriate image (should reject)
- [ ] Verify rejected image is deleted from storage
- [ ] Check user receives appropriate error message

### 7. Video Moderation Tests
- [ ] Test with safe thumbnail (should approve)
  ```bash
  curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/moderate-video \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"videoId":"test","videoUrl":"https://example.com/video.mp4","thumbnailUrl":"https://images.unsplash.com/photo-1494790108377-be9c29b29330"}'
  ```
- [ ] Test with inappropriate thumbnail (should reject)
- [ ] Verify `is_approved` set to `false` in database
- [ ] Check user receives notification

### 8. Log Verification
- [ ] Check avatar moderation logs: `supabase functions logs moderate-avatar`
- [ ] Check video moderation logs: `supabase functions logs moderate-video`
- [ ] Verify AWS authentication successful
- [ ] No error messages in logs

## Production Readiness

### 9. Performance Testing
- [ ] Test with multiple concurrent requests
- [ ] Verify response times acceptable (<5 seconds)
- [ ] Check AWS Rekognition API rate limits
- [ ] Monitor memory usage in Edge Functions

### 10. Error Handling
- [ ] Test with invalid image URL (should handle gracefully)
- [ ] Test with missing parameters (should return 400 error)
- [ ] Test with expired AWS credentials (should return error)
- [ ] Test with network timeout (should handle gracefully)

### 11. Security
- [ ] JWT verification enabled on both functions
- [ ] AWS credentials not exposed in logs
- [ ] User IDs validated before database updates
- [ ] File paths sanitized before deletion

## Monitoring Setup

### 12. AWS Monitoring
- [ ] AWS CloudWatch logs enabled
- [ ] Billing alerts configured
- [ ] Cost monitoring dashboard set up
- [ ] Usage alerts configured (optional)

### 13. Supabase Monitoring
- [ ] Edge Function logs accessible
- [ ] Database query performance monitored
- [ ] Storage usage tracked
- [ ] Error rate alerts configured (optional)

## Documentation

### 14. Team Documentation
- [x] Migration guide created (`AWS_REKOGNITION_MIGRATION.md`)
- [x] Quick start guide created (`AWS_SETUP_QUICK_START.md`)
- [x] Deployment checklist created (this document)
- [ ] Team members trained on new system
- [ ] Runbook created for common issues

### 15. User Communication
- [ ] Users notified of moderation changes (if needed)
- [ ] Help documentation updated
- [ ] FAQ updated with new moderation info
- [ ] Support team briefed on changes

## Post-Deployment

### 16. Monitoring (First 24 Hours)
- [ ] Check logs every 2 hours
- [ ] Monitor AWS costs
- [ ] Track moderation success rate
- [ ] Collect user feedback

### 17. Monitoring (First Week)
- [ ] Daily log review
- [ ] Weekly cost analysis
- [ ] False positive/negative tracking
- [ ] Performance metrics analysis

### 18. Optimization
- [ ] Adjust confidence threshold if needed (currently 80%)
- [ ] Add more moderation categories if needed
- [ ] Optimize image download process
- [ ] Implement caching if beneficial

## Rollback Plan

### 19. Emergency Rollback (If Needed)
- [ ] Previous Hive AI code backed up
- [ ] Rollback procedure documented
- [ ] Database schema changes reversible
- [ ] Team knows rollback process

**Rollback Steps:**
1. Redeploy previous Edge Function versions
2. Restore Hive AI environment variables
3. Revert database schema changes (if needed)
4. Notify team and users

## Future Enhancements

### 20. Video Frame Sampling (Planned)
- [ ] FFmpeg integration researched
- [ ] Frame extraction logic designed
- [ ] Performance impact assessed
- [ ] Cost impact calculated
- [ ] Implementation timeline set

### 21. Additional Features (Optional)
- [ ] Admin moderation dashboard
- [ ] Manual review queue
- [ ] User appeal system
- [ ] Moderation statistics page
- [ ] A/B testing framework

## Sign-Off

### Deployment Approval
- [ ] Technical lead approval
- [ ] Product owner approval
- [ ] Security review completed
- [ ] Budget approved

### Deployment Date
- **Planned:** _________________
- **Actual:** _________________
- **Deployed by:** _________________

### Post-Deployment Review
- **Review date:** _________________ (1 week after deployment)
- **Attendees:** _________________
- **Issues found:** _________________
- **Action items:** _________________

## Quick Reference

### Important Commands
```bash
# Set AWS credentials
supabase secrets set AWS_ACCESS_KEY_ID=your_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret
supabase secrets set AWS_REGION=ap-southeast-2

# Check logs
supabase functions logs moderate-avatar --tail
supabase functions logs moderate-video --tail

# List secrets
supabase secrets list

# Deploy functions (if needed)
supabase functions deploy moderate-avatar
supabase functions deploy moderate-video
```

### Important URLs
- **Supabase Dashboard:** https://supabase.com/dashboard/project/spdsgmkirubngfdxxrzj
- **AWS Console:** https://console.aws.amazon.com/
- **AWS Rekognition:** https://console.aws.amazon.com/rekognition/
- **AWS Billing:** https://console.aws.amazon.com/billing/

### Support Contacts
- **AWS Support:** https://console.aws.amazon.com/support/
- **Supabase Support:** https://supabase.com/dashboard/support
- **Team Lead:** _________________
- **On-Call Engineer:** _________________

## Notes

_Use this section for deployment-specific notes, issues encountered, or lessons learned._

---

**Status:** ⏳ Pending Deployment

**Last Updated:** December 30, 2024
