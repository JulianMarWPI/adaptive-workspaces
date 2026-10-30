// The single source of truth for the command vocabulary.
// Shared by the web app (dispatch), the server (prompt validation),
// the miner/generalizer, and the tests.
//
// Every grid change is a Command applied to a pure SheetState. apply()
// returns the next state plus an inverse; undo applies the inverse.
// Inverses are state snapshots: sheets in the study are small (< 100 rows),
// and a snapshot is simple, always correct, and trivial to test (see
// DECISIONS.md).

import type {
  Align,
  CellValue,
  ColRef,
  Command,
  CommandName,
  NumberFormat,
  SheetState,
  SortDirection,
} from './types.ts';

export class CommandError extends Error {}

// ---------------------------------------------------------------------------
// Arg schemas (used for validation of LLM-produced commands and for docs)
// ---------------------------------------------------------------------------

export type ArgType =
  | 'colref'
  | 'colref[]'
  | 'number'
  | 'string'
  | 'boolean'
  | 'cellvalue'
  | { enum: string[] };

export interface CommandSpec {
  /** arg name -> type; args not listed are rejected. */
  args: Record<string, { type: ArgType; optional?: boolean }>;
  /** Plain-English, used for "Show steps" and fallback card text. */
  describe: (args: Record<string, unknown>) => string;
  /** Keywords that may legitimately appear in an LLM summary of this command
   * (used to catch summaries that mention operations not in the pattern). */
  keywords: string[];
}

const colName = (c: unknown): string =>
  c && typeof c === 'object' && 'header' in (c as ColRef)
    ? (c as ColRef).header
    : String(c);

export const COMMAND_SPECS: Record<CommandName, CommandSpec> = {
  deleteEmptyRows: {
    args: { sheet: { type: 'string' } },
    describe: () => 'Delete all empty rows',
    keywords: ['delete', 'deletes', 'remove', 'removes', 'empty', 'blank'],
  },
  setRowStyle: {
    args: {
      row: { type: 'number' },
      bold: { type: 'boolean', optional: true },
      fill: { type: 'string', optional: true },
    },
    describe: (a) =>
      `Style row ${Number(a.row) + 1}${a.bold ? ' bold' : ''}${a.fill ? `, fill ${a.fill}` : ''}`,
    keywords: ['bold', 'bolds', 'fill', 'color', 'colour', 'highlight', 'highlights'],
  },
  freezeRows: {
    args: { count: { type: 'number' } },
    describe: (a) => `Freeze top ${a.count} row${a.count === 1 ? '' : 's'}`,
    keywords: ['freeze', 'freezes', 'frozen', 'lock', 'locks', 'pin', 'pins'],
  },
  setColumnWidth: {
    args: { column: { type: 'colref' }, width: { type: 'number' } },
    describe: (a) => `Set width of "${colName(a.column)}" to ${a.width}px`,
    keywords: ['width', 'widths', 'wide', 'widen', 'widens', 'resize', 'resizes'],
  },
  autoFitColumns: {
    args: { columns: { type: 'colref[]' } },
    describe: (a) =>
      `Auto-fit column widths (${(a.columns as ColRef[]).map((c) => c.header).join(', ')})`,
    keywords: ['fit', 'fits', 'auto', 'autofit', 'width', 'widths', 'resize', 'resizes'],
  },
  setNumberFormat: {
    args: {
      column: { type: 'colref' },
      format: { type: { enum: ['currency', 'percent', 'date', 'integer'] } },
    },
    describe: (a) => `Format "${colName(a.column)}" as ${a.format}`,
    keywords: ['currency', 'percent', 'percentage', 'date', 'dates', 'integer', 'integers'],
  },
  setAlignment: {
    args: {
      column: { type: 'colref' },
      align: { type: { enum: ['left', 'center', 'right'] } },
    },
    describe: (a) => `Align "${colName(a.column)}" ${a.align}`,
    keywords: ['align', 'aligns', 'aligned', 'alignment', 'left', 'right', 'center', 'centre'],
  },
  insertTotalRow: {
    args: { columns: { type: 'colref[]' } },
    describe: (a) =>
      `Add a total row (SUM of ${(a.columns as ColRef[]).map((c) => c.header).join(', ')})`,
    keywords: ['total', 'totals', 'sum', 'sums', 'subtotal'],
  },
  sortBy: {
    args: {
      column: { type: 'colref' },
      direction: { type: { enum: ['asc', 'desc'] } },
    },
    describe: (a) =>
      `Sort by "${colName(a.column)}" ${a.direction === 'desc' ? 'descending' : 'ascending'}`,
    keywords: ['sort', 'sorts', 'sorted', 'ascending', 'descending'],
  },
  renameSheet: {
    args: { name: { type: 'string' } },
    describe: (a) => `Rename sheet to "${a.name}"`,
    keywords: ['rename', 'renames'],
  },
  setCellValue: {
    args: {
      row: { type: 'number' },
      column: { type: 'colref' },
      value: { type: 'cellvalue' },
    },
    describe: (a) =>
      `Set "${colName(a.column)}" row ${Number(a.row) + 1} to ${JSON.stringify(a.value)}`,
    keywords: ['enter', 'enters', 'write', 'writes'],
  },
};

