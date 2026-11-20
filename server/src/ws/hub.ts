import type { WebSocket } from "ws";
import type { ScreenState } from "../lib/screen-types.js";

export class ScreenHub {
  private clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket));
  }

  broadcast(state: ScreenState): void {
    const payload = JSON.stringify({ type: "phase", state } satisfies { type: "phase"; state: ScreenState });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  sendSync(socket: WebSocket, state: ScreenState): void {
    socket.send(JSON.stringify({ type: "sync", state } satisfies { type: "sync"; state: ScreenState }));
  }
}