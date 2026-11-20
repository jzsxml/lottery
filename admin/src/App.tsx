import { useCallback, useEffect, useState } from "react";
import { api, type EligibilityMode, type Participant, type Prize, type AuditLogItem } from "./api";
import {
  applyPresetToTheme,
  markCustomIfColorsChanged,
  THEME_PRESETS_FALLBACK,
  type ThemePresetMeta,
} from "./theme/presets";
import {
  SPHERE_EFFECTS_FALLBACK,
  type SphereEffectMeta,
} from "./screen/sphereEffectsMeta";
import {
  SPHERE_ROLL_MODES_FALLBACK,
  type SphereRollModeMeta,
} from "./screen/sphereRollModesMeta";
import { applyThemeToRoot, type EventTheme } from "./theme/types";
import { canImport, canSettings, canVoid, ROLE_LABELS, useRole, type LotteryRole } from "./role";

type Tab = "participants" | "prizes" | "draw" | "results" | "settings" | "logs";

export function App() {
  const { role, setRole } = useRole();

  useEffect(() => {
    void api.getTheme().then((th) => applyThemeToRoot(th.theme));
  }, []);
  const [tab, setTab] = useState<Tab>("participants");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setError(null);
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const onError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setMessage(null);
  }, []);

  return (
    <div className="layout">
      <header className="header">
        <h1>年会抽奖 · 管理台</h1>
        <p className="muted">名单 / 奖项 / 大屏主持 / 资格与审计</p>
        <div className="form-row header-toolbar">
          <div className="role-switcher">
            <span className="role-switcher-label">当前角色</span>
            <select
              className="input role-select"
              value={role}
              aria-label="当前角色"
              onChange={(e) => setRole(e.target.value as LotteryRole)}
            >
              {(Object.keys(ROLE_LABELS) as LotteryRole[]).map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <a className="btn primary screen-link" href="/screen" target="_blank" rel="noreferrer">
            打开大屏
          </a>
          <a className="btn screen-link" href="/host" target="_blank" rel="noreferrer">
            移动主持
          </a>
        </div>
      </header>
      <nav className="tabs">
        {(
          [
            ["participants", "名单"],
            ["prizes", "奖项"],
            ["draw", "抽奖"],
            ["results", "结果与导出"],
            ["settings", "活动设置"],
            ["logs", "操作日志"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "tab active" : "tab"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {(message || error) && (
        <div className={error ? "banner error" : "banner ok"}>{error ?? message}</div>
      )}
      <main className="main">
        {tab === "participants" && (
          <ParticipantsPanel flash={flash} onError={onError} role={role} />
        )}
        {tab === "prizes" && <PrizesPanel flash={flash} onError={onError} />}
        {tab === "draw" && <DrawPanel flash={flash} onError={onError} />}
        {tab === "results" && <ResultsPanel onError={onError} role={role} />}
        {tab === "settings" && (
          <SettingsPanel flash={flash} onError={onError} role={role} />
        )}
        {tab === "logs" && <LogsPanel onError={onError} />}
      </main>
    </div>
  );
}

function ParticipantsPanel({
  flash,
  onError,
  role,
}: {
  flash: (m: string) => void;
  onError: (e: unknown) => void;
  role: ReturnType<typeof useRole>["role"];
}) {
  const [items, setItems] = useState<Participant[]>([]);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<EligibilityMode>("all");
  const [summary, setSummary] = useState({ totalActive: 0, eligible: 0 });

  const load = useCallback(async () => {
    try {
      const res = await api.getParticipants(q);
      setItems(res.items);
      const ev = await api.getEvent();
      setMode(ev.event.eligibility_mode);
      setSummary(ev.summary);
    } catch (e) {
      onError(e);
    }
  }, [q, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const res = await api.importFile(file);
      flash(
        `导入完成：新增 ${res.summary.inserted}，更新 ${res.summary.updated}，文件内重复跳过 ${res.summary.skippedDuplicatesInFile}`
      );
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const onClear = async () => {
    if (!confirm("确定清空全部名单？（已有抽奖记录时不可清空）")) return;
    try {
      await api.clearParticipants();
      flash("名单已清空");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <section>
      <div className="toolbar">
        {canImport(role) && (
          <>
            <label className="btn primary">
              导入 CSV / Excel
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="btn danger" onClick={() => void onClear()}>
              清空名单
            </button>
          </>
        )}
        <input
          className="input"
          placeholder="搜索姓名/工号/部门"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="muted">
          可参与 {summary.eligible} / 在册 {summary.totalActive} · 模式 {mode}
        </span>
      </div>
      <p className="hint">
        表头支持：<code>工号, 姓名, 部门</code> 或 <code>emp_no, name, department</code>
      </p>
      <p className="toolbar">
        <a className="btn" href="/api/templates/participants.csv" download>
          下载 CSV 模板
        </a>
        <a className="btn" href="/api/templates/participants.xlsx" download>
          下载 Excel 模板
        </a>
        <span className="muted">本地文件：data/templates/</span>
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>工号</th>
            <th>姓名</th>
            <th>部门</th>
            <th>状态</th>
            {(mode === "checked_in_only" || mode === "hybrid") && <th>签到</th>}
            {(mode === "manual_eligible" || mode === "hybrid") && <th>可参与</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.emp_no}</td>
              <td>{p.name}</td>
              <td>{p.department}</td>
              <td>{p.status}</td>
              {(mode === "checked_in_only" || mode === "hybrid") && (
                <td>
                  <input
                    type="checkbox"
                    checked={!!p.checked_in}
                    disabled={!canImport(role) && role !== "host"}
                    onChange={(e) =>
                      void api
                        .updateParticipant(p.id, { checked_in: e.target.checked })
                        .then(() => load())
                        .catch(onError)
                    }
                  />
                </td>
              )}
              {(mode === "manual_eligible" || mode === "hybrid") && (
                <td>
                  <input
                    type="checkbox"
                    checked={p.eligible_override === 1}
                    disabled={!canImport(role)}
                    onChange={(e) =>
                      void api
                        .updateParticipant(p.id, {
                          eligible_override: e.target.checked,
                        })
                        .then(() => load())
                        .catch(onError)
                    }
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PrizesPanel({
  flash,
  onError,
}: {
  flash: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [items, setItems] = useState<Prize[]>([]);
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);

  const load = useCallback(async () => {
    try {
      const res = await api.getPrizes();
      setItems(res.items);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!name.trim()) return;
    try {
      await api.createPrize({ name: name.trim(), count_per_round: count });
      setName("");
      setCount(1);
      flash("奖项已创建");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("删除该奖项？")) return;
    try {
      await api.deletePrize(id);
      flash("已删除");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <section>
      <div className="form-row">
        <input
          className="input"
          placeholder="奖项名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label>
          每轮抽取人数
          <input
            type="number"
            className="input narrow"
            min={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <button type="button" className="btn primary" onClick={() => void onCreate()}>
          添加奖项
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>排序</th>
            <th>名称</th>
            <th>人数</th>
            <th>状态</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.sort_order}</td>
              <td>{p.name}</td>
              <td>{p.count_per_round}</td>
              <td>{p.status}</td>
              <td>
                <button type="button" className="btn link" onClick={() => void onDelete(p.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DrawPanel({
  flash,
  onError,
}: {
  flash: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [screenPhase, setScreenPhase] = useState<string>("idle");
  const [lastRoundId, setLastRoundId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getPrizes();
      setPrizes(res.items);
      const pending = res.items.find((p) => p.status !== "completed");
      if (pending && selected == null) setSelected(pending.id);
      const screen = await api.getScreenState();
      setScreenPhase(screen.phase);
      setLastRoundId(screen.roundId);
    } catch (e) {
      onError(e);
    }
  }, [onError, selected]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (selected == null) return;
    void api
      .getPool(selected)
      .then((r) => setPoolCount(r.count))
      .catch(onError);
  }, [selected, onError]);

  const onStart = async () => {
    if (selected == null) return;
    try {
      await api.screenStart(selected);
      flash("大屏已进入滚动");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const onStop = async () => {
    try {
      const res = await api.screenStop();
      flash(`已停止并完成抽取 · 轮次 #${res.state.roundId ?? "?"}`);
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const onReset = async () => {
    try {
      await api.screenReset();
      flash("大屏已复位");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const onQuickDraw = async () => {
    if (selected == null) return;
    if (!confirm("跳过动画，直接抽取？（仍写入审计）")) return;
    try {
      const res = await api.draw(selected);
      flash(`快速抽取完成 · 轮次 #${res.roundId}`);
      await load();
    } catch (e) {
      onError(e);
    }
  };

  const rolling = screenPhase === "rolling";
  const canStart = screenPhase === "idle" || screenPhase === "result";
  const canStop = screenPhase === "rolling";

  return (
    <section>
      <p className="hint">
        大屏流程：<strong>开始滚动</strong> → 主持停表点 <strong>停止并抽奖</strong> → 大屏减速揭晓 →
        点击 <strong>下一轮/复位</strong>。请先另开窗口打开「大屏」全屏。
      </p>
      <div className="form-row phase-row">
        <span className="muted">
          大屏阶段：<code>{screenPhase}</code>
          {lastRoundId ? ` · 上轮 #${lastRoundId}` : null}
        </span>
      </div>
      <div className="form-row">
        <label>
          选择奖项
          <select
            className="input"
            value={selected ?? ""}
            onChange={(e) => setSelected(Number(e.target.value))}
            disabled={rolling}
          >
            {prizes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.status === "completed" ? "已抽" : p.status === "active" ? "滚动中" : "待抽"}）
              </option>
            ))}
          </select>
        </label>
        <span className="muted">可参与：{poolCount ?? "—"} 人</span>
        <button
          type="button"
          className="btn primary"
          disabled={selected == null || !canStart}
          onClick={() => void onStart()}
        >
          开始滚动
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!canStop}
          onClick={() => void onStop()}
        >
          停止并抽奖
        </button>
        <button type="button" className="btn" onClick={() => void onReset()}>
          复位 idle
        </button>
        <button type="button" className="btn link" onClick={() => void onQuickDraw()}>
          快速抽奖（无动画）
        </button>
      </div>
    </section>
  );
}

function ResultsPanel({
  onError,
  role,
}: {
  onError: (e: unknown) => void;
  role: ReturnType<typeof useRole>["role"];
}) {
  const [rounds, setRounds] = useState<
    Array<{
      id: number;
      prize_name: string;
      k: number;
      pool_count: number;
      result_hash: string;
      created_at: string;
      status: string;
    }>
  >([]);

  const load = useCallback(() => {
    void api
      .getRounds()
      .then((r) => setRounds(r.items))
      .catch(onError);
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const onVoid = async (roundId: number) => {
    if (!canVoid(role)) return;
    const reason = prompt("作废并重抽原因（必填）：");
    if (!reason?.trim()) return;
    if (!confirm(`确认作废轮次 #${roundId}？奖项将恢复为待抽状态`)) return;
    try {
      await api.voidRound(roundId, reason.trim());
      load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <a className="btn primary" href={api.exportUrl()}>
          导出 Excel
        </a>
        <span className="muted">含中奖明细与轮次审计字段</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>轮次</th>
            <th>奖项</th>
            <th>k</th>
            <th>池人数</th>
            <th>时间</th>
            <th>状态</th>
            <th>结果哈希</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.prize_name}</td>
              <td>{r.k}</td>
              <td>{r.pool_count}</td>
              <td>{r.created_at}</td>
              <td>{r.status}</td>
              <td className="mono small">{r.result_hash.slice(0, 20)}…</td>
              <td>
                {canVoid(role) && r.status === "locked" && (
                  <button type="button" className="btn link" onClick={() => void onVoid(r.id)}>
                    作废/重抽
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SettingsPanel({
  flash,
  onError,
  role,
}: {
  flash: (m: string) => void;
  onError: (e: unknown) => void;
  role: ReturnType<typeof useRole>["role"];
}) {
  const [mode, setMode] = useState<EligibilityMode>("all");
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [locked, setLocked] = useState(false);
  const [summary, setSummary] = useState({ totalActive: 0, eligible: 0 });
  const [theme, setTheme] = useState<EventTheme | null>(null);
  const [presets, setPresets] = useState<ThemePresetMeta[]>(THEME_PRESETS_FALLBACK);
  const [sphereEffects, setSphereEffects] = useState<SphereEffectMeta[]>(SPHERE_EFFECTS_FALLBACK);
  const [sphereRollModes, setSphereRollModes] = useState<SphereRollModeMeta[]>(
    SPHERE_ROLL_MODES_FALLBACK
  );
  const [hostPin, setHostPin] = useState("");
  const [hostPinRequired, setHostPinRequired] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ev, th, pr, fx, rm] = await Promise.all([
        api.getEvent(),
        api.getTheme(),
        api.getThemePresets().catch(() => ({ items: THEME_PRESETS_FALLBACK })),
        api.getSphereEffects().catch(() => ({ items: SPHERE_EFFECTS_FALLBACK })),
        api.getSphereRollModes().catch(() => ({ items: SPHERE_ROLL_MODES_FALLBACK })),
      ]);
      setMode(ev.event.eligibility_mode);
      setAllowRepeat(!!ev.event.allow_repeat);
      setLocked(!!ev.event.locked_at);
      setSummary(ev.summary);
      setPresets(pr.items.length ? pr.items : THEME_PRESETS_FALLBACK);
      setSphereEffects(fx.items.length ? fx.items : SPHERE_EFFECTS_FALLBACK);
      setSphereRollModes(rm.items.length ? rm.items : SPHERE_ROLL_MODES_FALLBACK);
      setTheme(th.theme);
      setHostPinRequired(th.hostPinRequired);
      applyThemeToRoot(th.theme);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canSettings(role)) {
    return <p className="hint">当前主持角色无法修改活动设置。</p>;
  }

  const onSave = async () => {
    if (!confirm("确认保存资格与重复中奖规则？")) return;
    try {
      const res = await api.updateSettings({
        eligibility_mode: mode,
        allow_repeat: allowRepeat,
        confirm: true,
      });
      setSummary(res.summary);
      flash("设置已保存");
    } catch (e) {
      onError(e);
    }
  };

  const onLock = async () => {
    if (!confirm("锁定后不可改资格规则（仍可签到勾选）？")) return;
    try {
      await api.lockEvent(true);
      setLocked(true);
      flash("活动已锁定");
    } catch (e) {
      onError(e);
    }
  };

  const onUnlock = async () => {
    if (!confirm("仅管理员可解锁，确认？")) return;
    try {
      await api.unlockEvent(true);
      setLocked(false);
      flash("已解锁");
    } catch (e) {
      onError(e);
    }
  };

  const onSaveTheme = async () => {
    if (!theme) return;
    if (!confirm("保存外观、音效与主持 PIN？")) return;
    try {
      const res = await api.updateTheme({
        theme,
        host_pin: hostPin.trim() || null,
        confirm: true,
      });
      setTheme(res.theme);
      setHostPinRequired(res.hostPinRequired);
      applyThemeToRoot(res.theme);
      flash("外观已保存");
    } catch (e) {
      onError(e);
    }
  };

  return (
    <section className="card">
      <p className="muted">
        可参与 {summary.eligible} / {summary.totalActive} 人
        {locked ? " · 已锁定" : " · 未锁定"}
      </p>
      <div className="form-row">
        <label>
          参与资格
          <select
            className="input"
            value={mode}
            disabled={locked}
            onChange={(e) => setMode(e.target.value as EligibilityMode)}
          >
            <option value="all">全员（不签到）</option>
            <option value="checked_in_only">仅已签到</option>
            <option value="manual_eligible">手动勾选可参与</option>
            <option value="hybrid">签到且可参与</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={allowRepeat}
            disabled={locked}
            onChange={(e) => setAllowRepeat(e.target.checked)}
          />
          允许同一人重复中奖
        </label>
      </div>
      <div className="form-row">
        <button type="button" className="btn primary" disabled={locked} onClick={() => void onSave()}>
          保存设置
        </button>
        {!locked ? (
          <button type="button" className="btn" onClick={() => void onLock()}>
            锁定活动
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={role !== "admin"}
            onClick={() => void onUnlock()}
          >
            解锁（admin）
          </button>
        )}
      </div>
      {theme && (
        <>
          <h3 className="section-title">外观与音效</h3>
          <p className="hint">选择风格后点击下方预览；改色块将标记为「自定义」。保存后大屏刷新即生效。</p>
          <div className="theme-preset-grid">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  theme.presetId === p.id ? "theme-preset-card active" : "theme-preset-card"
                }
                onClick={() => {
                  const next = applyPresetToTheme(theme, p);
                  setTheme(next);
                  applyThemeToRoot(next);
                }}
              >
                <span
                  className="theme-preset-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${p.colors.bgTop} 40%, ${p.colors.accent} 100%)`,
                  }}
                />
                <span className="theme-preset-name">{p.name}</span>
                <span className="theme-preset-desc">{p.description}</span>
              </button>
            ))}
            <button
              type="button"
              className={
                theme.presetId === "custom" ? "theme-preset-card active" : "theme-preset-card"
              }
              onClick={() => setTheme({ ...theme, presetId: "custom" })}
            >
              <span className="theme-preset-swatch custom">✎</span>
              <span className="theme-preset-name">自定义</span>
              <span className="theme-preset-desc">手动调色</span>
            </button>
          </div>
          <h4 className="subsection-title">姓名滚动方式</h4>
          <p className="hint">控制姓名卡片如何运动（与下方背景特效独立）。保存后大屏约 12 秒内自动同步。</p>
          <div className="theme-preset-grid sphere-roll-grid">
            {sphereRollModes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={
                  (theme.sphereRollMode ?? "globe") === m.id
                    ? "theme-preset-card active"
                    : "theme-preset-card"
                }
                onClick={() => setTheme({ ...theme, sphereRollMode: m.id })}
              >
                <span className="theme-preset-swatch sphere-roll" data-roll={m.id} />
                <span className="theme-preset-name">{m.name}</span>
                <span className="theme-preset-desc">{m.description}</span>
              </button>
            ))}
          </div>
          <h4 className="subsection-title">大屏背景特效</h4>
          <p className="hint">姓名球阵背后的 3D 氛围（星空 / 海水 / 火焰 / 极光等）。</p>
          <div className="theme-preset-grid sphere-effect-grid">
            {sphereEffects.map((fx) => (
              <button
                key={fx.id}
                type="button"
                className={
                  (theme.sphereEffect ?? "classic") === fx.id
                    ? "theme-preset-card active"
                    : "theme-preset-card"
                }
                onClick={() => setTheme({ ...theme, sphereEffect: fx.id })}
              >
                <span className="theme-preset-swatch sphere-fx" data-fx={fx.id} />
                <span className="theme-preset-name">{fx.name}</span>
                <span className="theme-preset-desc">{fx.description}</span>
              </button>
            ))}
          </div>
          <div className="form-row">
            <input
              className="input"
              value={theme.title}
              onChange={(e) => setTheme({ ...theme, title: e.target.value })}
              placeholder="大屏标题"
            />
            <input
              className="input"
              value={theme.logoUrl ?? ""}
              onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value || null })}
              placeholder="Logo URL（可选）"
            />
          </div>
          <div className="form-row">
            <label>
              主色
              <input
                type="color"
                value={theme.accent}
                onChange={(e) => {
                  const next = {
                    ...theme,
                    accent: e.target.value,
                    presetId: markCustomIfColorsChanged(
                      { ...theme, accent: e.target.value },
                      presets
                    ),
                  };
                  setTheme(next);
                  applyThemeToRoot(next);
                }}
              />
            </label>
            <label>
              强调色
              <input
                type="color"
                value={theme.accent2}
                onChange={(e) => {
                  const next = {
                    ...theme,
                    accent2: e.target.value,
                    presetId: markCustomIfColorsChanged(
                      { ...theme, accent2: e.target.value },
                      presets
                    ),
                  };
                  setTheme(next);
                  applyThemeToRoot(next);
                }}
              />
            </label>
            <label>
              背景顶
              <input
                type="color"
                value={theme.bgTop}
                onChange={(e) => {
                  const next = {
                    ...theme,
                    bgTop: e.target.value,
                    presetId: markCustomIfColorsChanged(
                      { ...theme, bgTop: e.target.value },
                      presets
                    ),
                  };
                  setTheme(next);
                  applyThemeToRoot(next);
                }}
              />
            </label>
            <label>
              背景底
              <input
                type="color"
                value={theme.bgBottom}
                onChange={(e) => {
                  const next = {
                    ...theme,
                    bgBottom: e.target.value,
                    presetId: markCustomIfColorsChanged(
                      { ...theme, bgBottom: e.target.value },
                      presets
                    ),
                  };
                  setTheme(next);
                  applyThemeToRoot(next);
                }}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={theme.musicEnabled}
                onChange={(e) => setTheme({ ...theme, musicEnabled: e.target.checked })}
              />
              大屏音效
            </label>
            <label>
              音量
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={theme.musicVolume}
                onChange={(e) =>
                  setTheme({ ...theme, musicVolume: Number(e.target.value) })
                }
              />
            </label>
            <input
              className="input"
              type="password"
              placeholder="主持 PIN（空=不校验）"
              value={hostPin}
              onChange={(e) => setHostPin(e.target.value)}
            />
            {hostPinRequired && <span className="muted">当前已启用 PIN</span>}
          </div>
          <button type="button" className="btn primary" onClick={() => void onSaveTheme()}>
            保存外观
          </button>
        </>
      )}
    </section>
  );
}

function LogsPanel({ onError }: { onError: (e: unknown) => void }) {
  const [items, setItems] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    void api
      .getAuditLogs()
      .then((r) => setItems(r.items))
      .catch(onError);
  }, [onError]);

  return (
    <section>
      <table className="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>动作</th>
            <th>实体</th>
            <th>哈希</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.created_at}</td>
              <td>{row.action}</td>
              <td>
                {row.entity_type} #{row.entity_id}
              </td>
              <td className="mono small">{row.entry_hash.slice(0, 16)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}