export type Bindings = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  IMAGES: R2Bucket;
  APP_ENV: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
  PUBLIC_IMAGE_BASE_URL?: string;
  ADMIN_USER_IDS?: string;
  DEFAULT_ADMIN_ACCOUNT?: string;
  DEFAULT_ADMIN_PASSWORD?: string;
};

export type Variables = {
  user: {
    id: string;
    account: string;
  };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export type DbUser = {
  id: string;
  account: string;
  nickname: string | null;
  password_hash: string;
  password_salt: string;
  password_algorithm: string;
  password_iterations: number;
  role: string;
  plan: string;
  membership_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbMemo = {
  id: string;
  user_id: string;
  content: string;
  pinned: number;
  public_id?: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbPublicMemo = {
  public_id: string;
  memo_id: string;
  user_id: string;
  published_at?: string;
  created_at: string;
};

export type DbTag = {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  icon: string | null;
  memo_count?: number;
  created_at: string;
  updated_at: string;
};

export type DbInviteCode = {
  code: string;
  created_by_user_id: string;
  used_by_user_id: string | null;
  used_at: string | null;
  created_at: string;
};
