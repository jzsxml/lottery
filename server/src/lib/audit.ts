import type Database from "better-sqlite3";
import { hmacAuditHash, sha256Hex } from "./hash.js";

const AUDIT_SECRET = process.env.LOTTERY_AUDIT_SECRET ?? "lottery-local-audit-dev-secret";

export function appendAuditLog(
  db: Database.Database,
  eventId: number,
  action: string,
  entityType: string | null,
  entityId: number | null,
  payload: unknown
): void {
  const prev = db
    .prepare(
      "SELECT entry_hash FROM audit_logs WHERE event_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(eventId) as { entry_hash: string } | undefined;

  const payloadJson = JSON.stringify(payload);
  const canonical = JSON.stringify({
    action,
    entityType,
    entityId,
    payload: payload,
    at: new Date().toISOString(),
  });
  const entryHash = hmacAuditHash(AUDIT_SECRET, canonical, prev?.entry_hash ?? null);

  db.prepare(
    `INSERT INTO audit_logs (event_id, action, entity_type, entity_id, payload_json, prev_audit_hash, entry_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    action,
    entityType,
    entityId,
    payloadJson,
    prev?.entry_hash ?? null,
    entryHash
  );
}

export function getLastAuditHash(db: Database.Database, eventId: number): string | null {
  const row = db
    .prepare(
      "SELECT entry_hash FROM audit_logs WHERE event_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(eventId) as { entry_hash: string } | undefined;
  return row?.entry_hash ?? null;
}

export function hashParticipantIds(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  return sha256Hex(sorted.join(","));
}

export function hashWinnerIds(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  return sha256Hex(`winners:${sorted.join(",")}`);
}