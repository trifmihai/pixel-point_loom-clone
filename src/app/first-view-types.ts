export type FirstViewEmailStatus = "failed" | "not-configured" | "pending" | "sent";

export type FirstVideoViewRecord = {
  adminReadAt?: string;
  emailStatus: FirstViewEmailStatus;
  firstViewedAt: string;
  id: string;
  projectId: string;
  shareToken: string;
  viewerEmail?: string;
  viewerName?: string;
  videoId: string;
};

export type FirstViewActivity = FirstVideoViewRecord & {
  projectName: string;
  videoTitle: string;
};

export type FirstViewActivityResponse = {
  emailConfigured: boolean;
  events: FirstViewActivity[];
  unreadCount: number;
};

export type FirstVideoViewRow = {
  admin_read_at: string | null;
  email_status: FirstViewEmailStatus;
  first_viewed_at: string;
  id: string;
  project_id: string;
  share_token: string;
  viewer_email: string | null;
  viewer_name: string | null;
  video_id: string;
};
