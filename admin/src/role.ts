import { useEffect, useState } from "react";

export type LotteryRole = "admin" | "operator" | "host";

export const ROLE_LABELS: Record<LotteryRole, string> = {
  admin: "管理员",
  operator: "操作员",
  host: "主持",
};

const STORAGE_KEY = "lottery-role";
const HOST_PIN_KEY = "lottery-host-pin";

export function getRole(): LotteryRole {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "host" || v === "operator" || v === "admin") return v;
  return "admin";
}

export function setRole(role: LotteryRole): void {
  localStorage.setItem(STORAGE_KEY, role);
}

export function getHostPin(): string {
  return localStorage.getItem(HOST_PIN_KEY) ?? "";
}

export function setHostPin(pin: string): void {
  if (pin) localStorage.setItem(HOST_PIN_KEY, pin);
  else localStorage.removeItem(HOST_PIN_KEY);
}

export function roleHeaders(): HeadersInit {
  return { "X-Lottery-Role": getRole() };
}

export function hostRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = { "X-Lottery-Role": "host" };
  const pin = getHostPin();
  if (pin) headers["X-Host-Pin"] = pin;
  return headers;
}

export function useRole() {
  const [role, setLocal] = useState<LotteryRole>(() => getRole());

  const update = (r: LotteryRole) => {
    setRole(r);
    setLocal(r);
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = e.newValue;
        if (v === "host" || v === "operator" || v === "admin") setLocal(v);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { role, setRole: update, label: ROLE_LABELS[role] };
}

/** 主持页专用：不写入 lottery-role，避免管理台角色被改成「主持」 */
export function isHostRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/host");
}

export function canImport(role: LotteryRole): boolean {
  return role === "admin" || role === "operator";
}

export function canSettings(role: LotteryRole): boolean {
  return role === "admin" || role === "operator";
}

export function canVoid(role: LotteryRole): boolean {
  return role === "admin" || role === "operator";
}