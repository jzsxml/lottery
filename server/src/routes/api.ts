import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templatesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/templates"
);
import { getDefaultEventId } from "../db/index.js";
import { executeDraw, verifyRoundIntegrity } from "../services/draw.js";
import { buildResultsWorkbook } from "../services/export.js";
import { importParticipants, parseCsv, parseExcel } from "../services/import.js";
import type { EligibilityMode } from "../lib/eligibility.js";
import { ELIGIBILITY_LABELS } from "../lib/eligibility.js";
import { appendAuditLog } from "../lib/audit.js";
import { roleFromRequest } from "../lib/http.js";
import { assertRole } from "../lib/role.js";
import {
  buildEligiblePoolWithMeta,
  countEligibleSummary,
  isEventLocked,
} from "../lib/pool.js";
import { assertHostPinIfRequired, getHostPin } from "../lib/host-pin.js";
import { escapeSqlLike, timingSafeEqualString } from "../lib/secure.js";
import { mergeEventTheme } from "../lib/theme-merge.js";
import { parseThemeJson, type EventTheme } from "../lib/theme.js";
import { listSphereEffects } from "../lib/sphere-effects.js";
import { listSphereRollModes } from "../lib/sphere-roll-modes.js";
import { listThemePresets } from "../lib/theme-presets.js";
import { voidRound } from "../services/void-round.js";

