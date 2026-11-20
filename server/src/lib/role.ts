export type LotteryRole = "admin" | "operator" | "host";

export function parseRole(header: string | string[] | undefined): LotteryRole | null {
  const raw = Array.isArray(header) ? header[0]?.trim() : header?.trim();
  if (raw === "host" || raw === "operator" || raw === "admin") return raw;
  return null;
}

export function assertRole(actual: LotteryRole | null, allowed: LotteryRole[]): void {
  if (!actual || !allowed.includes(actual)) {
    const label = actual ?? "未认证";
    throw new Error(`当前角色「${label}」无权限执行此操作`);
  }
}