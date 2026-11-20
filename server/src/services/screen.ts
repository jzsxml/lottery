import type Database from "better-sqlite3";
import { appendAuditLog } from "../lib/audit.js";
import type { ScreenPhase, ScreenPoolPerson, ScreenState, ScreenWinner } from "../lib/screen-types.js";
import { buildEligiblePoolWithMeta, countEligibleSummary, type ParticipantRow } from "../lib/pool.js";
import { executeDrawWithPool } from "./draw.js";

type PersistRow = {
  phase: ScreenPhase;
  prize_id: number | null;
  prize_name: string | null;
  round_id: number | null;
  pool_display_json: string | null;
  frozen_pool_ids_json: string | null;
  winners_json: string | null;
  draw_meta_json: string | null;
  updated_at: string;
};

function rowToState(row: PersistRow): ScreenState {
  const pool = row.pool_display_json ? (JSON.parse(row.pool_display_json) as ScreenPoolPerson[]) : [];
  const winners = row.winners_json ? (JSON.parse(row.winners_json) as ScreenWinner[]) : [];
  const meta = row.draw_meta_json
    ? (JSON.parse(row.draw_meta_json) as { resultHash?: string })
  : null;
  return {
    phase: row.phase,
    prizeId: row.prize_id,
    prizeName: row.prize_name,
    roundId: row.round_id,
    pool,
    winners,
    resultHash: meta?.resultHash ?? null,
    updatedAt: row.updated_at,
  };
}

function ensureScreenRow(db: Database.Database, eventId: number): void {
  const exists = db.prepare("SELECT 1 FROM screen_state WHERE event_id = ?").get(eventId);
  if (!exists) {
    db.prepare(
      `INSERT INTO screen_state (event_id, phase) VALUES (?, 'idle')`
    ).run(eventId);
  }
}

export function loadScreenState(db: Database.Database, eventId: number): ScreenState {
  ensureScreenRow(db, eventId);
  const row = db.prepare("SELECT * FROM screen_state WHERE event_id = ?").get(eventId) as PersistRow;
  return rowToState(row);
}

function persistState(
  db: Database.Database,
  eventId: number,
  patch: {
    phase: ScreenPhase;
    prizeId?: number | null;
    prizeName?: string | null;
    roundId?: number | null;
    pool?: ScreenPoolPerson[];
    frozenPoolIds?: number[];
    winners?: ScreenWinner[];
    drawMeta?: { resultHash: string; poolSnapshotHash: string; randomSeedHex: string };
  }
): ScreenState {
  ensureScreenRow(db, eventId);
  db.prepare(
    `UPDATE screen_state SET
      phase = ?,
      prize_id = ?,
      prize_name = ?,
      round_id = ?,
      pool_display_json = ?,
      frozen_pool_ids_json = ?,
      winners_json = ?,
      draw_meta_json = ?,
      updated_at = datetime('now')
     WHERE event_id = ?`
  ).run(
    patch.phase,
    patch.prizeId ?? null,
    patch.prizeName ?? null,
    patch.roundId ?? null,
    patch.pool ? JSON.stringify(patch.pool) : null,
    patch.frozenPoolIds ? JSON.stringify(patch.frozenPoolIds) : null,
    patch.winners ? JSON.stringify(patch.winners) : null,
    patch.drawMeta ? JSON.stringify(patch.drawMeta) : null,
    eventId
  );
  return loadScreenState(db, eventId);
}

