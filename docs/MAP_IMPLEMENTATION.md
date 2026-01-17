
# Map Implementation Guide

## Overview
This document describes the comprehensive Leaflet.js map implementation for POPNOW, featuring dynamic heatmap/pin switching, privacy radius visualization, and video discovery.

## Features Implemented

### 1. Map Base (Leaflet.js)
- **Library**: Leaflet.js v1.9.4 with plugins:
  - `leaflet.markercluster` v1.5.3 for pin clustering
  - `leaflet.heat` v0.2.0 for heatmap visualization
- **Default View**: Auckland, New Zealand (-36.8485, 174.7633)
- **Controls**: Pinch-zoom, pan, and cluster visualization enabled
- **Tile Layer**: OpenStreetMap tiles

### 2. Heatmap Layer (Zoom ≤ 10)
- **Activation**: Automatically shown when zoom level is 10 or below
- **Gradient**: Light yellow → Orange → Red indicating upload density
- **Data Source**: All approved videos with location data
- **Behavior**: No pins visible in heatmap mode

### 3. Pin Layer (Zoom > 10)
- **Activation**: Automatically shown when zoom level is above 10
- **Pin Design**: Custom circular pins with:
  - Red gradient background (#FF6B6B to #FF5252)
  - White border (3px)
  - Soft drop shadow
  - 📍 emoji icon
  - Hover scale effect

### 4. Privacy Radius Visualization
- **Exact Location**: No circle, pin at true coordinates
- **3km Radius**: 
  - Yellow circle: `rgba(255, 255, 0, 0.25)` fill
  - Yellow border: `rgba(255, 255, 0, 0.8)`
  - Pin randomized within 3km using seeded random
- **10km Radius**:
  - Blue circle: `rgba(0, 0, 255, 0.25)` fill
  - Blue border: `rgba(0, 0, 255, 0.8)`
  - Pin randomized within 10km using seeded random

### 5. Randomized Pin Positions
- **Algorithm**: Seeded random number generator based on video ID
- **Consistency**: Same video always appears at same randomized position
- **Implementation**: 
  ```javascript
  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  
  function randomPointInRadius(lat, lon, radiusKm, seed) {
    const radiusInDegrees = radiusKm / 111.32;
    const u = seededRandom(seed);
    const v = seededRandom(seed + 1);
    const w = radiusInDegrees * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    const x = w * Math.cos(t);
    const y = w * Math.sin(t);
    return { lat: lat + y, lon: lon + x / Math.cos(lat * Math.PI / 180) };
  }
  ```

### 6. Pin Clustering
- **Library**: Leaflet.markercluster
- **Settings**:
  - Max cluster radius: 60px
  - Spiderfy on max zoom
  - Zoom to bounds on click
- **Cluster Colors**:
  - Small (<10): Yellow
  - Medium (10-50): Orange
  - Large (>50): Red

### 7. Pin Interaction
- **Exact Location Videos**: 
  - Single video: Opens directly in video player
  - Multiple videos: Shows count with "View Videos" button
- **Radius Videos**:
  - Shows count of videos found within radius
  - "View Videos" button to browse all videos
  - "Cancel" button to close
- **Video Viewing**:
  - Full-screen modal with swipeable feed
  - Same interface as main feed
  - Like, comment, share functionality
  - Close button to return to map

### 8. Dynamic Behavior
- **Zoom Threshold**: 10
- **Smooth Transitions**: Automatic layer switching on zoom
- **Auto-Updates**: Map refreshes when new videos are uploaded
- **Lazy Loading**: Markers loaded efficiently

### 9. UI Enhancements

#### Locate Me Button
- **Position**: Bottom-right corner
- **Design**: 
  - White circular button (56x56px)
  - 📍 emoji icon
  - Drop shadow for depth
- **Function**: Centers map on user's current location

#### Map Legend
- **Position**: Bottom-left corner
- **Design**:
  - White background with transparency
  - Rounded corners (12px)
  - Drop shadow
- **Content**:
  - 🔴 Heat gradient = High activity area
  - 🟡 Yellow circle = 3 km privacy radius
  - 🔵 Blue circle = 10 km privacy radius
  - ⚪ Red pin = Exact location

## Database Schema

### Videos Table
```sql
videos (
  id uuid PRIMARY KEY,
  location_latitude double precision,
  location_longitude double precision,
  location_name text,
  location_privacy text CHECK (location_privacy IN ('exact', '3km', '10km')),
  moderation_status text CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  ...
)
```

### RPC Functions
```sql
-- Increment likes count
CREATE FUNCTION increment_likes_count(video_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE videos
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrement likes count
CREATE FUNCTION decrement_likes_count(video_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE videos
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Component Architecture

### LeafletMap Component
**File**: `components/LeafletMap.tsx`

**Props**:
- `markers`: Array of video locations with privacy settings
- `center`: Map center coordinates
- `zoom`: Initial zoom level
- `onMarkerPress`: Callback when marker is tapped
- `onLocateMePress`: Callback for locate button
- `heatmapData`: Array of points for heatmap

**Key Features**:
- WebView-based Leaflet.js integration
- Dynamic zoom-based layer switching
- Seeded random position generation
- Marker clustering
- Privacy radius circles

### MapScreen Component
**File**: `app/(tabs)/map.tsx`

**Responsibilities**:
- Fetch video locations from Supabase
- Generate heatmap data
- Handle user location
- Manage video viewing modal
- Handle marker interactions

**State Management**:
- `userLocation`: Current user coordinates
- `videoLocations`: Array of video markers
- `heatmapData`: Heatmap intensity points
- `selectedVideos`: Videos to display in modal
- `modalVisible`: Modal visibility state

## Usage Flow

1. **Map Load**:
   - Request user location permission
   - Fetch approved videos with location data
   - Generate markers and heatmap data
   - Initialize map at user location or Auckland

2. **Zoom Out (≤10)**:
   - Heatmap layer fades in
   - Pins and circles fade out
   - Legend shows heat gradient

3. **Zoom In (>10)**:
   - Heatmap layer fades out
   - Pins and circles fade in
   - Clustering activates for nearby pins

4. **Tap Pin**:
   - Fetch full video data
   - Check privacy setting
   - Show info modal or direct video
   - User can view all videos in feed mode

5. **Locate Me**:
   - Request location permission
   - Get current coordinates
   - Center map on user location

## Performance Optimizations

1. **Lazy Loading**: Markers loaded on demand
2. **Clustering**: Reduces marker count at lower zoom levels
3. **WebView Caching**: HTML content cached in WebView
4. **Efficient Updates**: Only update markers when data changes
5. **Viewport Culling**: Only render visible markers

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live video additions
2. **Custom Filters**: Filter by tags, date, popularity
3. **Search**: Search for locations or videos
4. **Offline Mode**: Cache map tiles for offline viewing
5. **AR Mode**: Augmented reality video discovery
6. **Heat Animation**: Animated heatmap transitions
7. **3D Terrain**: Optional 3D map view

## Troubleshooting

### Map Not Loading
- Check internet connection
- Verify Leaflet.js CDN availability
- Check console for WebView errors

### Pins Not Appearing
- Verify videos have location data
- Check zoom level (must be >10)
- Verify moderation_status is 'approved'

### Heatmap Not Showing
- Verify zoom level (must be ≤10)
- Check heatmapData array has points
- Verify leaflet.heat plugin loaded

### Location Permission Denied
- App defaults to Auckland
- User can manually pan to desired location
- "Locate Me" button prompts for permission again

## Testing Checklist

- [ ] Map loads at correct default location
- [ ] User location permission requested
- [ ] Heatmap visible at zoom ≤10
- [ ] Pins visible at zoom >10
- [ ] Privacy circles display correctly
- [ ] Randomized positions consistent per video
- [ ] Pin clustering works
- [ ] Marker tap opens correct videos
- [ ] Video modal displays properly
- [ ] Swipe navigation works in modal
- [ ] Like/comment/share functional
- [ ] "Locate Me" button works
- [ ] Legend displays correctly
- [ ] Smooth zoom transitions
- [ ] Performance acceptable with many pins

## Dependencies

```json
{
  "react-native-webview": "^13.15.0",
  "expo-location": "^19.0.7"
}
```

**CDN Resources**:
- Leaflet.js: https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
- Leaflet CSS: https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
- Marker Cluster: https://unpkg.com/leaflet.markercluster@1.5.3/
- Heatmap: https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js

## Conclusion

The map implementation provides a comprehensive, user-friendly interface for discovering videos based on location. The dynamic heatmap/pin switching, privacy radius visualization, and seamless video viewing create an engaging experience that respects user privacy while encouraging content discovery.
