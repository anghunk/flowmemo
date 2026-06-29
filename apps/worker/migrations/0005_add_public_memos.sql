CREATE TABLE IF NOT EXISTS public_memos (
  public_id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(public_id) = 10)
);

CREATE INDEX IF NOT EXISTS idx_public_memos_user_created ON public_memos(user_id, created_at DESC);
