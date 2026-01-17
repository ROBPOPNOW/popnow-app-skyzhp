
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Alert, Modal, TextInput, Pressable, Text, ScrollView, Image, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Share } from 'react-native';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import VideoPlayer from './VideoPlayer';
import VideoOverlay from './VideoOverlay';
import { VideoPost } from '@/types/video';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface VideoFeedItemProps {
  video: VideoPost;
  isActive: boolean;
  onLike: (videoId: string) => void;
  onViewChange?: (videoId: string) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onAvatarPress?: (userId: string) => void;
  hideUnlikeButton?: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  users: {
    username: string;
    avatar_url?: string;
  };
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoFeedItem({ 
  video, 
  isActive, 
  onLike,
  onViewChange,
  userLocation,
  onAvatarPress,
  hideUnlikeButton = false
}: VideoFeedItemProps) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
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

  // Track view when video becomes active
  useEffect(() => {
    if (isActive && onViewChange) {
      console.log('Video became active:', video.id);
      onViewChange(video.id);
    }
  }, [isActive, video.id, onViewChange]);

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
          
          // Fetch the full comment with user data
          const { data: newComment, error } = await supabase
            .from('comments')
            .select(`
              id,
              user_id,
              text,
              created_at,
              users (
                username,
                avatar_url
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
              // Check if comment already exists (avoid duplicates)
              const exists = prevComments.some(c => c.id === newComment.id);
              if (exists) {
                return prevComments;
              }
              return [newComment, ...prevComments];
            });

            // Update comment count
            setCommentsCount((prev) => prev + 1);
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
    console.log('Like pressed for video:', video.id);
    
    // Optimistic update
    const newIsLiked = !isLiked;
    const newLikesCount = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(newIsLiked);
    setLikesCount(newLikesCount);
    
    // Call parent handler
    onLike(video.id);
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
      
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          user_id,
          text,
          created_at,
          users (
            username,
            avatar_url
          )
        `)
        .eq('video_id', video.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading comments:', error);
        Alert.alert('Error', 'Failed to load comments. Please try again.');
        return;
      }

      console.log('Comments loaded:', data?.length || 0);
      setComments(data || []);
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
      
      // Get current user
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

      // Insert comment into database - Supabase Realtime will handle broadcasting
      const { data: newComment, error: commentError } = await supabase
        .from('comments')
        .insert({
          video_id: video.id,
          user_id: user.id,
          text: trimmedComment,
        })
        .select(`
          id,
          user_id,
          text,
          created_at,
          users (
            username,
            avatar_url
          )
        `)
        .single();

      if (commentError) {
        console.error('Error inserting comment:', commentError);
        // Revert optimistic update on error
        setCommentsCount(commentsCount);
        Alert.alert('Error', 'Failed to post comment. Please try again.');
        return;
      }

      console.log('✅ Comment inserted:', newComment.id);

      // Update comments count in videos table
      const { error: updateError } = await supabase
        .from('videos')
        .update({ comments_count: newCommentsCount })
        .eq('id', video.id);

      if (updateError) {
        console.error('Error updating comments count:', updateError);
        // Don't revert - the comment was posted successfully
      } else {
        console.log('✅ Comments count updated in database');
      }

      // Add comment to local state immediately (don't wait for realtime)
      if (newComment) {
        setComments((prevComments) => {
          // Check if comment already exists (avoid duplicates)
          const exists = prevComments.some(c => c.id === newComment.id);
          if (exists) {
            return prevComments;
          }
          return [newComment, ...prevComments];
        });
      }

      // Clear input
      setCommentText('');
      
      // Scroll to top to show the new comment
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: true });
      }

      console.log('=== COMMENT POSTED SUCCESSFULLY ===');
    } catch (error: any) {
      console.error('Error posting comment:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      // Revert optimistic update on error
      setCommentsCount(commentsCount);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setPostingComment(false);
    }
  };

  const handleShare = async () => {
    console.log('=== SHARE PRESSED ===');
    console.log('Video ID:', video.id);
    
    try {
      // Create share message
      const videoTitle = video.caption || 'Check out this video on POPNOW!';
      const shareMessage = `${videoTitle}\n\nWatch it on POPNOW - Discover and share 30-second moments happening around you!`;
      
      console.log('Opening share dialog...');
      
      // Open share dialog
      const result = await Share.share({
        message: shareMessage,
        title: 'Share Video from POPNOW',
      });

      console.log('Share result:', result);

      // Only update count if user actually shared (not dismissed)
      if (result.action === Share.sharedAction) {
        console.log('User shared the video');
        
        // Optimistic update: Update local state immediately
        const newSharesCount = sharesCount + 1;
        setSharesCount(newSharesCount);
        console.log('✅ Local shares count updated instantly to:', newSharesCount);

        // Update shares count in database
        const { error: updateError } = await supabase
          .from('videos')
          .update({ shares_count: newSharesCount })
          .eq('id', video.id);

        if (updateError) {
          console.error('Error updating shares count:', updateError);
          // Revert on error
          setSharesCount(sharesCount);
        } else {
          console.log('✅ Shares count updated in database');
        }
      } else if (result.action === Share.dismissedAction) {
        console.log('User dismissed share dialog');
      }

      console.log('=== SHARE COMPLETED ===');
    } catch (error: any) {
      console.error('Error sharing video:', error);
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
      <TapGestureHandler
        ref={doubleTapRef}
        onHandlerStateChange={handleDoubleTap}
        numberOfTaps={2}
      >
        <View style={StyleSheet.absoluteFill}>
          <VideoPlayer
            videoUrl={video.videoUrl || video.video_url}
            isActive={isActive}
            onLoad={() => console.log('Video loaded:', video.id)}
            onError={(error) => console.error('Video error:', error)}
          />
          
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
            <IconSymbol name="heart.fill" size={120} color="#FF3B5C" />
          </Animated.View>
        </View>
      </TapGestureHandler>
      
      <VideoOverlay
        video={updatedVideo}
        onLike={handleLike}
        onComment={handleComment}
        onShare={handleShare}
        userLocation={userLocation}
        onAvatarPress={onAvatarPress}
        hideUnlikeButton={hideUnlikeButton}
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>
              Comments ({commentsCount})
            </Text>
            <Pressable onPress={() => setShowComments(false)}>
              <IconSymbol name="xmark" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView 
            ref={scrollViewRef}
            style={styles.commentsList}
            contentContainerStyle={styles.commentsListContent}
            keyboardShouldPersistTaps="handled"
          >
            {loadingComments ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading comments...</Text>
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <IconSymbol name="bubble.left" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to comment!</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <View style={styles.commentAvatar}>
                    {comment.users?.avatar_url ? (
                      <Image 
                        source={{ uri: comment.users.avatar_url }} 
                        style={styles.commentAvatarImage}
                      />
                    ) : (
                      <IconSymbol name="person.fill" size={20} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentUsername}>
                        @{comment.users?.username || 'Unknown'}
                      </Text>
                      <Text style={styles.commentTime}>
                        {formatTimeAgo(comment.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

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
                <IconSymbol name="paperplane.fill" size={20} color={colors.card} />
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
    height: SCREEN_HEIGHT,
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
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  commentAvatarImage: {
    width: '100%',
    height: '100%',
  },
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
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
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
});
