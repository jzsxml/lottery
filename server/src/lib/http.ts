import type { FastifyRequest } from "fastify";
import { parseRole, type LotteryRole } from "./role.js";

export function roleFromRequest(req: FastifyRequest): LotteryRole | null {
  return parseRole(req.headers["x-lottery-role"]);
}