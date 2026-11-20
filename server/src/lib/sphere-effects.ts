export type SphereEffectId = "classic" | "stars" | "ocean" | "fire" | "aurora";

export type SphereEffectMeta = {
  id: SphereEffectId;
  name: string;
  description: string;
};

export const SPHERE_EFFECTS: SphereEffectMeta[] = [
  { id: "classic", name: "经典球阵", description: "姓名卡片斐波那契球面" },
  { id: "stars", name: "星空", description: "深空星场衬托球阵" },
  { id: "ocean", name: "海水", description: "波光粒子与深海雾" },
  { id: "fire", name: "火焰", description: "升腾余烬与暖光" },
  { id: "aurora", name: "极光", description: "流动光幕环绕" },
];

export function listSphereEffects(): SphereEffectMeta[] {
  return SPHERE_EFFECTS;
}

const VALID = new Set<SphereEffectId>(SPHERE_EFFECTS.map((e) => e.id));

export function parseSphereEffectId(raw: unknown): SphereEffectId {
  if (typeof raw === "string" && VALID.has(raw as SphereEffectId)) {
    return raw as SphereEffectId;
  }
  return "classic";
}