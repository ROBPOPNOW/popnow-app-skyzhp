import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { VideoPost } from '@/types/video';
import { router } from 'expo-router';

interface VideoOverlayProps {
  video: VideoPost;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onAvatarPress?: (userId: string) => void;
  onLocationPress?: (latitude: number, longitude: number, locationName?: string) => void; // ← ADD THIS
  disableLocationTap?: boolean;
}

export default function VideoOverlay({
  video,
  onLike,
  onComment,
  onShare,
  userLocation,
  onAvatarPress,
  onLocationPress, // ← ADD THIS
  disableLocationTap = false,
}: VideoOverlayProps) {

  const [timeInfo, setTimeInfo] = useState<{
    displayText: string;
    minutesLeft: number;
    isUrgent: boolean;
  }>({ displayText: '', minutesLeft: 0, isUrgent: false });

  // Calculate time info
  useEffect(() => {
    let mounted = true;

    const calculateTimeInfo = () => {
      if (!mounted) return;
      const createdAt = new Date(video.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const minutesLeft = (24 * 60) - diffMins;

      if (minutesLeft <= 60 && minutesLeft > 0) {
        if (mounted) setTimeInfo({
          displayText: `${minutesLeft} min${minutesLeft === 1 ? '' : 's'} left`,
          minutesLeft,
          isUrgent: true,
        });
      } else if (minutesLeft <= 0) {
        if (mounted) setTimeInfo({
          displayText: 'Expired',
          minutesLeft: 0,
          isUrgent: true,
        });
      } else {
        let displayText = '';
        if (diffMins < 1) {
          displayText = 'Just now';
        } else if (diffMins < 60) {
          displayText = `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
          displayText = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else {
          const diffDays = Math.floor(diffMs / 86400000);
          displayText = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        }
        if (mounted) setTimeInfo({
          displayText,
          minutesLeft,
          isUrgent: false,
        });
      }
    };

    calculateTimeInfo();
    const interval = setInterval(calculateTimeInfo, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [video.createdAt]);

  const formatCount = (count: number | null | undefined): string => {
    // Handle null, undefined, or invalid count values
    if (count == null || isNaN(count)) {
      return '0';
    }
    
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const calculateDistance = (): string | null => {
    if (!userLocation || !video.latitude || !video.longitude) {
      return null;
    }

    const R = 6371; // Earth's radius in km
    const dLat = toRad(video.latitude - userLocation.latitude);
    const dLon = toRad(video.longitude - userLocation.longitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(userLocation.latitude)) *
        Math.cos(toRad(video.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  const distance = calculateDistance();

  // Helper to get user data (handles both array and object)
const getUser = (users: any) => {
  return Array.isArray(users) ? users[0] : users;
};

// Safely access author properties with null checks
const author = getUser(video.users);
const authorUsername = author?.username || 'unknown';
const authorAvatar = author?.avatar_url;
const authorId = author?.id;
const authorIsPremium = author?.is_premium || false;

  // OPTIMIZED: Instant navigation with no delays - using callback or direct navigation
const handleAvatarPress = () => {
  console.log('⚡ Avatar pressed, author ID:', authorId);
  
  if (!authorId) {
    console.error('❌ No author ID found for video:', video.id);
    return;
  }

  // ALWAYS use callback if provided, NEVER navigate directly in modal context
  if (onAvatarPress) {
    console.log('🎯 Using onAvatarPress callback');
    onAvatarPress(authorId);
  } else {
    console.log('🚀 No callback provided, navigating directly');
    router.push(`/user-profile?userId=${authorId}`);
  }
};

  // OPTIMIZED: Instant navigation with no delays - using callback or direct navigation
  const handleUsernamePress = () => {
  console.log('⚡ Username pressed, author ID:', authorId);
  
  if (!authorId) {
    console.error('❌ No author ID found for video:', video.id);
    return;
  }

  // ALWAYS use callback if provided, NEVER navigate directly in modal context
  if (onAvatarPress) {
    console.log('🎯 Using onAvatarPress callback');
    onAvatarPress(authorId);
  } else {
    console.log('🚀 No callback provided, navigating directly');
    router.push(`/user-profile?userId=${authorId}`);
  }
};

  // Handle location tap - use callback if provided, otherwise navigate directly
const handleLocationPress = () => {
  if (video.latitude && video.longitude) {
    
    // Use callback if provided (e.g., from search-video-player to close player first)
    if (onLocationPress) {
      onLocationPress(video.latitude, video.longitude, video.locationName);
    } else {
      // Default behavior: navigate directly
      router.push({
        pathname: '/(tabs)/map',
        params: {
          latitude: video.latitude.toString(),
          longitude: video.longitude.toString(),
          locationName: video.locationName,
        },
      });
    }
  }
};

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom gradient - extended to cover more area and ensure visibility above tab bar */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

{/* Floating View Counter - Top Left */}
<View style={styles.viewCounter}>
  <IconSymbol 
    ios_icon_name="eye.fill" 
    android_material_icon_name="visibility"
    size={16} 
    color="#FFFFFF" 
  />
  <Text style={styles.viewCounterText}>
    {formatCount(video.views_count || 0)}
  </Text>
</View>

      {/* Right side actions - positioned higher to avoid tab bar */}
      <View style={styles.rightActions} pointerEvents="box-none">
{/* Profile Avatar - OPTIMIZED for instant response */}
        <Pressable 
          style={styles.actionButton} 
          onPress={handleAvatarPress}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.3)', borderless: true, radius: 30 }}
        >
          <PremiumAvatar
            avatarUrl={authorAvatar}
            size={48}
            isPremium={authorIsPremium}
          />
        </Pressable>

{/* Like - ALWAYS show */}
<Pressable style={styles.actionButton} onPress={onLike}>
  <IconSymbol
    name={video.isLiked ? 'heart.fill' : 'heart'}
    size={32}
    color={video.isLiked ? colors.primary : '#FFFFFF'}
  />
  <Text style={styles.actionText}>{formatCount(video.likes_count)}</Text>
</Pressable>

        {/* Comment */}
        <Pressable style={styles.actionButton} onPress={onComment}>
          <IconSymbol name="bubble.left.fill" size={32} color="#FFFFFF" />
          <Text style={styles.actionText}>{formatCount(video.comments_count)}</Text>
        </Pressable>

        {/* Share */}
        <Pressable style={styles.actionButton} onPress={onShare}>
          <IconSymbol name="arrowshape.turn.up.right.fill" size={32} color="#FFFFFF" />
          <Text style={styles.actionText}>{formatCount(video.shares_count)}</Text>
        </Pressable>
      </View>

      {/* Bottom info - positioned higher to avoid tab bar */}
      <View style={styles.bottomInfo} pointerEvents="box-none">
        {/* Username and Display Name - OPTIMIZED for instant response */}
        <View>
          <Pressable 
  onPress={handleUsernamePress}
  style={{ alignSelf: 'flex-start' }}
  android_ripple={{ color: 'rgba(255, 255, 255, 0.2)', borderless: false }}
>
  <Text style={styles.username}>@{authorUsername}</Text>
</Pressable>
        </View>
        
        {/* Time Info with Clock Icon */}
        <View style={styles.timeInfoContainer}>
          <IconSymbol 
            name="clock.fill" 
            size={16} 
            color={timeInfo.isUrgent ? '#FF3B5C' : 'rgba(255, 255, 255, 0.7)'} 
          />
          <Text style={[
            styles.timeInfoText,
            timeInfo.isUrgent && styles.timeInfoTextUrgent
          ]}>
            {timeInfo.displayText}
          </Text>
        </View>
        
        {/* Caption/Description */}
        {video.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            {video.caption}
          </Text>
        )}
        
        {/* Tags */}
        {video.tags && video.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {video.tags.slice(0, 3).map((tag, index) => (
              <Text key={index} style={styles.tag}>
                {tag.startsWith('#') ? tag : `#${tag}`}
              </Text>
            ))}
          </View>
        )}

{/* Location info with distance - Tappable only in Feed mode */}
        {video.locationName && (
          <View style={styles.locationContainer}>
            <View style={styles.locationDivider} />
            {disableLocationTap ? (
              // Map mode: Just show location info (not tappable)
              <View style={styles.locationInfo}>
                <IconSymbol name="mappin.circle.fill" size={16} color="#FFFFFF" />
                <Text style={styles.locationText}>
                  {video.locationName}
                  {distance && ` • ${distance} away`}
                </Text>
              </View>
            ) : (
              // Feed mode: Tappable location
              <Pressable 
                style={({ pressed }) => [
                  styles.locationInfo,
                  pressed && styles.locationInfoPressed
                ]}
                onPress={handleLocationPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="mappin.circle.fill" size={16} color="#FFFFFF" />
                <Text style={styles.locationText}>
                  {video.locationName}
                  {distance && ` • ${distance} away`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 101,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0,
    zIndex: 101,
  },
  rightActions: {
    position: 'absolute',
    right: 12,
    bottom: 240,
    gap: 24,
    zIndex: 102,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
// Avatar styles removed - now handled by PremiumAvatar component
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 130,
    left: 16,
    right: 80,
    zIndex: 102,
  },
  username: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  timeInfoText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeInfoTextUrgent: {
    color: '#FF3B5C',
    fontWeight: '700',
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  locationContainer: {
    marginTop: 8,
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#FFFFFF',  
    opacity: 0.3,
    marginBottom: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4, // Make tap target bigger
  },
  locationInfoPressed: {
    opacity: 0.7, // Visual feedback when pressed
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

viewCounter: {
  position: 'absolute',
  top: 80,
  left: 16,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 20,
  gap: 6,
  zIndex: 103,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.2)',
},
viewCounterText: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: '700',
  textShadowColor: 'rgba(0, 0, 0, 0.9)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
},
});