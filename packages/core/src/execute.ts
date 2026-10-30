// Tool executor: runs a generalized tool's steps against a sheet.
//
// The web app wraps this with dispatch(source: "tool") so every step is
// logged, and groups the whole run as one undo step. If any step cannot
// apply (e.g. no "Amount" column on this sheet), everything rolls back and
// the caller shows a short inline message.

import { applyCommand, CommandError, describeCommand } from './commands.ts';
import type {
  ApplyResult,
  } from './commands.ts';
import type { Binding, ColRef, Command, GeneralizedStep, SheetState } from './types.ts';

export interface ExecuteResult {
  ok: boolean;
  /** Final state: the result if ok, the original state if rolled back. */
  state: SheetState;
  /** Concrete commands that were applied (empty on failure). */
  applied: Command[];
  touched: ApplyResult['touched'][];
  error?: string;
  failedStep?: number;
}

function headerToColRef(state: SheetState, header: string): ColRef {
  const headers = state.data[0] ?? [];
  const index = headers.findIndex((h) => h === header);
  if (index === -1) throw new CommandError(`No column "${header}" on sheet "${state.name}"`);
  return { index, header };
}

function resolveBinding(state: SheetState, b: Binding, inputs: Record<string, unknown>): unknown {
  switch (b.kind) {
    case 'constant':
      return b.value;
    case 'currentSheet':
      return state.name;
    case 'lastRow':
      return state.data.length - 1;
    case 'columnByHeader':
      return headerToColRef(state, b.header);
    case 'columnsByHeader':
      return b.headers.map((h) => headerToColRef(state, h));
    case 'input':
      return inputs[b.param] !== undefined ? inputs[b.param] : b.default;
  }
}

/** Turn one generalized step into a concrete command for this sheet. */
export function concretize(
  state: SheetState,
  step: GeneralizedStep,
  inputs: Record<string, unknown> = {},
): Command {
  const args: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(step.args)) {
    const v = resolveBinding(state, binding, inputs);
    if (v !== undefined) args[key] = v;
  }
  return { cmd: step.cmd, args } as Command;
}

/** Run all steps; roll back to the original state if any step fails. */
export function executeSteps(
  state: SheetState,
  steps: GeneralizedStep[],
  inputs: Record<string, unknown> = {},
): ExecuteResult {
  let current = state;
  const applied: Command[] = [];
  const touched: ApplyResult['touched'][] = [];
  for (let i = 0; i < steps.length; i++) {
    try {
      const command = concretize(current, steps[i], inputs);
      const res = applyCommand(current, command);
      current = res.next;
      applied.push(command);
      touched.push(res.touched);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        state, // full rollback: the original state, untouched
        applied: [],
        touched: [],
        error: msg,
        failedStep: i,
      };
    }
  }
  return { ok: true, state: current, applied, touched };
}

/** Plain-English step list for the "Show steps" expander and tooltips. */
export function describeSteps(steps: GeneralizedStep[]): string[] {
  return steps.map((step) => {
    const args: Record<string, unknown> = {};
    for (const [key, b] of Object.entries(step.args)) {
      switch (b.kind) {
        case 'constant':
          args[key] = b.value;
          break;
        case 'currentSheet':
          args[key] = '(current sheet)';
          break;
        case 'lastRow':
          args[key] = -1; // described as "last row" below
          break;
        case 'columnByHeader':
          args[key] = { index: -1, header: b.header };
          break;
        case 'columnsByHeader':
          args[key] = b.headers.map((h) => ({ index: -1, header: h }));
          break;
        case 'input':
          args[key] = b.default;
          break;
      }
    }
    let text = describeCommand({ cmd: step.cmd, args } as Command);
    if (Object.values(step.args).some((b) => b.kind === 'lastRow')) {
      text = text.replace(/row 0\b/, 'the last row');
    }
    return text;
  });
}
