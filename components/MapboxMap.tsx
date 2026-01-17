
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  videoCount?: number;
}

interface MapboxMapProps {
  markers?: MapMarker[];
  center?: { latitude: number; longitude: number };
  zoom?: number;
  onMarkerPress?: (markerId: string) => void;
  showHeatmap?: boolean;
  heatmapData?: Array<{ latitude: number; longitude: number; intensity: number }>;
  mapboxToken?: string; // Add your Mapbox token to .env
}

export default function MapboxMap({
  markers = [],
  center = { latitude: 37.7749, longitude: -122.4194 },
  zoom = 13,
  onMarkerPress,
  showHeatmap = false,
  heatmapData = [],
  mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
}: MapboxMapProps) {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (webViewRef.current) {
      const message = JSON.stringify({
        type: 'updateMarkers',
        markers,
        heatmapData: showHeatmap ? heatmapData : [],
      });
      webViewRef.current.postMessage(message);
    }
  }, [markers, heatmapData, showHeatmap]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'markerPress' && onMarkerPress) {
        onMarkerPress(data.markerId);
      }
    } catch (error) {
      console.log('Error parsing message from WebView:', error);
    }
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <script src='https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js'></script>
      <link href='https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css' rel='stylesheet' />
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
        }
        #map {
          height: 100%;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        mapboxgl.accessToken = '${mapboxToken}';
        
        const map = new mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [${center.longitude}, ${center.latitude}],
          zoom: ${zoom}
        });

        let currentMarkers = [];

        function updateMarkers(newMarkers, heatmapData) {
          // Remove existing markers
          currentMarkers.forEach(marker => marker.remove());
          currentMarkers = [];

          // Add heatmap layer if data provided
          if (heatmapData && heatmapData.length > 0) {
            const geojson = {
              type: 'FeatureCollection',
              features: heatmapData.map(point => ({
                type: 'Feature',
                properties: {
                  intensity: point.intensity || 1
                },
                geometry: {
                  type: 'Point',
                  coordinates: [point.longitude, point.latitude]
                }
              }))
            };

            if (map.getSource('heatmap-source')) {
              map.getSource('heatmap-source').setData(geojson);
            } else {
              map.addSource('heatmap-source', {
                type: 'geojson',
                data: geojson
              });

              map.addLayer({
                id: 'heatmap-layer',
                type: 'heatmap',
                source: 'heatmap-source',
                paint: {
                  'heatmap-weight': ['get', 'intensity'],
                  'heatmap-intensity': 1,
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(33,102,172,0)',
                    0.2, 'rgb(103,169,207)',
                    0.4, 'rgb(209,229,240)',
                    0.6, 'rgb(253,219,199)',
                    0.8, 'rgb(239,138,98)',
                    1, 'rgb(178,24,43)'
                  ],
                  'heatmap-radius': 30,
                  'heatmap-opacity': 0.8
                }
              });
            }
          }

          // Add new markers
          newMarkers.forEach(markerData => {
            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.style.backgroundColor = '#FF6B6B';
            el.style.width = '30px';
            el.style.height = '30px';
            el.style.borderRadius = '50%';
            el.style.border = '3px solid white';
            el.style.cursor = 'pointer';
            el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            el.innerHTML = '📍';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';

            el.addEventListener('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerPress',
                markerId: markerData.id
              }));
            });

            const marker = new mapboxgl.Marker(el)
              .setLngLat([markerData.longitude, markerData.latitude])
              .addTo(map);

            if (markerData.title) {
              const popup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(\`
                  <div style="text-align: center;">
                    <strong>\${markerData.title}</strong>
                    \${markerData.videoCount ? \`<br/>\${markerData.videoCount} videos\` : ''}
                  </div>
                \`);
              marker.setPopup(popup);
            }

            currentMarkers.push(marker);
          });
        }

        // Listen for messages from React Native
        window.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'updateMarkers') {
              updateMarkers(data.markers, data.heatmapData || []);
            }
          } catch (error) {
            console.log('Error parsing message:', error);
          }
        });

        map.on('load', () => {
          updateMarkers(${JSON.stringify(markers)}, ${JSON.stringify(showHeatmap ? heatmapData : [])});
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
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#FF6B6B" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
