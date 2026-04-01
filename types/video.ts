export interface VideoPost {
  id: string;
  videoUrl?: string;
  video_url?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  caption: string;
  tags: string[];
  library_id?: number;
  latitude?: number;
  longitude?: number;
  location_latitude?: number;
  location_longitude?: number;
  locationName?: string;
  location_name?: string;
  locationPrivacy?: 'exact' | '3km' | '10km';
  location_privacy?: 'exact' | '3km' | '10km';
  location?: {
    latitude: number;
    longitude: number;
    name: string;
    privacy?: 'exact' | 'exact' | '3km' | '10km';
  };
  users?: {
    id: string;
    username: string;
    // display_name REMOVED ❌
    avatar_url?: string;
    is_premium?: boolean;
  } | Array<{
    id: string;
    username: string;
    // display_name REMOVED ❌
    avatar_url?: string;
    is_premium?: boolean;
  }>;
  user?: {
    id: string;
    username: string;
    // displayName REMOVED ❌
    avatar_url?: string;
  };
  author?: {
    id: string;
    username: string;
    avatar?: string;
  };
  user_id?: string;
  likes?: number;
  likes_count?: number;
  comments?: number;
  comments_count?: number;
  shares?: number;
  shares_count?: number;
  views?: number;
  views_count?: number;
  isLiked: boolean;
  createdAt: Date | string;
  created_at?: string;
  expires_at?: string;
  duration?: number;
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'flagged';
  moderationStatus?: 'pending' | 'approved' | 'rejected' | 'flagged';
  moderationResult?: {
    safe: boolean;
    categories: {
      adult: number;
      violence: number;
      hate: number;
      spam: number;
    };
    flagged: string[];
  };
  is_winner?: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  createdAt: Date;
  likes: number;
}

export interface UserProfile {
  id: string;
  username: string;
  // displayName REMOVED ❌
  bio: string;
  avatar?: string;
  followers: number;
  following: number;
  totalLikes: number;
  videosCount: number;
}