import type { SphereEffectId } from "../screen/sphereEffectsMeta";
import type { SphereRollModeId } from "../screen/sphereRollModesMeta";
import type { ThemePresetId } from "./presets";

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

export const THEME_CSS_VARS = {
  accent: "--lottery-accent",
  accent2: "--lottery-accent2",
  bgTop: "--lottery-bg-top",
  bgBottom: "--lottery-bg-bottom",
} as const;

export function applyThemeToRoot(theme: EventTheme): void {
  const root = document.documentElement;
  root.style.setProperty(THEME_CSS_VARS.accent, theme.accent);
  root.style.setProperty(THEME_CSS_VARS.accent2, theme.accent2);
  root.style.setProperty(THEME_CSS_VARS.bgTop, theme.bgTop);
  root.style.setProperty(THEME_CSS_VARS.bgBottom, theme.bgBottom);
}