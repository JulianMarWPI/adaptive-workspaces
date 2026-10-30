// Session logger. Every event is one JSON line.
// Sinks: in-memory (feeds the miner and export), IndexedDB (crash safety),
// batched POST to the local server, and — in lab mode — the LSL bridge
// websocket. Participant data never leaves the machine.

import type { LogEvent } from '@aw/core';

export interface SessionMeta {
  pid: string;
  session: string;
  cond: LogEvent['cond'];
  block: number;
}

const SERVER = 'http://127.0.0.1:8787';

export class Logger {
  meta: SessionMeta;
  events: LogEvent[] = [];
  private pending: LogEvent[] = [];
  private db: IDBDatabase | null = null;
  private flushTimer: number | null = null;
  private listeners = new Set<(e: LogEvent) => void>();
  /** Lab-mode websocket to bridge/lsl_bridge.py (set by sensing/bridge.ts). */
  bridgeSend: ((e: LogEvent) => void) | null = null;
  serverReachable = true;

  constructor(meta: SessionMeta) {
    this.meta = meta;
    this.openDb();
    this.flushTimer = window.setInterval(() => this.flush(), 2000);
    window.addEventListener('beforeunload', () => this.flush());
  }

  private openDb() {
    try {
      const req = indexedDB.open('aw-logs', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('events')) {
          req.result.createObjectStore('events', { autoIncrement: true });
        }
      };
      req.onsuccess = () => (this.db = req.result);
    } catch {
      this.db = null; // e.g. private browsing; memory + server still work
    }
  }

  /** Subscribe to every new event (used by the assistant engine and AOI). */
  onEvent(fn: (e: LogEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  log(partial: Partial<LogEvent> & { kind: LogEvent['kind'] }): LogEvent {
    const e: LogEvent = {
      t: performance.now(),
      wall: new Date().toISOString(),
      pid: this.meta.pid,
      session: this.meta.session,
      cond: this.meta.cond,
      block: this.meta.block,
      ...partial,
    } as LogEvent;
    this.events.push(e);
    this.pending.push(e);
    if (this.db) {
      try {
        this.db.transaction('events', 'readwrite').objectStore('events').add(e);
      } catch {
        /* non-fatal */
      }
    }
    this.bridgeSend?.(e);
    for (const fn of this.listeners) fn(e);
    return e;
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    try {
      const res = await fetch(`${SERVER}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pid: this.meta.pid, session: this.meta.session, events: batch }),
      });
      this.serverReachable = res.ok;
    } catch {
      this.serverReachable = false;
      this.pending.unshift(...batch); // retry next tick; memory copy is intact
      if (this.pending.length > 20000) this.pending.length = 20000;
    }
  }

  /** Download everything logged so far as a .jsonl file. */
  exportJsonl() {
    const text = this.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const blob = new Blob([text], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.meta.pid}_${this.meta.session}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  dispose() {
    if (this.flushTimer) window.clearInterval(this.flushTimer);
    this.flush();
  }
}
