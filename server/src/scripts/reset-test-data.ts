/**
 * 清空活动测试数据（抽奖记录、大屏状态、名单；保留活动设置与奖项定义）。
 * Usage: npm run reset:test -w server
 *   RESET_PRIZES=1  — 同时删除所有奖项
 *   RESET_AUDIT=1   — 同时清空操作日志
 */
import { appendAuditLog } from "../lib/audit.js";
import { openDatabase, getDefaultEventId } from "../db/index.js";

const db = openDatabase();
const eventId = getDefaultEventId(db);

const resetPrizes = process.env.RESET_PRIZES === "1";
const resetAudit = process.env.RESET_AUDIT === "1";

const before = {
  participants: (db.prepare("SELECT COUNT(*) AS c FROM participants WHERE event_id = ?").get(eventId) as {
    c: number;
  }).c,
  rounds: (db.prepare("SELECT COUNT(*) AS c FROM draw_rounds WHERE event_id = ?").get(eventId) as { c: number })
    .c,
  prizes: (db.prepare("SELECT COUNT(*) AS c FROM prizes WHERE event_id = ?").get(eventId) as { c: number }).c,
};

const tx = db.transaction(() => {
  db.prepare(
    `DELETE FROM draw_voids WHERE round_id IN (SELECT id FROM draw_rounds WHERE event_id = ?)`
  ).run(eventId);

  db.prepare(
    `UPDATE screen_state SET
      phase = 'idle',
      prize_id = NULL,
      prize_name = NULL,
      round_id = NULL,
      pool_display_json = NULL,
      frozen_pool_ids_json = NULL,
      winners_json = NULL,
      draw_meta_json = NULL,
      updated_at = datetime('now')
     WHERE event_id = ?`
  ).run(eventId);

  db.prepare(
    `DELETE FROM draw_results WHERE round_id IN (SELECT id FROM draw_rounds WHERE event_id = ?)`
  ).run(eventId);

  db.prepare(`DELETE FROM draw_rounds WHERE event_id = ?`).run(eventId);

  if (!db.prepare("SELECT 1 FROM screen_state WHERE event_id = ?").get(eventId)) {
    db.prepare(`INSERT INTO screen_state (event_id, phase) VALUES (?, 'idle')`).run(eventId);
  }

  db.prepare(`DELETE FROM participants WHERE event_id = ?`).run(eventId);

  if (resetPrizes) {
    db.prepare(`DELETE FROM prizes WHERE event_id = ?`).run(eventId);
  } else {
    db.prepare(`UPDATE prizes SET status = 'pending' WHERE event_id = ?`).run(eventId);
  }

  if (resetAudit) {
    db.prepare(`DELETE FROM audit_logs WHERE event_id = ?`).run(eventId);
  }
});

tx();

appendAuditLog(db, eventId, "data.reset_test", "event", eventId, {
  resetPrizes,
  resetAudit,
  cleared: before,
});

console.log("测试数据已清空（event_id=%d）", eventId);
console.log("  已删除参与者: %d 人", before.participants);
console.log("  已删除抽奖轮次: %d", before.rounds);
if (resetPrizes) console.log("  已删除奖项: %d", before.prizes);
else console.log("  奖项保留，状态已重置为 pending（共 %d 项）", before.prizes);
if (resetAudit) console.log("  操作日志已清空");
else console.log("  操作日志保留（设 RESET_AUDIT=1 可一并清空）");