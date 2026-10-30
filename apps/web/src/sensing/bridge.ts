// Lab mode: forward every log event to bridge/lsl_bridge.py over a local
// websocket; the bridge pushes each as an LSL marker. Includes the sync
// check: 5 marker pulses at session start.

import type { Logger } from '../logging/logger';

const BRIDGE_URL = 'ws://127.0.0.1:8765';

export function connectBridge(logger: Logger): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: number | null = null;

  const open = () => {
    if (closed) return;
    ws = new WebSocket(BRIDGE_URL);
    ws.onopen = () => {
      logger.bridgeSend = (e) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
      };
      logger.log({ kind: 'session', event: 'bridge_connected' });
      // Sync check: 5 pulses, ~200 ms apart.
      for (let i = 1; i <= 5; i++) {
        window.setTimeout(() => logger.log({ kind: 'session', event: 'sync_pulse', pulse: i }), i * 200);
      }
    };
    ws.onclose = () => {
      logger.bridgeSend = null;
      if (!closed) retry = window.setTimeout(open, 2000);
    };
    ws.onerror = () => ws?.close();
  };

  open();
  return () => {
    closed = true;
    if (retry !== null) window.clearTimeout(retry);
    logger.bridgeSend = null;
    ws?.close();
  };
}
