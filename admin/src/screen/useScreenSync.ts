import { useCallback, useEffect, useRef, useState } from "react";
import { loadScreenStateCache, saveScreenState } from "./idb";
import type { ScreenState, WsMessage } from "./types";

const defaultState: ScreenState = {
  phase: "idle",
  prizeId: null,
  prizeName: null,
  roundId: null,
  pool: [],
  winners: [],
  resultHash: null,
  updatedAt: "",
};

export function useScreenSync() {
  const [state, setState] = useState<ScreenState>(defaultState);
  const [connected, setConnected] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const apply = useCallback((next: ScreenState, source: "server" | "cache" = "server") => {
    setState(next);
    if (source === "server") setFromCache(false);
    void saveScreenState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadScreenStateCache().then((cached) => {
      if (!cancelled && cached) {
        apply(cached, "cache");
        setFromCache(true);
      }
    });

    void fetch("/api/screen/state")
      .then((r) => r.json())
      .then((data: ScreenState) => {
        if (!cancelled) apply(data, "server");
      });

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMessage;
        if (msg.state) apply(msg.state, "server");
      } catch {
        /* ignore */
      }
    };

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [apply]);

  return { state, connected, fromCache };
}