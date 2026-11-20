export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '年会抽奖',
  allow_repeat INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  emp_no TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  checked_in INTEGER NOT NULL DEFAULT 0,
  eligible_override INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, emp_no)
);

CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  count_per_round INTEGER NOT NULL DEFAULT 1,
  allow_repeat INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS draw_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  prize_id INTEGER NOT NULL REFERENCES prizes(id),
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('ready', 'drawing', 'locked', 'voided')),
  k INTEGER NOT NULL,
  pool_snapshot_hash TEXT NOT NULL,
  pool_count INTEGER NOT NULL,
  random_seed_hex TEXT NOT NULL,
  round_nonce TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'fisher-yates-v1',
  canonical_payload_json TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  prev_audit_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS draw_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES draw_rounds(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  rank_in_round INTEGER NOT NULL,
  is_voided INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, rank_in_round)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_results_event_winner
  ON draw_results (participant_id, round_id)
  WHERE is_voided = 0;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  payload_json TEXT,
  prev_audit_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_prizes_event ON prizes(event_id);
CREATE INDEX IF NOT EXISTS idx_draw_rounds_event ON draw_rounds(event_id);

CREATE TABLE IF NOT EXISTS screen_state (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle', 'rolling', 'slowing', 'result')),
  prize_id INTEGER REFERENCES prizes(id),
  prize_name TEXT,
  round_id INTEGER REFERENCES draw_rounds(id),
  pool_display_json TEXT,
  frozen_pool_ids_json TEXT,
  winners_json TEXT,
  draw_meta_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;