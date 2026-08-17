import React, { useState, useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import { colors } from '@/styles/commonStyles';
import { VideoPost } from '@/types/video';
import { IconSymbol } from '@/components/IconSymbol';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';

type SearchTab = 'videos' | 'users' | 'tags';

interface SearchUser {
  id: string;
  username: string;
  avatar?: string;
  is_premium?: boolean;
  lifetime_videos_count: number;
  lifetime_views_count: number;
  lifetime_likes_count: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    padding: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary + '20',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: colors.primary + '20',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoGrid: {
    padding: 12,
  },
  videoCard: {
    width: CARD_WIDTH,
    marginBottom: 16,
    marginHorizontal: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  videoThumbnail: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: colors.textSecondary + '20',
  },
  videoCardInfo: {
    padding: 8,
  },
  videoCaption: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoUsername: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  videoLocation: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  videoStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoStatsText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  videoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  usersList: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  // User avatar styles removed - now handled by PremiumAvatar component
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  userUsername: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userStatsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  userStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userStatLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  userStatValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
  },
  tagsList: {
    padding: 16,
  },
  tagCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  tagName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  tagCount: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});

// FloatingTabBar visual height, excluding the safe-area inset (which the tab
// bar and this screen both add via insets.bottom). Measured from FloatingTabBar
// styles: tabBar padding (6+4) + tab content (icon 20 + gap 2 + label ~12) + tab
// padding (2+2) ≈ 48. The +16 below adds breathing room above the bar.
const TAB_BAR_HEIGHT = 48;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('videos');
  const [isSearching, setIsSearching] = useState(false);
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [searchResults, setSearchResults] = useState<{
    users: SearchUser[];
    tags: { name: string; count: number }[];
  }>({
    users: [],
    tags: [],
  });

  useEffect(() => {
    let mounted = true;

    const runSearch = async () => {
      if (searchQuery.trim().length > 0) {
        await handleSearch(searchQuery);
      } else {
        if (mounted) setVideos([]);
        if (mounted) setSearchResults({ users: [], tags: [] });
      }
    };

    runSearch();

    return () => {
      mounted = false;
    };
  }, [searchQuery]);

  const handleSearch = async (query: string) => {
    if (query.trim().length === 0) {
      setVideos([]);
      setSearchResults({ users: [], tags: [] });
      return;
    }

    setIsSearching(true);
    console.log('Searching for:', query);

    try {
      // Get blocked users
      let blockedUserIds: string[] = [];
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: blockedData } = await supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', user.id);

        const { data: blockedByData } = await supabase
          .from('blocked_users')
          .select('blocker_id')
          .eq('blocked_id', user.id);

        blockedUserIds = [
          ...(blockedData?.map(b => b.blocked_id) || []),
          ...(blockedByData?.map(b => b.blocker_id) || []),
        ];
      }

      // Search videos
      const videoResults = await searchVideos(query);

      // Search users
      const userResults = await searchUsers(query);

      // Search tags
      const tagResults = await searchTags(query);

      // Filter blocked users from results
      const filteredVideos = blockedUserIds.length > 0
        ? videoResults.filter(v => !blockedUserIds.includes((v as any).users?.id || (v as any).user_id))
        : videoResults;

      const filteredUsers = blockedUserIds.length > 0
        ? userResults.filter(u => !blockedUserIds.includes(u.id))
        : userResults;

      setVideos(filteredVideos);
      setSearchResults({ users: filteredUsers, tags: tagResults });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const searchVideos = async (query: string): Promise<VideoPost[]> => {
    try {
      const searchTerm = query.toLowerCase();
      const hashtagSearch = searchTerm.startsWith('#') ? searchTerm : `#${searchTerm}`;

      console.log('=== VIDEO SEARCH ===');
      console.log('Search term:', searchTerm);

      // Calculate the timestamp for 24 hours ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 24);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Search in caption, location_name, and tags
      // Only show videos created within the last 24 hours
      const { data: videoResults, error: videoError } = await supabase
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
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO)
        .or(`caption.ilike.%${searchTerm}%,location_name.ilike.%${searchTerm}%,tags.cs.{${hashtagSearch}}`)
        .order('created_at', { ascending: false });

      if (videoError) {
        console.error('Error searching videos:', videoError);
        return [];
      }

      console.log('✅ Found', videoResults?.length || 0, 'videos');

      // Get current user to check liked videos
      const { data: { user } } = await supabase.auth.getUser();
      let likedVideoIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('likes')
          .select('video_id')
          .eq('user_id', user.id);

        likedVideoIds = likes?.map(like => like.video_id) || [];
      }

      return (videoResults || []).map((video: any) => ({
        id: video.id,
        videoUrl: video.video_url,
        video_url: video.video_url,
        thumbnailUrl: video.thumbnail_url,
        caption: video.caption || '',
        tags: video.tags || [],
        latitude: video.location_latitude,
        longitude: video.location_longitude,
        locationName: video.location_name,
        locationPrivacy: video.location_privacy,
        users: video.users ? {
          id: video.users.id,
          username: video.users.username || 'Unknown',
          avatar_url: video.users.avatar_url,
        } : undefined,
        likes: video.likes_count || 0,
        likes_count: video.likes_count || 0,
        comments: video.comments_count || 0,
        comments_count: video.comments_count || 0,
        shares: video.shares_count || 0,
        shares_count: video.shares_count || 0,
        views: video.views_count || 0,
        views_count: video.views_count || 0,
        isLiked: likedVideoIds.includes(video.id),
        createdAt: video.created_at,
      }));
    } catch (error) {
      console.error('Error in searchVideos:', error);
      return [];
    }
  };

  const searchUsers = async (query: string): Promise<SearchUser[]> => {
    try {
      const searchTerm = query.toLowerCase();

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`username.ilike.%${searchTerm}%`)
        .limit(50);

      if (error) {
        console.error('Error searching users:', error);
        return [];
      }

      return (data || []).map((user: any) => ({
        id: user.id,
        username: user.username,
        avatar: user.avatar_url,
        is_premium: user.is_premium || false,
        lifetime_videos_count: user.lifetime_videos_count || 0,
        lifetime_views_count: user.lifetime_views_count || 0,
        lifetime_likes_count: user.lifetime_likes_count || 0,
      }));
    } catch (error) {
      console.error('Error in searchUsers:', error);
      return [];
    }
  };

  const searchTags = async (query: string): Promise<{ name: string; count: number }[]> => {
    try {
      const searchTerm = query.toLowerCase();
      const hashtagSearch = searchTerm.startsWith('#') ? searchTerm : `#${searchTerm}`;

      // Get all videos with tags containing the search term
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

      const { data, error } = await supabase
        .from('videos')
        .select('tags')
        .eq('moderation_status', 'approved')
        .gte('created_at', twentyFourHoursAgoISO);

      if (error) {
        console.error('Error searching tags:', error);
        return [];
      }

      // Count occurrences of each matching tag
      const tagCounts: { [key: string]: number } = {};
      (data || []).forEach((video: any) => {
        (video.tags || []).forEach((tag: string) => {
          const tagLower = tag.toLowerCase();
          // Check if tag contains the search term
          if (tagLower.includes(searchTerm)) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      });

      // Convert to array and sort by count
      return Object.entries(tagCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
    } catch (error) {
      console.error('Error in searchTags:', error);
      return [];
    }
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

  const handleVideoPress = (video: VideoPost, index: number) => {
    console.log('Video card pressed:', video.id, 'at index:', index);
    // Navigate to search video player with all video IDs and starting index
    router.push({
      pathname: '/search-video-player',
      params: {
        videoIds: JSON.stringify(videos.map(v => v.id)),
        startIndex: index.toString(),
      },
    });
  };

  const handleUserPress = (user: SearchUser) => {
    console.log('User card pressed:', user.id);
    // Navigate to user profile
    router.push({
      pathname: '/user-profile',
      params: { userId: user.id },
    });
  };

  const handleTagPress = async (tagName: string) => {
    console.log('Tag pressed:', tagName);

    // Search for videos with this specific tag
    setIsSearching(true);
    setActiveTab('videos');

    try {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 24);
      const oneHourAgoISO = oneHourAgo.toISOString();

      const { data: videoResults, error } = await supabase
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
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO)
        .contains('tags', [tagName])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading videos for tag:', error);
        return;
      }

      // Get current user to check liked videos
      const { data: { user } } = await supabase.auth.getUser();
      let likedVideoIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('likes')
          .select('video_id')
          .eq('user_id', user.id);

        likedVideoIds = likes?.map(like => like.video_id) || [];
      }

      const formattedVideos = (videoResults || []).map((video: any) => ({
        id: video.id,
        videoUrl: video.video_url,
        video_url: video.video_url,
        thumbnailUrl: video.thumbnail_url,
        caption: video.caption || '',
        tags: video.tags || [],
        latitude: video.location_latitude,
        longitude: video.location_longitude,
        locationName: video.location_name,
        locationPrivacy: video.location_privacy,
        users: video.users ? {
          id: video.users.id,
          username: video.users.username || 'Unknown',
          avatar_url: video.users.avatar_url,
        } : undefined,
        likes: video.likes_count || 0,
        likes_count: video.likes_count || 0,
        comments: video.comments_count || 0,
        comments_count: video.comments_count || 0,
        shares: video.shares_count || 0,
        shares_count: video.shares_count || 0,
        views: video.views_count || 0,
        views_count: video.views_count || 0,
        isLiked: likedVideoIds.includes(video.id),
        createdAt: video.created_at,
      }));

      setVideos(formattedVideos);
      setSearchQuery(tagName);
    } catch (error) {
      console.error('Error in handleTagPress:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const renderContent = () => {
    if (isSearching) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (searchQuery.trim().length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <IconSymbol name="magnifyingglass" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            Search for videos, users, or tags
          </Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'videos':
        if (videos.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol name="film" android_material_icon_name="movie" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No videos found</Text>
            </View>
          );
        }
        return (
          <ScrollView
            style={styles.videoGrid}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {videos.reduce((rows: VideoPost[][], video, index) => {
              if (index % 2 === 0) rows.push([]);
              rows[rows.length - 1].push(video);
              return rows;
            }, []).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.videoRow}>
                {row.map((video, colIndex) => {
                  const actualIndex = (rowIndex * 2) + colIndex;
                  return (
                    <Pressable
                      key={video.id}
                      style={styles.videoCard}
                      onPress={() => handleVideoPress(video, actualIndex)}
                    >
                      <Image
                        source={{ uri: video.thumbnailUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400' }}
                        style={styles.videoThumbnail}
                        resizeMode="cover"
                      />
                      <View style={styles.videoCardInfo}>
                        <Text style={styles.videoCaption} numberOfLines={2}>
                          {video.caption}
                        </Text>
                        <Text style={styles.videoUsername} numberOfLines={1}>
                          @{video.users?.username || 'Unknown'}
                        </Text>
                        {video.locationName && (
                          <Text style={styles.videoLocation} numberOfLines={1}>
                            📍 {video.locationName}
                          </Text>
                        )}
                        <View style={styles.videoStats}>
                          <View style={styles.videoStat}>
                            <IconSymbol name="heart.fill" size={12} color={colors.textSecondary} />
                            <Text style={styles.videoStatsText}>
                              {formatCount(video.likes_count || 0)}
                            </Text>
                          </View>
                          <View style={styles.videoStat}>
                            <IconSymbol name="bubble.left.fill" size={12} color={colors.textSecondary} />
                            <Text style={styles.videoStatsText}>
                              {formatCount(video.comments_count || 0)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        );

      case 'users':
        if (searchResults.users.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol name="person.fill" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          );
        }
        return (
          <ScrollView
            style={styles.usersList}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {searchResults.users.map((user) => (
              <Pressable
                key={user.id}
                style={styles.userCard}
                onPress={() => handleUserPress(user)}
              >
                <PremiumAvatar
                  avatarUrl={user.avatar}
                  size={60}
                  isPremium={user.is_premium || false}
                />
                <View style={styles.userInfo}>
                  <Text style={styles.userDisplayName}>{user.username}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                </View>
                <View style={styles.userStatsContainer}>
                  <View style={styles.userStatRow}>
                    <Text style={styles.userStatLabel}>Videos:</Text>
                    <Text style={styles.userStatValue}>{formatCount(user.lifetime_videos_count)}</Text>
                  </View>
                  <View style={styles.userStatRow}>
                    <Text style={styles.userStatLabel}>Views:</Text>
                    <Text style={styles.userStatValue}>{formatCount(user.lifetime_views_count)}</Text>
                  </View>
                  <View style={styles.userStatRow}>
                    <Text style={styles.userStatLabel}>Likes:</Text>
                    <Text style={styles.userStatValue}>{formatCount(user.lifetime_likes_count)}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        );

      case 'tags':
        if (searchResults.tags.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol name="number" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No tags found</Text>
            </View>
          );
        }
        return (
          <ScrollView
            style={styles.tagsList}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {searchResults.tags.map((tag, index) => (
              <Pressable
                key={index}
                style={styles.tagCard}
                onPress={() => handleTagPress(tag.name)}
              >
                <Text style={styles.tagName}>{tag.name}</Text>
                <Text style={styles.tagCount}>
                  {formatCount(tag.count)} videos
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.searchContainer}>
              <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search videos, users, or tags"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <IconSymbol name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={() => router.back()}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabsContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
            onPress={() => setActiveTab('videos')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'videos' && styles.activeTabText,
              ]}
            >
              Videos
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'users' && styles.activeTab]}
            onPress={() => setActiveTab('users')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'users' && styles.activeTabText,
              ]}
            >
              Users
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'tags' && styles.activeTab]}
            onPress={() => setActiveTab('tags')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'tags' && styles.activeTabText,
              ]}
            >
              Tags
            </Text>
          </Pressable>
        </View>

        <View style={styles.content}>{renderContent()}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}