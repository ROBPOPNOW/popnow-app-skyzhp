import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
const { target_hour, test_user_id } = await req.json()

    // Get users whose 8am matches current UTC hour
let usersQuery = supabase
  .from('users')
  .select('id, push_token, timezone')
  .not('push_token', 'is', null)

if (test_user_id) {
  usersQuery = usersQuery.eq('id', test_user_id)
}

const { data: users } = await usersQuery

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found' }), { status: 200 })
    }

    // Filter users where it's currently 8am in their timezone
 const eligibleUsers = test_user_id ? users || [] : (users || []).filter(user => {
  try {
    const tz = user.timezone || 'UTC'
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    })
    const localHour = parseInt(formatter.format(now))
    return localHour === 8
  } catch {
    return false
  }
})

    if (eligibleUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No eligible users for this hour' }), { status: 200 })
    }

    // Get videos from last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: videos } = await supabase
      .from('videos')
      .select('id, location_name, location_latitude, location_longitude')
      .eq('moderation_status', 'approved')
      .gte('created_at', since)

    if (!videos || videos.length === 0) {
      return new Response(JSON.stringify({ message: 'No videos in last 24 hours' }), { status: 200 })
    }

    // Extract unique countries and cities
    const countries = new Set<string>()
    const cities = new Set<string>()

    videos.forEach(v => {
      if (!v.location_name) return
      const parts = v.location_name.split(',').map((p: string) => p.trim())
      if (parts.length >= 1) cities.add(parts[0])
      if (parts.length >= 2) countries.add(parts[parts.length - 1])
    })

    const countryList = Array.from(countries)
    const cityList = Array.from(cities)
    const videoCount = videos.length

    // Build notification message — country-first title, checked in this order:
    // empty → single video → exactly 1 country → 2-3 countries → 4+ countries
    let title: string
    let body: string

    if (countryList.length === 0) {
      // No video's location_name had a parseable "City, Country" comma — nothing to name safely.
      title = '🌍 New POPs from around the world'
      body = 'While you were away, unfiltered life was filmed in places you\'ve never seen.'
    } else if (videoCount === 1) {
      // Room for one full place — City, Country gives both intrigue and a recognizable country.
      title = `📍 New POP from ${videos[0].location_name || 'somewhere new'}`
      body = 'While you were away, unfiltered life was filmed there. Tap to explore.'
    } else if (countryList.length === 1) {
      // Multiple videos, all one country — "& more" would be misleading, so convey volume instead.
      title = `📍 ${videoCount} new POPs from ${countryList[0]}`
      body = 'While you were away, unfiltered life was filmed in places you\'ve never seen.'
    } else if (countryList.length <= 3) {
      // 2 or 3 distinct countries — "& more" is truthful here.
      title = `📍 ${countryList.slice(0, 2).join(', ')} & more`
      body = 'While you were away, unfiltered life was filmed in places you\'ve never seen.'
    } else {
      const remaining = countryList.length - 2
      title = `📍 ${countryList.slice(0, 2).join(', ')} & ${remaining} more`
      body = 'While you were away, unfiltered life was filmed across the world.'
    }

    // Build notification data payload
    const notificationData: any = {
      type: 'daily_digest',
      videoCount,
    }

    if (videoCount === 1 && videos[0].location_latitude && videos[0].location_longitude) {
      notificationData.latitude = videos[0].location_latitude
      notificationData.longitude = videos[0].location_longitude
    }

    // Send push to all eligible users
    const pushTokens = eligibleUsers.map(u => u.push_token).filter(Boolean)

    const pushPayload = {
      to: pushTokens,
      title,
      body,
      data: notificationData,
      sound: 'default',
    }

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushPayload),
    })

    console.log(`✅ Daily digest sent to ${pushTokens.length} users`)

    return new Response(JSON.stringify({ 
      success: true, 
      usersNotified: pushTokens.length,
      videoCount,
    }), { status: 200 })

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})