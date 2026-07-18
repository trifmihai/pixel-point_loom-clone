PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS feedback_comments (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL,
  project_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  parent_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_role TEXT NOT NULL DEFAULT 'guest' CHECK(author_role IN ('guest', 'admin')),
  body TEXT NOT NULL,
  timestamp_seconds REAL NOT NULL CHECK(timestamp_seconds >= 0),
  position_x REAL CHECK(position_x IS NULL OR (position_x >= 0 AND position_x <= 100)),
  position_y REAL CHECK(position_y IS NULL OR (position_y >= 0 AND position_y <= 100)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  admin_read_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES feedback_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_share_token
  ON feedback_comments(share_token);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_video_id
  ON feedback_comments(video_id);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_project_id
  ON feedback_comments(project_id);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_parent_id
  ON feedback_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_status
  ON feedback_comments(status);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_admin_read_at
  ON feedback_comments(admin_read_at);
