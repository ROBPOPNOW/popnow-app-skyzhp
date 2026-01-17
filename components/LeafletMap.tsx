
import React, { useRef, useEffect, useState, useCallback } from 'react';
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
}

export default function LeafletMap({
  markers = [],
  center,
  zoom = 12,
  onMarkerPress,
  onLocateMePress,
  onDoubleTap,
  showHeatmap = false,
  heatmapData = [],
  userLocation,
}: LeafletMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [isHeatmapMode, setIsHeatmapMode] = useState(false);
  
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update markers when they change
  useEffect(() => {
    if (!isMapReady || !webViewRef.current) {
      console.log('⏳ Map not ready yet, skipping marker update');
      return;
    }

    if (markers.length === 0) {
      console.log('⚠️ No markers to display');
      return;
    }

    // Clear any pending updates
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Schedule update with a small delay to batch updates
    updateTimeoutRef.current = setTimeout(() => {
      console.log('📍 Updating markers on map:', markers.length);

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

      console.log('Sample marker data:', markersData[0]);

      webViewRef.current?.injectJavaScript(`
        (function() {
          try {
            if (window.updateMarkers) {
              console.log('Calling updateMarkers with ${markersData.length} markers');
              window.updateMarkers(${JSON.stringify(markersData)});
            } else {
              console.error('updateMarkers function not available');
            }
          } catch (error) {
            console.error('Error in updateMarkers:', error);
          }
        })();
        true;
      `);
    }, 300);
  }, [markers, isMapReady]);

  // Update heatmap when data changes
  useEffect(() => {
    if (!isMapReady || !webViewRef.current || !showHeatmap || heatmapData.length === 0) {
      return;
    }

    console.log('🔥 Updating heatmap:', heatmapData.length, 'points');

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

  // Update user location when it changes
  useEffect(() => {
    if (!isMapReady || !webViewRef.current || !userLocation) {
      return;
    }

    console.log('📍 Updating user location:', userLocation);

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
      console.log('📨 Message from map:', data.type);

      switch (data.type) {
        case 'mapReady':
          console.log('✅ Map is ready');
          setIsMapReady(true);
          break;
          
        case 'markerClick':
          if (onMarkerPress) {
            console.log('🎯 Marker clicked:', data.markerId, 'Video IDs:', data.videoIds);
            onMarkerPress(data.markerId, data.videoIds || []);
          }
          break;
          
        case 'doubleTap':
          if (onDoubleTap) {
            console.log('👆 Map double-tapped at:', data.location);
            onDoubleTap(data.location);
          }
          break;
          
        case 'zoomChange':
          console.log('🔍 Zoom changed to:', data.zoom);
          setCurrentZoom(data.zoom);
          setIsHeatmapMode(data.zoom < 10);
          break;
      }
    } catch (error) {
      console.error('Error parsing message from map:', error);
    }
  };

  const handleLocateMe = () => {
    console.log('📍 Locate me pressed');
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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body, html {
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        #map {
          height: 100%;
          width: 100%;
          background: #f5f5f5;
        }
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
        .video-marker:hover {
          transform: scale(1.1);
        }
        .video-marker-exact {
          background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
        }
        .video-marker-3km {
          background: linear-gradient(135deg, #FFD93D 0%, #FFA500 100%);
        }
        .video-marker-10km {
          background: linear-gradient(135deg, #6C5CE7 0%, #4169E1 100%);
        }
        .request-marker {
          font-size: 28px;
          text-align: center;
          line-height: 1;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .request-marker:hover {
          transform: scale(1.15);
        }
        .user-marker {
          background: linear-gradient(135deg, #00D084 0%, #00A86B 100%);
          border: 4px solid #FFFFFF;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          box-shadow: 0 0 0 4px rgba(0, 208, 132, 0.3),
                      0 2px 8px rgba(0,0,0,0.3);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 4px rgba(0, 208, 132, 0.3),
                        0 2px 8px rgba(0,0,0,0.3);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(0, 208, 132, 0.2),
                        0 2px 12px rgba(0,0,0,0.4);
          }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .leaflet-popup-content {
          margin: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        console.log('🗺️ Initializing Leaflet map...');
        
        const HEATMAP_ZOOM_THRESHOLD = 10;
        const MAP_CONFIG = {
          zoomControl: true,
          attributionControl: true,
          minZoom: 3,
          maxZoom: 19,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
        };

        const map = L.map('map', {
          ...MAP_CONFIG,
          center: [${center?.latitude || -36.8485}, ${center?.longitude || 174.7633}],
          zoom: ${zoom},
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
          className: 'map-tiles',
        }).addTo(map);

        let state = {
          markers: new Map(),
          markerLayerGroup: L.layerGroup().addTo(map),
          heatmapLayer: null,
          userMarker: null,
          currentZoom: ${zoom},
          isHeatmapMode: ${zoom} < HEATMAP_ZOOM_THRESHOLD,
          lastTap: 0,
        };

        function notifyMapReady() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapReady'
          }));
        }

        map.on('zoomend', function() {
          const newZoom = map.getZoom();
          const wasHeatmapMode = state.isHeatmapMode;
          state.currentZoom = newZoom;
          state.isHeatmapMode = newZoom < HEATMAP_ZOOM_THRESHOLD;
          
          console.log('Zoom:', newZoom, 'Heatmap mode:', state.isHeatmapMode);
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'zoomChange',
            zoom: newZoom
          }));

          if (state.isHeatmapMode !== wasHeatmapMode) {
            toggleMapMode();
          }
        });

        function toggleMapMode() {
          if (state.isHeatmapMode) {
            console.log('Switching to heatmap mode');
            if (state.markerLayerGroup) {
              map.removeLayer(state.markerLayerGroup);
            }
            if (state.heatmapLayer) {
              map.addLayer(state.heatmapLayer);
            }
          } else {
            console.log('Switching to marker mode');
            if (state.heatmapLayer) {
              map.removeLayer(state.heatmapLayer);
            }
            if (state.markerLayerGroup) {
              map.addLayer(state.markerLayerGroup);
            }
          }
        }

        map.on('click', function(e) {
          const now = Date.now();
          const timeSinceLastTap = now - state.lastTap;
          
          if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'doubleTap',
              location: {
                latitude: e.latlng.lat,
                longitude: e.latlng.lng
              }
            }));
          }
          
          state.lastTap = now;
        });

        function getMarkerColorClass(privacyRadius) {
          switch (privacyRadius) {
            case '3km': return 'video-marker-3km';
            case '10km': return 'video-marker-10km';
            default: return 'video-marker-exact';
          }
        }

        function createMarkerIcon(markerData) {
          if (markerData.isRequest) {
            return L.divIcon({
              html: '<div class="request-marker">🙋</div>',
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 40],
              popupAnchor: [0, -40],
            });
          }

          const colorClass = getMarkerColorClass(markerData.privacyRadius);
          const count = markerData.videoCount || 1;
          
          return L.divIcon({
            html: '<div class="video-marker ' + colorClass + '">' + count + '</div>',
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -22],
          });
        }

        window.updateMarkers = function(markersData) {
          console.log('📍 updateMarkers called with', markersData.length, 'markers');
          
          try {
            // Clear existing markers
            state.markerLayerGroup.clearLayers();
            state.markers.clear();

            // Add new markers
            markersData.forEach(markerData => {
              console.log('Adding marker:', markerData.id, 'at', markerData.lat, markerData.lng);
              
              const icon = createMarkerIcon(markerData);
              const marker = L.marker([markerData.lat, markerData.lng], { 
                icon: icon,
                riseOnHover: true,
              });

              marker.on('click', function() {
                console.log('Marker clicked:', markerData.id);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'markerClick',
                  markerId: markerData.id,
                  videoIds: markerData.videoIds || []
                }));
              });

              if (markerData.title) {
                const popupContent = '<div style="text-align: center;">' +
                  '<strong>' + markerData.title + '</strong>' +
                  (markerData.videoCount > 1 ? '<br/>' + markerData.videoCount + ' videos' : '') +
                  '</div>';
                marker.bindPopup(popupContent);
              }

              state.markerLayerGroup.addLayer(marker);
              state.markers.set(markerData.id, marker);
            });

            console.log('✅ Markers updated. Total:', state.markers.size);
            
            // Ensure correct mode is displayed
            toggleMapMode();
          } catch (error) {
            console.error('❌ Error updating markers:', error);
          }
        };

        window.updateUserLocation = function(lat, lng) {
          console.log('📍 Updating user location:', lat, lng);
          
          try {
            if (state.userMarker) {
              map.removeLayer(state.userMarker);
            }

            const userIcon = L.divIcon({
              html: '<div class="user-marker"></div>',
              className: '',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });

            state.userMarker = L.marker([lat, lng], { 
              icon: userIcon,
              zIndexOffset: 1000,
            });
            
            state.userMarker.addTo(map);
            console.log('✅ User marker updated');
          } catch (error) {
            console.error('❌ Error updating user location:', error);
          }
        };

        window.centerOnUser = function(lat, lng) {
          console.log('📍 Centering on user:', lat, lng);
          map.setView([lat, lng], 15, { 
            animate: true,
            duration: 0.5,
          });
        };

        window.updateHeatmap = function(heatData) {
          console.log('🔥 Updating heatmap with', heatData.length, 'points');
          
          try {
            if (state.heatmapLayer) {
              map.removeLayer(state.heatmapLayer);
              state.heatmapLayer = null;
            }

            if (heatData.length === 0) {
              return;
            }

            const heatmapPoints = heatData.map(point => 
              [point.lat, point.lng, point.intensity || 1]
            );

            state.heatmapLayer = L.heatLayer(heatmapPoints, {
              radius: 30,
              blur: 20,
              maxZoom: HEATMAP_ZOOM_THRESHOLD,
              max: 1.0,
              minOpacity: 0.4,
              gradient: {
                0.0: 'rgba(0, 0, 255, 0)',
                0.2: 'rgba(0, 0, 255, 0.5)',
                0.4: 'rgba(0, 255, 255, 0.7)',
                0.6: 'rgba(0, 255, 0, 0.8)',
                0.8: 'rgba(255, 255, 0, 0.9)',
                1.0: 'rgba(255, 0, 0, 1)'
              }
            });

            console.log('✅ Heatmap layer created');
            
            toggleMapMode();
          } catch (error) {
            console.error('❌ Error updating heatmap:', error);
          }
        };

        map.whenReady(function() {
          console.log('✅ Map ready');
          setTimeout(notifyMapReady, 500);
        });
      </script>
    </body>
    </html>
  `;

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
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
        }}
        onLoadEnd={() => {
          console.log('✅ WebView loaded');
        }}
      />
      
      <Pressable style={styles.locateMeButton} onPress={handleLocateMe}>
        <View style={styles.locateMeButtonInner}>
          <Text style={styles.locateMeButtonText}>📍</Text>
          <Text style={styles.locateMeButtonLabel}>Locate Me</Text>
        </View>
      </Pressable>

      {isHeatmapMode && (
        <View style={styles.heatmapIndicator}>
          <Text style={styles.heatmapIndicatorText}>🔥 Heatmap View</Text>
          <Text style={styles.heatmapIndicatorSubtext}>Zoom in to see individual videos</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  locateMeButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locateMeButtonInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locateMeButtonText: {
    fontSize: 24,
  },
  locateMeButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  heatmapIndicator: {
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
  heatmapIndicatorText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  heatmapIndicatorSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
