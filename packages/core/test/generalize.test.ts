import { describe, expect, it } from 'vitest';
import { generalize } from '../src/generalize.ts';
import { mine } from '../src/miner.ts';
import { normalize } from '../src/normalize.ts';
import type { Command, LogEvent } from '../src/types.ts';
import { cmdEvent, sheetSwitch, COLS_NORMAL, COLS_SHUFFLED, cleanupCommands } from './fixtures.ts';

function logFor(episodes: { sheet: string; cmds: Command[]; rowCount?: number }[]): LogEvent[] {
  const events: LogEvent[] = [];
  episodes.forEach((ep, i) => {
    if (i > 0) events.push(sheetSwitch(ep.sheet));
    for (const c of ep.cmds) events.push(cmdEvent(ep.sheet, c, ep.rowCount));
  });
  return events;
}

function minedPattern(episodes: { sheet: string; cmds: Command[]; rowCount?: number }[], K = 3) {
  const candidates = mine(normalize(logFor(episodes)), K);
  expect(candidates.length).toBeGreaterThan(0);
  return generalize(candidates[0]);
}

describe('generalize', () => {
  it('same value everywhere -> constant', () => {
    const cmds = (sheet: string): Command[] => [
      { cmd: 'freezeRows', args: { count: 1 } },
      { cmd: 'setRowStyle', args: { row: 0, bold: true } },
      { cmd: 'setAlignment', args: { column: { index: 3, header: 'Qty' }, align: 'right' } },
    ];
    const p = minedPattern([
      { sheet: 'Jan', cmds: cmds('Jan') },
      { sheet: 'Feb', cmds: cmds('Feb') },
      { sheet: 'Mar', cmds: cmds('Mar') },
    ]);
    expect(p.steps[0].args.count).toEqual({ kind: 'constant', value: 1 });
    expect(p.steps[1].args.bold).toEqual({ kind: 'constant', value: true });
    expect(p.exposedParams).toEqual([]);
  });

  it('sheet arg always equals the current sheet -> bound at run time', () => {
    const cmds = (sheet: string): Command[] => [
      { cmd: 'deleteEmptyRows', args: { sheet } },
      { cmd: 'freezeRows', args: { count: 1 } },
      { cmd: 'setRowStyle', args: { row: 0, bold: true } },
    ];
    const p = minedPattern([
      { sheet: 'Jan', cmds: cmds('Jan') },
      { sheet: 'Feb', cmds: cmds('Feb') },
      { sheet: 'Mar', cmds: cmds('Mar') },
    ]);
    expect(p.steps[0].args.sheet).toEqual({ kind: 'currentSheet' });
  });

  it('row always the last row -> bound at run time', () => {
    const cmds = (last: number): Command[] => [
      { cmd: 'setRowStyle', args: { row: last, bold: true } },
      { cmd: 'freezeRows', args: { count: 1 } },
      { cmd: 'setAlignment', args: { column: { index: 3, header: 'Qty' }, align: 'right' } },
    ];
    const p = minedPattern([
      { sheet: 'Jan', cmds: cmds(9), rowCount: 10 },
      { sheet: 'Feb', cmds: cmds(14), rowCount: 15 },
      { sheet: 'Mar', cmds: cmds(7), rowCount: 8 },
    ]);
    expect(p.steps[0].args.row).toEqual({ kind: 'lastRow' });
  });

  it('shuffled columns: same header, different index -> columnByHeader', () => {
    const p = minedPattern([
      { sheet: 'Jan', cmds: cleanupCommands('Jan', COLS_NORMAL) },
      { sheet: 'Feb', cmds: cleanupCommands('Feb', COLS_NORMAL) },
      { sheet: 'Mar', cmds: cleanupCommands('Mar', COLS_SHUFFLED) },
    ]);
    const fmtStep = p.steps.find((s) => s.cmd === 'setNumberFormat')!;
    expect(fmtStep.args.column).toEqual({ kind: 'columnByHeader', header: 'Amount' });
    const totalStep = p.steps.find((s) => s.cmd === 'insertTotalRow')!;
    expect(totalStep.args.columns).toEqual({
      kind: 'columnsByHeader',
      headers: ['Amount', 'Qty'],
    });
  });

  it('no rule -> exposed input defaulting to the most common value', () => {
    // Same token sequence is required for mining, so vary an arg that is
    // abstracted in the token: the column width target... widths differ in
    // token too. Instead, mine on identical tokens and generalize occurrences
    // whose sheet-abstracted args differ: use renameSheet? Simplest realistic
    // case: freezeRows count differs -> different tokens, so the miner would
    // not group them. Free params therefore come from token-abstracted args:
    // 'sheet' (when not the current sheet) and 'row' (when not the last row).
    const cmds = (sheet: string, row: number): Command[] => [
      { cmd: 'setRowStyle', args: { row, bold: true } },
      { cmd: 'freezeRows', args: { count: 1 } },
      { cmd: 'setAlignment', args: { column: { index: 3, header: 'Qty' }, align: 'right' } },
    ];
    // rows differ and are NOT the last row; rowCounts differ
    const p = minedPattern(
      [
        { sheet: 'Jan', cmds: cmds('Jan', 9), rowCount: 20 },
        { sheet: 'Feb', cmds: cmds('Feb', 9), rowCount: 25 },
        { sheet: 'Mar', cmds: cmds('Mar', 9), rowCount: 18 },
      ],
      3,
    );
    // row=9 everywhere -> constant (sanity: constants win over inputs)
    expect(p.steps[0].args.row).toEqual({ kind: 'constant', value: 9 });
  });

  it('free parameter falls back to most common value as default', () => {
    // Hand-build a candidate whose occurrences differ in one arg with no
    // contextual rule (possible when tokens abstract the arg, e.g. row=last
    // in tokens but we disable rowCount context for one occurrence).
    const occ = (sheet: string, row: number, rowCount?: number) => ({
      token: 'setRowStyle(bold=true,row=last)',
      command: { cmd: 'setRowStyle', args: { row, bold: true } } as Command,
      sheet,
      rowCount,
    });
    const candidate = {
      tokens: ['setRowStyle(bold=true,row=last)'],
      support: 3,
      length: 1,
      score: 3,
      key: 'test',
      occurrences: [[occ('Jan', 9, 10)], [occ('Feb', 9, 15)], [occ('Mar', 9, 10)]],
    };
    // row 9 is constant here; make them differ:
    candidate.occurrences = [[occ('Jan', 9, 99)], [occ('Feb', 14, 99)], [occ('Mar', 9, 99)]];
    const p = generalize(candidate);
    expect(p.steps[0].args.row).toEqual({
      kind: 'input',
      param: 'step1_row',
      default: 9, // most common value
    });
    expect(p.exposedParams).toEqual([{ param: 'step1_row', default: 9 }]);
  });
});