export const COMMAND_NAMES = Object.keys(COMMAND_SPECS) as CommandName[];

/** Validate a raw { cmd, args } object against the shared schema.
 * Returns an error string, or null if valid. Used by the prompted path. */
export function validateCommand(raw: { cmd?: unknown; args?: unknown }): string | null {
  if (typeof raw.cmd !== 'string' || !(raw.cmd in COMMAND_SPECS)) {
    return `unknown command: ${String(raw.cmd)}`;
  }
  const spec = COMMAND_SPECS[raw.cmd as CommandName];
  const args = (raw.args ?? {}) as Record<string, unknown>;
  if (typeof args !== 'object' || Array.isArray(args)) return 'args must be an object';
  for (const key of Object.keys(args)) {
    if (!(key in spec.args)) return `${raw.cmd}: unexpected arg "${key}"`;
  }
  for (const [key, def] of Object.entries(spec.args)) {
    const v = args[key];
    if (v === undefined || v === null) {
      if (def.optional) continue;
      return `${raw.cmd}: missing arg "${key}"`;
    }
    const t = def.type;
    const isColRef = (x: unknown) =>
      !!x && typeof x === 'object' && typeof (x as ColRef).header === 'string' &&
      typeof (x as ColRef).index === 'number';
    if (t === 'number' && typeof v !== 'number') return `${raw.cmd}.${key}: expected number`;
    if (t === 'string' && typeof v !== 'string') return `${raw.cmd}.${key}: expected string`;
    if (t === 'boolean' && typeof v !== 'boolean') return `${raw.cmd}.${key}: expected boolean`;
    if (t === 'colref' && !isColRef(v)) return `${raw.cmd}.${key}: expected {index, header}`;
    if (t === 'colref[]' && (!Array.isArray(v) || !v.every(isColRef)))
      return `${raw.cmd}.${key}: expected array of {index, header}`;
    if (t === 'cellvalue' && !(v === null || typeof v === 'string' || typeof v === 'number'))
      return `${raw.cmd}.${key}: expected string | number | null`;
    if (typeof t === 'object' && 'enum' in t && !t.enum.includes(String(v)))
      return `${raw.cmd}.${key}: expected one of ${t.enum.join('|')}`;
  }
  return null;
}

