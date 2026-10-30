// LLM proposer (section 4d). The LLM never decides the steps — it only
// names the tool, writes the card text, and picks a template. Deterministic
// code found and stored the steps; an LLM mistake can produce a bad label,
// never a broken spreadsheet.
//
// Validate -> retry once -> deterministic fallback. The path taken is
// logged with the proposal so every card is reproducible from log + config.

import {
  COMMAND_SPECS,
  describeSteps,
  type CommandName,
  type GeneralizedPattern,
} from '@aw/core';
import { OllamaError, ollamaGenerate, type FetchLike } from './ollama.ts';

export interface Proposal {
  label: string;
  summary: string;
  card_text: string;
  element: 'button' | 'button_with_input';
  exposed_inputs: { param: string; friendly_name: string }[];
}

export interface ProposeResult {
  proposal: Proposal;
  /** Which path produced it: first LLM call, the retry, or the fallback. */
  path: 'llm' | 'llm_retry' | 'fallback';
  latencyMs: number;
  /** Validation errors seen along the way (for the researcher log). */
  errors: string[];
}

export const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', maxLength: 30 },
    summary: { type: 'string' },
    card_text: { type: 'string' },
    element: { type: 'string', enum: ['button', 'button_with_input'] },
    exposed_inputs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          param: { type: 'string' },
          friendly_name: { type: 'string' },
        },
        required: ['param', 'friendly_name'],
      },
    },
  },
  required: ['label', 'summary', 'card_text', 'element', 'exposed_inputs'],
} as const;

const TEMPLATE_DESCRIPTIONS = `Available card templates:
- "button": a single one-click button. Use when the tool needs no input.
- "button_with_input": a button with one or more small input fields. Use only when the tool has exposed inputs the user may want to change per run.`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Words that may appear in a summary for the commands in this pattern. */
function allowedKeywords(cmds: CommandName[]): Set<string> {
  const s = new Set<string>();
  for (const c of cmds) for (const k of COMMAND_SPECS[c].keywords) s.add(k);
  return s;
}

/** Generic spreadsheet words that are never treated as operation mentions. */
const GENERIC_WORDS = new Set([
  'sheet', 'sheets', 'row', 'rows', 'column', 'columns', 'header', 'headers',
  'cell', 'cells', 'value', 'values', 'number', 'numbers', 'format', 'formats',
  'formatted', 'add', 'adds', 'set', 'sets', 'name', 'top', 'style', 'styles',
  'button', 'click', 'one', 'step', 'steps', 'table', 'data', 'amount', 'date',
]);

/** Keywords belonging ONLY to commands not in the pattern. */
function forbiddenKeywords(cmds: CommandName[]): Set<string> {
  const allowed = allowedKeywords(cmds);
  const out = new Set<string>();
  const inPattern = new Set(cmds);
  for (const [name, spec] of Object.entries(COMMAND_SPECS)) {
    if (inPattern.has(name as CommandName)) continue;
    for (const k of spec.keywords) {
      if (!allowed.has(k) && !GENERIC_WORDS.has(k)) out.add(k);
    }
  }
  return out;
}

