import { parseSphereEffectId, type SphereEffectId } from "./sphere-effects.js";
import { parseSphereRollModeId, type SphereRollModeId } from "./sphere-roll-modes.js";
import type { ThemePresetId } from "./theme-presets.js";

export type EventTheme = {
  presetId?: ThemePresetId;
  sphereEffect?: SphereEffectId;
  sphereRollMode?: SphereRollModeId;
  accent: string;
  accent2: string;
  bgTop: string;
  bgBottom: string;
  title: string;
  logoUrl: string | null;
  musicEnabled: boolean;
  musicVolume: number;
};

export const DEFAULT_THEME: EventTheme = {
  presetId: "classic",
  sphereEffect: "classic",
  sphereRollMode: "globe",
  accent: "#3d8bfd",
  accent2: "#f6c945",
  bgTop: "#1b2d52",
  bgBottom: "#05070c",
  title: "年会抽奖",
  logoUrl: null,
  musicEnabled: true,
  musicVolume: 0.35,
};

export function parseThemeJson(raw: string | null | undefined): EventTheme {
  if (!raw) return { ...DEFAULT_THEME };
  try {
    const v = JSON.parse(raw) as Partial<EventTheme>;
    return {
      presetId: v.presetId ?? DEFAULT_THEME.presetId,
      sphereEffect: parseSphereEffectId(v.sphereEffect),
      sphereRollMode: parseSphereRollModeId(v.sphereRollMode),
      accent: v.accent ?? DEFAULT_THEME.accent,
      accent2: v.accent2 ?? DEFAULT_THEME.accent2,
      bgTop: v.bgTop ?? DEFAULT_THEME.bgTop,
      bgBottom: v.bgBottom ?? DEFAULT_THEME.bgBottom,
      title: v.title ?? DEFAULT_THEME.title,
      logoUrl: v.logoUrl ?? null,
      musicEnabled: v.musicEnabled ?? DEFAULT_THEME.musicEnabled,
      musicVolume:
        typeof v.musicVolume === "number"
          ? Math.min(1, Math.max(0, v.musicVolume))
          : DEFAULT_THEME.musicVolume,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}