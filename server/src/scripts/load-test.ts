/**
 * DB stress test: eligible pool + repeated draws (no HTTP).
 * Usage: npm run stress:test -w server
 */
import { openDatabase, getDefaultEventId } from "../db/index.js";
import { buildEligiblePoolWithMeta } from "../lib/pool.js";
import { executeDrawWithPool } from "../services/draw.js";

const PARTICIPANT_TARGET = Number(process.env.STRESS_N ?? 200);
const DRAW_ROUNDS = Number(process.env.STRESS_ROUNDS ?? 15);

const db = openDatabase();
const eventId = getDefaultEventId(db);

const count = db
  .prepare("SELECT COUNT(*) as c FROM participants WHERE event_id = ?")
  .get(eventId) as { c: number };

if (count.c < PARTICIPANT_TARGET) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO participants (event_id, emp_no, name, department)
     VALUES (?, ?, ?, '压测部')`
  );
  const tx = db.transaction(() => {
    for (let i = count.c + 1; i <= PARTICIPANT_TARGET; i++) {
      insert.run(eventId, `S${String(i).padStart(4, "0")}`, `压测${i}`);
    }
  });
  tx();
  console.log(`Seeded participants to ${PARTICIPANT_TARGET}`);
}

db.prepare(`DELETE FROM draw_voids WHERE round_id IN (
  SELECT id FROM draw_rounds WHERE event_id = ?
)`).run(eventId);
db.prepare(`UPDATE screen_state SET round_id = NULL WHERE event_id = ?`).run(eventId);
db.prepare(`DELETE FROM draw_results WHERE round_id IN (
  SELECT id FROM draw_rounds WHERE event_id = ?
)`).run(eventId);
db.prepare(`DELETE FROM draw_rounds WHERE event_id = ?`).run(eventId);
db.prepare(`UPDATE prizes SET status = 'pending' WHERE event_id = ?`).run(eventId);

const prizes = db
  .prepare(`SELECT id, name, count_per_round, allow_repeat FROM prizes WHERE event_id = ? LIMIT 20`)
  .all(eventId) as Array<{
  id: number;
  name: string;
  count_per_round: number;
  allow_repeat: number;
}>;

if (prizes.length === 0) {
  db.prepare(
    `INSERT INTO prizes (event_id, name, sort_order, count_per_round) VALUES (?, '压测奖', 0, 1)`
  ).run(eventId);
  prizes.push({
    id: Number((db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id),
    name: "压测奖",
    count_per_round: 1,
    allow_repeat: 0,
  });
}

const times: number[] = [];
let duplicateWinners = 0;
const seen = new Set<number>();

for (let r = 0; r < DRAW_ROUNDS; r++) {
  const prize = prizes[r % prizes.length]!;
  db.prepare(`UPDATE prizes SET status = 'pending' WHERE id = ?`).run(prize.id);
  const { pool, meta } = buildEligiblePoolWithMeta(
    db,
    eventId,
    !!prize.allow_repeat,
    false
  );
  if (pool.length < prize.count_per_round) {
    console.log(`Round ${r + 1}: pool exhausted (${pool.length})`);
    break;
  }
  const t0 = performance.now();
  const result = executeDrawWithPool(db, eventId, prize.id, pool, prize, meta.poolPolicy);
  times.push(performance.now() - t0);
  for (const w of result.winners) {
    if (seen.has(w.participantId)) duplicateWinners++;
    seen.add(w.participantId);
  }
}

times.sort((a, b) => a - b);
const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
const max = times[times.length - 1] ?? 0;

console.log(
  JSON.stringify(
    {
      draws: times.length,
      duplicateWinners,
      msP99: Math.round(p99 * 100) / 100,
      msMax: Math.round(max * 100) / 100,
      ok: duplicateWinners === 0 && p99 < 500,
    },
    null,
    2
  )
);

process.exit(duplicateWinners === 0 && p99 < 500 ? 0 : 1);