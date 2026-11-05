CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  age SMALLINT CHECK (age IS NULL OR age >= 18),
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female')),
  bio TEXT NOT NULL DEFAULT '',
  photos TEXT[] NOT NULL DEFAULT '{}',
  region TEXT,
  district TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('like', 'skip', 'super_like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_id, target_id),
  CHECK (actor_id <> target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

CREATE TABLE IF NOT EXISTS ad_groups (
  chat_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  chat_type TEXT NOT NULL CHECK (chat_type IN ('group', 'supergroup', 'channel')),
  opted_in_by BIGINT NOT NULL,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_ad_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ad_delivery_log (
  chat_id BIGINT NOT NULL REFERENCES ad_groups(chat_id) ON DELETE CASCADE,
  local_day DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, local_day, scheduled_time)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_region_district_idx ON profiles (region, district);
CREATE INDEX IF NOT EXISTS interactions_actor_created_idx ON interactions (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_user1_idx ON matches (user1_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS matches_user2_idx ON matches (user2_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS ad_groups_enabled_idx ON ad_groups (enabled) WHERE enabled = TRUE;
