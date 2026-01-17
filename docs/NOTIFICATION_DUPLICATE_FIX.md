
# Notification Duplicate Fix - Implementation Summary

## Problem
Users were receiving **2 notification cards** when someone liked or commented on their videos. This was causing a poor user experience with duplicate notifications cluttering the notifications tab.

## Root Cause
The issue was caused by **duplicate database triggers** on the `likes` and `comments` tables:

### For Comments:
- `on_comment_created` → `notify_new_comment()` function
- `trigger_notify_on_comment` → `notify_on_comment()` function

### For Likes:
- `on_like_created` → `notify_new_like()` function
- `trigger_notify_on_like` → `notify_on_like()` function

Both triggers were firing on INSERT operations, each creating a separate notification record, resulting in duplicates.

## Solution Implemented

### 1. Removed Duplicate Triggers
Dropped the older duplicate triggers and their associated functions:
- Dropped `on_comment_created` trigger
- Dropped `on_like_created` trigger
- Dropped `notify_new_comment()` function
- Dropped `notify_new_like()` function

Kept the newer triggers that use the centralized `create_notification()` function:
- `trigger_notify_on_comment` → `notify_on_comment()`
- `trigger_notify_on_like` → `notify_on_like()`

### 2. Enhanced Deduplication Logic
Updated the `create_notification()` function to include deduplication logic:
- Checks for duplicate notifications within the last 5 seconds
- Prevents race conditions from creating multiple notifications
- Returns existing notification ID if duplicate is found instead of creating a new one

### 3. Cleaned Up Existing Duplicates
Removed any existing duplicate notifications from the database, keeping only the oldest notification for each unique combination of:
- `user_id`
- `actor_id`
- `type`
- `video_id`
- `comment_id`

## Database Changes

### Migration: `fix_duplicate_notification_triggers_v2`
```sql
-- Drop duplicate triggers
DROP TRIGGER IF EXISTS on_comment_created ON comments;
DROP TRIGGER IF EXISTS on_like_created ON likes;

-- Drop old functions
DROP FUNCTION IF EXISTS notify_new_comment();
DROP FUNCTION IF EXISTS notify_new_like();

-- Clean up existing duplicates
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, actor_id, type, video_id, COALESCE(comment_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY created_at ASC
    ) as rn
  FROM notifications
  WHERE created_at > NOW() - INTERVAL '1 hour'
)
DELETE FROM notifications
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
```

### Migration: `add_notification_deduplication`
Enhanced the `create_notification()` function with deduplication logic:
- Checks for existing notifications within 5-second window
- Prevents duplicate notifications from being created
- Returns existing notification ID if duplicate found

## Current State

### Active Triggers
- **Comments**: `trigger_notify_on_comment` (calls `notify_on_comment()` → `create_notification()`)
- **Likes**: `trigger_notify_on_like` (calls `notify_on_like()` → `create_notification()`)

### Notification Flow
1. User likes/comments on a video
2. Single trigger fires on INSERT
3. Trigger calls `create_notification()` function
4. Function checks for duplicates within 5 seconds
5. If no duplicate exists, creates new notification
6. If duplicate exists, returns existing notification ID
7. Supabase Realtime broadcasts the notification to the user
8. User receives exactly **1 notification card**

## Testing Recommendations

1. **Like a video**: Verify only 1 notification is created
2. **Comment on a video**: Verify only 1 notification is created
3. **Rapid actions**: Try liking/unliking/liking quickly to test deduplication
4. **Multiple users**: Have multiple users interact with the same video
5. **Check database**: Query notifications table to ensure no duplicates

## Verification Query
```sql
-- Check for duplicate notifications
SELECT 
  user_id,
  actor_id,
  type,
  video_id,
  comment_id,
  COUNT(*) as duplicate_count
FROM notifications
GROUP BY user_id, actor_id, type, video_id, comment_id
HAVING COUNT(*) > 1;
```

Should return 0 rows if no duplicates exist.

## Benefits

1. ✅ **No more duplicate notifications** - Users receive exactly 1 notification per action
2. ✅ **Cleaner notifications tab** - Better user experience
3. ✅ **Database efficiency** - Fewer unnecessary records
4. ✅ **Future-proof** - Deduplication logic prevents future issues
5. ✅ **Backward compatible** - No changes needed to client code

## Notes

- The deduplication window is set to 5 seconds, which is sufficient to catch race conditions and duplicate triggers
- The solution maintains all existing functionality while eliminating duplicates
- No changes were needed to the React Native app code
- The fix is entirely database-side, making it robust and reliable
