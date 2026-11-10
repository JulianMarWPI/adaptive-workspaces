// Normalization: turn the raw event log into episodes of abstract tokens.
//
// - Drops selection/scroll (never logged as commands in the first place) and
//   any command that was undone before the next command was issued.
// - Abstracts arguments that naturally vary between sheets: the sheet name,
//   and row indices that depend on data length (e.g. the total row): a row
//   equal to rowCount-1 at dispatch time becomes "last".
// - Column refs are reduced to their header text so the same action on a
//   shuffled-column sheet produces the same token.
//
// Pure functions, no DOM.

import type { ColRef, Command, LogEvent } from './types.ts';

export interface NormalizedCommand {
  token: string;
  /** The concrete command as logged (for the generalizer). */
  command: Command;
  /** Sheet the command ran on and row count at dispatch time. */
  sheet: string;
  rowCount?: number;
}

export type Episode = NormalizedCommand[];

const isColRef = (v: unknown): v is ColRef =>
  !!v && typeof v === 'object' && 'header' in (v as ColRef) && 'index' in (v as ColRef);

/** One stable token per command, e.g. setNumberFormat(column=Amount,format=currency). */
export function tokenize(command: Command, ctx?: { rowCount?: number }): string {
  const parts: string[] = [];
  const args = command.args as Record<string, unknown>;
  for (const key of Object.keys(args).sort()) {
    const v = args[key];
    if (v === undefined) continue;
    if (key === 'sheet') continue; // abstract: always the current sheet
    if (key === 'row' && typeof v === 'number' && ctx?.rowCount !== undefined && v === ctx.rowCount - 1) {
      parts.push('row=last');
      continue;
    }
    if (isColRef(v)) {
      parts.push(`${key}=${v.header}`);
    } else if (Array.isArray(v) && v.every(isColRef)) {
      parts.push(`${key}=[${v.map((c) => c.header).join('|')}]`);
    } else {
      parts.push(`${key}=${JSON.stringify(v)}`);
    }
  }
  return `${command.cmd}(${parts.join(',')})`;
}

/** Remove commands that were undone before the next command: an `undo` pops
 * the most recent surviving command; `redo` restores the most recently
 * undone one. */
export function dropUndone(events: LogEvent[]): LogEvent[] {
  const out: LogEvent[] = [];
  const undone: LogEvent[] = [];
  for (const e of events) {
    if (e.kind === 'command') {
      undone.length = 0; // a new command clears the redo stack
      out.push(e);
    } else if (e.kind === 'undo') {
      // pop the most recent command event still in `out`
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].kind === 'command') {
          undone.push(out[i]);
          out.splice(i, 1);
          break;
        }
      }
    } else if (e.kind === 'redo') {
      const r = undone.pop();
      if (r) out.push(r);
    } else {
      out.push(e);
    }
  }
  return out;
}

/** Split the cleaned log into episodes at sheet switches / data imports and
 * tokenize each surviving command. */
export function normalize(events: LogEvent[]): Episode[] {
  const cleaned = dropUndone(events);
  const episodes: Episode[] = [];
  let current: Episode = [];
  const flush = () => {
    if (current.length > 0) episodes.push(current);
    current = [];
  };
  for (const e of cleaned) {
    if (e.kind === 'sheet_switch' || (e.kind === 'session' && e.event === 'data_import')) {
      flush();
      continue;
    }
    if (e.kind !== 'command' || !e.cmd) continue;
    // Per-row deletions are data-dependent (blank rows sit at different
    // indices on every sheet), so they can't generalize into a reusable tool
    // step. Exclude them from episodes: the assistant never proposes
    // automating row deletion, which stays a manual, human-judged action.
    if (e.cmd === 'deleteRow') continue;
    const command = { cmd: e.cmd, args: e.args } as Command;
    current.push({
      token: tokenize(command, e.ctx),
      command,
      sheet: e.sheet ?? '',
      rowCount: e.ctx?.rowCount,
    });
  }
  flush();
  return episodes;
}
