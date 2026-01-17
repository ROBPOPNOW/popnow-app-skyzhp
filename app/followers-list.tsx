
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';

type ListType = 'followers' | 'following';

interface UserItem {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  isFollowing?: boolean;
}

export default function FollowersListScreen() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;
  const initialType = (params.type as ListType) || 'followers';
  
  const [listType, setListType] = useState<ListType>(initialType);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const followsChannelRef = useRef<any>(null);

  useEffect(() => {
    loadUsers();
    setupFollowsSubscription();
    
    return () => {
      // Cleanup follows channel
      if (followsChannelRef.current) {
        supabase.removeChannel(followsChannelRef.current);
        followsChannelRef.current = null;
      }
    };
  }, [userId, listType]);

  // NEW: Set up real-time subscription for follows changes
  const setupFollowsSubscription = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    console.log('=== SETTING UP FOLLOWERS LIST REAL-TIME SUBSCRIPTION ===');

    // Clean up existing channel
    if (followsChannelRef.current) {
      await supabase.removeChannel(followsChannelRef.current);
      followsChannelRef.current = null;
    }

    // Create new channel for follows changes
    const channel = supabase
      .channel(`followers-list:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
        },
        (payload) => {
          console.log('Follow change detected in followers list:', payload);
          // Reload users when any follow change happens
          loadUsers();
        }
      )
      .subscribe((status) => {
        console.log('Followers list subscription status:', status);
      });

    followsChannelRef.current = channel;
  };

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      console.log('Loading', listType, 'for user:', userId);

      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setCurrentUserId(currentUser?.id || null);

      if (listType === 'followers') {
        // Load followers
        const { data, error } = await supabase
          .from('follows')
          .select(`
            follower_id,
            users!follows_follower_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('following_id', userId);

        if (error) {
          console.error('Error loading followers:', error);
          Alert.alert('Error', 'Failed to load followers');
          return;
        }

        const followerUsers = data?.map((follow: any) => follow.users).filter(Boolean) || [];
        
        // Check which users the current user is following
        if (currentUser) {
          const { data: followingData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentUser.id);

          const followingIds = new Set(followingData?.map(f => f.following_id) || []);
          
          const usersWithFollowStatus = followerUsers.map((user: any) => ({
            ...user,
            isFollowing: followingIds.has(user.id),
          }));

          setUsers(usersWithFollowStatus);
        } else {
          setUsers(followerUsers);
        }
      } else {
        // Load following
        const { data, error } = await supabase
          .from('follows')
          .select(`
            following_id,
            users!follows_following_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('follower_id', userId);

        if (error) {
          console.error('Error loading following:', error);
          Alert.alert('Error', 'Failed to load following');
          return;
        }

        const followingUsers = data?.map((follow: any) => follow.users).filter(Boolean) || [];
        
        // Check which users the current user is following
        if (currentUser) {
          const { data: followingData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentUser.id);

          const followingIds = new Set(followingData?.map(f => f.following_id) || []);
          
          const usersWithFollowStatus = followingUsers.map((user: any) => ({
            ...user,
            isFollowing: followingIds.has(user.id),
          }));

          setUsers(usersWithFollowStatus);
        } else {
          setUsers(followingUsers);
        }
      }
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowToggle = async (targetUserId: string) => {
    try {
      if (!currentUserId) {
        Alert.alert('Error', 'You must be logged in to follow users');
        return;
      }

      const user = users.find(u => u.id === targetUserId);
      if (!user) return;

      // Optimistic update
      setUsers(users.map(u =>
        u.id === targetUserId ? { ...u, isFollowing: !user.isFollowing } : u
      ));

      if (user.isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);

        if (error) {
          console.error('Error unfollowing:', error);
          // Revert optimistic update
          setUsers(users.map(u =>
            u.id === targetUserId ? { ...u, isFollowing: true } : u
          ));
          Alert.alert('Error', 'Failed to unfollow user');
        }
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: targetUserId,
          });

        if (error) {
          console.error('Error following:', error);
          // Revert optimistic update
          setUsers(users.map(u =>
            u.id === targetUserId ? { ...u, isFollowing: false } : u
          ));
          Alert.alert('Error', 'Failed to follow user');
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const handleUserPress = (targetUserId: string) => {
    console.log('User pressed:', targetUserId);
    router.push(`/user-profile?userId=${targetUserId}`);
  };

  const renderUserItem = ({ item }: { item: UserItem }) => {
    const isOwnProfile = currentUserId === item.id;

    return (
      <Pressable
        style={styles.userItem}
        onPress={() => handleUserPress(item.id)}
      >
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <IconSymbol name="person.fill" size={24} color={colors.textSecondary} />
              </View>
            )}
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.displayName}>
              {item.display_name || item.username}
            </Text>
            <Text style={styles.username}>@{item.username}</Text>
          </View>
        </View>

        {!isOwnProfile && (
          <Pressable
            style={[
              styles.followButton,
              item.isFollowing && styles.followingButton,
            ]}
            onPress={() => handleFollowToggle(item.id)}
          >
            <IconSymbol 
              name={item.isFollowing ? "checkmark" : "plus"} 
              size={16} 
              color={item.isFollowing ? colors.text : "#FFFFFF"} 
            />
            <Text
              style={[
                styles.followButtonText,
                item.isFollowing && styles.followingButtonText,
              ]}
            >
              {item.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          {/* NEW: Improved toggle switch */}
          <View style={styles.toggleContainer}>
            <Pressable
              style={[
                styles.toggleButton,
                listType === 'followers' && styles.toggleButtonActive,
              ]}
              onPress={() => setListType('followers')}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  listType === 'followers' && styles.toggleButtonTextActive,
                ]}
              >
                Followers
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggleButton,
                listType === 'following' && styles.toggleButtonActive,
              ]}
              onPress={() => setListType('following')}
            >
              <Text
                style={[
                  styles.toggleButtonText,
                  listType === 'following' && styles.toggleButtonTextActive,
                ]}
              >
                Following
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol
            name={listType === 'followers' ? 'person.2' : 'person.2.fill'}
            size={48}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyText}>
            {listType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  // NEW: Improved toggle switch styles
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  // NEW: Improved follow button with icon
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  followingButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  followingButtonText: {
    color: colors.text,
  },
});
