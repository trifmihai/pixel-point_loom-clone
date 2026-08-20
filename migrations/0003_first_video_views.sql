PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS first_video_views (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  video_id TEXT NOT NULL UNIQUE,
  share_token TEXT NOT NULL,
  viewer_name TEXT,
  viewer_email TEXT,
  first_viewed_at TEXT NOT NULL,
  admin_read_at TEXT,
  email_status TEXT NOT NULL DEFAULT 'not-configured'
    CHECK(email_status IN ('not-configured', 'pending', 'sent', 'failed')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_first_video_views_project_id
  ON first_video_views(project_id);

CREATE INDEX IF NOT EXISTS idx_first_video_views_first_viewed_at
  ON first_video_views(first_viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_first_video_views_admin_read_at
  ON first_video_views(admin_read_at);
