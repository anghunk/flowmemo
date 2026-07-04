CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(name) > 0 AND length(name) <= 64)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_created ON api_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash_active ON api_tokens(token_hash, revoked_at);
