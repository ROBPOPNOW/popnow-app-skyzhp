
# Comment System - Quick Reference

## ✅ What Was Fixed

### The Error
```
function realtime.send (text, unknown, jsonb, boolean) does not exist
```

### The Cause
SQL triggers were calling `realtime.send()`, an internal Supabase function that should never be called from user code.

### The Solution
1. ✅ Removed all `realtime.send()` calls from SQL functions
2. ✅ Enabled Supabase Realtime on `comments`, `videos`, and `notifications` tables
3. ✅ Updated client to use `postgres_changes` subscriptions
4. ✅ Verified RLS policies allow SELECT for realtime

## 🚀 How to Use

### Posting a Comment (Client-Side)

```typescript
// Simple insert - Supabase handles the rest
const { data, error } = await supabase
  .from('comments')
  .insert({
    video_id: videoId,
    user_id: userId,
    text: commentText,
  });
```

### Subscribing to Real-Time Comments

```typescript
const channel = supabase
  .channel(`comments:${videoId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `video_id=eq.${videoId}`,
    },
    (payload) => {
      console.log('New comment:', payload.new);
      // Update UI with new comment
    }
  )
  .subscribe();

// Cleanup
return () => supabase.removeChannel(channel);
```

## 📋 Verification Checklist

Run this query to verify everything is set up correctly:

```sql
-- All should return ✅
SELECT 
  'Comments Table RLS' AS check_type,
  CASE WHEN rowsecurity THEN '✅ Enabled' ELSE '❌ Disabled' END AS status
FROM pg_tables 
WHERE tablename = 'comments'

UNION ALL

SELECT 
  'Comments in Realtime Publication',
  CASE WHEN COUNT(*) > 0 THEN '✅ Enabled' ELSE '❌ Not Enabled' END
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'comments'

UNION ALL

SELECT 
  'SELECT Policy Exists',
  CASE WHEN COUNT(*) > 0 THEN '✅ Exists' ELSE '❌ Missing' END
FROM pg_policies 
WHERE tablename = 'comments' AND cmd = 'SELECT';
```

## 🔍 Troubleshooting

### Comments not appearing in real-time?

1. **Check Realtime is enabled:**
   ```sql
   SELECT * FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime' AND tablename = 'comments';
   ```

2. **Check RLS policies allow SELECT:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'comments' AND cmd = 'SELECT';
   ```

3. **Check subscription status:**
   ```typescript
   channel.subscribe((status) => {
     console.log('Status:', status); // Should be 'SUBSCRIBED'
   });
   ```

### Still getting `realtime.send` error?

1. **Check for remaining calls:**
   ```sql
   SELECT proname, pg_get_functiondef(oid) 
   FROM pg_proc 
   WHERE pg_get_functiondef(oid) LIKE '%realtime.send%';
   ```

2. **If found, remove them:**
   ```sql
   -- Replace the function without realtime.send call
   CREATE OR REPLACE FUNCTION function_name() ...
   ```

## 📚 Key Concepts

### ❌ Don't Do This:
```sql
-- WRONG: Never call realtime.send from SQL
PERFORM realtime.send('channel', 'event', payload, false);
```

### ✅ Do This Instead:
```sql
-- CORRECT: Just insert/update data
INSERT INTO comments (video_id, user_id, text) VALUES (...);
-- Supabase Realtime broadcasts automatically
```

### Client Subscription:
```typescript
// Subscribe to postgres_changes
supabase
  .channel('channel-name')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'comments' 
  }, callback)
  .subscribe();
```

## 🎯 Best Practices

1. **Enable Realtime on tables:**
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE table_name;
   ```

2. **Use RLS to control access:**
   ```sql
   CREATE POLICY "policy_name" ON table_name
   FOR SELECT USING (condition);
   ```

3. **Subscribe only when needed:**
   ```typescript
   useEffect(() => {
     if (modalOpen) {
       const channel = supabase.channel(...).subscribe();
       return () => supabase.removeChannel(channel);
     }
   }, [modalOpen]);
   ```

4. **Handle duplicates:**
   ```typescript
   setComments(prev => {
     const exists = prev.some(c => c.id === newComment.id);
     return exists ? prev : [newComment, ...prev];
   });
   ```

5. **Optimistic updates:**
   ```typescript
   // Update UI immediately
   setCount(prev => prev + 1);
   
   // Then save to database
   await supabase.from('table').insert(...);
   ```

## 📖 Related Documentation

- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Full Fix Documentation](./COMMENT_SYSTEM_FIX.md)
