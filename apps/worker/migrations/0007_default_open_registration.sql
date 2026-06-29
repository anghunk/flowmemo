INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('invite_registration_enabled', 'false', datetime('now'), datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = 'false',
  updated_at = datetime('now');