function participantsFromIds(db: Database.Database, ids: number[]): ParticipantRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, emp_no, name, department, status, checked_in FROM participants
       WHERE id IN (${placeholders}) ORDER BY id ASC`
    )
    .all(...ids) as ParticipantRow[];
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rows;
}

function toDisplay(pool: ParticipantRow[]): ScreenPoolPerson[] {
  return pool.map((p) => ({
    id: p.id,
    emp_no: p.emp_no,
    name: p.name,
    department: p.department,
  }));
}

export class ScreenController {
  constructor(
    private db: Database.Database,
    private eventId: number,
    private broadcast: (state: ScreenState) => void
  ) {}

  getState(): ScreenState {
    return loadScreenState(this.db, this.eventId);
  }

  startRolling(prizeId: number): ScreenState {
    const current = this.getState();
    if (current.phase !== "idle" && current.phase !== "result") {
      throw new Error(`当前阶段为 ${current.phase}，无法开始滚动`);
    }

    const prize = this.db
      .prepare("SELECT * FROM prizes WHERE id = ? AND event_id = ?")
      .get(prizeId, this.eventId) as
      | { id: number; name: string; status: string; allow_repeat: number; count_per_round: number }
      | undefined;

    if (!prize) throw new Error("奖项不存在");
    if (prize.status === "completed") throw new Error("该奖项已抽取完毕");

    const event = this.db
      .prepare("SELECT allow_repeat FROM events WHERE id = ?")
      .get(this.eventId) as { allow_repeat: number };

    const { pool, meta } = buildEligiblePoolWithMeta(
      this.db,
      this.eventId,
      !!prize.allow_repeat,
      !!event.allow_repeat
    );

    if (pool.length < prize.count_per_round) {
      throw new Error(`可抽奖人数不足：${pool.length} / ${prize.count_per_round}`);
    }

    const display = toDisplay(pool);
    const state = persistState(this.db, this.eventId, {
      phase: "rolling",
      prizeId: prize.id,
      prizeName: prize.name,
      roundId: null,
      pool: display,
      frozenPoolIds: pool.map((p) => p.id),
      winners: [],
      drawMeta: undefined,
    });

    appendAuditLog(this.db, this.eventId, "screen.start", "prize", prizeId, {
      poolCount: pool.length,
      poolPolicy: meta.poolPolicy,
    });

    this.db.prepare("UPDATE prizes SET status = 'active' WHERE id = ?").run(prizeId);

    this.broadcast(state);
    return state;
  }

  stopAndDraw(): ScreenState {
    const current = this.getState();
    if (current.phase !== "rolling") {
      throw new Error("当前未在滚动，无法停止");
    }
    if (current.prizeId == null) throw new Error("缺少奖项信息");

    const row = this.db
      .prepare("SELECT frozen_pool_ids_json FROM screen_state WHERE event_id = ?")
      .get(this.eventId) as { frozen_pool_ids_json: string | null };

    const frozenIds = row.frozen_pool_ids_json
      ? (JSON.parse(row.frozen_pool_ids_json) as number[])
      : [];

    if (frozenIds.length === 0) throw new Error("抽奖池快照丢失");

    const pool = participantsFromIds(this.db, frozenIds);
    const summary = countEligibleSummary(this.db, this.eventId);
    const frozenPolicy = {
      eligibilityMode: summary.mode,
      poolRefreshPolicy: "on_round_start",
      participantCountTotal: summary.totalActive,
      participantCountEligible: summary.eligible,
      poolCountAtDraw: pool.length,
      frozenSnapshot: true,
      computedAt: new Date().toISOString(),
    };
    const draw = executeDrawWithPool(
      this.db,
      this.eventId,
      current.prizeId,
      pool,
      undefined,
      frozenPolicy
    );

    const state = persistState(this.db, this.eventId, {
      phase: "slowing",
      prizeId: current.prizeId,
      prizeName: current.prizeName,
      roundId: draw.roundId,
      pool: current.pool,
      frozenPoolIds: frozenIds,
      winners: draw.winners,
      drawMeta: {
        resultHash: draw.resultHash,
        poolSnapshotHash: draw.poolSnapshotHash,
        randomSeedHex: draw.randomSeedHex,
      },
    });

    appendAuditLog(this.db, this.eventId, "screen.stop", "draw_round", draw.roundId, {
      prizeId: current.prizeId,
      winnerCount: draw.winners.length,
    });

    this.broadcast(state);
    return state;
  }

  completeSlowing(): ScreenState {
    const current = this.getState();
    if (current.phase !== "slowing") {
      return current;
    }
    this.db
      .prepare(
        `UPDATE screen_state SET phase = 'result', updated_at = datetime('now') WHERE event_id = ?`
      )
      .run(this.eventId);
    const finalState = loadScreenState(this.db, this.eventId);
    this.broadcast(finalState);
    return finalState;
  }

  resetIdle(): ScreenState {
    ensureScreenRow(this.db, this.eventId);
    this.db
      .prepare(
        `UPDATE screen_state SET
          phase = 'idle', prize_id = NULL, prize_name = NULL, round_id = NULL,
          pool_display_json = NULL, frozen_pool_ids_json = NULL, winners_json = NULL,
          draw_meta_json = NULL, updated_at = datetime('now')
         WHERE event_id = ?`
      )
      .run(this.eventId);
    const state = loadScreenState(this.db, this.eventId);
    appendAuditLog(this.db, this.eventId, "screen.reset", "event", this.eventId, {});
    this.broadcast(state);
    return state;
  }
}