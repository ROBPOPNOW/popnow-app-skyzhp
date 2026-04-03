import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/styles/commonStyles';

interface MapMarker {
  id: string;
  videoIds: string[];
  latitude: number;
  longitude: number;
  title?: string;
  videoCount?: number;
  privacyRadius?: 'exact' | '3km' | '10km';
  isRequest?: boolean;
}

interface LeafletMapProps {
  markers?: MapMarker[];
  center?: { latitude: number; longitude: number };
  zoom?: number;
  onMarkerPress?: (markerId: string, videoIds: string[]) => void;
  onLocateMePress?: () => void;
  onDoubleTap?: (location: { latitude: number; longitude: number }) => void;
  showHeatmap?: boolean;
  heatmapData?: Array<{ latitude: number; longitude: number; intensity: number }>;
  userLocation?: { latitude: number; longitude: number } | null;
  isGpsReady?: boolean;
  locationDenied?: boolean;
  onZoomChange?: (level: 'world' | 'country' | 'city') => void;  // ← ADD THIS
}

function LeafletMap({
  markers = [],
  center,
  zoom = 12,
  onMarkerPress,
  onLocateMePress,
  onDoubleTap,
  showHeatmap = false,
  heatmapData = [],
  userLocation,
  isGpsReady = false,
  locationDenied = false,
  onZoomChange,  // ← ADD THIS
}: LeafletMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [zoomLevel, setZoomLevel] = useState<'world' | 'country' | 'city'>('city');
  
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add this RIGHT AFTER the useRef declarations
useEffect(() => {
  return () => {
  };
}, []);
  
  // ✅ SAVE INITIAL CENTER AND ZOOM - NEVER CHANGES AFTER FIRST RENDER
  const initialCenter = useRef(center || { latitude: -36.8485, longitude: 174.7633 });
  const initialZoom = useRef(zoom);

  // Update markers when they change
  useEffect(() => {
    if (!isMapReady || !webViewRef.current) return;
    
    // ✅ REMOVED: Early return for empty markers
    // We MUST allow empty marker arrays to clear the map properly

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      const markersData = markers.map(marker => ({
        id: marker.id,
        videoIds: marker.videoIds || [],
        lat: marker.latitude,
        lng: marker.longitude,
        title: marker.title || '',
        videoCount: marker.videoCount || marker.videoIds?.length || 1,
        privacyRadius: marker.privacyRadius || 'exact',
        isRequest: marker.isRequest || marker.id.startsWith('request_'),
      }));

      webViewRef.current?.injectJavaScript(`
        (function() {
          try {
            if (window.updateMarkers) {
              window.updateMarkers(${JSON.stringify(markersData)});
            }
          } catch (error) {
            console.error('Error in updateMarkers:', error);
          }
        })();
        true;
      `);
    }, 300);
  }, [markers, isMapReady]);

  // Update heatmap
  useEffect(() => {
    if (!isMapReady || !webViewRef.current || !showHeatmap || heatmapData.length === 0) return;

    const heatData = heatmapData.map(point => ({
      lat: point.latitude,
      lng: point.longitude,
      intensity: point.intensity || 1,
    }));

    webViewRef.current.injectJavaScript(`
      (function() {
        try {
          if (window.updateHeatmap) {
            window.updateHeatmap(${JSON.stringify(heatData)});
          }
        } catch (error) {
          console.error('Error in updateHeatmap:', error);
        }
      })();
      true;
    `);
  }, [heatmapData, showHeatmap, isMapReady]);

  // Update user location
  useEffect(() => {
    if (!isMapReady || !webViewRef.current || !userLocation || locationDenied) return;

    webViewRef.current.injectJavaScript(`
      (function() {
        try {
          if (window.updateUserLocation) {
            window.updateUserLocation(${userLocation.latitude}, ${userLocation.longitude});
          }
        } catch (error) {
          console.error('Error in updateUserLocation:', error);
        }
      })();
      true;
    `);
  }, [userLocation, isMapReady]);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'mapReady':
          setIsMapReady(true);
          break;
        case 'markerClick':
          if (onMarkerPress) {
            onMarkerPress(data.markerId, data.videoIds || []);
          }
          break;
        case 'doubleTap':
          if (onDoubleTap) {
            onDoubleTap(data.location);
          }
          break;
        case 'zoomChange':
  setCurrentZoom(data.zoom);
  if (data.zoom <= 5) {
    setZoomLevel('world');
    if (onZoomChange) onZoomChange('world');  // ← ADD THIS
  } else if (data.zoom <= 9) {
    setZoomLevel('country');
    if (onZoomChange) onZoomChange('country');  // ← ADD THIS
  } else {
    setZoomLevel('city');
    if (onZoomChange) onZoomChange('city');  // ← ADD THIS
  }
  break;
      }
    } catch (error) {
      console.error('Error parsing message from map:', error);
    }
  };

  const handleLocateMe = () => {
    if (onLocateMePress) {
      onLocateMePress();
    }
    
    if (userLocation && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (window.centerOnUser) {
              window.centerOnUser(${userLocation.latitude}, ${userLocation.longitude});
            }
          } catch (error) {
            console.error('Error in centerOnUser:', error);
          }
        })();
        true;
      `);
    }
  };

  // ✅ CREATE HTML ONLY ONCE WITH INITIAL CENTER
  const htmlContent = useMemo(() => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="referrer" content="no-referrer-when-downgrade" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
      <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, html { height: 100%; width: 100%; overflow: hidden; }
        #map { height: 100%; width: 100%; background: #f5f5f5; }
        
        .video-marker {
          border: 3px solid #FFFFFF;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
          color: #FFFFFF;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .video-marker:hover { transform: scale(1.1); }
        .video-marker-exact { background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); }
        .video-marker-3km { background: linear-gradient(135deg, #FFD93D 0%, #FFA500 100%); }
        .video-marker-10km { background: linear-gradient(135deg, #6C5CE7 0%, #4169E1 100%); }
        
        .request-marker {
          font-size: 28px;
          text-align: center;
          line-height: 1;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .request-marker:hover { transform: scale(1.15); }
        
        .rainbow-cluster {
          background: linear-gradient(135deg, #FF00FF 0%, #00FFFF 25%, #FFFF00 50%, #FF00FF 75%, #00FFFF 100%);
          border: 4px solid #FFFFFF;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 900;
          color: #0000009c;
          text-shadow: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0);
          line-height: 1;
        }

        .country-cluster {
          background: linear-gradient(135deg, #FF69B4 0%, #7952B3 100%);
          border: 3px solid #FFFFFF;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          color: #FFFFFF;
          box-shadow: 0 4px 15px rgba(255, 105, 180, 0.5);
          line-height: 1;
          text-shadow: none;
        }
        .country-cluster-small { width: 45px; height: 45px; font-size: 16px; }
        .country-cluster-medium { width: 55px; height: 55px; font-size: 18px; }
        .country-cluster-large { width: 65px; height: 65px; font-size: 20px; }

        .hotspot-dot {
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 105, 180, 0.9) 0%, rgba(255, 105, 180, 0.4) 50%, rgba(255, 105, 180, 0) 70%);
          animation: hotspot-pulse 2s ease-in-out infinite;
          cursor: pointer;
        }
        .hotspot-dot-small { width: 30px; height: 30px; }
        .hotspot-dot-medium { width: 50px; height: 50px; }
        .hotspot-dot-large { width: 70px; height: 70px; }
        @keyframes hotspot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
        }

        .user-marker {
          background: linear-gradient(135deg, #00D084 0%, #00A86B 100%);
          border: 4px solid #FFFFFF;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          box-shadow: 0 0 0 4px rgba(0, 208, 132, 0.3), 0 2px 8px rgba(0,0,0,0.3);
          animation: user-pulse 2s ease-in-out infinite;
        }
        @keyframes user-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(0, 208, 132, 0.3), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(0, 208, 132, 0.2), 0 2px 12px rgba(0,0,0,0.4); }
        }

        .marker-cluster-small, .marker-cluster-small div, .marker-cluster-small span,
        .marker-cluster-medium, .marker-cluster-medium div, .marker-cluster-medium span,
        .marker-cluster-large, .marker-cluster-large div, .marker-cluster-large span,
        .leaflet-marker-icon span {
          text-shadow: none !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var WORLD_MAX = 5;
        var COUNTRY_MAX = 9;

        var map = L.map('map', {
  center: [${initialCenter.current.latitude}, ${initialCenter.current.longitude}],
  zoom: ${initialZoom.current},  // ✅ CORRECT! Using saved initial zoom
  zoomControl: false,
  minZoom: 2,
  maxZoom: 19,
});

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
  referrerPolicy: 'no-referrer-when-downgrade',
}).addTo(map);

        var state = {
          cityClusterGroup: L.markerClusterGroup({
            maxClusterRadius: 60,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: function(cluster) {
              return L.divIcon({
                html: '<div class="rainbow-cluster">' + cluster.getChildCount() + '</div>',
                className: '',
                iconSize: L.point(50, 50),
              });
            }
          }),
          countryClusterGroup: L.markerClusterGroup({
            maxClusterRadius: 120,
            spiderfyOnMaxZoom: false,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 10,
            iconCreateFunction: function(cluster) {
              return L.divIcon({
                html: '<div class="rainbow-cluster">' + cluster.getChildCount() + '</div>',
                className: '',
                iconSize: L.point(50, 50),
              });
            }
          }),
          worldHotspotsGroup: L.layerGroup(),
          requestLayerGroup: L.layerGroup(),
          heatmapLayer: null,
          userMarker: null,
          currentZoom: ${initialZoom.current},
          currentLevel: 'city',
          allMarkers: [],
          lastTap: 0,
        };

        if (state.currentZoom <= WORLD_MAX) state.currentLevel = 'world';
        else if (state.currentZoom <= COUNTRY_MAX) state.currentLevel = 'country';
        else state.currentLevel = 'city';

        function addCurrentLayers() {
          if (state.currentLevel === 'world') map.addLayer(state.worldHotspotsGroup);
          else if (state.currentLevel === 'country') map.addLayer(state.countryClusterGroup);
          else {
            map.addLayer(state.cityClusterGroup);
            map.addLayer(state.requestLayerGroup);
          }
        }

        function removeAllLayers() {
          map.removeLayer(state.worldHotspotsGroup);
          map.removeLayer(state.countryClusterGroup);
          map.removeLayer(state.cityClusterGroup);
          map.removeLayer(state.requestLayerGroup);
          if (state.heatmapLayer) map.removeLayer(state.heatmapLayer);
        }

        addCurrentLayers();

        map.on('zoomend', function() {
          var newZoom = map.getZoom();
          var oldLevel = state.currentLevel;
          state.currentZoom = newZoom;
          if (newZoom <= WORLD_MAX) state.currentLevel = 'world';
          else if (newZoom <= COUNTRY_MAX) state.currentLevel = 'country';
          else state.currentLevel = 'city';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'zoomChange', zoom: newZoom }));
          if (oldLevel !== state.currentLevel) {
            removeAllLayers();
            addCurrentLayers();
          }
        });

        map.on('click', function(e) {
          var now = Date.now();
          if (now - state.lastTap < 300 && now - state.lastTap > 0) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'doubleTap',
              location: { latitude: e.latlng.lat, longitude: e.latlng.lng }
            }));
          }
          state.lastTap = now;
        });

        function getMarkerColorClass(r) {
          return r === '3km' ? 'video-marker-3km' : r === '10km' ? 'video-marker-10km' : 'video-marker-exact';
        }

        function createCityMarkerIcon(m) {
          if (m.isRequest) {
            return L.divIcon({
              html: '<div class="request-marker">🙋</div>',
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 40],
              popupAnchor: [0, -40],
            });
          }
          return L.divIcon({
            html: '<div class="video-marker ' + getMarkerColorClass(m.privacyRadius) + '">' + (m.videoCount || 1) + '</div>',
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -22],
          });
        }

        function buildWorldHotspots(markersData) {
          state.worldHotspotsGroup.clearLayers();
          var grid = {}, gridSize = 10;
          markersData.forEach(function(m) {
            if (m.isRequest) return;
            var key = Math.floor(m.lat/gridSize)*gridSize + ',' + Math.floor(m.lng/gridSize)*gridSize;
            if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0 };
            grid[key].lat += m.lat;
            grid[key].lng += m.lng;
            grid[key].count += 1;
          });
          Object.keys(grid).forEach(function(key) {
            var c = grid[key], lat = c.lat/c.count, lng = c.lng/c.count;
            var cls = c.count >= 20 ? 'hotspot-dot-large' : c.count >= 5 ? 'hotspot-dot-medium' : 'hotspot-dot-small';
            var sz = c.count >= 20 ? 70 : c.count >= 5 ? 50 : 30;
            var h = L.marker([lat, lng], {
              icon: L.divIcon({ html: '<div class="hotspot-dot ' + cls + '"></div>', className: '', iconSize: [sz, sz], iconAnchor: [sz/2, sz/2] })
            });
            h.on('click', function() { map.setView([lat, lng], WORLD_MAX + 1, { animate: true }); });
            state.worldHotspotsGroup.addLayer(h);
          });
        }

        window.updateMarkers = function(markersData) {
          try {
            state.allMarkers = markersData;
            state.cityClusterGroup.clearLayers();
            state.countryClusterGroup.clearLayers();
            state.requestLayerGroup.clearLayers();
            state.worldHotspotsGroup.clearLayers();
            markersData.forEach(function(m) {
              var icon = createCityMarkerIcon(m);
              var cm = L.marker([m.lat, m.lng], { icon: icon, riseOnHover: true });
              cm.on('click', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerClick', markerId: m.id, videoIds: m.videoIds || [] }));
              });
              if (m.title) {
                cm.bindPopup('<div style="text-align:center;"><strong>' + m.title + '</strong>' + (m.videoCount > 1 ? '<br/>' + m.videoCount + ' videos' : '') + '</div>');
              }
              if (m.isRequest) {
                state.requestLayerGroup.addLayer(cm);
              } else {
                state.cityClusterGroup.addLayer(cm);
                var cnm = L.marker([m.lat, m.lng]);
                cnm.on('click', function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerClick', markerId: m.id, videoIds: m.videoIds || [] }));
                });
                state.countryClusterGroup.addLayer(cnm);
              }
            });
            buildWorldHotspots(markersData);
          } catch (e) { console.error('Error updating markers:', e); }
        };

        window.updateUserLocation = function(lat, lng) {
          try {
            if (state.userMarker) map.removeLayer(state.userMarker);
            state.userMarker = L.marker([lat, lng], {
              icon: L.divIcon({ html: '<div class="user-marker"></div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
              zIndexOffset: 1000,
            });
            state.userMarker.addTo(map);
          } catch (e) { console.error('Error updating user location:', e); }
        };

        window.centerOnUser = function(lat, lng) {
          map.setView([lat, lng], 15, { animate: true, duration: 0.5 });
        };

        window.updateHeatmap = function(heatData) {
          try {
            if (state.heatmapLayer) { map.removeLayer(state.heatmapLayer); state.heatmapLayer = null; }
            if (heatData.length === 0) return;
            var pts = heatData.map(function(p) { return [p.lat, p.lng, p.intensity || 1]; });
            state.heatmapLayer = L.heatLayer(pts, {
              radius: 30, blur: 20, maxZoom: 10, max: 1.0, minOpacity: 0.3,
              gradient: { 0.0: 'rgba(0,0,255,0)', 0.2: 'rgba(0,0,255,0.5)', 0.4: 'rgba(0,255,255,0.7)', 0.6: 'rgba(0,255,0,0.8)', 0.8: 'rgba(255,255,0,0.9)', 1.0: 'rgba(255,0,0,1)' }
            });
            if (state.currentLevel === 'country') map.addLayer(state.heatmapLayer);
          } catch (e) { console.error('Error updating heatmap:', e); }
        };

        map.whenReady(function() {
          setTimeout(function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
          }, 500);
        });
      </script>
    </body>
    </html>
    `;  // ← Close template string
  }, []); // ← Close useMemo function with empty deps array

  const getZoomIndicator = () => {
    if (zoomLevel === 'world') {
      return {
        text: '🌍 World View',
        subtext: 'Pulsing dots show where videos are live. Tap to zoom in.',
      };
    } else if (zoomLevel === 'country') {
      return {
        text: '🏙️ Region View',
        subtext: 'Numbers show video counts. Tap a cluster to zoom in.',
      };
    }
    return null;
  };

  const zoomIndicator = getZoomIndicator();

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        )}
      />
      
      <Pressable 
        style={[
          styles.locateMeButton,
          (!isGpsReady || locationDenied) && styles.locateMeButtonDisabled
        ]} 
        onPress={handleLocateMe}
        disabled={!isGpsReady || locationDenied}
      >
        <View style={styles.locateMeButtonInner}>
          {locationDenied ? (
            <>
              <Text style={styles.locateMeButtonTextDisabled}>📍</Text>
              <Text style={styles.locateMeButtonLabelDisabled}>Location Disabled</Text>
            </>
          ) : !isGpsReady ? (
            <>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.locateMeButtonLabelDisabled}>Getting GPS...</Text>
            </>
          ) : (
            <>
              <Text style={styles.locateMeButtonText}>📍</Text>
              <Text style={styles.locateMeButtonLabel}>Locate Me</Text>
            </>
          )}
        </View>
      </Pressable>

      {zoomIndicator && (
        <View style={styles.zoomIndicator}>
          <Text style={styles.zoomIndicatorText}>{zoomIndicator.text}</Text>
          <Text style={styles.zoomIndicatorSubtext}>{zoomIndicator.subtext}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.textSecondary },
  locateMeButton: {
  position: 'absolute',
  bottom: 120,  // ← Move up a bit more
  right: 20,
  backgroundColor: 'rgba(255, 255, 255, 0.85)',  // ← Semi-transparent
  borderRadius: 12,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 5,
},
  locateMeButtonDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.6,
  },
  locateMeButtonInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locateMeButtonText: { fontSize: 24 },
  locateMeButtonTextDisabled: { fontSize: 24, opacity: 0.4 },
  locateMeButtonLabel: { fontSize: 16, fontWeight: '600', color: '#212121' },
  locateMeButtonLabelDisabled: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  zoomIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  zoomIndicatorText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  zoomIndicatorSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
export default React.memo(
  LeafletMap,
  (prevProps, nextProps) => {
    
    const prevMarkers = prevProps.markers || [];
    const nextMarkers = nextProps.markers || [];
    
    
    if (prevMarkers.length !== nextMarkers.length) {
      console.log('❌ Marker count changed - WILL RE-RENDER');
      return false; // Re-render if count changed
    }
    
    const prevIds = prevMarkers.map(m => m.id).sort().join(',');
    const nextIds = nextMarkers.map(m => m.id).sort().join(',');
    
    if (prevIds !== nextIds) {
      return false; // Re-render if marker IDs changed
    }
    
    console.log('✅ Props are equal - PREVENTING RE-RENDER');
    return true;
  }
);