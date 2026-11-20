import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomSeedHex(): string {
  return randomBytes(32).toString("hex");
}

/** Unbiased integer in [0, maxExclusive) using crypto.randomInt */
export function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("maxExclusive must be positive");
  return randomInt(maxExclusive);
}

export function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hmacAuditHash(secret: string, canonical: string, prev: string | null): string {
  const payload = `${prev ?? "genesis"}|${canonical}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}