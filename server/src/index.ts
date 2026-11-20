import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/index.js";
import { getDefaultEventId } from "./db/index.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerScreenRoutes } from "./routes/screen.js";
import { loadScreenState } from "./services/screen.js";
import { ScreenHub } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDist = path.resolve(__dirname, "../../admin/dist");

const db = openDatabase();

const app = Fastify({ logger: true });

// POST with no body / empty JSON should not 415 (Fastify default is strict on Content-Type).
app.removeContentTypeParser("application/json");
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, body, done) => {
    const text = (body as string)?.trim() ?? "";
    if (text === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text) as unknown);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      (error as Error & { statusCode?: number }).statusCode = 400;
      done(error, undefined);
    }
  }
);

app.addHook("onRequest", async (req) => {
  if (
    req.method === "POST" &&
    req.url.startsWith("/api") &&
    !req.headers["content-type"]
  ) {
    req.headers["content-type"] = "application/json";
  }
});

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
await app.register(websocket);

const screenHub = new ScreenHub();
registerApiRoutes(app, db);
registerScreenRoutes(app, db, screenHub);

app.get("/api/ws", { websocket: true }, (socket) => {
  screenHub.add(socket);
  const state = loadScreenState(db, getDefaultEventId(db));
  screenHub.sendSync(socket, state);
});

if (fs.existsSync(adminDist)) {
  await app.register(fastifyStatic, {
    root: adminDist,
    prefix: "/",
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`Server listening on http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}