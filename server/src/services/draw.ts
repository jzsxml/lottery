import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  appendAuditLog,
  getLastAuditHash,
  hashParticipantIds,
  hashWinnerIds,
} from "../lib/audit.js";
import { fisherYatesShuffle, randomSeedHex } from "../lib/hash.js";
import {
  buildEligiblePoolWithMeta,
  countEligibleSummary,
  type ParticipantRow,
} from "../lib/pool.js";

export type DrawResult = {
  roundId: number;
  prizeId: number;
  winners: { participantId: number; empNo: string; name: string; department: string; rank: number }[];
  poolSnapshotHash: string;
  randomSeedHex: string;
  resultHash: string;
};

export function executeDraw(
  db: Database.Database,
  eventId: number,
  prizeId: number
): DrawResult {
  const prize = db
    .prepare("SELECT * FROM prizes WHERE id = ? AND event_id = ?")
    .get(prizeId, eventId) as
    | {
        id: number;
        count_per_round: number;
        allow_repeat: number;
        name: string;
      }
    | undefined;

  if (!prize) {
    throw new Error("奖项不存在");
  }

  const event = db.prepare("SELECT allow_repeat FROM events WHERE id = ?").get(eventId) as {
    allow_repeat: number;
  };

  const { pool, meta } = buildEligiblePoolWithMeta(
    db,
    eventId,
    !!prize.allow_repeat,
    !!event.allow_repeat
  );
  return executeDrawWithPool(db, eventId, prizeId, pool, prize, meta.poolPolicy);
}

export function executeDrawWithPool(
  db: Database.Database,
  eventId: number,
  prizeId: number,
  pool: ParticipantRow[],
  prize?: {
    id: number;
    count_per_round: number;
    allow_repeat: number;
    name: string;
  },
  poolPolicy?: Record<string, unknown>
): DrawResult {
  const p =
    prize ??
    (db.prepare("SELECT * FROM prizes WHERE id = ? AND event_id = ?").get(prizeId, eventId) as
      | {
          id: number;
          count_per_round: number;
          allow_repeat: number;
          name: string;
        }
      | undefined);

  if (!p) {
    throw new Error("奖项不存在");
  }

  const k = p.count_per_round;
  if (pool.length < k) {
    throw new Error(`可抽奖人数不足：当前 ${pool.length} 人，需要 ${k} 人`);
  }

  const poolIds = pool.map((row) => row.id);
  const poolSnapshotHash = hashParticipantIds(poolIds);
  const seedHex = randomSeedHex();
  const roundNonce = randomUUID();

  const summary = countEligibleSummary(db, eventId);
  const resolvedPolicy =
    poolPolicy ?? {
      eligibilityMode: summary.mode,
      poolRefreshPolicy: "on_round_start",
      participantCountTotal: summary.totalActive,
      participantCountEligible: summary.eligible,
      poolCountAtDraw: pool.length,
      computedAt: new Date().toISOString(),
    };

  const canonical = {
    eventId,
    prizeId,
    k,
    poolSnapshotHash,
    poolCount: pool.length,
    poolParticipantIds: poolIds,
    randomSeedHex: seedHex,
    roundNonce,
    algorithm: "fisher-yates-v1",
    poolPolicy: resolvedPolicy,
  };

  const shuffled = fisherYatesShuffle(poolIds);
  const winnerIds = shuffled.slice(0, k);
  const resultHash = hashWinnerIds(winnerIds);
  const prevAuditHash = getLastAuditHash(db, eventId);

  const drawTransaction = db.transaction(() => {
    const round = db
      .prepare(
        `INSERT INTO draw_rounds (
          event_id, prize_id, status, k, pool_snapshot_hash, pool_count,
          random_seed_hex, round_nonce, canonical_payload_json, result_hash, prev_audit_hash,
          pool_policy_json
        ) VALUES (?, ?, 'locked', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        prizeId,
        k,
        poolSnapshotHash,
        pool.length,
        seedHex,
        roundNonce,
        JSON.stringify(canonical),
        resultHash,
        prevAuditHash,
        JSON.stringify(resolvedPolicy)
      );

    const roundId = Number(round.lastInsertRowid);
    const participantMap = new Map(pool.map((row) => [row.id, row]));

    const insertResult = db.prepare(
      `INSERT INTO draw_results (round_id, participant_id, rank_in_round) VALUES (?, ?, ?)`
    );

    winnerIds.forEach((pid, index) => {
      insertResult.run(roundId, pid, index + 1);
    });

    db.prepare("UPDATE prizes SET status = 'completed' WHERE id = ?").run(prizeId);

    appendAuditLog(db, eventId, "draw.execute", "draw_round", roundId, {
      prizeId,
      prizeName: p.name,
      roundId,
      k,
      poolSnapshotHash,
      randomSeedHex: seedHex,
      resultHash,
      winnerIds,
    });

    const winners = winnerIds.map((pid, index) => {
      const row = participantMap.get(pid)!;
      return {
        participantId: pid,
        empNo: row.emp_no,
        name: row.name,
        department: row.department,
        rank: index + 1,
      };
    });

    return { roundId, winners };
  });

  const { roundId, winners } = drawTransaction();

  return {
    roundId,
    prizeId,
    winners,
    poolSnapshotHash,
    randomSeedHex: seedHex,
    resultHash,
  };
}

/** Integrity check: stored hash matches persisted winners & pool snapshot in canonical. */
export function verifyRoundIntegrity(db: Database.Database, roundId: number): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const round = db
    .prepare(
      "SELECT canonical_payload_json, result_hash, pool_snapshot_hash FROM draw_rounds WHERE id = ?"
    )
    .get(roundId) as
    | { canonical_payload_json: string; result_hash: string; pool_snapshot_hash: string }
    | undefined;

  if (!round) {
    return { ok: false, errors: ["round not found"] };
  }

  const canonical = JSON.parse(round.canonical_payload_json) as {
    poolParticipantIds: number[];
    poolSnapshotHash: string;
    k: number;
  };

  const recomputedPool = hashParticipantIds(canonical.poolParticipantIds);
  if (recomputedPool !== round.pool_snapshot_hash) {
    errors.push("pool_snapshot_hash mismatch");
  }
  if (recomputedPool !== canonical.poolSnapshotHash) {
    errors.push("canonical pool hash mismatch");
  }

  const rows = db
    .prepare(
      `SELECT participant_id FROM draw_results
       WHERE round_id = ? AND is_voided = 0 ORDER BY rank_in_round ASC`
    )
    .all(roundId) as { participant_id: number }[];

  if (rows.length !== canonical.k) {
    errors.push(`winner count mismatch: ${rows.length} vs k=${canonical.k}`);
  }

  const winnerIds = rows.map((r) => r.participant_id);
  const recomputedResult = hashWinnerIds(winnerIds);
  if (recomputedResult !== round.result_hash) {
    errors.push("result_hash mismatch");
  }

  for (const id of winnerIds) {
    if (!canonical.poolParticipantIds.includes(id)) {
      errors.push(`winner ${id} not in pool snapshot`);
    }
  }

  return { ok: errors.length === 0, errors };
}