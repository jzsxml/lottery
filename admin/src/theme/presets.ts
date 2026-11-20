import type { EventTheme } from "./types";

export type ThemePresetId = "classic" | "spring" | "tech" | "elegant" | "fresh" | "custom";

export type ThemePresetMeta = {
  id: Exclude<ThemePresetId, "custom">;
  name: string;
  description: string;
  colors: Pick<EventTheme, "accent" | "accent2" | "bgTop" | "bgBottom">;
};

/** 与后端 theme-presets 保持一致，离线预览用 */
export const THEME_PRESETS_FALLBACK: ThemePresetMeta[] = [
  {
    id: "classic",
    name: "星际蓝金",
    description: "默认深蓝 + 金色点缀",
    colors: { accent: "#3d8bfd", accent2: "#f6c945", bgTop: "#1b2d52", bgBottom: "#05070c" },
  },
  {
    id: "spring",
    name: "喜庆红金",
    description: "年会 / 春节氛围",
    colors: { accent: "#ff4d4f", accent2: "#ffd666", bgTop: "#5c1a1a", bgBottom: "#1a0808" },
  },
  {
    id: "tech",
    name: "赛博青紫",
    description: "科技感、高光对比",
    colors: { accent: "#22d3ee", accent2: "#c084fc", bgTop: "#1e1b4b", bgBottom: "#09080f" },
  },
  {
    id: "elegant",
    name: "黑金晚宴",
    description: "低调奢华",
    colors: { accent: "#c9a962", accent2: "#f5e6c8", bgTop: "#2c2c2c", bgBottom: "#0c0c0c" },
  },
  {
    id: "fresh",
    name: "清新绿意",
    description: "活力、健康",
    colors: { accent: "#34d399", accent2: "#6ee7b7", bgTop: "#14532d", bgBottom: "#052e16" },
  },
];

export function applyPresetToTheme(
  base: EventTheme,
  preset: ThemePresetMeta
): EventTheme {
  return {
    ...base,
    ...preset.colors,
    presetId: preset.id,
  };
}

export function markCustomIfColorsChanged(
  theme: EventTheme,
  presets: ThemePresetMeta[]
): ThemePresetId {
  if (!theme.presetId || theme.presetId === "custom") return "custom";
  const p = presets.find((x) => x.id === theme.presetId);
  if (!p) return "custom";
  const c = p.colors;
  if (
    theme.accent !== c.accent ||
    theme.accent2 !== c.accent2 ||
    theme.bgTop !== c.bgTop ||
    theme.bgBottom !== c.bgBottom
  ) {
    return "custom";
  }
  return theme.presetId;
}