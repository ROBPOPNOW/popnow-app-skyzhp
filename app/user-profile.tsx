
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
import VideoFeedItem from '@/components/VideoFeedItem';
import { VideoPost } from '@/types/video';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 48) / 3;

export default function UserProfileScreen() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

  // Profile data
  const [profile, setProfile] = useState({
    username: '',
    displayName: '',
    bio: '',
    avatarUrl: '',
    followersCount: 0,
    followingCount: 0,
    totalLikes: 0,
    videosCount: 0,
  });

  // Videos data
  const [videos, setVideos] = useState<any[]>([]);
  const [videoFeedData, setVideoFeedData] = useState<VideoPost[]>([]);

  useEffect(() => {
    loadProfile();
    checkIfFollowing();
  }, [userId]);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      console.log('Loading profile for user:', userId);

      // Get current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setCurrentUserId(currentUser?.id || null);

      // Load user profile
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
        displayName: userData.display_name || '',
        bio: userData.bio || '',
        avatarUrl: userData.avatar_url || '',
        followersCount: userData.followers_count || 0,
        followingCount: userData.following_count || 0,
        totalLikes: userData.total_likes || 0,
        videosCount: userData.videos_count || 0,
      });

      // Load user's videos
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select(`
          *,
          users (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('user_id', userId)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false });

      if (videosError) {
        console.error('Error loading videos:', videosError);
      } else {
        console.log('Videos loaded:', videosData?.length || 0);
        setVideos(videosData || []);

        // Transform videos for feed
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
          isLiked: false,
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

  const handleFollowToggle = async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      if (isFollowing) {
        // Unfollow
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
        // Follow
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

  const handleLike = async (videoId: string) => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) return;

      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', currentUser.id)
        .single();

      if (existingLike) {
        await supabase.from('likes').delete().eq('video_id', videoId).eq('user_id', currentUser.id);
        await supabase.rpc('decrement_likes_count', { video_id: videoId });
      } else {
        await supabase.from('likes').insert({ video_id: videoId, user_id: currentUser.id });
        await supabase.rpc('increment_likes_count', { video_id: videoId });
      }
    } catch (error) {
      console.error('Error liking video:', error);
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
            <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>@{profile.username}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <IconSymbol name="person.fill" size={40} color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile.videosCount)}</Text>
              <Text style={styles.statLabel}>Videos</Text>
            </View>
            <Pressable 
              style={styles.statItem}
              onPress={() => router.push(`/followers-list?userId=${userId}&type=followers`)}
            >
              <Text style={styles.statValue}>{formatCount(profile.followersCount)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <Pressable 
              style={styles.statItem}
              onPress={() => router.push(`/followers-list?userId=${userId}&type=following`)}
            >
              <Text style={styles.statValue}>{formatCount(profile.followingCount)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile.totalLikes)}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileDetails}>
          <Text style={styles.displayName}>{profile.displayName || profile.username}</Text>
          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </View>

        {!isOwnProfile && (
          <Pressable
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={handleFollowToggle}
          >
            <IconSymbol
              name={isFollowing ? 'checkmark' : 'plus'}
              size={16}
              color={isFollowing ? colors.primary : '#FFFFFF'}
            />
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {videos.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="video.slash" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateText}>No videos yet</Text>
            <Text style={styles.emptyStateSubtext}>
              {isOwnProfile ? 'Start creating and sharing your moments' : 'This user hasn&apos;t posted any videos yet'}
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
                        <IconSymbol name="eye.fill" size={14} color="#FFFFFF" />
                        <Text style={styles.gridItemStatText}>
                          {formatCount(video.views_count || 0)}
                        </Text>
                      </View>
                      <View style={styles.gridItemStat}>
                        <IconSymbol name="heart.fill" size={14} color="#FFFFFF" />
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

      {/* Video Feed Modal */}
      {videoModalVisible && (
        <View style={styles.videoModalContainer}>
          <SafeAreaView style={styles.videoModalSafeArea} edges={['top', 'bottom']}>
            <Pressable
              style={styles.closeButton}
              onPress={() => setVideoModalVisible(false)}
            >
              <IconSymbol name="xmark.circle.fill" size={32} color="#FFFFFF" />
            </Pressable>

            <FlatList
              data={videoFeedData}
              renderItem={({ item, index }) => (
                <VideoFeedItem
                  video={item}
                  isActive={index === selectedVideoIndex && videoModalVisible}
                  onLike={handleLike}
                  onViewChange={handleViewChange}
                  userLocation={null}
                />
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
              }}
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
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
    backgroundColor: colors.surface,
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
    ...StyleSheet.absoluteFillObject,
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
});
