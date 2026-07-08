PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  client_name TEXT,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'unlisted',
  share_slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_email_updated_at
  ON projects(owner_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  gumlet_asset_id TEXT NOT NULL,
  gumlet_input TEXT,
  direct_video_url TEXT,
  description TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  start_time_seconds INTEGER,
  recommended_playback_speed REAL NOT NULL DEFAULT 1.5,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_videos_project_order
  ON videos(project_id, order_index ASC);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  video_id TEXT,
  passcode_hash TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_token
  ON share_links(token);

CREATE INDEX IF NOT EXISTS idx_share_links_project_id
  ON share_links(project_id);
