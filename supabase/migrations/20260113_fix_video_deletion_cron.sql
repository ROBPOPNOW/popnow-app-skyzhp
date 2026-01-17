
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FIX VIDEO DELETION CRON JOB
-- This migration completely rebuilds the automated video deletion system
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Delete ALL existing cleanup cron jobs (clean slate)
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobid, jobname 
    FROM cron.job 
    WHERE jobname LIKE '%cleanup%' OR jobname LIKE '%expired%' OR jobname LIKE '%video%'
  LOOP
    RAISE NOTICE 'Deleting old cron job: % (ID: %)', job_record.jobname, job_record.jobid;
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END $$;

-- Step 3: Drop any old cleanup functions that might exist
DROP FUNCTION IF EXISTS public.cleanup_expired_videos_cron() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_videos() CASCADE;

-- Step 4: Create the new cron job that calls the Edge Function
-- This runs every hour at minute 0
SELECT cron.schedule(
  'delete-expired-videos-hourly',
  '0 * * * *', -- Run at the start of every hour (e.g., 1:00, 2:00, 3:00, etc.)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/delete-expired-videos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Step 5: Verify the cron job was created
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'delete-expired-videos-hourly';
  
  IF job_count > 0 THEN
    RAISE NOTICE '✅ Cron job "delete-expired-videos-hourly" created successfully';
    RAISE NOTICE 'ℹ️ The job will run every hour at minute 0';
    RAISE NOTICE 'ℹ️ Next run: Top of the next hour';
  ELSE
    RAISE WARNING '⚠️ Failed to create cron job';
  END IF;
END $$;

-- Step 6: Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Step 7: Log current expired videos count for verification
DO $$
DECLARE
  expired_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO expired_count
  FROM videos
  WHERE created_at < NOW() - INTERVAL '3 days';
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 CURRENT STATUS';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📹 Expired videos currently in database: %', expired_count;
  RAISE NOTICE '⏰ These will be deleted on the next hourly run';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- Step 8: Create a manual trigger function for testing
CREATE OR REPLACE FUNCTION public.trigger_video_cleanup_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Call the Edge Function immediately
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/delete-expired-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) INTO result;
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.trigger_video_cleanup_now() IS 
'Manually trigger the video cleanup Edge Function for testing. 
Usage: SELECT public.trigger_video_cleanup_now();';

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ VIDEO DELETION SYSTEM REBUILT SUCCESSFULLY';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE 'ℹ️ Cron job: delete-expired-videos-hourly';
  RAISE NOTICE 'ℹ️ Schedule: Every hour at minute 0';
  RAISE NOTICE 'ℹ️ Edge Function: /functions/v1/delete-expired-videos';
  RAISE NOTICE 'ℹ️ Manual trigger: SELECT public.trigger_video_cleanup_now();';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
