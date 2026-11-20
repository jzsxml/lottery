import { useCallback, useEffect, useRef } from "react";
import type { ScreenPhase } from "./types";
import type { EventTheme } from "../theme/types";

function beep(
  ctx: AudioContext,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function useScreenMusic(phase: ScreenPhase, theme: EventTheme, audioArmed: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureCtx = useCallback(() => {
    if (!theme.musicEnabled || !audioArmed) return null;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, [theme.musicEnabled, audioArmed]);

  useEffect(() => {
    const vol = theme.musicVolume;
    const ctx = ensureCtx();
    if (!ctx) return;

    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (phase === "rolling") {
      tickRef.current = setInterval(() => {
        beep(ctx, 180 + Math.random() * 80, 0.04, vol * 0.5, "square");
      }, 90);
    } else if (phase === "slowing") {
      tickRef.current = setInterval(() => {
        beep(ctx, 120, 0.08, vol * 0.4, "triangle");
      }, 280);
    } else if (phase === "result") {
      beep(ctx, 523, 0.15, vol, "sine");
      setTimeout(() => beep(ctx, 659, 0.15, vol, "sine"), 120);
      setTimeout(() => beep(ctx, 784, 0.35, vol, "sine"), 240);
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, theme.musicVolume, ensureCtx]);
}