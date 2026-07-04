ALTER TABLE api_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'all';
ALTER TABLE api_tokens ADD COLUMN allowed_tags_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_scope ON api_tokens(user_id, scope);
