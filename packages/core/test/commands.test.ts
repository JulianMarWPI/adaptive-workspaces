import { describe, expect, it } from 'vitest';
import { applyCommand, colLetter, resolveCol, validateCommand, CommandError } from '../src/commands.ts';
import type { Command } from '../src/types.ts';
import { makeSheet, rawSheet, rawSheetShuffled } from './fixtures.ts';

describe('applyCommand', () => {
  it('deleteEmptyRows removes blank rows, keeps header, remaps row styles', () => {
    const s = rawSheet();
    s.rowStyles[3] = { bold: true }; // style on the Globex row
    const { next } = applyCommand(s, { cmd: 'deleteEmptyRows', args: { sheet: 'Jan' } });
    expect(next.data.length).toBe(4);
    expect(next.data[0][0]).toBe('Date');
    expect(next.data.map((r) => r[1])).toEqual(['Customer', 'Acme', 'Globex', 'Initech']);
    expect(next.rowStyles[2]).toEqual({ bold: true }); // Globex moved from 3 to 2
  });

  it('setNumberFormat resolves columns by header when order is shuffled', () => {
    const s = rawSheetShuffled();
    // Ref recorded on a normal sheet: Amount at index 2. Here Amount is index 0.
    const { next } = applyCommand(s, {
      cmd: 'setNumberFormat',
      args: { column: { index: 2, header: 'Amount' }, format: 'currency' },
    });
    expect(next.columnFormats[0]).toBe('currency');
    expect(next.columnFormats[2]).toBeUndefined();
  });

  it('throws CommandError when the header does not exist', () => {
    const s = rawSheet();
    expect(() =>
      applyCommand(s, {
        cmd: 'setNumberFormat',
        args: { column: { index: 9, header: 'Price' }, format: 'currency' },
      }),
    ).toThrow(CommandError);
  });

  it('insertTotalRow appends SUM formulas over the data rows', () => {
    const s = rawSheet();
    const cleaned = applyCommand(s, { cmd: 'deleteEmptyRows', args: { sheet: 'Jan' } }).next;
    const { next } = applyCommand(cleaned, {
      cmd: 'insertTotalRow',
      args: {
        columns: [
          { index: 2, header: 'Amount' },
          { index: 3, header: 'Qty' },
        ],
      },
    });
    const last = next.data[next.data.length - 1];
    expect(last[0]).toBe('Total');
    expect(last[2]).toBe('=SUM(C2:C4)');
    expect(last[3]).toBe('=SUM(D2:D4)');
    expect(next.rowStyles[next.data.length - 1]).toEqual({ bold: true });
  });

  it('sortBy sorts data rows and keeps the header in place', () => {
    const s = makeSheet('S', [
      ['Name', 'N'],
      ['b', 2],
      ['a', 3],
      ['c', 1],
    ]);
    const asc = applyCommand(s, {
      cmd: 'sortBy',
      args: { column: { index: 1, header: 'N' }, direction: 'asc' },
    }).next;
    expect(asc.data.map((r) => r[1])).toEqual(['N', 1, 2, 3]);
    const desc = applyCommand(s, {
      cmd: 'sortBy',
      args: { column: { index: 0, header: 'Name' }, direction: 'desc' },
    }).next;
    expect(desc.data.map((r) => r[0])).toEqual(['Name', 'c', 'b', 'a']);
  });

  it('autoFitColumns sets deterministic widths within bounds', () => {
    const s = rawSheet();
    const { next } = applyCommand(s, {
      cmd: 'autoFitColumns',
      args: { columns: [{ index: 1, header: 'Customer' }] },
    });
    const w = next.columnWidths[1];
    expect(w).toBeGreaterThanOrEqual(60);
    expect(w).toBeLessThanOrEqual(300);
  });
});

describe('undo/redo for every command', () => {
  const base = rawSheet();
  const commands: Command[] = [
    { cmd: 'deleteEmptyRows', args: { sheet: 'Jan' } },
    { cmd: 'setRowStyle', args: { row: 0, bold: true, fill: '#eee' } },
    { cmd: 'freezeRows', args: { count: 1 } },
    { cmd: 'setColumnWidth', args: { column: { index: 1, header: 'Customer' }, width: 140 } },
    { cmd: 'autoFitColumns', args: { columns: [{ index: 0, header: 'Date' }] } },
    { cmd: 'setNumberFormat', args: { column: { index: 2, header: 'Amount' }, format: 'currency' } },
    { cmd: 'setAlignment', args: { column: { index: 3, header: 'Qty' }, align: 'right' } },
    { cmd: 'insertTotalRow', args: { columns: [{ index: 2, header: 'Amount' }] } },
    { cmd: 'sortBy', args: { column: { index: 1, header: 'Customer' }, direction: 'asc' } },
    { cmd: 'renameSheet', args: { name: 'January' } },
    { cmd: 'setCellValue', args: { row: 1, column: { index: 1, header: 'Customer' }, value: 'ACME' } },
  ];

  for (const c of commands) {
    it(`${c.cmd}: undo restores the exact prior state; redo re-applies`, () => {
      const before = structuredClone(base);
      const { next, inverse } = applyCommand(base, c);
      // undo = restore inverse snapshot
      expect(inverse).toEqual(before);
      // redo = re-apply the same command to the restored state
      const redo = applyCommand(inverse, c);
      expect(redo.next).toEqual(next);
      // original input was never mutated
      expect(base).toEqual(before);
    });
  }

  it('covers the whole command vocabulary', async () => {
    const { COMMAND_NAMES } = await import('../src/commands.ts');
    expect(new Set(commands.map((c) => c.cmd))).toEqual(new Set(COMMAND_NAMES));
  });
});

describe('validateCommand', () => {
  it('accepts a valid command', () => {
    expect(
      validateCommand({
        cmd: 'sortBy',
        args: { column: { index: 0, header: 'Date' }, direction: 'asc' },
      }),
    ).toBeNull();
  });
  it('rejects unknown commands, bad enums, missing and extra args', () => {
    expect(validateCommand({ cmd: 'dropTable', args: {} })).toMatch(/unknown/);
    expect(
      validateCommand({ cmd: 'sortBy', args: { column: { index: 0, header: 'D' }, direction: 'up' } }),
    ).toMatch(/expected one of/);
    expect(validateCommand({ cmd: 'freezeRows', args: {} })).toMatch(/missing/);
    expect(validateCommand({ cmd: 'freezeRows', args: { count: 1, extra: true } })).toMatch(/unexpected/);
  });
});

describe('helpers', () => {
  it('colLetter', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(25)).toBe('Z');
    expect(colLetter(26)).toBe('AA');
  });
  it('resolveCol prefers matching index, falls back to header search', () => {
    const s = rawSheetShuffled();
    expect(resolveCol(s, { index: 0, header: 'Amount' })).toBe(0);
    expect(resolveCol(s, { index: 2, header: 'Amount' })).toBe(0);
  });
});
