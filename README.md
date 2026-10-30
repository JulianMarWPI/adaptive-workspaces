# Adaptive Workspaces

A research prototype for a WPI HCI study (CS 546): a web spreadsheet that logs
every action as a structured command, detects command sequences the user
repeats across sheets, uses a **local** LLM to turn each repeat into a named
one-click tool, and asks the user to approve it on a proposal card before
adding it to a "My tools" toolbar. Supports eye-tracking/EEG sync via LSL and
runs a within-subjects study.

**Everything runs offline on one laptop.** No cloud APIs, no telemetry, no CDN
at runtime. Participant data never leaves the machine
(`data/sessions/<pid>/<session>.jsonl`).

## Setup (9 commands)

```bash
# 1. prerequisites: Node 20+, Python 3.11+, Ollama (https://ollama.com)
git clone <this repo> && cd adaptive-workspaces   # or unzip
npm install
ollama pull qwen3:8b
python -m pip install -r analysis/requirements.txt
python -m pip install -r bridge/requirements.txt   # only needed for lab mode
cp .env.example .env                               # optional: tweak model/K/port
npm run dev                                        # starts server (8787) + web app (5173)
python bridge/lsl_bridge.py                        # only in lab mode, separate terminal
```

Open **http://127.0.0.1:5173/setup** for the researcher screen, or
**http://127.0.0.1:5173/demo** for a seeded two-minute click-through
(skips consent).

## Running a participant session

1. Start Ollama (`ollama serve` if it is not already running), then `npm run dev`.
2. Go to `/setup`: enter the participant ID, pick pilot/full study, K, and the
   sensing mode. The screen shows server + Ollama status and the
   counterbalanced condition/workbook order (from the participant ID via a
   Latin square; editable).
3. Click **Start session** → consent (one checkbox per data stream) →
   calibration (if sensing is on) → 2-minute practice sheet → blocks, each
   followed by NASA-TLX → end screen.
4. In lab mode, start `python bridge/lsl_bridge.py` first and record the
   `AdaptiveWorkspaces` marker stream in LabRecorder. Five sync pulses are
   emitted at session start.

See `RUNBOOK.md` for the full pilot checklist.

## Where the data goes

- Live: browser IndexedDB (crash safety) + batched POSTs to the local server.
- On disk: `data/sessions/<pid>/<session>.jsonl` — one JSON event per line.
- Export: from `/setup` (recorded sessions list) or the end screen.

## Analysis

```bash
python analysis/analyze.py
```

Reads every session under `data/sessions/`, writes `analysis/out/summary.csv`
(per-sheet time, manual/tool steps, correctness, tool-existed), plus
`proposals.csv`, `tlx.csv`, `gaze.csv`, and PNG charts.

## Tests

```bash
npm test                 # core (50) + server (24) unit tests, mocked LLM
npm run test:e2e         # Playwright: scripted participant, full proactive flow
cd analysis && python -m pytest       # analysis on a generated fake session
npm run eval:llm         # real model, 50 proposals: valid rate + latency
npm run eval:prompt      # real model, 25 requests: exact-match accuracy
```

The two `eval:*` scripts need Ollama running with the configured model.

## Architecture (short)

- `packages/core` — shared, pure TypeScript: command vocabulary with
  `apply`/invert (`commands.ts`), normalization (`normalize.ts`), repeat miner
  (`miner.ts`), parameter generalizer (`generalize.ts`), tool executor with
  rollback (`execute.ts`), correctness checker (`checker.ts`).
- `apps/server` — Fastify on 127.0.0.1:8787: JSONL log sink, `/propose`
  (LLM names a mined pattern; validate → retry once → deterministic fallback),
  `/prompt` (request → validated command list; prompted condition only).
- `apps/web` — React + Handsontable. Every grid change goes through
  `dispatch(command, source)`; the LLM never writes code and never decides
  steps, so a model mistake can produce a bad label, never a broken sheet.
- `bridge/` — websocket → LSL marker outlet (`AdaptiveWorkspaces`).
- `analysis/` — Python pipeline (pandas/matplotlib).

Design choices not fixed by the study plan are recorded in `DECISIONS.md`.
