import { useCallback, useEffect, useState } from "react";
import { api, type Prize } from "../api";
import { getHostPin, setHostPin, hostRequestHeaders } from "../role";
import "./host.css";

export function HostPage() {
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState(getHostPin());
  const [unlocked, setUnlocked] = useState(!getHostPin());
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/host/config")
      .then((r) => r.json())
      .then((c: { hostPinRequired: boolean }) => {
        setPinRequired(c.hostPinRequired);
        if (!c.hostPinRequired) setUnlocked(true);
      });
  }, []);

  const load = useCallback(async () => {
    const [p, screen] = await Promise.all([api.getPrizes(), api.getScreenState()]);
    setPrizes(p.items);
    setPhase(screen.phase);
    const pending = p.items.find((x) => x.status !== "completed");
    if (pending && selected == null) setSelected(pending.id);
  }, [selected]);

  useEffect(() => {
    if (!unlocked) return;
    void load().catch((e) => setError(String(e)));
    const id = setInterval(() => void load().catch(() => {}), 2000);
    return () => clearInterval(id);
  }, [unlocked, load]);

  const onUnlock = async () => {
    try {
      const res = await fetch("/api/host/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hostRequestHeaders() },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PIN 错误");
      setHostPin(pinInput);
      setUnlocked(true);
      setMessage("已验证");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async (action: "start" | "stop" | "reset") => {
    setError(null);
    try {
      if (action === "start" && selected != null) await api.screenStart(selected);
      if (action === "stop") await api.screenStop();
      if (action === "reset") await api.screenReset();
      setMessage(action === "start" ? "已开始滚动" : action === "stop" ? "已停止" : "已复位");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (pinRequired && !unlocked) {
    return (
      <div className="host-root">
        <h1>主持台</h1>
        <p className="muted">请输入本场 PIN</p>
        <input
          className="host-input"
          type="password"
          inputMode="numeric"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          placeholder="PIN"
        />
        <button type="button" className="host-btn primary" onClick={() => void onUnlock()}>
          进入
        </button>
        {error && <p className="host-err">{error}</p>}
      </div>
    );
  }

  const canStart = phase === "idle" || phase === "result";
  const canStop = phase === "rolling";

  return (
    <div className="host-root">
      <header className="host-header">
        <h1>主持台</h1>
        <a href="/screen" className="host-link">
          大屏
        </a>
      </header>
      <p className="host-phase">
        阶段 <strong>{phase}</strong>
      </p>
      {(message || error) && (
        <p className={error ? "host-err" : "host-ok"}>{error ?? message}</p>
      )}
      <label className="host-label">
        奖项
        <select
          className="host-input"
          value={selected ?? ""}
          disabled={phase === "rolling"}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {prizes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="host-actions">
        <button
          type="button"
          className="host-btn primary"
          disabled={!canStart || selected == null}
          onClick={() => void run("start")}
        >
          开始滚动
        </button>
        <button
          type="button"
          className="host-btn accent"
          disabled={!canStop}
          onClick={() => void run("stop")}
        >
          停止抽奖
        </button>
        <button type="button" className="host-btn" onClick={() => void run("reset")}>
          下一轮
        </button>
      </div>
    </div>
  );
}