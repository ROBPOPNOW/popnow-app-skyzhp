
# Comment System Fix - Supabase Best Practices

## Problem
The app was encountering this error when inserting comments:
```
function realtime.send (text, unknown, jsonb, boolean) does not exist
```

This error occurred because SQL triggers were attempting to call `realtime.send()`, which is an internal Supabase function that should never be called directly from user code.

## Solution Applied

### 1. Database Migrations

**Migration: `fix_comment_realtime_system`**
- Removed `realtime.send()` call from `notify_new_comment()` function
- Enabled Realtime on the `comments` table via `ALTER PUBLICATION supabase_realtime ADD TABLE comments`
- Added performance indexes on `comments(video_id)` and `comments(created_at)`

**Migration: `remove_realtime_send_cascade`**
- Removed `realtime.send()` call from `notify_new_like()` function
- Dropped `broadcast_video_stats()` function and trigger (no longer needed)
- Enabled Realtime on `videos` and `notifications` tables

### 2. Client-Side Changes

**Updated: `components/VideoFeedItem.tsx`**

#### Removed:
- ❌ Broadcast channels for stats updates
- ❌ Manual `realtime.send()` calls
- ❌ `broadcastStatsUpdate()` function

#### Added:
- ✅ Proper `postgres_changes` subscription for comments
- ✅ Real-time comment updates using Supabase's built-in Realtime
- ✅ Automatic duplicate prevention
- ✅ Optimistic UI updates

#### Key Changes:

**Before (Incorrect):**
```typescript
// ❌ Using broadcast channels
const statsChannel = supabase.channel(`video:${video.id}:stats`, {
  config: { broadcast: { self: false } },
});

statsChannel.on('broadcast', { event: 'stats_updated' }, (payload) => {
  // Handle stats update
});

// ❌ Manual broadcasting
await broadcastChannel.send({
  type: 'broadcast',
  event: 'stats_updated',
  payload: updates,
});
```

**After (Correct):**
```typescript
// ✅ Using postgres_changes subscription
const commentsChannel = supabase
  .channel(`comments:${video.id}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `video_id=eq.${video.id}`,
    },
    async (payload) => {
      // Fetch full comment with user data
      const { data: newComment } = await supabase
        .from('comments')
        .select(`id, user_id, text, created_at, users (username, avatar_url)`)
        .eq('id', payload.new.id)
        .single();

      // Add to local state with duplicate check
      setComments((prev) => {
        const exists = prev.some(c => c.id === newComment.id);
        return exists ? prev : [newComment, ...prev];
      });
    }
  )
  .subscribe();
```

### 3. Database Functions Fixed

All functions now follow Supabase best practices:

#### `notify_new_comment()` - ✅ Fixed
```sql
-- Before: Had PERFORM realtime.send(...)
-- After: Only creates notification, Realtime handles broadcasting
INSERT INTO notifications (user_id, actor_id, type, video_id, comment_id, message)
VALUES (...);
```

#### `notify_new_like()` - ✅ Fixed
```sql
-- Before: Had PERFORM realtime.send(...)
-- After: Only creates notification, Realtime handles broadcasting
INSERT INTO notifications (user_id, actor_id, type, video_id, message)
VALUES (...);
```

#### `broadcast_video_stats()` - ✅ Removed
This function is no longer needed. Supabase Realtime automatically broadcasts changes to the `videos` table.

### 4. Realtime Configuration

The following tables now have Realtime enabled:

- ✅ `comments` - For real-time comment updates
- ✅ `videos` - For real-time video stats updates
- ✅ `notifications` - For real-time notification updates

### 5. Row Level Security (RLS)

Existing RLS policies on `comments` table:
- ✅ `Comments are viewable by everyone` - Allows SELECT for all users (required for Realtime)
- ✅ `Users can insert comments` - Allows INSERT for authenticated users
- ✅ `Users can update their own comments` - Allows UPDATE for comment owners
- ✅ `Users can delete their own comments` - Allows DELETE for comment owners

## How It Works Now

### Comment Flow:

1. **User posts comment:**
   - Client calls `supabase.from('comments').insert(...)`
   - Optimistic UI update (instant feedback)

2. **Database processes:**
   - Comment inserted into `comments` table
   - Trigger `on_comment_created` fires → calls `notify_new_comment()`
   - Notification created in `notifications` table
   - Supabase Realtime automatically broadcasts INSERT event

3. **Real-time updates:**
   - All subscribed clients receive `postgres_changes` event
   - Clients fetch full comment data with user info
   - UI updates with new comment

### Benefits:

- ✅ **No more errors** - No illegal `realtime.send()` calls
- ✅ **Automatic broadcasting** - Supabase handles all real-time events
- ✅ **Better performance** - Built-in Realtime is optimized
- ✅ **Simpler code** - No manual broadcast management
- ✅ **Reliable** - Supabase guarantees event delivery
- ✅ **Scalable** - Works with any number of clients

## Testing

To verify the fix works:

1. **Open the app on two devices/browsers**
2. **Navigate to the same video**
3. **Post a comment from device 1**
4. **Verify comment appears on device 2 in real-time**

Expected behavior:
- Comment posts successfully (no errors)
- Comment appears instantly on posting device (optimistic update)
- Comment appears on other devices within 1-2 seconds (real-time)
- Comment count updates correctly on all devices

## Migration History

- `20251023072324` - Initial tables
- `20251129213218` - Created notification triggers
- `20251129213413` - Updated notification triggers with username
- **`fix_comment_realtime_system`** - Fixed comment realtime (removed realtime.send)
- **`remove_realtime_send_cascade`** - Removed all remaining realtime.send calls

## Additional Notes

### Why `realtime.send()` is Wrong:

- `realtime.send()` is an **internal Supabase function**
- It's not part of the public API
- Calling it from SQL triggers causes errors
- Supabase Realtime handles broadcasting automatically

### Correct Approach:

1. Enable Realtime on tables via `ALTER PUBLICATION supabase_realtime ADD TABLE table_name`
2. Subscribe to `postgres_changes` events on the client
3. Let Supabase handle all broadcasting automatically
4. Use RLS policies to control who can see what

### Performance Optimizations:

- Added indexes on `comments(video_id)` and `comments(created_at)` for faster queries
- Subscription only activates when comments modal is open
- Duplicate prevention to avoid redundant UI updates
- Optimistic updates for instant user feedback

## References

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
