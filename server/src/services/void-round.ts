import type Database from "better-sqlite3";
import { appendAuditLog } from "../lib/audit.js";
import type { LotteryRole } from "../lib/role.js";

/** Void entire round and reopen prize for re-draw. */
export function voidRound(
  db: Database.Database,
  eventId: number,
  roundId: number,
  reason: string,
  role: LotteryRole
): { prizeId: number } {
  if (!reason.trim()) throw new Error("必须填写作废原因");

  const round = db
    .prepare("SELECT * FROM draw_rounds WHERE id = ? AND event_id = ?")
    .get(roundId, eventId) as
    | { id: number; prize_id: number; status: string }
    | undefined;

  if (!round) throw new Error("轮次不存在");
  if (round.status === "voided") throw new Error("该轮次已作废");

  const tx = db.transaction(() => {
    db.prepare("UPDATE draw_results SET is_voided = 1 WHERE round_id = ?").run(roundId);
    db.prepare("UPDATE draw_rounds SET status = 'voided' WHERE id = ?").run(roundId);
    db.prepare("UPDATE prizes SET status = 'pending' WHERE id = ?").run(round.prize_id);
    db.prepare(
      `INSERT INTO draw_voids (round_id, reason, operator_role) VALUES (?, ?, ?)`
    ).run(roundId, reason.trim(), role);
    appendAuditLog(db, eventId, "round.void", "draw_round", roundId, {
      reason: reason.trim(),
      role,
      prizeId: round.prize_id,
    });
  });

  tx();
  return { prizeId: round.prize_id };
}