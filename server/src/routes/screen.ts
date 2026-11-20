import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { getDefaultEventId } from "../db/index.js";
import { roleFromRequest } from "../lib/http.js";
import { assertRole } from "../lib/role.js";
import { assertHostPinIfRequired } from "../lib/host-pin.js";
import { ScreenController } from "../services/screen.js";
import type { ScreenHub } from "../ws/hub.js";

export function registerScreenRoutes(
  app: FastifyInstance,
  db: Database.Database,
  hub: ScreenHub
): ScreenController {
  const eventId = () => getDefaultEventId(db);

  const controller = new ScreenController(db, eventId(), (state) => hub.broadcast(state));

  app.get("/api/screen/state", async () => controller.getState());

  app.post("/api/screen/start", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator", "host"]);
      assertHostPinIfRequired(db, eventId(), req);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const body = req.body as { prizeId?: number };
    if (!body?.prizeId) return reply.code(400).send({ error: "prizeId 必填" });
    try {
      const state = controller.startRolling(Number(body.prizeId));
      return { state };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post("/api/screen/stop", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator", "host"]);
      assertHostPinIfRequired(db, eventId(), req);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    try {
      const state = controller.stopAndDraw();
      return { state };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post("/api/screen/complete-slowing", async () => {
    const state = controller.completeSlowing();
    return { state };
  });

  app.post("/api/screen/reset", async (req, reply) => {
    try {
      assertRole(roleFromRequest(req), ["admin", "operator", "host"]);
      assertHostPinIfRequired(db, eventId(), req);
    } catch (e) {
      return reply.code(403).send({ error: (e as Error).message });
    }
    const state = controller.resetIdle();
    return { state };
  });

  return controller;
}