export function validateProposal(raw: unknown, pattern: GeneralizedPattern): string | null {
  if (typeof raw !== 'object' || raw === null) return 'not an object';
  const p = raw as Record<string, unknown>;
  if (typeof p.label !== 'string' || p.label.trim() === '') return 'label missing';
  if (p.label.length > 30) return `label too long (${p.label.length} > 30)`;
  if (typeof p.summary !== 'string' || p.summary.trim() === '') return 'summary missing';
  if (typeof p.card_text !== 'string' || p.card_text.trim() === '') return 'card_text missing';
  if (p.element !== 'button' && p.element !== 'button_with_input') return 'bad element';
  if (!Array.isArray(p.exposed_inputs)) return 'exposed_inputs not an array';

  const realParams = new Set(pattern.exposedParams.map((e) => e.param));
  for (const e of p.exposed_inputs as unknown[]) {
    const o = e as Record<string, unknown>;
    if (typeof o?.param !== 'string' || typeof o?.friendly_name !== 'string')
      return 'exposed_inputs item malformed';
    if (!realParams.has(o.param)) return `exposed input "${o.param}" is not a real parameter`;
  }

  // The summary must not mention operations that are not in the pattern.
  const cmds = pattern.steps.map((s) => s.cmd);
  const forbidden = forbiddenKeywords(cmds);
  const words = (p.summary as string).toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of words) {
    if (forbidden.has(w)) return `summary mentions "${w}", which is not in the pattern`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(pattern: GeneralizedPattern, occurrenceCount: number): { system: string; user: string } {
  const steps = describeSteps(pattern.steps);
  const system = `You name small spreadsheet automation tools for a research prototype.
You are given the exact steps of a repeated action sequence. You do NOT choose or change the steps.
Respond with JSON only, matching the requested schema.
Rules:
- label: at most 30 characters, a short verb phrase naming what the tool does (e.g. "Clean monthly sheet").
- summary: one sentence describing what the tool does. Mention ONLY the operations listed in the steps.
- card_text: one friendly sentence of the form "You've done X on N sheets (M steps). Add a button that does it in one click?" adapted to the steps.
- element: pick a template. ${TEMPLATE_DESCRIPTIONS}
- exposed_inputs: one entry per adjustable parameter listed below (use the exact "param" string); empty array if none.`;
  const inputs =
    pattern.exposedParams.length === 0
      ? 'Adjustable parameters: none.'
      : `Adjustable parameters: ${pattern.exposedParams
          .map((e) => `${e.param} (default ${JSON.stringify(e.default)})`)
          .join(', ')}.`;
  const user = `The user repeated this ${steps.length}-step sequence on ${occurrenceCount} sheets:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
${inputs}`;
  return { system, user };
}

// ---------------------------------------------------------------------------
// Deterministic fallback (template text from command names)
// ---------------------------------------------------------------------------

export function fallbackProposal(pattern: GeneralizedPattern, occurrenceCount: number): Proposal {
  const n = pattern.steps.length;
  return {
    label: `${n}-step shortcut`,
    summary: describeSteps(pattern.steps).join('; ') + '.',
    card_text: `You've done the same ${n} steps on ${occurrenceCount} sheets. Add a button for these ${n} steps?`,
    element: pattern.exposedParams.length > 0 ? 'button_with_input' : 'button',
    exposed_inputs: pattern.exposedParams.map((e) => ({
      param: e.param,
      friendly_name: e.param.replace(/^step\d+_/, ''),
    })),
  };
}

// ---------------------------------------------------------------------------
// Main entry: call LLM, validate, retry once, fall back.
// ---------------------------------------------------------------------------

export async function propose(
  pattern: GeneralizedPattern,
  occurrenceCount: number,
  fetchFn?: FetchLike,
): Promise<ProposeResult> {
  const t0 = Date.now();
  const { system, user } = buildPrompt(pattern, occurrenceCount);
  const errors: string[] = [];

  for (const attempt of ['llm', 'llm_retry'] as const) {
    try {
      const extra =
        attempt === 'llm_retry' && errors.length > 0
          ? `\nYour previous answer was rejected: ${errors[errors.length - 1]}. Fix that and answer again.`
          : '';
      const text = await ollamaGenerate({
        system,
        user: user + extra,
        schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
        fetchFn,
      });
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        errors.push('response was not valid JSON');
        continue;
      }
      const problem = validateProposal(parsed, pattern);
      if (problem) {
        errors.push(problem);
        continue;
      }
      return { proposal: parsed as Proposal, path: attempt, latencyMs: Date.now() - t0, errors };
    } catch (err) {
      errors.push(err instanceof OllamaError ? `ollama: ${err.message}` : String(err));
      if (errors[errors.length - 1].includes('fetch failed') || err instanceof OllamaError) {
        // Unreachable or hard failure: no point retrying the same way twice
        // if the first error was a connection error.
        if (attempt === 'llm' && !/HTTP|no content/.test(String(err))) break;
      }
    }
  }

  return {
    proposal: fallbackProposal(pattern, occurrenceCount),
    path: 'fallback',
    latencyMs: Date.now() - t0,
    errors,
  };
}
