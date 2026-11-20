import { useEffect, useState } from "react";
import { applyThemeToRoot, type EventTheme } from "./types";

const DEFAULT: EventTheme = {
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

export function useEventTheme() {
  const [theme, setTheme] = useState<EventTheme>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch("/api/event/theme")
        .then((r) => r.json())
        .then((data: { theme: EventTheme }) => {
          if (!cancelled && data.theme) {
            setTheme(data.theme);
            applyThemeToRoot(data.theme);
          }
        });
    };
    load();
    const id = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return theme;
}