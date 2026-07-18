export type FeedbackAuthorRole = "admin" | "guest";
export type FeedbackStatus = "open" | "resolved";

export type FeedbackComment = {
  adminReadAt?: string;
  authorEmail?: string;
  authorName: string;
  authorRole: FeedbackAuthorRole;
  body: string;
  createdAt: string;
  deletedAt?: string;
  id: string;
  parentId?: string;
  positionX?: number;
  positionY?: number;
  projectId: string;
  shareToken: string;
  status: FeedbackStatus;
  timestampSeconds: number;
  updatedAt: string;
  videoId: string;
};

export type PublicFeedbackComment = Pick<
  FeedbackComment,
  | "authorName"
  | "authorRole"
  | "body"
  | "createdAt"
  | "id"
  | "parentId"
  | "positionX"
  | "positionY"
  | "status"
  | "timestampSeconds"
  | "updatedAt"
  | "videoId"
>;

export type CreatePublicFeedbackInput = {
  authorEmail?: string;
  authorName: string;
  body: string;
  positionX: number;
  positionY: number;
  timestampSeconds: number;
  videoId: string;
};

export type CreateAdminReplyInput = {
  body: string;
};

export type UpdateFeedbackInput = {
  deleted?: boolean;
  markRead?: boolean;
  status?: FeedbackStatus;
};

export type FeedbackVideoSummary = {
  openCount: number;
  projectId: string;
  resolvedCount: number;
  unreadCount: number;
  videoId: string;
};

export type FeedbackSummaryResponse = {
  videos: FeedbackVideoSummary[];
};

export type GuestFeedbackIdentity = {
  email: string;
  name: string;
};

export type FeedbackValidationIssue = {
  field: keyof CreatePublicFeedbackInput;
  message: string;
};

export type FeedbackCommentRow = {
  admin_read_at: string | null;
  author_email: string | null;
  author_name: string;
  author_role: FeedbackAuthorRole;
  body: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  parent_id: string | null;
  position_x: number | null;
  position_y: number | null;
  project_id: string;
  share_token: string;
  status: FeedbackStatus;
  timestamp_seconds: number;
  updated_at: string;
  video_id: string;
};

export type FeedbackCommentPatch = {
  adminReadAt?: string;
  deletedAt?: string;
  status?: FeedbackStatus;
  updatedAt: string;
};
