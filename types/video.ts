
export interface VideoPost {
  id: string;
  videoUrl: string;
  video_url?: string;
  thumbnailUrl?: string;
  caption: string;
  tags: string[];
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationPrivacy?: 'exact' | '3km' | '10km';
  location?: {
    latitude: number;
    longitude: number;
    name: string;
    privacy?: 'exact' | '3km' | '10km';
  };
  users?: {
    id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
  user?: {
    id: string;
    username: string;
    displayName?: string;
    avatar_url?: string;
  };
  author?: {
    id: string;
    username: string;
    avatar?: string;
  };
  likes: number;
  likes_count?: number;
  comments: number;
  comments_count?: number;
  shares: number;
  shares_count?: number;
  views?: number;
  views_count?: number;
  isLiked: boolean;
  createdAt: Date | string;
  duration?: number;
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
  displayName: string;
  bio: string;
  avatar?: string;
  followers: number;
  following: number;
  totalLikes: number;
  videosCount: number;
}
