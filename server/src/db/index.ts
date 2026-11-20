import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate.js";
import { SCHEMA_SQL } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../data");

export function openDatabase(dbPath?: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const resolved = dbPath ?? path.join(dataDir, "lottery.db");
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  ensureDefaultEvent(db);
  return db;
}

function ensureDefaultEvent(db: Database.Database): void {
  const row = db.prepare("SELECT id FROM events LIMIT 1").get() as { id: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO events (name) VALUES (?)").run("年会抽奖");
  }
}

export type EventRow = {
  id: number;
  name: string;
  allow_repeat: number;
};

export function getDefaultEventId(db: Database.Database): number {
  const row = db.prepare("SELECT id FROM events ORDER BY id LIMIT 1").get() as { id: number };
  return row.id;
}