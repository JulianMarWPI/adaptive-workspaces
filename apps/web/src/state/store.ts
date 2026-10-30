// Central app state. Every grid change flows through dispatch(); toolbar
// buttons, tools, and intercepted Handsontable edits never touch the grid
// directly.

import { create } from 'zustand';
import {
  applyCommand,
  checkSheet,
  CommandError,
  describeSteps,
  executeSteps,
  generalize,
  mine,
  newPolicyState,
  normalize,
  pickProposal,
  type ApplyResult,
  type Candidate,
  type Command,
  type CommandSource,
  type GeneralizedPattern,
  type LogEvent,
  type ProposalPolicyState,
  type SheetState,
  type ToolDef,
} from '@aw/core';
import { Logger } from '../logging/logger';
import {
  counterbalance,
  generateWorkbook,
  practiceSheet,
  type Cond,
  type WorkbookId,
} from '../tasks/workbooks';

const SERVER = 'http://127.0.0.1:8787';

export type Phase =
  | 'setup'
  | 'consent'
  | 'calibration'
  | 'practice'
  | 'task'
  | 'tlx'
  | 'end';

export type SensingMode = 'none' | 'webgazer' | 'lab';

export interface StudyConfig {
  pid: string;
  session: string;
  pilot: boolean;
  demo: boolean;
  K: number;
  sensing: SensingMode;
  condOrder: Cond[];
  workbookOrder: WorkbookId[];
  consent: { interaction: boolean; eye: boolean; eeg: boolean };
}

export interface ProposalCard {
  key: string;
  pattern: GeneralizedPattern;
  candidate: Candidate;
  label: string;
  summary: string;
  cardText: string;
  element: 'button' | 'button_with_input';
  exposedInputs: { param: string; friendly_name: string }[];
  path: 'llm' | 'llm_retry' | 'fallback' | 'local_fallback';
  expanded: boolean;
}

interface UndoEntry {
  sheetIndex: number;
  before: SheetState;
  after: SheetState;
  label: string;
}

export interface Highlight {
  sheetIndex: number;
  touched: ApplyResult['touched'][];
  at: number;
}

interface AWState {
  phase: Phase;
  config: StudyConfig | null;
  logger: Logger | null;
  ollamaOk: boolean;

  blockIndex: number; // 0-based block within condOrder
  cond: Cond;
  sheets: SheetState[];
  targets: SheetState[];
  active: number;
  gridVersion: number;

  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  tools: ToolDef[];
  card: ProposalCard | null;
  cardPendingKey: string | null;
  policy: ProposalPolicyState;
  panelDot: boolean;
  toolMessage: string | null;
  promptBusy: boolean;
  highlight: Highlight | null;
  lastManualAt: number;
  idleEvaluated: boolean;

  // --- actions ---
  startSession: (cfg: StudyConfig) => void;
  giveConsent: (c: StudyConfig['consent']) => void;
  finishCalibration: () => void;
  startPractice: () => void;
  beginBlock: (i: number) => void;
  endBlock: () => void;
  submitTlx: (values: Record<string, number>) => void;

  dispatch: (command: Command, source: CommandSource) => boolean;
  undo: () => void;
  redo: () => void;
  switchSheet: (i: number) => void;

  runTool: (tool: ToolDef, inputs?: Record<string, unknown>) => void;
  removeTool: (id: string) => void;
  maybePropose: (trigger: 'sheet_switch' | 'idle') => void;
  expandCard: () => void;
  acceptCard: (label?: string, enabledParams?: string[]) => void;
  dismissCard: (how: 'not_now' | 'never') => void;
  submitPrompt: (text: string) => Promise<void>;
  clearToolMessage: () => void;
  setOllamaOk: (ok: boolean) => void;
}

