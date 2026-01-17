
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DELETION SYSTEM VERIFICATION SCRIPT
-- Run this to verify the automated deletion system is working correctly
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  cron_job_exists BOOLEAN;
  cron_job_active BOOLEAN;
  expired_videos_count INTEGER;
  total_videos_count INTEGER;
  oldest_video_age_days NUMERIC;
  manual_trigger_function_exists BOOLEAN;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🔍 DELETION SYSTEM VERIFICATION';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';

  -- Check 1: Cron job exists and is active
  SELECT 
    EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-videos-hourly'),
    COALESCE((SELECT active FROM cron.job WHERE jobname = 'delete-expired-videos-hourly'), false)
  INTO cron_job_exists, cron_job_active;

  RAISE NOTICE '📋 CHECK 1: Cron Job Status';
  IF cron_job_exists AND cron_job_active THEN
    RAISE NOTICE '   ✅ Cron job "delete-expired-videos-hourly" is ACTIVE';
    RAISE NOTICE '   ℹ️  Schedule: Every hour at minute 0';
  ELSIF cron_job_exists AND NOT cron_job_active THEN
    RAISE WARNING '   ⚠️  Cron job exists but is INACTIVE';
    RAISE NOTICE '   📋 To activate: UPDATE cron.job SET active = true WHERE jobname = ''delete-expired-videos-hourly'';';
  ELSE
    RAISE WARNING '   ❌ Cron job does NOT exist';
    RAISE NOTICE '   📋 To fix: Run the migration file 20260113_fix_video_deletion_cron.sql';
  END IF;
  RAISE NOTICE '';

  -- Check 2: Count expired videos
  SELECT COUNT(*) INTO expired_videos_count
  FROM videos
  WHERE created_at < NOW() - INTERVAL '3 days';

  RAISE NOTICE '📊 CHECK 2: Expired Videos Count';
  IF expired_videos_count = 0 THEN
    RAISE NOTICE '   ✅ No expired videos found (system is working!)';
  ELSE
    RAISE WARNING '   ⚠️  Found % expired videos (older than 3 days)', expired_videos_count;
    RAISE NOTICE '   ℹ️  These will be deleted on the next hourly run';
    RAISE NOTICE '   📋 To delete now: SELECT public.trigger_video_cleanup_now();';
  END IF;
  RAISE NOTICE '';

  -- Check 3: Total videos and oldest video age
  SELECT 
    COUNT(*),
    COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400, 1), 0)
  INTO total_videos_count, oldest_video_age_days
  FROM videos;

  RAISE NOTICE '📈 CHECK 3: Video Statistics';
  RAISE NOTICE '   📹 Total videos in database: %', total_videos_count;
  IF total_videos_count > 0 THEN
    RAISE NOTICE '   ⏰ Oldest video age: % days', oldest_video_age_days;
    IF oldest_video_age_days > 3 THEN
      RAISE WARNING '   ⚠️  Oldest video is older than 3 days (should have been deleted)';
    ELSE
      RAISE NOTICE '   ✅ All videos are within the 3-day lifespan';
    END IF;
  ELSE
    RAISE NOTICE '   ℹ️  No videos in database yet';
  END IF;
  RAISE NOTICE '';

  -- Check 4: Manual trigger function exists
  SELECT EXISTS(
    SELECT 1 FROM pg_proc 
    WHERE proname = 'trigger_video_cleanup_now'
  ) INTO manual_trigger_function_exists;

  RAISE NOTICE '🔧 CHECK 4: Manual Trigger Function';
  IF manual_trigger_function_exists THEN
    RAISE NOTICE '   ✅ Manual trigger function exists';
    RAISE NOTICE '   📋 To use: SELECT public.trigger_video_cleanup_now();';
  ELSE
    RAISE WARNING '   ❌ Manual trigger function does NOT exist';
    RAISE NOTICE '   📋 To fix: Run the migration file 20260113_fix_video_deletion_cron.sql';
  END IF;
  RAISE NOTICE '';

  -- Check 5: Required extensions
  RAISE NOTICE '🔌 CHECK 5: Required Extensions';
  IF EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '   ✅ pg_cron extension is installed';
  ELSE
    RAISE WARNING '   ❌ pg_cron extension is NOT installed';
    RAISE NOTICE '   📋 To fix: CREATE EXTENSION pg_cron;';
  END IF;

  IF EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE '   ✅ pg_net extension is installed';
  ELSE
    RAISE WARNING '   ❌ pg_net extension is NOT installed';
    RAISE NOTICE '   📋 To fix: CREATE EXTENSION pg_net;';
  END IF;
  RAISE NOTICE '';

  -- Final summary
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 SUMMARY';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  IF cron_job_exists AND cron_job_active AND expired_videos_count = 0 AND manual_trigger_function_exists THEN
    RAISE NOTICE '✅ DELETION SYSTEM IS FULLY OPERATIONAL';
    RAISE NOTICE '';
    RAISE NOTICE 'The system will automatically:';
    RAISE NOTICE '  • Delete videos older than 3 days every hour';
    RAISE NOTICE '  • Delete AI-rejected videos immediately';
    RAISE NOTICE '  • Remove files from Bunny.net storage';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 No action required!';
  ELSE
    RAISE WARNING '⚠️  DELETION SYSTEM NEEDS ATTENTION';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEXT STEPS:';
    
    IF NOT cron_job_exists OR NOT cron_job_active THEN
      RAISE NOTICE '  1. Fix the cron job (see CHECK 1 above)';
    END IF;
    
    IF expired_videos_count > 0 THEN
      RAISE NOTICE '  2. Delete expired videos manually: SELECT public.trigger_video_cleanup_now();';
    END IF;
    
    IF NOT manual_trigger_function_exists THEN
      RAISE NOTICE '  3. Create the manual trigger function (see CHECK 4 above)';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '📖 For detailed instructions, see: docs/DELETION_SYSTEM_FIXED.md';
  END IF;
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- Display cron job details
SELECT 
  '🕐 CRON JOB DETAILS' as info,
  jobname as "Job Name",
  schedule as "Schedule",
  active as "Active",
  jobid as "Job ID"
FROM cron.job
WHERE jobname = 'delete-expired-videos-hourly';

-- Display expired videos (if any)
SELECT 
  '📹 EXPIRED VIDEOS (WILL BE DELETED)' as info,
  id,
  caption,
  created_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600, 1) as "Age (hours)",
  ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400, 1) as "Age (days)"
FROM videos
WHERE created_at < NOW() - INTERVAL '3 days'
ORDER BY created_at ASC
LIMIT 10;