export function registerApiRoutes(app: FastifyInstance, db: Database.Database): void {
  const eventId = () => getDefaultEventId(db);

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/templates/participants.csv", async (_req, reply) => {
    const filePath = path.join(templatesDir, "participants-import-template.csv");
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "template not found" });
    }
    const body = fs.readFileSync(filePath);
    const withBom = Buffer.concat([Buffer.from("\ufeff", "utf8"), body]);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="participants-import-template.csv"')
      .send(withBom);
  });

  app.get("/api/templates/participants.xlsx", async (_req, reply) => {
    const filePath = path.join(templatesDir, "participants-import-template.xlsx");
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "template not found" });
    }
    const buf = fs.readFileSync(filePath);
    return reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header("Content-Disposition", 'attachment; filename="participants-import-template.xlsx"')
      .send(buf);
  });

  app.get("/api/event", async () => {
    const id = eventId();
    const row = db
      .prepare(
        `SELECT id, name, allow_repeat, eligibility_mode, locked_at, theme_json, created_at
         FROM events WHERE id = ?`
      )
      .get(id);
    const summary = countEligibleSummary(db, id);
    return {
      event: row,
      eligibilityLabel: ELIGIBILITY_LABELS[(row as { eligibility_mode: EligibilityMode }).eligibility_mode],
      summary,
    };
  });

  app.get("/api/event/eligible-summary", async () => countEligibleSummary(db, eventId()));

  app.get("/api/event/theme/presets", async () => ({ items: listThemePresets() }));

  app.get("/api/event/sphere/effects", async () => ({ items: listSphereEffects() }));

  app.get("/api/event/sphere/roll-modes", async () => ({ items: listSphereRollModes() }));

  app.get("/api/event/theme", async () => {
    const id = eventId();
    const row = db.prepare("SELECT theme_json, host_pin FROM events WHERE id = ?").get(id) as {
      theme_json: string | null;
      host_pin: string | null;
    };
    return {
      theme: parseThemeJson(row?.theme_json),
      hostPinRequired: !!getHostPin(db, id),
    };
  });

  app.patch("/api/event/theme", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as {
      theme?: Partial<EventTheme>;
      host_pin?: string | null;
      confirm?: boolean;
    };
    if (!body.confirm) return reply.code(400).send({ error: "需要 confirm: true" });
    const id = eventId();
    const row = db.prepare("SELECT theme_json FROM events WHERE id = ?").get(id) as {
      theme_json: string | null;
    };
    const next = mergeEventTheme(row?.theme_json, body.theme);
    let hostPinUpdate: string | null | undefined = undefined;
    if (body.host_pin !== undefined) {
      hostPinUpdate = body.host_pin?.trim() ? body.host_pin.trim() : null;
    }
    if (hostPinUpdate !== undefined) {
      db.prepare(`UPDATE events SET theme_json = ?, host_pin = ? WHERE id = ?`).run(
        JSON.stringify(next),
        hostPinUpdate,
        id
      );
    } else {
      db.prepare(`UPDATE events SET theme_json = ? WHERE id = ?`).run(JSON.stringify(next), id);
    }
    appendAuditLog(db, id, "event.theme", "event", id, { role, title: next.title });
    return { ok: true, theme: next, hostPinRequired: !!getHostPin(db, id) };
  });

  app.get("/api/host/config", async () => ({
    hostPinRequired: !!getHostPin(db, eventId()),
  }));

  app.post("/api/host/verify", async (req, reply) => {
    const body = req.body as { pin?: string };
    const required = getHostPin(db, eventId());
    if (!required) return { ok: true };
    if (body.pin && timingSafeEqualString(body.pin.trim(), required)) return { ok: true };
    return reply.code(401).send({ error: "PIN 错误" });
  });

  app.patch("/api/event/settings", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const id = eventId();
    if (isEventLocked(db, id)) {
      return reply.code(409).send({ error: "活动已锁定，无法修改资格/重复规则" });
    }
    const body = req.body as {
      allow_repeat?: boolean;
      eligibility_mode?: EligibilityMode;
      confirm?: boolean;
    };
    if (!body.confirm) {
      return reply.code(400).send({ error: "需要 confirm: true 二次确认" });
    }
    const existing = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as {
      allow_repeat: number;
      eligibility_mode: EligibilityMode;
    };
    const allow_repeat =
      body.allow_repeat !== undefined ? (body.allow_repeat ? 1 : 0) : existing.allow_repeat;
    const eligibility_mode = body.eligibility_mode ?? existing.eligibility_mode;
  const validModes: EligibilityMode[] = ["all", "checked_in_only", "manual_eligible", "hybrid"];
    if (!validModes.includes(eligibility_mode)) {
      return reply.code(400).send({ error: "无效的 eligibility_mode" });
    }
    db.prepare(
      `UPDATE events SET allow_repeat = ?, eligibility_mode = ? WHERE id = ?`
    ).run(allow_repeat, eligibility_mode, id);
    appendAuditLog(db, id, "event.settings", "event", id, {
      allow_repeat,
      eligibility_mode,
      role,
    });
    return { ok: true, summary: countEligibleSummary(db, id) };
  });

  app.post("/api/event/lock", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as { confirm?: boolean };
    if (!body?.confirm) return reply.code(400).send({ error: "需要 confirm: true" });
    const id = eventId();
    db.prepare(`UPDATE events SET locked_at = datetime('now') WHERE id = ?`).run(id);
    appendAuditLog(db, id, "event.lock", "event", id, { role });
    return { ok: true };
  });

  app.post("/api/event/unlock", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as { confirm?: boolean };
    if (!body?.confirm) return reply.code(400).send({ error: "需要 confirm: true" });
    const id = eventId();
    db.prepare(`UPDATE events SET locked_at = NULL WHERE id = ?`).run(id);
    appendAuditLog(db, id, "event.unlock", "event", id, { role });
    return { ok: true };
  });

  app.get("/api/participants", async (req) => {
    const { q } = req.query as { q?: string };
    const id = eventId();
    let sql = `SELECT id, emp_no, name, department, status, checked_in, eligible_override FROM participants WHERE event_id = ?`;
    const params: unknown[] = [id];
    if (q?.trim()) {
      sql += ` AND (name LIKE ? ESCAPE '\\' OR emp_no LIKE ? ESCAPE '\\' OR department LIKE ? ESCAPE '\\')`;
      const like = `%${escapeSqlLike(q.trim())}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY id ASC";
    return { items: db.prepare(sql).all(...params) };
  });

  app.patch("/api/participants/:participantId", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const participantId = Number((req.params as { participantId: string }).participantId);
    const body = req.body as { checked_in?: boolean; eligible_override?: boolean | null };
    const id = eventId();
    const row = db
      .prepare("SELECT id FROM participants WHERE id = ? AND event_id = ?")
      .get(participantId, id);
    if (!row) return reply.code(404).send({ error: "not found" });

    if (body.checked_in !== undefined) {
      db.prepare(
        `UPDATE participants SET checked_in = ? WHERE id = ? AND event_id = ?`
      ).run(body.checked_in ? 1 : 0, participantId, id);
    }
    if (body.eligible_override !== undefined) {
      const v =
        body.eligible_override === null ? null : body.eligible_override ? 1 : 0;
      db.prepare(
        `UPDATE participants SET eligible_override = ? WHERE id = ? AND event_id = ?`
      ).run(v, participantId, id);
    }
    appendAuditLog(db, id, "participant.update", "participant", participantId, {
      body,
      role,
    });
    return { ok: true };
  });

  app.post("/api/participants/bulk-checkin", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator", "host"]);
      assertHostPinIfRequired(db, eventId(), req);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as { ids?: number[]; checked_in?: boolean };
    if (!body.ids?.length) return reply.code(400).send({ error: "ids 必填" });
    const id = eventId();
    const stmt = db.prepare(
      `UPDATE participants SET checked_in = ? WHERE event_id = ? AND id = ?`
    );
    const tx = db.transaction(() => {
      for (const pid of body.ids!) {
        stmt.run(body.checked_in ? 1 : 0, id, pid);
      }
      appendAuditLog(db, id, "participants.bulk_checkin", "event", id, {
        count: body.ids!.length,
        checked_in: body.checked_in,
        role,
      });
    });
    tx();
    return { ok: true, summary: countEligibleSummary(db, id) };
  });

  app.delete("/api/participants", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const id = eventId();
    const count = db.prepare("SELECT COUNT(*) as c FROM draw_rounds WHERE event_id = ?").get(id) as {
      c: number;
    };
    if (count.c > 0) {
      return reply.code(409).send({ error: "已有抽奖记录，无法清空名单" });
    }
    db.prepare("DELETE FROM participants WHERE event_id = ?").run(id);
    appendAuditLog(db, id, "participants.clear", "event", id, {});
    return { ok: true };
  });

  app.post("/api/participants/import", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: "请上传 CSV 或 Excel 文件" });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const filename = data.filename.toLowerCase();

    let rows;
    try {
      if (filename.endsWith(".csv")) {
        rows = parseCsv(buffer);
      } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
        rows = parseExcel(buffer);
      } else {
        return reply.code(400).send({ error: "仅支持 .csv / .xlsx" });
      }
    } catch (e) {
      return reply.code(400).send({ error: `解析失败: ${(e as Error).message}` });
    }

    if (rows.length === 0) {
      return reply.code(400).send({ error: "未解析到有效行（需工号、姓名列）" });
    }
    const MAX_IMPORT = 500;
    if (rows.length > MAX_IMPORT) {
      return reply
        .code(400)
        .send({ error: `单次最多导入 ${MAX_IMPORT} 行，当前 ${rows.length} 行` });
    }

    const summary = importParticipants(db, eventId(), rows);
    return { summary, sample: rows.slice(0, 3) };
  });

  app.get("/api/prizes", async () => {
    const items = db
      .prepare(
        `SELECT * FROM prizes WHERE event_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(eventId());
    return { items };
  });

  app.post("/api/prizes", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as {
      name?: string;
      sort_order?: number;
      count_per_round?: number;
      allow_repeat?: boolean;
    };
    if (!body.name?.trim()) {
      return reply.code(400).send({ error: "奖项名称必填" });
    }
    const id = eventId();
    const maxOrder = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM prizes WHERE event_id = ?")
      .get(id) as { m: number };
    const sortOrder = body.sort_order ?? maxOrder.m + 1;
    const count = Math.max(1, body.count_per_round ?? 1);
    const result = db
      .prepare(
        `INSERT INTO prizes (event_id, name, sort_order, count_per_round, allow_repeat, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      )
      .run(id, body.name.trim(), sortOrder, count, body.allow_repeat ? 1 : 0);
    const prizeId = Number(result.lastInsertRowid);
    appendAuditLog(db, id, "prize.create", "prize", prizeId, body);
    return { id: prizeId };
  });

  app.patch("/api/prizes/:prizeId", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const prizeId = Number((req.params as { prizeId: string }).prizeId);
    const body = req.body as Partial<{
      name: string;
      sort_order: number;
      count_per_round: number;
      allow_repeat: boolean;
      status: string;
    }>;
    const existing = db
      .prepare("SELECT * FROM prizes WHERE id = ? AND event_id = ?")
      .get(prizeId, eventId());
    if (!existing) return reply.code(404).send({ error: "not found" });
    const rounds = db
      .prepare("SELECT id FROM draw_rounds WHERE prize_id = ? LIMIT 1")
      .get(prizeId);
    if (rounds && (body.count_per_round != null || body.allow_repeat != null)) {
      return reply.code(409).send({ error: "该奖项已抽奖，不能修改人数/重复规则" });
    }
    const name = body.name?.trim() ?? (existing as { name: string }).name;
    const sort_order = body.sort_order ?? (existing as { sort_order: number }).sort_order;
    const count_per_round =
      body.count_per_round ?? (existing as { count_per_round: number }).count_per_round;
    const allow_repeat =
      body.allow_repeat !== undefined
        ? body.allow_repeat
          ? 1
          : 0
        : (existing as { allow_repeat: number }).allow_repeat;
    const status = body.status ?? (existing as { status: string }).status;
    db.prepare(
      `UPDATE prizes SET name = ?, sort_order = ?, count_per_round = ?, allow_repeat = ?, status = ? WHERE id = ?`
    ).run(name, sort_order, count_per_round, allow_repeat, status, prizeId);
    appendAuditLog(db, eventId(), "prize.update", "prize", prizeId, body);
    return { ok: true };
  });

  app.delete("/api/prizes/:prizeId", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const prizeId = Number((req.params as { prizeId: string }).prizeId);
    const drawn = db.prepare("SELECT id FROM draw_rounds WHERE prize_id = ? LIMIT 1").get(prizeId);
    if (drawn) return reply.code(409).send({ error: "该奖项已有抽奖记录" });
    db.prepare("DELETE FROM prizes WHERE id = ? AND event_id = ?").run(prizeId, eventId());
    appendAuditLog(db, eventId(), "prize.delete", "prize", prizeId, {});
    return { ok: true };
  });

  app.get("/api/prizes/:prizeId/pool", async (req, reply) => {
    const prizeId = Number((req.params as { prizeId: string }).prizeId);
    const id = eventId();
    const prize = db.prepare("SELECT * FROM prizes WHERE id = ? AND event_id = ?").get(prizeId, id) as
      | { allow_repeat: number }
      | undefined;
    if (!prize) return reply.code(404).send({ error: "not found" });
    const event = db.prepare("SELECT allow_repeat FROM events WHERE id = ?").get(id) as {
      allow_repeat: number;
    };
    const { pool, meta } = buildEligiblePoolWithMeta(
      db,
      id,
      !!prize.allow_repeat,
      !!event.allow_repeat
    );
    return { count: pool.length, items: pool.slice(0, 50), poolPolicy: meta.poolPolicy };
  });

  app.post("/api/prizes/:prizeId/draw", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator", "host"]);
      assertHostPinIfRequired(db, eventId(), req);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const prizeId = Number((req.params as { prizeId: string }).prizeId);
    try {
      const result = executeDraw(db, eventId(), prizeId);
      return result;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get("/api/rounds", async () => {
    const rounds = db
      .prepare(
        `SELECT r.id, r.prize_id, r.k, r.pool_count, r.result_hash, r.random_seed_hex, r.created_at,
                r.status, p.name AS prize_name
         FROM draw_rounds r
         JOIN prizes p ON p.id = r.prize_id
         WHERE r.event_id = ?
         ORDER BY r.id DESC`
      )
      .all(eventId());
    return { items: rounds };
  });

  app.get("/api/rounds/:roundId", async (req, reply) => {
    const roundId = Number((req.params as { roundId: string }).roundId);
    const round = db
      .prepare(
        `SELECT r.*, p.name AS prize_name FROM draw_rounds r
         JOIN prizes p ON p.id = r.prize_id
         WHERE r.id = ? AND r.event_id = ?`
      )
      .get(roundId, eventId());
    if (!round) return reply.code(404).send({ error: "not found" });
    const winners = db
      .prepare(
        `SELECT dr.rank_in_round, pt.emp_no, pt.name, pt.department
         FROM draw_results dr
         JOIN participants pt ON pt.id = dr.participant_id
         WHERE dr.round_id = ? AND dr.is_voided = 0
         ORDER BY dr.rank_in_round`
      )
      .all(roundId);
  const verification = verifyRoundIntegrity(db, roundId);
    return { round, winners, verification };
  });

  app.post("/api/rounds/:roundId/void", async (req, reply) => {
    const role = roleFromRequest(req);
    try {
      assertRole(role, ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const roundId = Number((req.params as { roundId: string }).roundId);
    const body = req.body as { reason?: string; confirm?: boolean };
    if (!body.confirm) return reply.code(400).send({ error: "需要 confirm: true" });
    try {
      const result = voidRound(db, eventId(), roundId, body.reason ?? "", role!);
      return { ok: true, ...result };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get("/api/audit-logs", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const items = db
      .prepare(
        `SELECT id, action, entity_type, entity_id, payload_json, entry_hash, created_at
         FROM audit_logs WHERE event_id = ? ORDER BY id DESC LIMIT 100`
      )
      .all(eventId());
    return { items };
  });

  app.get("/api/export/results.xlsx", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator"]);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const buf = await buildResultsWorkbook(db, eventId());
    const filename = `lottery-results-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buf);
  });
}