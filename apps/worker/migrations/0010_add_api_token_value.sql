-- 保存完整 token 明文，供用户在偏好设置中随时查看和复制；旧数据为 NULL，无法回溯补齐
ALTER TABLE api_tokens ADD COLUMN token_value TEXT;
