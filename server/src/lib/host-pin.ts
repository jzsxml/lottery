import type { FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import { roleFromRequest } from "./http.js";
import { timingSafeEqualString } from "./secure.js";

export function getHostPin(db: Database.Database, eventId: number): string | null {
  const row = db.prepare("SELECT host_pin FROM events WHERE id = ?").get(eventId) as
    | { host_pin: string | null }
    | undefined;
  const pin = row?.host_pin?.trim();
  return pin ? pin : null;
}

export function assertHostPinIfRequired(
  db: Database.Database,
  eventId: number,
  req: FastifyRequest
): void {
  const required = getHostPin(db, eventId);
  if (!required) return;

  const role = roleFromRequest(req);
  if (role === "admin" || role === "operator") return;

  const header = req.headers["x-host-pin"];
  const provided = (Array.isArray(header) ? header[0] : header)?.trim() ?? "";
  if (!provided || !timingSafeEqualString(provided, required)) {
    throw new Error("主持 PIN 不正确或未提供");
  }
}