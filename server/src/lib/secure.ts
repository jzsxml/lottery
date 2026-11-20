import { timingSafeEqual } from "node:crypto";

export function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** SQLite LIKE 通配符转义 */
export function escapeSqlLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const LOGO_URL_RE = /^https?:\/\/.+/i;

export function sanitizeLogoUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > 2048) return null;
  if (!LOGO_URL_RE.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeThemeTitle(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (!t) return fallback;
  return t.slice(0, 120);
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return HEX_COLOR.test(t) ? t : fallback;
}