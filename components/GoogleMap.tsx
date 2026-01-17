
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

interface GoogleMapProps {
  markers?: MapMarker[];
  center?: { latitude: number; longitude: number };
  zoom?: number;
  onMarkerPress?: (markerId: string) => void;
  showHeatmap?: boolean;
  heatmapData?: Array<{ latitude: number; longitude: number; intensity: number }>;
  googleMapsApiKey?: string; // Add your Google Maps API key to .env
}

export default function GoogleMap({
  markers = [],
  center = { latitude: 37.7749, longitude: -122.4194 },
  zoom = 13,
  onMarkerPress,
  showHeatmap = false,
  heatmapData = [],
  googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
}: GoogleMapProps) {
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
      <script src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=visualization"></script>
      <script>
        let map;
        let currentMarkers = [];
        let heatmap = null;

        function initMap() {
          map = new google.maps.Map(document.getElementById('map'), {
            center: { lat: ${center.latitude}, lng: ${center.longitude} },
            zoom: ${zoom},
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }

        function updateMarkers(newMarkers, heatmapData) {
          // Remove existing markers
          currentMarkers.forEach(marker => marker.setMap(null));
          currentMarkers = [];

          // Remove existing heatmap
          if (heatmap) {
            heatmap.setMap(null);
            heatmap = null;
          }

          // Add heatmap if data provided
          if (heatmapData && heatmapData.length > 0) {
            const heatmapPoints = heatmapData.map(point => ({
              location: new google.maps.LatLng(point.latitude, point.longitude),
              weight: point.intensity || 1
            }));

            heatmap = new google.maps.visualization.HeatmapLayer({
              data: heatmapPoints,
              radius: 30,
              opacity: 0.8,
              gradient: [
                'rgba(0, 255, 255, 0)',
                'rgba(0, 255, 255, 1)',
                'rgba(0, 191, 255, 1)',
                'rgba(0, 127, 255, 1)',
                'rgba(0, 63, 255, 1)',
                'rgba(0, 0, 255, 1)',
                'rgba(0, 0, 223, 1)',
                'rgba(0, 0, 191, 1)',
                'rgba(0, 0, 159, 1)',
                'rgba(0, 0, 127, 1)',
                'rgba(63, 0, 91, 1)',
                'rgba(127, 0, 63, 1)',
                'rgba(191, 0, 31, 1)',
                'rgba(255, 0, 0, 1)'
              ]
            });
            heatmap.setMap(map);
          }

          // Add new markers
          newMarkers.forEach(markerData => {
            const marker = new google.maps.Marker({
              position: { lat: markerData.latitude, lng: markerData.longitude },
              map: map,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#FF6B6B',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              },
            });

            marker.addListener('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'markerPress',
                markerId: markerData.id
              }));
            });

            if (markerData.title) {
              const infoWindow = new google.maps.InfoWindow({
                content: \`
                  <div style="text-align: center; padding: 8px;">
                    <strong>\${markerData.title}</strong>
                    \${markerData.videoCount ? \`<br/>\${markerData.videoCount} videos\` : ''}
                  </div>
                \`
              });

              marker.addListener('click', () => {
                infoWindow.open(map, marker);
              });
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

        // Initialize map
        initMap();
        updateMarkers(${JSON.stringify(markers)}, ${JSON.stringify(showHeatmap ? heatmapData : [])});
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
