export type SphereEffectId = "classic" | "stars" | "ocean" | "fire" | "aurora";

export type SphereEffectMeta = {
  id: SphereEffectId;
  name: string;
  description: string;
};

/** 与后端 sphere-effects 一致，离线兜底 */
export const SPHERE_EFFECTS_FALLBACK: SphereEffectMeta[] = [
  { id: "classic", name: "经典球阵", description: "姓名卡片斐波那契球面" },
  { id: "stars", name: "星空", description: "深空星场衬托球阵" },
  { id: "ocean", name: "海水", description: "波光粒子与深海雾" },
  { id: "fire", name: "火焰", description: "升腾余烬与暖光" },
  { id: "aurora", name: "极光", description: "流动光幕环绕" },
];