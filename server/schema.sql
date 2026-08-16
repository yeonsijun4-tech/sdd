CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10000 CHECK (points >= 0),
  max_streak INTEGER NOT NULL DEFAULT 0,
  max_session_gain INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  bonus_claimed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_number INTEGER NOT NULL,
  session_points INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id, is_active);
