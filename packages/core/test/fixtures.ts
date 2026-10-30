// Shared test fixtures: raw sheets and synthetic logs.

import type { CellValue, Command, LogEvent, SheetState } from '../src/types.ts';

export function makeSheet(name: string, data: CellValue[][]): SheetState {
  return {
    name,
    data: structuredClone(data),
    columnWidths: {},
    frozenRows: 0,
    rowStyles: {},
    columnFormats: {},
    columnAligns: {},
  };
}

/** A small raw "monthly export" sheet: header + rows with blanks mixed in. */
export function rawSheet(name = 'Jan'): SheetState {
  return makeSheet(name, [
    ['Date', 'Customer', 'Amount', 'Qty'],
    ['2026-01-03', 'Acme', 120.5, 2],
    [null, null, null, null],
    ['2026-01-05', 'Globex', 80, 1],
    ['', '', '', ''],
    ['2026-01-09', 'Initech', 240, 4],
  ]);
}

/** Same columns, shuffled order (Amount first). */
export function rawSheetShuffled(name = 'Mar'): SheetState {
  return makeSheet(name, [
    ['Amount', 'Date', 'Customer', 'Qty'],
    [55, '2026-03-02', 'Acme', 1],
    ['', '', '', ''],
    [310, '2026-03-11', 'Umbrella', 3],
  ]);
}

let seq = 0;
export function ev(partial: Partial<LogEvent>): LogEvent {
  seq += 1;
  return {
    t: seq * 1000,
    wall: new Date(1700000000000 + seq * 1000).toISOString(),
    pid: 'P00',
    session: 's1',
    cond: 'proactive',
    block: 1,
    kind: 'command',
    source: 'manual',
    ...partial,
  } as LogEvent;
}

export function cmdEvent(sheet: string, command: Command, rowCount?: number): LogEvent {
  return ev({
    kind: 'command',
    sheet,
    cmd: command.cmd,
    args: command.args as Record<string, unknown>,
    ctx: rowCount !== undefined ? { rowCount } : undefined,
  });
}

export function sheetSwitch(to: string): LogEvent {
  return ev({ kind: 'sheet_switch', sheet: to });
}

/** The canonical 6-step cleanup sequence on a sheet, as concrete commands. */
export function cleanupCommands(sheet: string, cols: Record<string, number>): Command[] {
  return [
    { cmd: 'deleteEmptyRows', args: { sheet } },
    { cmd: 'setRowStyle', args: { row: 0, bold: true } },
    { cmd: 'freezeRows', args: { count: 1 } },
    {
      cmd: 'setNumberFormat',
      args: { column: { index: cols.Amount, header: 'Amount' }, format: 'currency' },
    },
    {
      cmd: 'setNumberFormat',
      args: { column: { index: cols.Date, header: 'Date' }, format: 'date' },
    },
    {
      cmd: 'insertTotalRow',
      args: {
        columns: [
          { index: cols.Amount, header: 'Amount' },
          { index: cols.Qty, header: 'Qty' },
        ],
      },
    },
  ];
}

export const COLS_NORMAL = { Date: 0, Customer: 1, Amount: 2, Qty: 3 };
export const COLS_SHUFFLED = { Amount: 0, Date: 1, Customer: 2, Qty: 3 };
