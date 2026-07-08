export type PlaybackSpeed = 1 | 1.25 | 1.5 | 1.75 | 2;

export type ProjectVisibility = "private" | "unlisted";

export type PortalVideo = {
  assetId: string;
  createdAt: string;
  description?: string;
  durationSeconds?: number;
  id: string;
  orderIndex: number;
  recommendedPlaybackSpeed: PlaybackSpeed;
  startTimeSeconds?: number;
  thumbnailUrl?: string;
  title: string;
  updatedAt: string;
};

export type PortalProject = {
  clientName?: string;
  createdAt: string;
  description?: string;
  id: string;
  name: string;
  shareSlug: string;
  updatedAt: string;
  videos: PortalVideo[];
  visibility: ProjectVisibility;
};

export type PortalCommentStatus = "open" | "resolved";

export type PortalComment = {
  authorEmail?: string;
  authorName: string;
  commentText: string;
  createdAt: string;
  id: string;
  projectId: string;
  status: PortalCommentStatus;
  timestampSeconds?: number;
  videoId: string;
};

export type ViewingProgressStatus = "in-progress" | "not-started" | "watched";

export type PortalData = {
  projects: PortalProject[];
};
