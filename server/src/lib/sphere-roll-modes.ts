export type SphereRollModeId =
  | "globe"
  | "shuffle"
  | "waterfall"
  | "fountain"
  | "volcano";

export type SphereRollModeMeta = {
  id: SphereRollModeId;
  name: string;
  description: string;
};

export const SPHERE_ROLL_MODES: SphereRollModeMeta[] = [
  { id: "globe", name: "球面旋转", description: "经典斐波那契球阵" },
  { id: "shuffle", name: "随机滑动", description: "卡片在空间中无序漂移" },
  { id: "waterfall", name: "姓名瀑布", description: "多列自上而下流过" },
  { id: "fountain", name: "喷泉上扬", description: "自底部喷涌后飘落" },
  { id: "volcano", name: "火山喷发", description: "中心爆发向四周飞散" },
];

export function listSphereRollModes(): SphereRollModeMeta[] {
  return SPHERE_ROLL_MODES;
}

const VALID = new Set<SphereRollModeId>(SPHERE_ROLL_MODES.map((m) => m.id));

export function parseSphereRollModeId(raw: unknown): SphereRollModeId {
  if (typeof raw === "string" && VALID.has(raw as SphereRollModeId)) {
    return raw as SphereRollModeId;
  }
  return "globe";
}