import { useEffect, useMemo, useRef, useState } from "react";
import { useEventTheme } from "../theme/useEventTheme";
import { Confetti } from "./Confetti";
import { SphereScene } from "./SphereScene";
import { useScreenMusic } from "./useScreenMusic";
import { useScreenSync } from "./useScreenSync";
import "./screen.css";

const SLOWING_MS = 3500;

export function ScreenPage() {
  const theme = useEventTheme();
  const [audioArmed, setAudioArmed] = useState(false);
  const { state, connected, fromCache } = useScreenSync();
  const [displayPhase, setDisplayPhase] = useState(state.phase);
  const [ticker, setTicker] = useState("");
  const slowingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.phase === "slowing") {
      setDisplayPhase("slowing");
      if (slowingTimer.current) clearTimeout(slowingTimer.current);
      slowingTimer.current = setTimeout(() => {
        setDisplayPhase("result");
        void fetch("/api/screen/complete-slowing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      }, SLOWING_MS);
      return () => {
        if (slowingTimer.current) clearTimeout(slowingTimer.current);
      };
    }
    if (state.phase === "result") {
      setDisplayPhase("result");
    } else if (state.phase === "rolling") {
      setDisplayPhase("rolling");
    } else if (state.phase === "idle") {
      setDisplayPhase("idle");
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "rolling" && displayPhase !== "rolling") return;
    const names = state.pool.map((p) => p.name);
    if (names.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % names.length;
      setTicker(names[i]!);
    }, displayPhase === "rolling" ? 70 : 200);
    return () => clearInterval(id);
  }, [state.pool, state.phase, displayPhase]);

  const showConfetti = displayPhase === "result" && state.winners.length > 0;
  const poolKey = useMemo(
    () => `${state.pool.length}-${state.pool[0]?.id ?? 0}`,
    [state.pool]
  );

  useScreenMusic(displayPhase, theme, audioArmed);

  return (
    <div className="screen-root">
      <Confetti active={showConfetti} />
      <header className="screen-header">
        <div className="screen-title">
          {theme.logoUrl && (
            <img src={theme.logoUrl} alt="" className="screen-logo" />
          )}
          {theme.title}
        </div>
        <div className="screen-header-actions">
          {theme.musicEnabled && !audioArmed && (
            <button type="button" className="screen-audio-btn" onClick={() => setAudioArmed(true)}>
              开启音效
            </button>
          )}
          <div className={`screen-badge ${connected ? "on" : ""}`}>
            {connected ? (fromCache ? "已恢复（同步中）" : "实时连接") : "重连中…"}
          </div>
        </div>
      </header>

      <div className="screen-prize">
        {state.prizeName ? (
          <>
            <span className="label">当前奖项</span>
            <h1>{state.prizeName}</h1>
          </>
        ) : (
          <h1 className="idle-text">等待开始</h1>
        )}
      </div>

      <div className="screen-stage">
        <SphereScene
          key={`${poolKey}-${theme.sphereEffect ?? "classic"}-${theme.sphereRollMode ?? "globe"}`}
          pool={state.pool}
          phase={displayPhase}
          winners={state.winners}
          effect={theme.sphereEffect ?? "classic"}
          rollMode={theme.sphereRollMode ?? "globe"}
          colors={{ accent: theme.accent, accent2: theme.accent2 }}
        />
        {(displayPhase === "rolling" || displayPhase === "slowing") && ticker && (
          <div className="screen-ticker">
            <span className={displayPhase === "slowing" ? "slow" : ""}>{ticker}</span>
          </div>
        )}
      </div>

      {displayPhase === "result" && state.winners.length > 0 && (
        <footer className="screen-winners">
          <h2>恭喜中奖</h2>
          <ul>
            {state.winners.map((w) => (
              <li key={w.rank}>
                <strong>{w.name}</strong>
                <span>{w.department}</span>
                <em>工号 {w.empNo}</em>
              </li>
            ))}
          </ul>
          {state.roundId != null && (
            <p className="round-tag">轮次 #{state.roundId}</p>
          )}
        </footer>
      )}

      {displayPhase === "idle" && (
        <p className="screen-hint">请主持人在控制台点击「开始滚动」</p>
      )}
    </div>
  );
}