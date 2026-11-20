import type Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { appendAuditLog } from "../lib/audit.js";

export async function buildResultsWorkbook(db: Database.Database, eventId: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "lottery";
  wb.created = new Date();

  const summary = wb.addWorksheet("概览");
  summary.columns = [
    { header: "字段", key: "k", width: 24 },
    { header: "值", key: "v", width: 48 },
  ];
  const event = db.prepare("SELECT name FROM events WHERE id = ?").get(eventId) as { name: string };
  summary.addRows([
    { k: "活动", v: event.name },
    { k: "导出时间", v: new Date().toISOString() },
  ]);

  const prizes = db
    .prepare("SELECT id, name, count_per_round, status FROM prizes WHERE event_id = ? ORDER BY sort_order")
    .all(eventId) as { id: number; name: string; count_per_round: number; status: string }[];

  const winnersSheet = wb.addWorksheet("中奖明细");
  winnersSheet.columns = [
    { header: "奖项", key: "prize", width: 20 },
    { header: "名次", key: "rank", width: 8 },
    { header: "工号", key: "emp_no", width: 16 },
    { header: "姓名", key: "name", width: 14 },
    { header: "部门", key: "department", width: 16 },
    { header: "轮次ID", key: "round_id", width: 10 },
    { header: "抽奖时间", key: "drawn_at", width: 22 },
    { header: "结果哈希", key: "result_hash", width: 44 },
    { header: "随机种子", key: "seed", width: 44 },
  ];

  for (const prize of prizes) {
    const rows = db
      .prepare(
        `SELECT r.id AS round_id, r.created_at, r.result_hash, r.random_seed_hex,
                dr.rank_in_round, p.emp_no, p.name, p.department
         FROM draw_rounds r
         JOIN draw_results dr ON dr.round_id = r.id AND dr.is_voided = 0
         JOIN participants p ON p.id = dr.participant_id
         WHERE r.prize_id = ? AND r.event_id = ?
         ORDER BY dr.rank_in_round`
      )
      .all(prize.id, eventId) as {
      round_id: number;
      created_at: string;
      result_hash: string;
      random_seed_hex: string;
      rank_in_round: number;
      emp_no: string;
      name: string;
      department: string;
    }[];

    for (const row of rows) {
      winnersSheet.addRow({
        prize: prize.name,
        rank: row.rank_in_round,
        emp_no: row.emp_no,
        name: row.name,
        department: row.department,
        round_id: row.round_id,
        drawn_at: row.created_at,
        result_hash: row.result_hash,
        seed: row.random_seed_hex,
      });
    }
  }

  const auditSheet = wb.addWorksheet("轮次审计");
  auditSheet.columns = [
    { header: "轮次ID", key: "id", width: 10 },
    { header: "奖项", key: "prize", width: 20 },
    { header: "人数k", key: "k", width: 8 },
    { header: "池人数", key: "pool", width: 10 },
    { header: "池哈希", key: "pool_hash", width: 44 },
    { header: "结果哈希", key: "result_hash", width: 44 },
    { header: "时间", key: "at", width: 22 },
  ];

  const rounds = db
    .prepare(
      `SELECT r.*, pr.name AS prize_name FROM draw_rounds r
       JOIN prizes pr ON pr.id = r.prize_id
       WHERE r.event_id = ? ORDER BY r.id`
    )
    .all(eventId) as Array<{
    id: number;
    prize_name: string;
    k: number;
    pool_count: number;
    pool_snapshot_hash: string;
    result_hash: string;
    created_at: string;
  }>;

  for (const r of rounds) {
    auditSheet.addRow({
      id: r.id,
      prize: r.prize_name,
      k: r.k,
      pool: r.pool_count,
      pool_hash: r.pool_snapshot_hash,
      result_hash: r.result_hash,
      at: r.created_at,
    });
  }

  appendAuditLog(db, eventId, "export.results", "event", eventId, { roundCount: rounds.length });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}