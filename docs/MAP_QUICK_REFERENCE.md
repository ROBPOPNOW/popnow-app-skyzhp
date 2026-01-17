
# Map Feature Quick Reference

## User Guide

### Viewing the Map
1. Open the **Map** tab from the bottom navigation
2. Grant location permission when prompted (optional)
3. Map centers on your location or Auckland by default

### Understanding the Map

#### Zoom Levels
- **Zoomed Out (≤10)**: See heatmap showing video density
  - Yellow = Low activity
  - Orange = Medium activity
  - Red = High activity
  
- **Zoomed In (>10)**: See individual video pins
  - Red pins = Video locations
  - Yellow circles = 3km privacy radius
  - Blue circles = 10km privacy radius

#### Pin Colors & Circles
- **Red Pin Only**: Exact location shared
- **Red Pin + Yellow Circle**: Location within 3km
- **Red Pin + Blue Circle**: Location within 10km

### Interacting with the Map

#### Viewing Videos
1. **Tap a pin** to see videos at that location
2. If multiple videos:
   - See count of videos found
   - Tap "View Videos" to browse
   - Swipe up/down to navigate
3. If single exact location:
   - Video plays immediately

#### Navigation
- **Pinch**: Zoom in/out
- **Drag**: Pan around map
- **Tap 📍 button**: Return to your location

#### Video Actions
While viewing videos from map:
- **❤️ Like**: Tap heart icon
- **💬 Comment**: Tap comment bubble
- **↗️ Share**: Tap share icon
- **✕ Close**: Return to map

### Privacy Settings

When uploading videos, you choose location privacy:

1. **Exact Location**
   - Pin shows true coordinates
   - No privacy circle
   - Best for public places

2. **3km Radius**
   - Pin randomized within 3km
   - Yellow circle shows area
   - Good for neighborhoods

3. **10km Radius**
   - Pin randomized within 10km
   - Blue circle shows area
   - Best for city-wide privacy

## Developer Guide

### Adding Map to Your Screen

```typescript
import LeafletMap from '@/components/LeafletMap';

<LeafletMap
  markers={videoLocations}
  center={{ latitude: -36.8485, longitude: 174.7633 }}
  zoom={12}
  onMarkerPress={handleMarkerPress}
  onLocateMePress={handleLocateMe}
  heatmapData={heatmapData}
/>
```

### Marker Data Structure

```typescript
interface MapMarker {
  id: string;              // Unique marker ID
  videoId: string;         // Video ID for lookup
  latitude: number;        // True latitude
  longitude: number;       // True longitude
  title?: string;          // Location name
  videoCount?: number;     // Number of videos
  privacyRadius?: 'exact' | '3km' | '10km';
}
```

### Heatmap Data Structure

```typescript
interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number;  // 0-1 scale
}
```

### Fetching Video Locations

```typescript
const { data: videos } = await supabase
  .from('videos')
  .select(`
    id,
    location_latitude,
    location_longitude,
    location_name,
    location_privacy
  `)
  .eq('moderation_status', 'approved')
  .not('location_latitude', 'is', null)
  .not('location_longitude', 'is', null);
```

### Handling Marker Press

```typescript
const handleMarkerPress = async (markerId: string, videoIds: string[]) => {
  // Fetch full video data
  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .in('id', videoIds);
  
  // Show videos in modal
  setSelectedVideos(videos);
  setModalVisible(true);
};
```

### Customizing Map Appearance

Edit `components/LeafletMap.tsx`:

```javascript
// Change heatmap colors
gradient: {
  0.0: '#FFEB3B',  // Yellow
  0.5: '#FF9800',  // Orange
  0.7: '#FF5722',  // Deep Orange
  1.0: '#F44336'   // Red
}

// Change pin style
.custom-pin {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
  border: 3px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

// Change circle colors
// 3km radius
color: 'rgba(255, 255, 0, 0.8)',
fillColor: 'rgba(255, 255, 0, 0.25)',

// 10km radius
color: 'rgba(0, 0, 255, 0.8)',
fillColor: 'rgba(0, 0, 255, 0.25)',
```

### Zoom Threshold

Change when heatmap/pins switch:

```javascript
const ZOOM_THRESHOLD = 10;  // Change this value

// In updateDisplayMode()
if (zoom <= ZOOM_THRESHOLD) {
  // Show heatmap
} else {
  // Show pins
}
```

### Privacy Radius Calculation

The randomized position is calculated using a seeded random generator:

```javascript
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const seed = hashString(videoId);
const randomPoint = randomPointInRadius(lat, lon, radiusKm, seed);
```

This ensures the same video always appears at the same randomized location.

## Common Tasks

### Change Default Location

Edit `app/(tabs)/map.tsx`:

```typescript
// Change from Auckland to your city
center={userLocation || { 
  latitude: YOUR_LAT, 
  longitude: YOUR_LON 
}}
```

### Add Custom Map Tiles

Edit `components/LeafletMap.tsx`:

```javascript
// Replace OpenStreetMap with custom tiles
L.tileLayer('https://your-tile-server/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: 'Your attribution'
}).addTo(map);
```

### Disable Clustering

```javascript
// Remove marker cluster group
// Add markers directly to map
markers.forEach(marker => {
  L.marker([marker.lat, marker.lon]).addTo(map);
});
```

### Change Cluster Radius

```javascript
const markerClusterGroup = L.markerClusterGroup({
  maxClusterRadius: 60,  // Change this (default: 80)
});
```

### Add Search Functionality

```typescript
const [searchQuery, setSearchQuery] = useState('');

const filteredMarkers = markers.filter(marker =>
  marker.title?.toLowerCase().includes(searchQuery.toLowerCase())
);

<LeafletMap markers={filteredMarkers} ... />
```

## Troubleshooting

### Map is blank
- Check internet connection (needs CDN access)
- Verify WebView is enabled
- Check console for errors

### Pins not showing
- Zoom in past level 10
- Verify videos have location data
- Check moderation_status is 'approved'

### Heatmap not showing
- Zoom out to level 10 or below
- Verify heatmapData has points
- Check intensity values (0-1)

### Wrong location
- Check latitude/longitude order (lat, lon)
- Verify coordinates are in decimal degrees
- Check for null/undefined values

### Performance issues
- Reduce maxClusterRadius
- Limit number of markers loaded
- Implement viewport-based loading
- Reduce heatmap radius/blur

## Best Practices

1. **Always validate location data** before adding to map
2. **Use clustering** for more than 100 markers
3. **Implement lazy loading** for large datasets
4. **Cache map state** to improve load times
5. **Handle permission denials** gracefully
6. **Test on real devices** (WebView performance varies)
7. **Respect user privacy** with radius options
8. **Provide clear legend** for user understanding

## Resources

- [Leaflet.js Documentation](https://leafletjs.com/)
- [Marker Cluster Plugin](https://github.com/Leaflet/Leaflet.markercluster)
- [Heatmap Plugin](https://github.com/Leaflet/Leaflet.heat)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)
- [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/)
