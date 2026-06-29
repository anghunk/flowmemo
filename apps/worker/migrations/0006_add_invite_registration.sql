CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL,
  used_by_user_id TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_created ON invite_codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes(used_by_user_id, used_at);

INSERT OR IGNORE INTO system_settings (key, value, created_at, updated_at)
VALUES ('invite_registration_enabled', 'false', datetime('now'), datetime('now'));
