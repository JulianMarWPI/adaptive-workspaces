// Researcher setup screen (/setup): participant ID, condition order, K,
// sensing mode, Ollama status, and session export.

import { useEffect, useState } from 'react';
import { useStore, type SensingMode } from '../state/store';
import { counterbalance, type Cond, type WorkbookId } from '../tasks/workbooks';

const SERVER = 'http://127.0.0.1:8787';
const ALL_CONDS: Cond[] = ['default', 'proactive', 'prompted'];
const ALL_WBS: WorkbookId[] = ['A', 'B', 'C'];

interface Health {
  ok: boolean;
  ollama: { reachable: boolean; modelAvailable: boolean; models: string[] };
  model: string;
  minerK: number;
}

export function SetupScreen() {
  const startSession = useStore((s) => s.startSession);
  const [pid, setPid] = useState('P01');
  const [pilot, setPilot] = useState(true);
  const [K, setK] = useState(3);
  const [sensing, setSensing] = useState<SensingMode>('none');
  const [health, setHealth] = useState<Health | null>(null);
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<{ pid: string; session: string; bytes: number }[]>([]);
  const cb = counterbalance(pid, pilot);
  const [conds, setConds] = useState<Cond[] | null>(null);
  const [wbs, setWbs] = useState<WorkbookId[] | null>(null);
  const condOrder = conds ?? cb.conds;
  const wbOrder = wbs ?? cb.workbooks;

  useEffect(() => {
    fetch(`${SERVER}/health`)
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        setServerUp(true);
        setK(h.minerK);
        useStore.getState().setOllamaOk(h.ollama.reachable && h.ollama.modelAvailable);
      })
      .catch(() => setServerUp(false));
    fetch(`${SERVER}/sessions`)
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {});
  }, []);

  const start = () => {
    const session = `s${Date.now().toString(36)}`;
    startSession({
      pid: pid.trim() || 'P00',
      session,
      pilot,
      demo: false,
      K,
      sensing,
      condOrder,
      workbookOrder: wbOrder,
      consent: { interaction: false, eye: false, eeg: false },
    });
  };

  return (
    <div className="aw-setup">
      <h1>Adaptive Workspaces — researcher setup</h1>

      <div className="aw-setup-grid">
        <label>Participant ID
          <input value={pid} onChange={(e) => { setPid(e.target.value); setConds(null); setWbs(null); }} />
        </label>
        <label>Study
          <select value={pilot ? 'pilot' : 'full'}
            onChange={(e) => { setPilot(e.target.value === 'pilot'); setConds(null); setWbs(null); }}>
            <option value="pilot">Pilot (default, proactive)</option>
            <option value="full">Full (all three conditions)</option>
          </select>
        </label>
        <label>Miner threshold K
          <input type="number" min={2} max={6} value={K} onChange={(e) => setK(Number(e.target.value) || 3)} />
        </label>
        <label>Sensing
          <select value={sensing} onChange={(e) => setSensing(e.target.value as SensingMode)}>
            <option value="none">None</option>
            <option value="webgazer">Webcam (WebGazer)</option>
            <option value="lab">Lab (LSL bridge)</option>
          </select>
        </label>
      </div>

      <h3>Counterbalancing (from participant ID; editable)</h3>
      <table className="aw-setup-table">
        <thead><tr><th>Block</th><th>Condition</th><th>Workbook</th></tr></thead>
        <tbody>
          {condOrder.map((c, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <select value={c} onChange={(e) => {
                  const next = condOrder.slice();
                  next[i] = e.target.value as Cond;
                  setConds(next);
                }}>
                  {ALL_CONDS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </td>
              <td>
                <select value={wbOrder[i]} onChange={(e) => {
                  const next = wbOrder.slice();
                  next[i] = e.target.value as WorkbookId;
                  setWbs(next);
                }}>
                  {ALL_WBS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Status</h3>
      <ul className="aw-status">
        <li>Local server: {serverUp === null ? 'checking…' : serverUp ? '✅ running' : '❌ not running — start it with: npm run dev:server'}</li>
        <li>
          Ollama: {health
            ? health.ollama.reachable
              ? health.ollama.modelAvailable
                ? `✅ running, ${health.model} available`
                : `⚠️ running but ${health.model} missing — run: ollama pull ${health.model} (proposals will use template text)`
              : '⚠️ not reachable — proposals will use template text'
            : '…'}
        </li>
      </ul>

      <button className="aw-primary aw-big" onClick={start} disabled={serverUp === false}>
        Start session
      </button>
      {serverUp === false && <p className="aw-warn">Start the local server first so the session is recorded.</p>}
      <p><a href="/demo">Demo mode</a> — seeded, skips consent, two-minute click-through.</p>

      {sessions.length > 0 && (
        <>
          <h3>Recorded sessions</h3>
          <ul className="aw-status">
            {sessions.map((s) => (
              <li key={`${s.pid}/${s.session}`}>
                {s.pid}/{s.session} ({(s.bytes / 1024).toFixed(1)} KB){' '}
                <a href={`${SERVER}/export/${s.pid}/${s.session}`}>export</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
