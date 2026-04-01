import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import { getVideoThumbnailUrl } from '@/utils/bunnynet';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import VideoFeedItem from '@/components/VideoFeedItem';
import { VideoPost } from '@/types/video';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 48) / 3;

export default function UserProfileScreen() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;
  const showVisibleOnly = params.showVisibleOnly === 'true';

  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

  // Profile data
  const [profile, setProfile] = useState({
  username: '',
  bio: '',
  avatarUrl: '',
  isPremium: false,
  followersCount: 0,
  followingCount: 0,
  lifetime_videos_count: 0,
  lifetime_likes_count: 0,
  lifetime_views_count: 0,
});

  // Videos data
  const [videos, setVideos] = useState<any[]>([]);
  const [videoFeedData, setVideoFeedData] = useState<VideoPost[]>([]);

  useEffect(() => {
    loadProfile();
    checkIfFollowing();
    checkIfBlocked();
  }, [userId, showVisibleOnly]);

  const handleAvatarPressInModal = (userId: string) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 MODAL AVATAR HANDLER CALLED');
    console.log('  User ID:', userId);
    console.log('  Modal visible:', videoModalVisible);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    setVideoModalVisible(false);
    console.log('✅ Modal closed');
    
    setTimeout(() => {
      if (currentUserId && userId === currentUserId) {
        console.log('➡️ Navigating to own profile tab');
        router.replace('/(tabs)/profile');
      } else {
        console.log('➡️ Navigating to user profile:', userId);
        router.push(`/user-profile?userId=${userId}`);
      }
    }, 100);
  };

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      console.log('Loading profile for user:', userId);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setCurrentUserId(currentUser?.id || null);

      if (currentUser && currentUser.id === userId) {
        console.log('👤 User tapped their own avatar - redirecting to Profile tab');
        router.replace('/(tabs)/profile');
        return;
      }

      console.log('🌍 Viewing other user profile:', userId);

      const { data: userData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error loading profile:', profileError);
        return;
      }

      console.log('Profile loaded:', userData);

      setProfile({
  username: userData.username || '',
  bio: userData.bio || '',
  avatarUrl: userData.avatar_url || '',
  isPremium: userData.is_premium || false,
  followersCount: userData.followers_count || 0,
  followingCount: userData.following_count || 0,
  lifetime_videos_count: userData.lifetime_videos_count || 0,
  lifetime_likes_count: userData.lifetime_likes_count || 0,
  lifetime_views_count: userData.lifetime_views_count || 0,
});

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('📺 Loading live videos only (within 1 hour)');
      console.log('Cutoff time:', oneHourAgoISO);

      const { data: videosData, error: videosError } = await supabase
  .from('videos')
  .select(`
  *,
  users (
    id,
    username,
    avatar_url,
    is_premium
  )
`)
  .eq('user_id', userId)
  .eq('moderation_status', 'approved')
  .gte('created_at', oneHourAgoISO)
  .order('created_at', { ascending: false });

      if (videosError) {
        console.error('Error loading videos:', videosError);
      } else {
        console.log('✅ Loaded', videosData?.length || 0, 'live videos');
        setVideos(videosData || []);

        let likedVideoIds: string[] = [];
        if (currentUser) {
          const videoIds = videosData?.map(v => v.id) || [];
          if (videoIds.length > 0) {
            const { data: likes } = await supabase
              .from('likes')
              .select('video_id')
              .eq('user_id', currentUser.id)
              .in('video_id', videoIds);
            
            likedVideoIds = likes?.map(like => like.video_id) || [];
          }
        }

        const transformedVideos = (videosData || []).map((video: any) => ({
          ...video,
          videoUrl: video.video_url,
          likes_count: video.likes_count || 0,
          comments_count: video.comments_count || 0,
          shares_count: video.shares_count || 0,
          views_count: video.views_count || 0,
          comments: video.comments_count || 0,
          likes: video.likes_count || 0,
          shares: video.shares_count || 0,
          isLiked: likedVideoIds.includes(video.id),
          createdAt: video.created_at,
        }));
        setVideoFeedData(transformedVideos as VideoPost[]);
      }
    } catch (error) {
      console.error('Error in loadProfile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkIfFollowing = async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser || currentUser.id === userId) return;

      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', userId)
        .single();

      if (!error && data) {
        setIsFollowing(true);
      }
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const checkIfBlocked = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser || currentUser.id === userId) return;

      const { data, error } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', currentUser.id)
        .eq('blocked_id', userId)
        .maybeSingle();

      if (!error && data) {
        setIsBlocked(true);
      }
    } catch (error) {
      console.error('Error checking block status:', error);
    }
  };

  const handleFollowToggle = async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', userId);

        setIsFollowing(false);
        setProfile((prev) => ({
          ...prev,
          followersCount: Math.max(0, prev.followersCount - 1),
        }));
      } else {
        await supabase.from('follows').insert({
          follower_id: currentUser.id,
          following_id: userId,
        });

        setIsFollowing(true);
        setProfile((prev) => ({
          ...prev,
          followersCount: prev.followersCount + 1,
        }));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const handleBlockToggle = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      if (isBlocked) {
        // Unblock
        await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', currentUser.id)
          .eq('blocked_id', userId);

        setIsBlocked(false);
      } else {
        // Block + auto-unfollow both directions
        await supabase
          .from('blocked_users')
          .insert({ blocker_id: currentUser.id, blocked_id: userId });

        // Remove follow in both directions
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', userId);

        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', currentUser.id);

        setIsBlocked(true);
        setIsFollowing(false);
      }
    } catch (error) {
      console.error('Error toggling block:', error);
    }
  };

  const handleLike = async (videoId: string) => {
    console.log('🎯 USER PROFILE: LIKE HANDLER');
    console.log('  Video ID:', videoId);
    
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      const video = videoFeedData.find(v => v.id === videoId);
      if (!video) return;

      const currentIsLiked = video.isLiked;

      if (currentIsLiked) {
        console.log('➖ Removing like...');
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', currentUser.id);

        if (error) {
          console.error('❌ Error removing like:', error);
          return;
        }

        console.log('✅ Like removed - trigger will update count');

        setVideoFeedData(prevVideos => prevVideos.map(v =>
          v.id === videoId
            ? {
                ...v,
                likes: Math.max(0, v.likes - 1),
                likes_count: Math.max(0, (v.likes_count || 0) - 1),
                isLiked: false
              }
            : v
        ));
      } else {
        console.log('➕ Adding like...');
        const { error } = await supabase
          .from('likes')
          .insert({ video_id: videoId, user_id: currentUser.id });

        if (error) {
          if (error.code === '23505') {
            console.log('ℹ️ Already liked (duplicate ignored)');
            setVideoFeedData(prevVideos => prevVideos.map(v =>
              v.id === videoId ? { ...v, isLiked: true } : v
            ));
            return;
          }
          console.error('❌ Error adding like:', error);
          return;
        }

        console.log('✅ Like added - trigger will update count');

        setVideoFeedData(prevVideos => prevVideos.map(v =>
          v.id === videoId
            ? {
                ...v,
                likes: v.likes + 1,
                likes_count: (v.likes_count || 0) + 1,
                isLiked: true
              }
            : v
        ));
      }

      console.log('✅ USER PROFILE: LIKE COMPLETE');
    } catch (error) {
      console.error('❌ Error in handleLike:', error);
    }
  };

  const handleViewChange = (videoId: string) => {
    console.log('Video viewed in user profile:', videoId);
  };

  const handleVideoPress = (index: number) => {
    setSelectedVideoIndex(index);
    setVideoModalVisible(true);
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwnProfile = currentUserId === userId;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>@{profile.username}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            <PremiumAvatar
              avatarUrl={profile.avatarUrl}
              size={80}
              isPremium={profile.isPremium}
            />
          </View>

          <View style={styles.statsContainer}>
            {/* Videos */}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile.lifetime_videos_count || 0)}</Text>
              <Text style={styles.statLabel}>Videos</Text>
            </View>
            
            {/* Views */}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile.lifetime_views_count || 0)}</Text>
              <Text style={styles.statLabel}>Views</Text>
            </View>
            
            {/* Likes */}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile.lifetime_likes_count || 0)}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            
            {/* Followers */}
            <Pressable 
              style={styles.statItem}
              onPress={() => router.push(`/followers-list?userId=${userId}&type=followers`)}
            >
              <Text style={styles.statValue}>{formatCount(profile.followersCount)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            
            {/* Following */}
            <Pressable 
              style={styles.statItem}
              onPress={() => router.push(`/followers-list?userId=${userId}&type=following`)}
            >
              <Text style={styles.statValue}>{formatCount(profile.followingCount)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.profileDetails}>
  <Text style={styles.displayName}>@{profile.username}</Text>
  {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
</View>

        {!isOwnProfile && (
          <Pressable
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={handleFollowToggle}
          >
            <IconSymbol
              ios_icon_name={isFollowing ? 'checkmark' : 'plus'}
              android_material_icon_name={isFollowing ? 'check' : 'add'}
              size={16}
              color={isFollowing ? colors.primary : '#FFFFFF'}
            />
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}

        {!isOwnProfile && (
          <Pressable
            style={[styles.blockButton, isBlocked && styles.blockedButton]}
            onPress={handleBlockToggle}
          >
            <IconSymbol
              ios_icon_name={isBlocked ? 'slash.circle' : 'nosign'}
              android_material_icon_name={isBlocked ? 'person-add' : 'block'}
              size={16}
              color={isBlocked ? '#FFFFFF' : '#FF3B30'}
            />
            <Text style={[styles.blockButtonText, isBlocked && styles.blockedButtonText]}>
              {isBlocked ? 'Unblock' : 'Block'}
            </Text>
          </Pressable>
        )}
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {videos.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol ios_icon_name="video.slash" android_material_icon_name="videocam-off" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateText}>No videos yet</Text>
            <Text style={styles.emptyStateSubtext}>
              {isOwnProfile ? 'Start creating and sharing your moments' : 'This user has no active videos at the moment'}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {videos.map((video, index) => {
              const thumbnailUrl = video.thumbnail_url || getVideoThumbnailUrl(video.video_url);

              return (
                <Pressable
                  key={video.id}
                  style={styles.gridItem}
                  onPress={() => handleVideoPress(index)}
                >
                  <Image
                    source={{ uri: thumbnailUrl }}
                    style={styles.gridItemImage}
                    resizeMode="cover"
                  />
                  <View style={styles.gridItemOverlay}>
                    <View style={styles.gridItemStats}>
                      <View style={styles.gridItemStat}>
                        <IconSymbol ios_icon_name="eye.fill" android_material_icon_name="visibility" size={14} color="#FFFFFF" />
                        <Text style={styles.gridItemStatText}>
                          {formatCount(video.views_count || 0)}
                        </Text>
                      </View>
                      <View style={styles.gridItemStat}>
                        <IconSymbol ios_icon_name="heart.fill" android_material_icon_name="favorite" size={14} color="#FFFFFF" />
                        <Text style={styles.gridItemStatText}>
                          {formatCount(video.likes_count || 0)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {videoModalVisible && (
        <View style={styles.videoModalContainer}>
          <SafeAreaView style={styles.videoModalSafeArea} edges={['top', 'bottom']}>
            <Pressable
              style={styles.closeButton}
              onPress={() => setVideoModalVisible(false)}
            >
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={32} color="#FFFFFF" />
            </Pressable>

            <FlatList
              data={videoFeedData}
              renderItem={({ item, index }) => (
                <View style={styles.videoItemContainer}>
                  <VideoFeedItem
                    video={item}
                    isActive={index === selectedVideoIndex && videoModalVisible}
                    onLike={handleLike}
                    onViewChange={handleViewChange}
                    userLocation={null}
                    onAvatarPress={handleAvatarPressInModal}
                  />
                </View>
              )}
              keyExtractor={(item) => item.id}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              snapToInterval={SCREEN_HEIGHT}
              snapToAlignment="start"
              decelerationRate="fast"
              initialScrollIndex={selectedVideoIndex}
              getItemLayout={(data, index) => ({
                length: SCREEN_HEIGHT,
                offset: SCREEN_HEIGHT * index,
                index,
              })}
              onViewableItemsChanged={({ viewableItems }) => {
                if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                  setSelectedVideoIndex(viewableItems[0].index);
                }
              }}
              viewabilityConfig={{
                itemVisiblePercentThreshold: 50,
                minimumViewTime: 100,
              }}
              removeClippedSubviews={false}
              maxToRenderPerBatch={2}
              windowSize={3}
              initialNumToRender={1}
            />
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    marginRight: 20,
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  profileDetails: {
    marginBottom: 16,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  followingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  followingButtonText: {
    color: '#FFFFFF',
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
    marginTop: 10,
  },
  blockedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  blockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
  blockedButtonText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.card,
    position: 'relative',
  },
  gridItemImage: {
    width: '100%',
    height: '100%',
  },
  gridItemOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    padding: 8,
  },
  gridItemStats: {
    flexDirection: 'row',
    gap: 12,
  },
  gridItemStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridItemStatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  videoModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
  },
  videoModalSafeArea: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1001,
  },
  videoItemContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});