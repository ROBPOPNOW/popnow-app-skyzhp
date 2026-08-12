
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Alert, Modal, TextInput, Pressable, Text, ScrollView, Image, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Share } from 'react-native';
import VideoPlayer from './VideoPlayer';
import VideoOverlay from './VideoOverlay';
import { VideoPost } from '@/types/video';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import { TapGestureHandler, LongPressGestureHandler, State } from 'react-native-gesture-handler';

interface VideoFeedItemProps {
  video: VideoPost;
  isActive: boolean;
  onLike: (videoId: string, newIsLiked: boolean, newLikesCount: number) => void;
  onViewChange?: (videoId: string) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onAvatarPress?: (userId: string) => void;
  onLocationPress?: (latitude: number, longitude: number, locationName?: string) => void; // ← ADD THIS
  hideUnlikeButton?: boolean;
  disableLocationTap?: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  parent_id?: string | null;
  users: {
    username: string;
    avatar_url?: string;
    is_premium?: boolean;
  }[];
  replies?: Comment[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 50;
const VIDEO_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

export default function VideoFeedItem({ 
  video, 
  isActive, 
  onLike,
  onViewChange,
  userLocation,
  onAvatarPress,
  onLocationPress, // ← ADD THIS
  hideUnlikeButton = false,
  disableLocationTap = false
}: VideoFeedItemProps) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [likesCount, setLikesCount] = useState(video.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(video.comments_count || 0);
  const [sharesCount, setSharesCount] = useState(video.shares_count || 0);
  const [isLiked, setIsLiked] = useState(video.isLiked || false);
  const commentsChannelRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const doubleTapRef = useRef<TapGestureHandler>(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const likeAnimationOpacity = useRef(new Animated.Value(0)).current;
  const [localViewsCount, setLocalViewsCount] = useState(video.views_count || 0);
  const [is2x, setIs2x] = useState(false);

// Helper to get user data (handles both array and object)
const getUser = (users: any) => {
  return Array.isArray(users) ? users[0] : users;
};

// Track view IMMEDIATELY when video becomes active - no duration check
useEffect(() => {
  let mounted = true;
  if (!isActive || !video.id) return;

  console.log('Video became active:', video.id);
  
  const trackView = async () => {
    try {
      if (!mounted) return;
      console.log('Tracking view for video:', video.id);
      if (onViewChange && mounted) {
        onViewChange(video.id);
      }
    } catch (error) {
      console.error('Error in trackView:', error);
    }
  };

  trackView();

  return () => {
    mounted = false;
    console.log('Video becoming inactive:', video.id);
  };
}, [isActive, video.id]);

// Set up real-time subscription for new comments using postgres_changes
useEffect(() => {
  // Only subscribe when comments modal is open
  if (!showComments) {
    return;
  }

  console.log('Setting up realtime subscription for comments on video:', video.id);

  // Create a channel for this video's comments
  const commentsChannel = supabase
    .channel(`comments:${video.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `video_id=eq.${video.id}`,
      },
      async (payload) => {
        console.log('New comment received via realtime:', payload);
        
        const { data: newComment, error } = await supabase
          .from('comments')
.select(`
  id,
  user_id,
  text,
  created_at,
  parent_id,
  users (
    username,
    avatar_url,
    is_premium
  )
`)
          .eq('id', payload.new.id)
          .single();

        if (error) {
          console.error('Error fetching new comment details:', error);
          return;
        }

        if (newComment) {
          console.log('Adding new comment to list:', newComment.id);
          setComments((prevComments) => {
            const existsTopLevel = prevComments.some(c => c.id === newComment.id);
            const existsInReplies = prevComments.some(c => 
              c.replies?.some(r => r.id === newComment.id)
            );
            if (existsTopLevel || existsInReplies) {
              return prevComments;
            }

            if (newComment.parent_id) {
              return prevComments.map(c => {
                if (c.id === newComment.parent_id) {
                  return {
                    ...c,
                    replies: [...(c.replies || []), newComment],
                  };
                }
                return c;
              });
            } else {
              return [{ ...newComment, replies: [] }, ...prevComments];
            }
          });

          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({ y: 0, animated: true });
            }
          }, 100);
        }
      }
    )
    .subscribe((status) => {
      console.log('Comments channel subscription status:', status);
    });

  commentsChannelRef.current = commentsChannel;

  return () => {
    if (commentsChannelRef.current) {
      console.log('Unsubscribing from comments channel');
      supabase.removeChannel(commentsChannelRef.current);
      commentsChannelRef.current = null;
    }
  };
}, [video.id, showComments]);

  // Update local state when video prop changes
  useEffect(() => {
    setLikesCount(video.likes_count || 0);
    setCommentsCount(video.comments_count || 0);
    setSharesCount(video.shares_count || 0);
    setIsLiked(video.isLiked || false);
  }, [video.likes_count, video.comments_count, video.shares_count, video.isLiked]);

const handleLike = async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 VIDEOFEEDITEM: LIKE HANDLER');
  console.log('  Video ID:', video.id);
  console.log('  Current isLiked:', isLiked);
  console.log('  Current likesCount:', likesCount);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ Error getting user:', userError);
      Alert.alert('Error', 'You must be logged in to like');
      return;
    }

    const newIsLiked = !isLiked;
    const newLikesCount = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    
    // Optimistic UI update
    setIsLiked(newIsLiked);
    setLikesCount(newLikesCount);
    console.log('✅ Optimistic update: isLiked =', newIsLiked, ', likesCount =', newLikesCount);

    if (newIsLiked) {
      console.log('➕ Adding like to database...');
      const { error: likeError } = await supabase
        .from('likes')
        .insert({ video_id: video.id, user_id: user.id });

      if (likeError) {
        if (likeError.code === '23505') {
          // Duplicate - just keep the UI updated
          console.log('ℹ️ Already liked (duplicate ignored)');
          onLike(video.id, true, newLikesCount);
          return;
        }
        console.error('❌ Error adding like:', likeError);
        setIsLiked(isLiked);
        setLikesCount(likesCount);
        Alert.alert('Error', 'Failed to like video');
        return;
      }
      console.log('✅ Like added - trigger will update count');
      onLike(video.id, newIsLiked, newLikesCount);
    } else {
      console.log('➖ Removing like from database...');
      const { error: unlikeError } = await supabase
        .from('likes')
        .delete()
        .eq('video_id', video.id)
        .eq('user_id', user.id);

      if (unlikeError) {
        console.error('❌ Error removing like:', unlikeError);
        setIsLiked(isLiked);
        setLikesCount(likesCount);
        Alert.alert('Error', 'Failed to unlike video');
        return;
      }
      console.log('✅ Like removed - trigger will update count');
      onLike(video.id, newIsLiked, newLikesCount);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VIDEOFEEDITEM: LIKE COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error: any) {
    console.error('❌ Error handling like:', error);
    setIsLiked(isLiked);
    setLikesCount(likesCount);
  }
};

  const handleDoubleTap = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      console.log('Double tap detected on video:', video.id);
      
      // Only like if not already liked
      if (!isLiked) {
        // Trigger like animation
        likeAnimationScale.setValue(0);
        likeAnimationOpacity.setValue(1);
        
        Animated.parallel([
          Animated.spring(likeAnimationScale, {
            toValue: 1,
            friction: 3,
            useNativeDriver: true,
          }),
          Animated.timing(likeAnimationOpacity, {
            toValue: 0,
            duration: 1000,
            delay: 200,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Perform like action
        handleLike();
      }
    }
  };

  const handleComment = async () => {
    console.log('Comment pressed for video:', video.id);
    setShowComments(true);
    await loadComments();
  };

const loadComments = async () => {
    try {
      setLoadingComments(true);
      console.log('Loading comments for video:', video.id);

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
      
     const { data, error } = await supabase
        .from('comments')
.select(`
  id,
  user_id,
  text,
  created_at,
  parent_id,
  users (
    username,
    avatar_url,
    is_premium
  )
`)
        .eq('video_id', video.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading comments:', error);
        Alert.alert('Error', 'Failed to load comments. Please try again.');
        return;
      }

      // Filter out blocked users' comments
      const filteredComments = blockedUserIds.length > 0
        ? (data || []).filter(c => !blockedUserIds.includes(c.user_id))
        : (data || []);

     console.log('Comments loaded:', data?.length || 0, '| After filter:', filteredComments.length);
      
      // Organize into threads: top-level comments with nested replies
      const topLevelComments: Comment[] = [];
      const repliesMap: { [key: string]: Comment[] } = {};

      filteredComments.forEach((comment: Comment) => {
        if (comment.parent_id) {
          if (!repliesMap[comment.parent_id]) {
            repliesMap[comment.parent_id] = [];
          }
          repliesMap[comment.parent_id].push(comment);
        } else {
          topLevelComments.push(comment);
        }
      });

      // Attach replies to their parent comments
      const threaded = topLevelComments.map(comment => ({
        ...comment,
        replies: repliesMap[comment.id] || [],
      }));

      // Reverse so newest top-level comments are first
      threaded.reverse();

      setComments(threaded);
    } catch (error) {
      console.error('Error loading comments:', error);
      Alert.alert('Error', 'Failed to load comments. Please try again.');
    } finally {
      setLoadingComments(false);
    }
  };

const handlePostComment = async () => {
  const trimmedComment = commentText.trim();
  
  if (!trimmedComment) {
    Alert.alert('Error', 'Please enter a comment');
    return;
  }

  try {
    setPostingComment(true);
    console.log('=== POSTING COMMENT ===');
    console.log('Video ID:', video.id);
    console.log('Comment text:', trimmedComment);
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Error getting user:', userError);
      Alert.alert('Error', 'You must be logged in to comment');
      return;
    }

    console.log('User ID:', user.id);

    // Optimistic update: Increment comment count immediately
    const newCommentsCount = commentsCount + 1;
    setCommentsCount(newCommentsCount);
    console.log('✅ Local comment count updated instantly to:', newCommentsCount);

    // Insert comment - Realtime will add it to the list
    const { error: commentError } = await supabase
      .from('comments')
      .insert({
        video_id: video.id,
        user_id: user.id,
        text: trimmedComment,
        parent_id: replyingTo?.id || null,
      });

    if (commentError) {
      console.error('Error inserting comment:', commentError);
      // Revert optimistic update on error
      setCommentsCount(commentsCount);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
      return;
    }

    console.log('✅ Comment inserted - realtime will add to list');

    // Clear input
    setCommentText('');
    setReplyingTo(null);

    console.log('=== COMMENT POSTED SUCCESSFULLY ===');

  } catch (error: any) {
    console.error('Error posting comment:', error);
    // Revert optimistic update on error
    setCommentsCount(commentsCount);
    Alert.alert('Error', 'Failed to post comment. Please try again.');
  } finally {
    setPostingComment(false);
  }
};

const handleShare = async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 SHARE HANDLER CALLED');
  console.log('  Video ID:', video.id);
  console.log('  Current sharesCount:', sharesCount);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ Error getting user:', userError);
      Alert.alert('Error', 'You must be logged in to share');
      return;
    }

    // Create share message
    // Calculate time remaining
    const createdAt = new Date(video.createdAt);
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours after creation
    const now = new Date();
    const msLeft = expiresAt.getTime() - now.getTime();
    const minsLeft = Math.max(0, Math.floor(msLeft / 60000));
    const timeLeft = minsLeft > 0 ? `${minsLeft} min${minsLeft === 1 ? '' : 's'}` : 'moments';

    const videoTitle = video.caption || '';
    const shareUrl = `https://popnow.world/v.html?id=${video.id}`;
const shareMessage = `${videoTitle ? videoTitle + '\n\n' : ''}🚨 Only ${timeLeft} left to catch this moment on POPNOW!\n\n${shareUrl}`;
    
console.log('📱 Opening share dialog...');
    
// Open native share dialog
const result = await Share.share({
  message: shareMessage,
  title: 'Share Video from POPNOW',
});

    console.log('Share result:', result);

    // Only record share if user actually shared (not dismissed)
    if (result.action === Share.sharedAction) {
      console.log('✅ User completed share action');
      
      // Optimistic update: Update local state immediately
      const newSharesCount = sharesCount + 1;
      setSharesCount(newSharesCount);
      console.log('✅ Optimistic update: sharesCount =', newSharesCount);

      // Insert into shares table - database trigger will update videos.shares_count automatically
      console.log('💾 Recording share in database...');
      const { error: shareError } = await supabase
        .from('shares')
        .insert({
          video_id: video.id,
          user_id: user.id,
        });

      if (shareError) {
        // Check if error is duplicate (user already shared this video before)
        if (shareError.code === '23505') {
          console.log('ℹ️ User already shared this video previously (duplicate ignored)');
          // Keep the optimistic update - it's fine
        } else {
          console.error('❌ Error recording share:', shareError);
          // Revert optimistic update on real error
          setSharesCount(sharesCount);
          Alert.alert('Error', 'Failed to record share');
        }
      } else {
        console.log('✅ Share recorded - database trigger will update videos.shares_count');
      }
    } else if (result.action === Share.dismissedAction) {
      console.log('ℹ️ User dismissed share dialog without sharing');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SHARE OPERATION COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error: any) {
    console.error('❌ Error sharing video:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
    });
    Alert.alert('Error', 'Failed to share video. Please try again.');
  }
};

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Create updated video object with real-time counts
  const updatedVideo = {
    ...video,
    likes_count: likesCount,
    comments_count: commentsCount,
    shares_count: sharesCount,
    comments: commentsCount,
    likes: likesCount,
    shares: sharesCount,
    isLiked: isLiked,
  };

  return (
    <View style={styles.container}>
      <LongPressGestureHandler
        minDurationMs={300}
        onHandlerStateChange={({ nativeEvent }) => {
          if (nativeEvent.state === State.ACTIVE) {
            console.log('👆 Long press - 2x speed');
            setIs2x(true);
          } else if (
            nativeEvent.state === State.END ||
            nativeEvent.state === State.CANCELLED ||
            nativeEvent.state === State.FAILED
          ) {
            console.log('👆 Long press ended - 1x speed');
            setIs2x(false);
          }
        }}
      >
        <View style={StyleSheet.absoluteFill}>
        <TapGestureHandler
        ref={doubleTapRef}
        onHandlerStateChange={handleDoubleTap}
        numberOfTaps={2}
      >
        <View style={StyleSheet.absoluteFill}>
          {(video.videoUrl || video.video_url) ? (
  <VideoPlayer
    videoUrl={video.videoUrl || video.video_url}
    isActive={isActive}
    libraryId={video.library_id}
    is2x={is2x}
    onLoad={() => console.log('Video loaded:', video.id)}
    onError={(error) => console.error('Video error:', error)}
  />
) : (
  <View style={styles.videoLoading}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.videoLoadingText}>Loading video...</Text>
  </View>
)}
          
          {/* Double Tap Like Animation */}
          <Animated.View
            style={[
              styles.likeAnimation,
              {
                opacity: likeAnimationOpacity,
                transform: [{ scale: likeAnimationScale }],
              },
            ]}
            pointerEvents="none"
          >
            <IconSymbol ios_icon_name="heart.fill" android_material_icon_name="favorite" size={120} color="#FF3B5C" />
          </Animated.View>
        </View>
      </TapGestureHandler>
        </View>
      </LongPressGestureHandler>
      
<VideoOverlay
  video={updatedVideo}
  onLike={handleLike}
  onComment={handleComment}
  onShare={handleShare}
  userLocation={userLocation}
  onAvatarPress={onAvatarPress}
  onLocationPress={onLocationPress} // ← ADD THIS LINE
  disableLocationTap={disableLocationTap}
/>

      {/* Comments Modal */}
      <Modal
        visible={showComments}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowComments(false)}
      >
        <KeyboardAvoidingView 
          style={styles.commentsModal}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40: 20}
        >
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>
              Comments ({commentsCount})
            </Text>
            <Pressable onPress={() => setShowComments(false)}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView 
            ref={scrollViewRef}
            style={styles.commentsList}
            contentContainerStyle={styles.commentsListContent}
            keyboardShouldPersistTaps="always"
          >
            {loadingComments ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading comments...</Text>
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <IconSymbol ios_icon_name="bubble.left" android_material_icon_name="chat-bubble" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to comment!</Text>
              </View>
            ) : (
              comments.map((comment) => {
  const commentUser = getUser(comment.users);
  return (
    <View key={comment.id}>
      {/* Top-level comment */}
      <View style={styles.commentItem}>
        <PremiumAvatar
          avatarUrl={commentUser?.avatar_url}
          size={40}
          isPremium={commentUser?.is_premium || false}
        />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentUsername}>
  @{commentUser?.username || 'Unknown'}
</Text>
            <Text style={styles.commentTime}>
              {formatTimeAgo(comment.created_at)}
            </Text>
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
          <Pressable
            onPress={() => {
              setReplyingTo(comment);
              setCommentText(`@${commentUser?.username || 'Unknown'} `);
            }}
            style={styles.replyButton}
          >
            <Text style={styles.replyButtonText}>Reply</Text>
          </Pressable>
        </View>
      </View>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map((reply) => {
            const replyUser = getUser(reply.users);
            return (
              <View key={reply.id} style={styles.commentItem}>
                <PremiumAvatar
                  avatarUrl={replyUser?.avatar_url}
                  size={32}
                  isPremium={replyUser?.is_premium || false}
                />
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentUsername}>
  @{replyUser?.username || 'Unknown'}
</Text>
                    <Text style={styles.commentTime}>
                      {formatTimeAgo(reply.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{reply.text}</Text>
                  <Pressable
                    onPress={() => {
                      setReplyingTo({ ...reply, id: comment.id });
                      setCommentText(`@${replyUser?.username || 'Unknown'} `);
                    }}
                    style={styles.replyButton}
                  >
                    <Text style={styles.replyButtonText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
})
            )}
          </ScrollView>

          {replyingTo && (
  <View style={styles.replyingToContainer}>
    <Text style={styles.replyingToText}>
  Replying to @{getUser(replyingTo.users)?.username || 'Unknown'}
</Text>
    <Pressable onPress={() => { setReplyingTo(null); setCommentText(''); }}>
      <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
    </Pressable>
  </View>
)}

          <View style={styles.commentInputContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textSecondary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[
                styles.postButton,
                (!commentText.trim() || postingComment) && styles.postButtonDisabled
              ]}
              onPress={handlePostComment}
              disabled={!commentText.trim() || postingComment}
            >
              {postingComment ? (
                <ActivityIndicator size="small" color={colors.card} />
              ) : (
                <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={20} color={colors.card} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: VIDEO_HEIGHT,
    position: 'relative',
    zIndex: 1,
  },
  likeAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -60,
    zIndex: 1000,
  },
  commentsModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  commentsList: {
    flex: 1,
  },
  commentsListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptyComments: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
// Comment avatar styles removed - now handled by PremiumAvatar component
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commentTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  commentText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
    gap: 12,
    backgroundColor: colors.background,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  postButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  replyButton: {
    marginTop: 4,
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  repliesContainer: {
    marginLeft: 52,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: 12,
  },
  replyingToContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyingToText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  videoLoading: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#000',
},
videoLoadingText: {
  fontSize: 14,
  color: colors.textSecondary,
  marginTop: 12,
},
});
