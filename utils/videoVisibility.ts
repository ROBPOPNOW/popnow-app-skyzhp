import { Alert } from 'react-native';

const PUBLIC_WINDOW_MS = 24 * 60 * 60 * 1000;

// Matches the same boundary used everywhere else in the app (created_at >= now - 24h).
export function isVideoStillPublic(createdAt: string | Date): boolean {
  const createdMs = new Date(createdAt).getTime();
  return Date.now() - createdMs <= PUBLIC_WINDOW_MS;
}

export function showLocationExpiredAlert(): void {
  Alert.alert(
    'Location unavailable',
    'This video has expired from public view, so its location is no longer shown on the map. You can still watch and download it for up to 3 days.'
  );
}