export function describeCommand(c: Command): string {
  return COMMAND_SPECS[c.cmd].describe(c.args as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Apply / invert
// ---------------------------------------------------------------------------

export interface ApplyResult {
  next: SheetState;
  /** Snapshot of the state before the command; undo restores it. */
  inverse: SheetState;
  /** Cells/columns touched, for highlighting in the UI.
   * 'cols' highlights whole columns; 'rows' whole rows; 'all' everything. */
  touched:
    | { kind: 'cols'; cols: number[] }
    | { kind: 'rows'; rows: number[] }
    | { kind: 'cell'; row: number; col: number }
    | { kind: 'all' };
}

const clone = (s: SheetState): SheetState => structuredClone(s);

/** Resolve a column reference against this sheet, preferring the header text.
 * Falls back to the stored index only if that column has the expected header.
 * Throws CommandError if the header does not exist on the sheet. */
export function resolveCol(state: SheetState, ref: ColRef): number {
  const headers = state.data[0] ?? [];
  if (headers[ref.index] === ref.header) return ref.index;
  const i = headers.findIndex((h) => h === ref.header);
  if (i === -1) throw new CommandError(`No column "${ref.header}" on sheet "${state.name}"`);
  return i;
}

const isEmptyRow = (row: CellValue[]): boolean =>
  row.every((c) => c === null || c === undefined || String(c).trim() === '');

/** A1-style column letter for formulas. */
export function colLetter(index: number): string {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Deterministic auto-fit: width from the longest rendered cell text. */
export function autoFitWidth(state: SheetState, col: number): number {
  let max = 4;
  for (const row of state.data) {
    const v = row[col];
    if (v !== null && v !== undefined) max = Math.max(max, String(v).length);
  }
  return Math.min(300, Math.max(60, max * 8 + 16));
}

function remapRowRecord<T>(rec: Record<number, T>, map: (old: number) => number | null): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const next = map(Number(k));
    if (next !== null) out[next] = v;
  }
  return out;
}

export function applyCommand(state: SheetState, command: Command): ApplyResult {
  const inverse = clone(state);
  const next = clone(state);

  switch (command.cmd) {
    case 'deleteEmptyRows': {
      const keep: number[] = [];
      next.data = next.data.filter((row, i) => {
        const keepIt = i === 0 || !isEmptyRow(row);
        if (keepIt) keep.push(i);
        return keepIt;
      });
      const newIndex = new Map(keep.map((old, idx) => [old, idx]));
      next.rowStyles = remapRowRecord(next.rowStyles, (o) => newIndex.get(o) ?? null);
      return { next, inverse, touched: { kind: 'all' } };
    }

    case 'setRowStyle': {
      const { row, bold, fill } = command.args;
      if (row < 0 || row >= next.data.length)
        throw new CommandError(`Row ${row + 1} does not exist`);
      const prev = next.rowStyles[row] ?? {};
      next.rowStyles[row] = {
        ...prev,
        ...(bold !== undefined ? { bold } : {}),
        ...(fill !== undefined ? { fill } : {}),
      };
      return { next, inverse, touched: { kind: 'rows', rows: [row] } };
    }

    case 'freezeRows': {
      next.frozenRows = command.args.count;
      return { next, inverse, touched: { kind: 'rows', rows: [0] } };
    }

    case 'setColumnWidth': {
      const col = resolveCol(next, command.args.column);
      next.columnWidths[col] = command.args.width;
      return { next, inverse, touched: { kind: 'cols', cols: [col] } };
    }

    case 'autoFitColumns': {
      const cols = command.args.columns.map((c) => resolveCol(next, c));
      for (const col of cols) next.columnWidths[col] = autoFitWidth(next, col);
      return { next, inverse, touched: { kind: 'cols', cols } };
    }

    case 'setNumberFormat': {
      const col = resolveCol(next, command.args.column);
      next.columnFormats[col] = command.args.format;
      return { next, inverse, touched: { kind: 'cols', cols: [col] } };
    }

    case 'setAlignment': {
      const col = resolveCol(next, command.args.column);
      next.columnAligns[col] = command.args.align;
      return { next, inverse, touched: { kind: 'cols', cols: [col] } };
    }

    case 'insertTotalRow': {
      const cols = command.args.columns.map((c) => resolveCol(next, c));
      const width = Math.max(...next.data.map((r) => r.length), 1);
      const total: CellValue[] = new Array(width).fill(null);
      if (!cols.includes(0)) total[0] = 'Total'; // label, unless col 0 is totaled
      const lastDataRow = next.data.length; // 1-based A1 row of the last data row
      for (const col of cols) {
        const letter = colLetter(col);
        total[col] = `=SUM(${letter}2:${letter}${lastDataRow})`;
      }
      next.data.push(total);
      next.rowStyles[next.data.length - 1] = { bold: true };
      return { next, inverse, touched: { kind: 'rows', rows: [next.data.length - 1] } };
    }

    case 'sortBy': {
      const col = resolveCol(next, command.args.column);
      const dir = command.args.direction === 'desc' ? -1 : 1;
      const header = next.data[0];
      const body = next.data.slice(1);
      const key = (v: CellValue) => (v === null || v === undefined ? '' : v);
      body.sort((a, b) => {
        const x = key(a[col]);
        const y = key(b[col]);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x).localeCompare(String(y)) * dir;
      });
      next.data = [header, ...body];
      // Row styles other than the header no longer track their rows; drop them.
      next.rowStyles = next.rowStyles[0] !== undefined ? { 0: next.rowStyles[0] } : {};
      return { next, inverse, touched: { kind: 'all' } };
    }

    case 'renameSheet': {
      next.name = command.args.name;
      return { next, inverse, touched: { kind: 'all' } };
    }

    case 'setCellValue': {
      const col = resolveCol(next, command.args.column);
      const { row, value } = command.args;
      if (row < 0) throw new CommandError(`Row ${row + 1} does not exist`);
      while (next.data.length <= row) next.data.push([]);
      next.data[row][col] = value;
      return { next, inverse, touched: { kind: 'cell', row, col } };
    }
  }
}
