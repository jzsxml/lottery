import type Database from "better-sqlite3";
import {
  buildPoolPolicy,
  isParticipantEligible,
  type EligibilityMode,
} from "./eligibility.js";

export type ParticipantRow = {
  id: number;
  emp_no: string;
  name: string;
  department: string;
  status: string;
  checked_in: number;
  eligible_override: number | null;
};

export type PoolBuildMeta = {
  poolPolicy: Record<string, unknown>;
  eligibilityMode: EligibilityMode;
};

export function getEventEligibilityMode(db: Database.Database, eventId: number): EligibilityMode {
  const row = db.prepare("SELECT eligibility_mode FROM events WHERE id = ?").get(eventId) as
    | { eligibility_mode: EligibilityMode }
    | undefined;
  return row?.eligibility_mode ?? "all";
}

export function isEventLocked(db: Database.Database, eventId: number): boolean {
  const row = db.prepare("SELECT locked_at FROM events WHERE id = ?").get(eventId) as
    | { locked_at: string | null }
    | undefined;
  return !!row?.locked_at;
}

function loadActiveParticipants(db: Database.Database, eventId: number): ParticipantRow[] {
  return db
    .prepare(
      `SELECT id, emp_no, name, department, status, checked_in, eligible_override
       FROM participants WHERE event_id = ? AND status = 'active'
       ORDER BY id ASC`
    )
    .all(eventId) as ParticipantRow[];
}

export function countEligibleSummary(db: Database.Database, eventId: number): {
  totalActive: number;
  eligible: number;
  mode: EligibilityMode;
} {
  const mode = getEventEligibilityMode(db, eventId);
  const active = loadActiveParticipants(db, eventId);
  const eligible = active.filter((p) => isParticipantEligible(p, mode)).length;
  return { totalActive: active.length, eligible, mode };
}

export function buildEligiblePool(
  db: Database.Database,
  eventId: number,
  prizeAllowRepeat: boolean,
  eventAllowRepeat: boolean
): ParticipantRow[] {
  const { pool } = buildEligiblePoolWithMeta(db, eventId, prizeAllowRepeat, eventAllowRepeat);
  return pool;
}

export function buildEligiblePoolWithMeta(
  db: Database.Database,
  eventId: number,
  prizeAllowRepeat: boolean,
  eventAllowRepeat: boolean
): { pool: ParticipantRow[]; meta: PoolBuildMeta } {
  const mode = getEventEligibilityMode(db, eventId);
  const active = loadActiveParticipants(db, eventId);
  const eligibleByMode = active.filter((p) => isParticipantEligible(p, mode));

  const allowRepeat = prizeAllowRepeat || eventAllowRepeat;

  let pool: ParticipantRow[];
  if (allowRepeat) {
    pool = eligibleByMode;
  } else {
    const wonIds = new Set(
      (
        db
          .prepare(
            `SELECT dr.participant_id FROM draw_results dr
             JOIN draw_rounds r ON r.id = dr.round_id
             WHERE r.event_id = ? AND dr.is_voided = 0`
          )
          .all(eventId) as { participant_id: number }[]
      ).map((r) => r.participant_id)
    );
    pool = eligibleByMode.filter((p) => !wonIds.has(p.id));
  }

  const meta: PoolBuildMeta = {
    eligibilityMode: mode,
    poolPolicy: buildPoolPolicy(mode, active.length, eligibleByMode.length),
  };

  return { pool, meta };
}