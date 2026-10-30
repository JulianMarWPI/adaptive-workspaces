// Prompted path (section 4f): the user types a request; the LLM maps it to
// an ordered list of commands from the fixed vocabulary. Every command and
// arg is validated against the shared schema before anything reaches the
// grid. Column references the LLM produces are plain header strings; the
// server hydrates them into header-bound steps so the tool re-targets
// columns by header on every sheet.

import {
  COMMAND_NAMES,
  COMMAND_SPECS,
  validateCommand,
  type Binding,
  type ColRef,
  type CommandName,
  type GeneralizedStep,
} from '@aw/core';
import { OllamaError, ollamaGenerate, type FetchLike } from './ollama.ts';

export interface PromptToolResult {
  ok: boolean;
  label?: string;
  summary?: string;
  steps?: GeneralizedStep[];
  error?: string;
  latencyMs: number;
}

export const PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', maxLength: 30 },
    commands: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          cmd: { type: 'string', enum: COMMAND_NAMES },
          args: { type: 'object' },
        },
        required: ['cmd', 'args'],
      },
    },
  },
  required: ['label', 'commands'],
} as const;

const FEW_SHOT = `Examples:

Request: "button that removes empty rows and sorts by date"
{"label":"Clean & sort by date","commands":[
 {"cmd":"deleteEmptyRows","args":{}},
 {"cmd":"sortBy","args":{"column":"Date","direction":"asc"}}]}

Request: "format amount as currency and right-align it"
{"label":"Currency amounts","commands":[
 {"cmd":"setNumberFormat","args":{"column":"Amount","format":"currency"}},
 {"cmd":"setAlignment","args":{"column":"Amount","align":"right"}}]}

Request: "bold the header and freeze it"
{"label":"Fix header","commands":[
 {"cmd":"setRowStyle","args":{"row":0,"bold":true}},
 {"cmd":"freezeRows","args":{"count":1}}]}

Request: "add totals under amount and qty"
{"label":"Add totals","commands":[
 {"cmd":"insertTotalRow","args":{"columns":["Amount","Qty"]}}]}

Request: "make all the columns fit their contents"
{"label":"Fit columns","commands":[
 {"cmd":"autoFitColumns","args":{"columns":["*"]}}]}

Request: "set the date column 160 pixels wide"
{"label":"Widen Date","commands":[
 {"cmd":"setColumnWidth","args":{"column":"Date","width":160}}]}

Request: "sort by amount, biggest first, and format it as currency"
{"label":"Sort by amount desc","commands":[
 {"cmd":"sortBy","args":{"column":"Amount","direction":"desc"}},
 {"cmd":"setNumberFormat","args":{"column":"Amount","format":"currency"}}]}`;

function systemPrompt(headers: string[]): string {
  const vocab = COMMAND_NAMES.map((name) => {
    const spec = COMMAND_SPECS[name];
    const args = Object.entries(spec.args)
      .map(([k, d]) => {
        const t =
          typeof d.type === 'object'
            ? d.type.enum.join('|')
            : d.type === 'colref'
              ? 'column header string'
              : d.type === 'colref[]'
                ? 'array of column header strings, or ["*"] for all'
                : d.type;
        return `${k}: ${t}${d.optional ? '?' : ''}`;
      })
      .join(', ');
    return `- ${name}(${args})`;
  }).join('\n');
  return `You translate a user's request into an ordered list of spreadsheet commands for a research prototype.
Use ONLY these commands (columns are referred to by header string):
${vocab}
The current sheet has these column headers: ${headers.join(', ')}.
Match column names case-insensitively to the real headers. Respond with JSON only.
Rules: label at most 30 characters. Do not invent commands or args. Row indices are 0-based; the header is row 0.

${FEW_SHOT}`;
}

/** Hydrate LLM-shaped args (headers as strings) into real command args, then
 * validate against the shared schema, then convert to header-bound steps. */
