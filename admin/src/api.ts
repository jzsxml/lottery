import { hostRequestHeaders, isHostRoute, roleHeaders } from "./role";
import type { EventTheme } from "./theme/types";

export type EligibilityMode = "all" | "checked_in_only" | "manual_eligible" | "hybrid";

function authHeaders(path: string): HeadersInit {
  if (isHostRoute()) return hostRequestHeaders();
  return roleHeaders();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = authHeaders(path);
  const res = await fetch(path, {
    ...init,
    headers: {
      ...base,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export type Participant = {
  id: number;
  emp_no: string;
  name: string;
  department: string;
  status: string;
  checked_in: number;
  eligible_override: number | null;
};

export type Prize = {
  id: number;
  name: string;
  sort_order: number;
  count_per_round: number;
  allow_repeat: number;
  status: string;
};

export type DrawResponse = {
  roundId: number;
  prizeId: number;
  winners: {
    participantId: number;
    empNo: string;
    name: string;
    department: string;
    rank: number;
  }[];
  poolSnapshotHash: string;
  randomSeedHex: string;
  resultHash: string;
};

export type EventInfo = {
  event: {
    id: number;
    name: string;
    allow_repeat: number;
    eligibility_mode: EligibilityMode;
    locked_at: string | null;
  };
  eligibilityLabel: string;
  summary: { totalActive: number; eligible: number; mode: EligibilityMode };
};

export type AuditLogItem = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  payload_json: string;
  entry_hash: string;
  created_at: string;
};

export const api = {
  getEvent: () => request<EventInfo>("/api/event"),
  updateSettings: (body: {
    allow_repeat?: boolean;
    eligibility_mode?: EligibilityMode;
    confirm: boolean;
  }) =>
    request<{ ok: boolean; summary: EventInfo["summary"] }>("/api/event/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  lockEvent: (confirm: boolean) =>
    request<{ ok: boolean }>("/api/event/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    }),
  unlockEvent: (confirm: boolean) =>
    request<{ ok: boolean }>("/api/event/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    }),
  getParticipants: (q?: string) =>
    request<{ items: Participant[] }>(`/api/participants${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  updateParticipant: (
    id: number,
    body: { checked_in?: boolean; eligible_override?: boolean | null }
  ) =>
    request<{ ok: boolean }>(`/api/participants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  bulkCheckin: (ids: number[], checked_in: boolean) =>
    request<{ ok: boolean; summary: EventInfo["summary"] }>("/api/participants/bulk-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, checked_in }),
    }),
  importFile: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/participants/import", {
      method: "POST",
      body: fd,
      headers: authHeaders("/api/participants/import"),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "import failed");
    return data as { summary: { inserted: number; updated: number; skippedDuplicatesInFile: number; total: number } };
  },
  clearParticipants: () => request<{ ok: boolean }>("/api/participants", { method: "DELETE" }),
  getPrizes: () => request<{ items: Prize[] }>("/api/prizes"),
  createPrize: (body: {
    name: string;
    sort_order?: number;
    count_per_round?: number;
    allow_repeat?: boolean;
  }) =>
    request<{ id: number }>("/api/prizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deletePrize: (id: number) =>
    request<{ ok: boolean }>(`/api/prizes/${id}`, { method: "DELETE" }),
  getPool: (prizeId: number) =>
    request<{ count: number; items: Participant[]; poolPolicy: Record<string, unknown> }>(
      `/api/prizes/${prizeId}/pool`
    ),
  draw: (prizeId: number) =>
    request<DrawResponse>(`/api/prizes/${prizeId}/draw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  getRounds: () =>
    request<{
      items: Array<{
        id: number;
        prize_name: string;
        k: number;
        pool_count: number;
        result_hash: string;
        created_at: string;
        status: string;
      }>;
    }>("/api/rounds"),
  voidRound: (roundId: number, reason: string) =>
    request<{ ok: boolean; prizeId: number }>(`/api/rounds/${roundId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, confirm: true }),
    }),
  getAuditLogs: () => request<{ items: AuditLogItem[] }>("/api/audit-logs"),
  exportUrl: () => "/api/export/results.xlsx",
  getScreenState: () => request<import("./screen/types").ScreenState>("/api/screen/state"),
  screenStart: (prizeId: number) =>
    request<{ state: import("./screen/types").ScreenState }>("/api/screen/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prizeId }),
    }),
  screenStop: () =>
    request<{ state: import("./screen/types").ScreenState }>("/api/screen/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  screenReset: () =>
    request<{ state: import("./screen/types").ScreenState }>("/api/screen/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  getTheme: () =>
    request<{ theme: EventTheme; hostPinRequired: boolean }>("/api/event/theme"),
  getThemePresets: () =>
    request<{ items: import("./theme/presets").ThemePresetMeta[] }>(
      "/api/event/theme/presets"
    ),
  getSphereEffects: () =>
    request<{ items: import("./screen/sphereEffectsMeta").SphereEffectMeta[] }>(
      "/api/event/sphere/effects"
    ),
  getSphereRollModes: () =>
    request<{ items: import("./screen/sphereRollModesMeta").SphereRollModeMeta[] }>(
      "/api/event/sphere/roll-modes"
    ),
  updateTheme: (body: {
    theme?: Partial<EventTheme>;
    host_pin?: string | null;
    confirm: boolean;
  }) =>
    request<{ ok: boolean; theme: EventTheme; hostPinRequired: boolean }>("/api/event/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};