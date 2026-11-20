import type { EventTheme } from "./theme.js";

export type ThemePresetId = "classic" | "spring" | "tech" | "elegant" | "fresh" | "custom";

export type ThemePresetColors = Pick<EventTheme, "accent" | "accent2" | "bgTop" | "bgBottom">;

export type ThemePresetMeta = {
  id: Exclude<ThemePresetId, "custom">;
  name: string;
  description: string;
  colors: ThemePresetColors;
};

export const THEME_PRESETS: ThemePresetMeta[] = [
  {
    id: "classic",
    name: "星际蓝金",
    description: "默认深蓝 + 金色点缀",
    colors: {
      accent: "#3d8bfd",
      accent2: "#f6c945",
      bgTop: "#1b2d52",
      bgBottom: "#05070c",
    },
  },
  {
    id: "spring",
    name: "喜庆红金",
    description: "年会 / 春节氛围",
    colors: {
      accent: "#ff4d4f",
      accent2: "#ffd666",
      bgTop: "#5c1a1a",
      bgBottom: "#1a0808",
    },
  },
  {
    id: "tech",
    name: "赛博青紫",
    description: "科技感、高光对比",
    colors: {
      accent: "#22d3ee",
      accent2: "#c084fc",
      bgTop: "#1e1b4b",
      bgBottom: "#09080f",
    },
  },
  {
    id: "elegant",
    name: "黑金晚宴",
    description: "低调奢华",
    colors: {
      accent: "#c9a962",
      accent2: "#f5e6c8",
      bgTop: "#2c2c2c",
      bgBottom: "#0c0c0c",
    },
  },
  {
    id: "fresh",
    name: "清新绿意",
    description: "活力、健康",
    colors: {
      accent: "#34d399",
      accent2: "#6ee7b7",
      bgTop: "#14532d",
      bgBottom: "#052e16",
    },
  },
];

export function listThemePresets(): ThemePresetMeta[] {
  return THEME_PRESETS;
}

const PRESET_IDS = new Set<ThemePresetId>([...THEME_PRESETS.map((p) => p.id), "custom"]);

export function parsePresetId(raw: unknown): ThemePresetId {
  if (typeof raw === "string" && PRESET_IDS.has(raw as ThemePresetId)) {
    return raw as ThemePresetId;
  }
  return "classic";
}

export function applyPresetColors(
  base: EventTheme,
  presetId: Exclude<ThemePresetId, "custom">
): EventTheme {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return base;
  return {
    ...base,
    ...preset.colors,
    presetId,
  };
}