export function hydrateCommands(
  rawCommands: { cmd: string; args: Record<string, unknown> }[],
  headers: string[],
): { steps?: GeneralizedStep[]; error?: string } {
  const findHeader = (name: unknown): ColRef | null => {
    if (typeof name !== 'string') return null;
    const i = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    return i === -1 ? null : { index: i, header: headers[i] };
  };

  const steps: GeneralizedStep[] = [];
  for (const raw of rawCommands) {
    if (!(raw.cmd in COMMAND_SPECS)) return { error: `unknown command "${raw.cmd}"` };
    const spec = COMMAND_SPECS[raw.cmd as CommandName];
    const args: Record<string, unknown> = { ...raw.args };

    // Hydrate column refs and the sheet arg.
    for (const [key, def] of Object.entries(spec.args)) {
      if (def.type === 'colref' && args[key] !== undefined) {
        const ref = findHeader(args[key]);
        if (!ref) return { error: `no column named "${String(args[key])}" on this sheet` };
        args[key] = ref;
      }
      if (def.type === 'colref[]' && args[key] !== undefined) {
        let names = args[key];
        if (Array.isArray(names) && names.length === 1 && names[0] === '*') {
          names = [...headers];
        }
        if (!Array.isArray(names)) return { error: `${raw.cmd}.${key} must be a list of headers` };
        const refs: ColRef[] = [];
        for (const n of names) {
          const ref = findHeader(n);
          if (!ref) return { error: `no column named "${String(n)}" on this sheet` };
          refs.push(ref);
        }
        args[key] = refs;
      }
      if (key === 'sheet' && args[key] === undefined) args[key] = '__current__';
    }

    const problem = validateCommand({ cmd: raw.cmd, args });
    if (problem) return { error: problem };

    // Convert to bindings: columns bind by header, sheet binds to the current
    // sheet, everything else is a constant.
    const bound: Record<string, Binding> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined) continue;
      const def = spec.args[key];
      if (key === 'sheet') bound[key] = { kind: 'currentSheet' };
      else if (def?.type === 'colref')
        bound[key] = { kind: 'columnByHeader', header: (value as ColRef).header };
      else if (def?.type === 'colref[]')
        bound[key] = { kind: 'columnsByHeader', headers: (value as ColRef[]).map((c) => c.header) };
      else bound[key] = { kind: 'constant', value };
    }
    steps.push({ cmd: raw.cmd as CommandName, args: bound });
  }
  return { steps };
}

export async function promptToTool(
  request: string,
  headers: string[],
  fetchFn?: FetchLike,
): Promise<PromptToolResult> {
  const t0 = Date.now();
  if (typeof request !== 'string' || request.trim().length === 0) {
    return { ok: false, error: 'empty request', latencyMs: 0 };
  }
  try {
    const text = await ollamaGenerate({
      system: systemPrompt(headers),
      user: `Request: ${JSON.stringify(request.trim())}`,
      schema: PROMPT_SCHEMA as unknown as Record<string, unknown>,
      fetchFn,
    });
    let parsed: { label?: unknown; commands?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'the model did not return valid JSON', latencyMs: Date.now() - t0 };
    }
    if (typeof parsed.label !== 'string' || !Array.isArray(parsed.commands) || parsed.commands.length === 0) {
      return { ok: false, error: 'the model returned an incomplete tool', latencyMs: Date.now() - t0 };
    }
    const { steps, error } = hydrateCommands(
      parsed.commands as { cmd: string; args: Record<string, unknown> }[],
      headers,
    );
    if (error || !steps) return { ok: false, error, latencyMs: Date.now() - t0 };
    return {
      ok: true,
      label: parsed.label.slice(0, 30),
      summary: `Does ${steps.length} step${steps.length === 1 ? '' : 's'} from your request.`,
      steps,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof OllamaError ? 'the local model is not reachable' : String(err),
      latencyMs: Date.now() - t0,
    };
  }
}
