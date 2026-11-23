CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  per_minute_limit INTEGER NOT NULL DEFAULT 20,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_counters (
  key_id TEXT PRIMARY KEY,
  minute_start INTEGER NOT NULL,
  day_start INTEGER NOT NULL,
  minute_used INTEGER NOT NULL DEFAULT 0,
  day_used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quota_daily (
  day TEXT PRIMARY KEY,
  calls_used INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  template TEXT NOT NULL,
  model_set TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  calls_spent INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL,
  failed_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_battles_key_created ON battles(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_cache_key ON battles(cache_key);

CREATE TABLE IF NOT EXISTS votes (
  battle_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  winner_model TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (battle_id, api_key_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_model ON votes(winner_model);

CREATE TABLE IF NOT EXISTS vote_events (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  winner_model TEXT NOT NULL,
  previous_winner TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id TEXT NOT NULL,
  battle_id TEXT NOT NULL,
  model TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_key_created ON usage(api_key_id, created_at DESC);
