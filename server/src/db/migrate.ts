import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function runMigrations(db: Database.Database): void {
  if (!hasColumn(db, "events", "eligibility_mode")) {
    db.exec(`ALTER TABLE events ADD COLUMN eligibility_mode TEXT NOT NULL DEFAULT 'all'`);
  }
  if (!hasColumn(db, "events", "locked_at")) {
    db.exec(`ALTER TABLE events ADD COLUMN locked_at TEXT`);
  }

  if (!hasColumn(db, "draw_rounds", "pool_policy_json")) {
    db.exec(`ALTER TABLE draw_rounds ADD COLUMN pool_policy_json TEXT`);
  }

  if (!hasColumn(db, "events", "theme_json")) {
    db.exec(`ALTER TABLE events ADD COLUMN theme_json TEXT`);
  }
  if (!hasColumn(db, "events", "host_pin")) {
    db.exec(`ALTER TABLE events ADD COLUMN host_pin TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS draw_voids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES draw_rounds(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      operator_role TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}