import { openDatabase } from "../db/index.js";
import { verifyRoundIntegrity } from "../services/draw.js";

const roundId = Number(process.argv[2]);
if (!roundId) {
  console.error("Usage: npm run audit:verify -w server -- <roundId>");
  process.exit(1);
}

const db = openDatabase();
const result = verifyRoundIntegrity(db, roundId);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);