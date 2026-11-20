import { parseSphereEffectId } from "./sphere-effects.js";
import { parseSphereRollModeId } from "./sphere-roll-modes.js";
import { parseThemeJson, type EventTheme } from "./theme.js";
import { parsePresetId } from "./theme-presets.js";
import {
  sanitizeHexColor,
  sanitizeLogoUrl,
  sanitizeThemeTitle,
} from "./secure.js";

export function mergeEventTheme(
  currentRaw: string | null | undefined,
  patch: Partial<EventTheme> | undefined
): EventTheme {
  const current = parseThemeJson(currentRaw);
  if (!patch) return current;

  return {
    presetId: patch.presetId !== undefined ? parsePresetId(patch.presetId) : current.presetId,
    sphereEffect:
      patch.sphereEffect !== undefined
        ? parseSphereEffectId(patch.sphereEffect)
        : current.sphereEffect,
    sphereRollMode:
      patch.sphereRollMode !== undefined
        ? parseSphereRollModeId(patch.sphereRollMode)
        : current.sphereRollMode,
    accent: patch.accent !== undefined ? sanitizeHexColor(patch.accent, current.accent) : current.accent,
    accent2:
      patch.accent2 !== undefined ? sanitizeHexColor(patch.accent2, current.accent2) : current.accent2,
    bgTop: patch.bgTop !== undefined ? sanitizeHexColor(patch.bgTop, current.bgTop) : current.bgTop,
    bgBottom:
      patch.bgBottom !== undefined ? sanitizeHexColor(patch.bgBottom, current.bgBottom) : current.bgBottom,
    title:
      patch.title !== undefined ? sanitizeThemeTitle(patch.title, current.title) : current.title,
    logoUrl:
      patch.logoUrl !== undefined ? sanitizeLogoUrl(patch.logoUrl) : current.logoUrl,
    musicEnabled:
      patch.musicEnabled !== undefined ? !!patch.musicEnabled : current.musicEnabled,
    musicVolume:
      patch.musicVolume !== undefined
        ? Math.min(1, Math.max(0, patch.musicVolume))
        : current.musicVolume,
  };
}