export const useStore = create<AWState>((set, get) => {
  /** Log an assistant event. */
  const logA = (event: string, extra: Record<string, unknown> = {}) =>
    get().logger?.log({ kind: 'assistant', event, ...extra });

  const sheetHeaders = (s: SheetState): string[] => (s.data[0] ?? []).map((h) => String(h ?? ''));

  return {
    phase: 'setup',
    config: null,
    logger: null,
    ollamaOk: false,
    blockIndex: -1,
    cond: 'default',
    sheets: [],
    targets: [],
    active: 0,
    gridVersion: 0,
    undoStack: [],
    redoStack: [],
    tools: [],
    card: null,
    cardPendingKey: null,
    policy: newPolicyState(),
    panelDot: false,
    toolMessage: null,
    promptBusy: false,
    highlight: null,
    lastManualAt: 0,
    idleEvaluated: true,

    setOllamaOk: (ok) => set({ ollamaOk: ok }),

    startSession: (cfg) => {
      const logger = new Logger({ pid: cfg.pid, session: cfg.session, cond: cfg.condOrder[0], block: 0 });
      logger.log({ kind: 'session', event: 'start', sensing: cfg.sensing, K: cfg.K, demo: cfg.demo,
        condOrder: cfg.condOrder, workbookOrder: cfg.workbookOrder, pilot: cfg.pilot });
      set({ config: cfg, logger, phase: cfg.demo ? 'practice' : 'consent' });
      if (cfg.demo) get().startPractice();
    },

    giveConsent: (consent) => {
      const { config, logger } = get();
      if (!config || !logger) return;
      logger.log({ kind: 'session', event: 'consent', ...consent });
      const next = config.sensing !== 'none' && consent.eye ? 'calibration' : 'practice';
      set({ config: { ...config, consent }, phase: next });
      if (next === 'practice') get().startPractice();
    },

    finishCalibration: () => {
      get().logger?.log({ kind: 'session', event: 'calibration_done' });
      set({ phase: 'practice' });
      get().startPractice();
    },

    startPractice: () => {
      const s = practiceSheet();
      get().logger?.log({ kind: 'session', event: 'practice_start' });
      set({
        phase: 'practice',
        sheets: [s],
        targets: [],
        active: 0,
        undoStack: [],
        redoStack: [],
        gridVersion: get().gridVersion + 1,
      });
    },

    beginBlock: (i) => {
      const { config, logger } = get();
      if (!config || !logger) return;
      const cond = config.condOrder[i];
      const wb = generateWorkbook(config.workbookOrder[i] ?? 'A');
      logger.meta = { ...logger.meta, cond, block: i + 1 };
      logger.log({ kind: 'session', event: 'block_start', workbook: wb.id, condName: cond });
      set({
        blockIndex: i,
        cond,
        sheets: wb.sheets.map((s) => structuredClone(s)),
        targets: wb.targets,
        active: 0,
        undoStack: [],
        redoStack: [],
        tools: [],
        card: null,
        cardPendingKey: null,
        policy: newPolicyState(),
        panelDot: false,
        toolMessage: null,
        phase: 'task',
        gridVersion: get().gridVersion + 1,
      });
    },

    endBlock: () => {
      const { sheets, targets, logger } = get();
      const scores = sheets.map((s, i) => (targets[i] ? checkSheet(s, targets[i]) : null));
      logger?.log({
        kind: 'session',
        event: 'block_end',
        scores: scores.map((sc, i) => sc && { sheet: sheets[i].name, score: sc.score, passed: sc.passed, total: sc.total }),
      });
      set({ phase: 'tlx' });
    },

    submitTlx: (values) => {
      const { logger, blockIndex, config } = get();
      logger?.log({ kind: 'session', event: 'tlx', values });
      const nextBlock = blockIndex + 1;
      if (config && nextBlock < config.condOrder.length) {
        get().beginBlock(nextBlock);
      } else {
        logger?.log({ kind: 'session', event: 'end' });
        logger?.flush();
        set({ phase: 'end' });
      }
    },

    dispatch: (command, source) => {
      const st = get();
      const sheet = st.sheets[st.active];
      if (!sheet) return false;
      const rowCount = sheet.data.length;
      let result: ApplyResult;
      try {
        result = applyCommand(sheet, command);
      } catch (err) {
        if (err instanceof CommandError) {
          set({ toolMessage: err.message });
          st.logger?.log({ kind: 'command', source, sheet: sheet.name, cmd: command.cmd,
            args: command.args as Record<string, unknown>, error: err.message, failed: true });
          return false;
        }
        throw err;
      }
      const sheets = st.sheets.slice();
      sheets[st.active] = result.next;
      st.logger?.log({
        kind: 'command',
        source,
        sheet: sheet.name,
        cmd: command.cmd,
        args: command.args as Record<string, unknown>,
        ctx: { rowCount },
      });
      set({
        sheets,
        undoStack: [
          ...st.undoStack,
          { sheetIndex: st.active, before: result.inverse, after: result.next, label: command.cmd },
        ],
        redoStack: [],
        gridVersion: st.gridVersion + 1,
        highlight: { sheetIndex: st.active, touched: [result.touched], at: performance.now() },
        ...(source === 'manual' ? { lastManualAt: performance.now(), idleEvaluated: false } : {}),
      });
      return true;
    },

    undo: () => {
      const st = get();
      const entry = st.undoStack[st.undoStack.length - 1];
      if (!entry) return;
      const sheets = st.sheets.slice();
      sheets[entry.sheetIndex] = structuredClone(entry.before);
      st.logger?.log({ kind: 'undo', sheet: sheets[entry.sheetIndex].name, cmd: entry.label as never });
      set({
        sheets,
        undoStack: st.undoStack.slice(0, -1),
        redoStack: [...st.redoStack, entry],
        active: entry.sheetIndex,
        gridVersion: st.gridVersion + 1,
      });
    },

    redo: () => {
      const st = get();
      const entry = st.redoStack[st.redoStack.length - 1];
      if (!entry) return;
      const sheets = st.sheets.slice();
      sheets[entry.sheetIndex] = structuredClone(entry.after);
      st.logger?.log({ kind: 'redo', sheet: sheets[entry.sheetIndex].name, cmd: entry.label as never });
      set({
        sheets,
        undoStack: [...st.undoStack, entry],
        redoStack: st.redoStack.slice(0, -1),
        active: entry.sheetIndex,
        gridVersion: st.gridVersion + 1,
      });
    },

    switchSheet: (i) => {
      const st = get();
      if (i === st.active || !st.sheets[i]) return;
      st.logger?.log({ kind: 'sheet_switch', sheet: st.sheets[i].name });
      set({ active: i, gridVersion: st.gridVersion + 1 });
      // A sheet switch means an occurrence may have just completed.
      get().maybePropose('sheet_switch');
    },

    runTool: (tool, inputs = {}) => {
      const st = get();
      const sheet = st.sheets[st.active];
      if (!sheet) return;
      const result = executeSteps(sheet, tool.steps, inputs);
      if (!result.ok) {
        set({ toolMessage: `"${tool.label}" didn't run: ${result.error}. Nothing was changed.` });
        logA('tool_error', { tool_id: tool.id, error: result.error, failed_step: result.failedStep });
        return;
      }
      // Log every step as a command with source "tool"...
      for (const c of result.applied) {
        st.logger?.log({ kind: 'command', source: 'tool', sheet: sheet.name, cmd: c.cmd,
          args: c.args as Record<string, unknown>, tool_id: tool.id });
      }
      logA('tool_used', { tool_id: tool.id, steps: tool.steps.length });
      const sheets = st.sheets.slice();
      sheets[st.active] = result.state;
      // ...but group the whole run as ONE undo step.
      set({
        sheets,
        undoStack: [
          ...st.undoStack,
          { sheetIndex: st.active, before: structuredClone(sheet), after: result.state, label: tool.label },
        ],
        redoStack: [],
        gridVersion: st.gridVersion + 1,
        highlight: { sheetIndex: st.active, touched: result.touched, at: performance.now() },
      });
    },

    removeTool: (id) => {
      logA('tool_removed', { tool_id: id });
      set({ tools: get().tools.filter((t) => t.id !== id) });
    },

    maybePropose: (trigger) => {
      const st = get();
      if (st.phase !== 'task' || st.cond !== 'proactive' || !st.config || !st.logger) return;
      if (st.card || st.cardPendingKey) return;
      // Mine the manual command stream of the current block only.
      const blockStart = st.logger.events.findIndex(
        (e) => e.kind === 'session' && e.event === 'block_start' && e.block === st.blockIndex + 1,
      );
      const events: LogEvent[] = st.logger.events
        .slice(blockStart === -1 ? 0 : blockStart)
        .filter(
          (e) =>
            (e.kind === 'command' && e.source === 'manual' && !e.failed) ||
            e.kind === 'sheet_switch' || e.kind === 'undo' || e.kind === 'redo',
        );
      const candidates = mine(normalize(events), st.config.K);
      const policy = { ...st.policy, openCardKey: st.card ? (st.card as ProposalCard).key : null };
      const candidate = pickProposal(candidates, policy);
      if (!candidate) return;

      const pattern = generalize(candidate);
      set({ cardPendingKey: candidate.key });
      logA('miner_fired', { trigger, key: candidate.key, support: candidate.support, length: candidate.length });

      // Start the LLM call in the background immediately.
      fetch(`${SERVER}/propose`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern, occurrenceCount: candidate.support }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`server ${res.status}`);
          return res.json() as Promise<{
            proposal: { label: string; summary: string; card_text: string; element: 'button' | 'button_with_input'; exposed_inputs: { param: string; friendly_name: string }[] };
            path: 'llm' | 'llm_retry' | 'fallback';
          }>;
        })
        .catch(() => {
          // Server (or Ollama) unreachable: deterministic local fallback.
          const n = pattern.steps.length;
          return {
            proposal: {
              label: `${n}-step shortcut`,
              summary: describeSteps(pattern.steps).join('; ') + '.',
              card_text: `You've done the same ${n} steps on ${candidate.support} sheets. Add a button for these ${n} steps?`,
              element: (pattern.exposedParams.length > 0 ? 'button_with_input' : 'button') as 'button' | 'button_with_input',
              exposed_inputs: pattern.exposedParams.map((e) => ({ param: e.param, friendly_name: e.param })),
            },
            path: 'local_fallback' as const,
          };
        })
        .then(({ proposal, path }) => {
          const cur = get();
          if (cur.cardPendingKey !== candidate.key || cur.phase !== 'task') return;
          set({
            card: {
              key: candidate.key,
              pattern,
              candidate,
              label: proposal.label,
              summary: proposal.summary,
              cardText: proposal.card_text,
              element: proposal.element,
              exposedInputs: proposal.exposed_inputs,
              path,
              expanded: false,
            },
            cardPendingKey: null,
            panelDot: true,
          });
          logA('proposal_shown', { key: candidate.key, label: proposal.label, path, support: candidate.support });
        });
    },

    expandCard: () => {
      const { card } = get();
      if (!card || card.expanded) return;
      logA('proposal_expanded', { key: card.key });
      set({ card: { ...card, expanded: true } });
    },

    acceptCard: (label, enabledParams) => {
      const st = get();
      const card = st.card;
      if (!card) return;
      const finalLabel = (label ?? card.label).slice(0, 30);
      const edited = label !== undefined && label !== card.label;
      const enabled = new Set(enabledParams ?? card.exposedInputs.map((e) => e.param));
      const tool: ToolDef = {
        id: card.key,
        label: finalLabel,
        summary: card.summary,
        steps: card.pattern.steps,
        exposedParams: card.pattern.exposedParams
          .filter((e) => enabled.has(e.param))
          .map((e) => ({
            param: e.param,
            friendly_name: card.exposedInputs.find((x) => x.param === e.param)?.friendly_name ?? e.param,
            default: e.default,
          })),
        origin: 'mined',
      };
      st.policy.accepted.add(card.key);
      logA(edited ? 'edited' : 'accepted', { key: card.key, label: finalLabel, steps: tool.steps.length });
      set({ tools: [...st.tools, tool], card: null, panelDot: false });
    },

    dismissCard: (how) => {
      const st = get();
      const card = st.card;
      if (!card) return;
      if (how === 'not_now') {
        st.policy.deferred.set(card.key, card.candidate.support);
      } else {
        st.policy.suppressed.add(card.key);
      }
      logA(how, { key: card.key });
      set({ card: null, panelDot: false });
    },

    submitPrompt: async (text) => {
      const st = get();
      if (st.cond !== 'prompted' || !text.trim() || st.promptBusy) return;
      const sheet = st.sheets[st.active];
      logA('prompt_submitted', { text });
      set({ promptBusy: true, toolMessage: null });
      try {
        const res = await fetch(`${SERVER}/prompt`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ request: text, headers: sheetHeaders(sheet) }),
        });
        const r = (await res.json()) as {
          ok: boolean; label?: string; summary?: string;
          steps?: ToolDef['steps']; error?: string;
        };
        if (!r.ok || !r.steps) {
          logA('prompt_result', { ok: false, error: r.error });
          set({ toolMessage: r.error ?? 'Could not build that tool.', promptBusy: false });
          return;
        }
        // Prompted tools are added immediately, no confirmation card.
        const tool: ToolDef = {
          id: `prompt_${Date.now().toString(36)}`,
          label: r.label ?? 'Custom tool',
          summary: r.summary ?? '',
          steps: r.steps,
          exposedParams: [],
          origin: 'prompted',
        };
        logA('prompt_result', { ok: true, label: tool.label, steps: tool.steps.length, tool_id: tool.id });
        set({ tools: [...get().tools, tool], promptBusy: false });
      } catch {
        logA('prompt_result', { ok: false, error: 'server unreachable' });
        set({ toolMessage: 'The local server is not reachable.', promptBusy: false });
      }
    },

    clearToolMessage: () => set({ toolMessage: null }),
  };
});

// Exposed for the Playwright end-to-end test (and researcher debugging).
if (typeof window !== 'undefined') {
  (window as unknown as { __aw: typeof useStore }).__aw = useStore;
}
