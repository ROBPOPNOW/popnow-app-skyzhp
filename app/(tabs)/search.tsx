
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  displayName: string;
  avatar?: string;
  followers: number;
  videosCount: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const VIDEOS_PER_PAGE = 10;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
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
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
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
    numberOfLines: 2,
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
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 100,
  },
  paginationButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.primary,
    minWidth: 100,
  },
  paginationButtonDisabled: {
    backgroundColor: colors.textSecondary + '40',
  },
  paginationButtonText: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  paginationInfo: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  usersList: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
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
    marginBottom: 4,
  },
  userStats: {
    flexDirection: 'row',
    gap: 16,
  },
  userStat: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  followButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  followButtonText: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '600',
  },
  tagsList: {
    padding: 16,
  },
  tagItem: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  tagName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  tagCount: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('videos');
  const [isSearching, setIsSearching] = useState(false);
  const [allVideos, setAllVideos] = useState<VideoPost[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchResults, setSearchResults] = useState<{
    users: SearchUser[];
    tags: { name: string; count: number }[];
  }>({
    users: [],
    tags: [],
  });

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      handleSearch(searchQuery);
    } else {
      setAllVideos([]);
      setSearchResults({ users: [], tags: [] });
      setCurrentPage(1);
    }
  }, [searchQuery]);

  const handleSearch = async (query: string) => {
    if (query.trim().length === 0) {
      setAllVideos([]);
      setSearchResults({ users: [], tags: [] });
      setCurrentPage(1);
      return;
    }

    setIsSearching(true);
    setCurrentPage(1);
    console.log('Searching for:', query);

    try {
      // Search videos
      const videos = await searchVideos(query);
      
      // Search users
      const users = await searchUsers(query);
      
      // Search tags
      const tags = await searchTags(query);

      setAllVideos(videos);
      setSearchResults({ users, tags });
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

      console.log('=== ENHANCED VIDEO SEARCH (NO USERNAME) ===');
      console.log('Search term:', searchTerm);

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Search ONLY in caption, location_name, and tags (NO USERNAME SEARCH)
      // Only show videos created within the last hour
      const { data: videoResults, error: videoError } = await supabase
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

      // Randomize the order of videos
      const shuffledVideos = (videoResults || []).sort(() => Math.random() - 0.5);

      return shuffledVideos.map((video: any) => ({
        id: video.id,
        videoUrl: video.video_url,
        thumbnailUrl: video.thumbnail_url,
        caption: video.caption,
        tags: video.tags || [],
        user: {
          id: video.users?.id || '',
          username: video.users?.username || 'Unknown',
          displayName: video.users?.display_name || 'Unknown User',
          avatar: video.users?.avatar_url,
        },
        location: video.location_latitude && video.location_longitude
          ? {
              latitude: video.location_latitude,
              longitude: video.location_longitude,
              name: video.location_name || 'Unknown Location',
            }
          : undefined,
        likes: video.likes_count || 0,
        comments: video.comments_count || 0,
        shares: video.shares_count || 0,
        views: video.views_count || 0,
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
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) {
        console.error('Error searching users:', error);
        return [];
      }

      return (data || []).map((user: any) => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        avatar: user.avatar_url,
        followers: user.followers_count || 0,
        videosCount: user.videos_count || 0,
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

      // Get all videos with matching tags
      const { data, error } = await supabase
        .from('videos')
        .select('tags')
        .eq('moderation_status', 'approved')
        .contains('tags', [hashtagSearch]);

      if (error) {
        console.error('Error searching tags:', error);
        return [];
      }

      // Count occurrences of each tag
      const tagCounts: { [key: string]: number } = {};
      (data || []).forEach((video: any) => {
        (video.tags || []).forEach((tag: string) => {
          if (tag.toLowerCase().includes(searchTerm)) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      });

      // Convert to array and sort by count
      return Object.entries(tagCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
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
    // Navigate to search video player with all videos and starting index
    router.push({
      pathname: '/search-video-player',
      params: {
        videoIds: JSON.stringify(allVideos.map(v => v.id)),
        startIndex: index.toString(),
      },
    });
  };

  const totalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
  const startIndex = (currentPage - 1) * VIDEOS_PER_PAGE;
  const endIndex = startIndex + VIDEOS_PER_PAGE;
  const currentVideos = allVideos.slice(startIndex, endIndex);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
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
        if (allVideos.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol name="film" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No videos found</Text>
            </View>
          );
        }
        return (
          <ScrollView style={styles.videoGrid}>
            {currentVideos.reduce((rows: VideoPost[][], video, index) => {
              if (index % 2 === 0) rows.push([]);
              rows[rows.length - 1].push(video);
              return rows;
            }, []).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.videoRow}>
                {row.map((video, colIndex) => {
                  const actualIndex = startIndex + (rowIndex * 2) + colIndex;
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
                          @{video.user?.username || 'Unknown'}
                        </Text>
                        {video.location && (
                          <Text style={styles.videoLocation} numberOfLines={1}>
                            📍 {video.location.name}
                          </Text>
                        )}
                        <View style={styles.videoStats}>
                          <View style={styles.videoStat}>
                            <IconSymbol name="heart.fill" size={12} color={colors.textSecondary} />
                            <Text style={styles.videoStatsText}>
                              {formatCount(video.likes)}
                            </Text>
                          </View>
                          <View style={styles.videoStat}>
                            <IconSymbol name="bubble.left.fill" size={12} color={colors.textSecondary} />
                            <Text style={styles.videoStatsText}>
                              {formatCount(video.comments)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <View style={styles.paginationContainer}>
                <Pressable
                  style={[
                    styles.paginationButton,
                    currentPage === 1 && styles.paginationButtonDisabled,
                  ]}
                  onPress={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <Text style={styles.paginationButtonText}>Previous</Text>
                </Pressable>
                
                <Text style={styles.paginationInfo}>
                  Page {currentPage} of {totalPages}
                </Text>
                
                <Pressable
                  style={[
                    styles.paginationButton,
                    currentPage === totalPages && styles.paginationButtonDisabled,
                  ]}
                  onPress={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  <Text style={styles.paginationButtonText}>Next</Text>
                </Pressable>
              </View>
            )}
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
          <ScrollView style={styles.usersList}>
            {searchResults.users.map((user) => (
              <View key={user.id} style={styles.userItem}>
                <View style={styles.userAvatar}>
                  {user.avatar ? (
                    <Image
                      source={{ uri: user.avatar }}
                      style={styles.userAvatarImage}
                    />
                  ) : (
                    <IconSymbol name="person.fill" size={28} color={colors.primary} />
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userDisplayName}>{user.displayName}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                  <View style={styles.userStats}>
                    <Text style={styles.userStat}>
                      {formatCount(user.followers)} followers
                    </Text>
                    <Text style={styles.userStat}>
                      {formatCount(user.videosCount)} videos
                    </Text>
                  </View>
                </View>
                <Pressable style={styles.followButton}>
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    style={styles.followButton}
                  >
                    <Text style={styles.followButtonText}>Follow</Text>
                  </LinearGradient>
                </Pressable>
              </View>
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
          <ScrollView style={styles.tagsList}>
            {searchResults.tags.map((tag, index) => (
              <Pressable 
                key={index} 
                style={styles.tagItem}
                onPress={() => {
                  setSearchQuery(tag.name);
                  setActiveTab('videos');
                }}
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
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
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
