import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands.ts';
import { checkSheet } from '../src/checker.ts';
import { describeSteps, executeSteps } from '../src/execute.ts';
import { generalize } from '../src/generalize.ts';
import { mine } from '../src/miner.ts';
import { normalize } from '../src/normalize.ts';
import type { Command, LogEvent, SheetState } from '../src/types.ts';
import {
  cleanupCommands,
  cmdEvent,
  COLS_NORMAL,
  COLS_SHUFFLED,
  makeSheet,
  rawSheet,
  rawSheetShuffled,
  sheetSwitch,
} from './fixtures.ts';

/** Clean a sheet "by hand": apply the concrete cleanup commands one by one. */
function cleanManually(sheet: SheetState, cols: Record<string, number>): SheetState {
  let s = sheet;
  for (const c of cleanupCommands(sheet.name, cols)) {
    s = applyCommand(s, c).next;
  }
  return s;
}

/** Mine + generalize the cleanup pattern from 3 manual episodes. */
function minedCleanupTool() {
  const events: LogEvent[] = [];
  (['Jan', 'Feb', 'Mar'] as const).forEach((sheet, i) => {
    if (i > 0) events.push(sheetSwitch(sheet));
    for (const c of cleanupCommands(sheet, COLS_NORMAL)) events.push(cmdEvent(sheet, c));
  });
  const candidates = mine(normalize(events), 3);
  expect(candidates.length).toBe(1);
  return generalize(candidates[0]);
}

describe('executeSteps', () => {
  it('applies the mined tool to a fresh raw sheet; result equals the manually cleaned sheet', () => {
    const tool = minedCleanupTool();
    const fresh = rawSheet('Apr');
    const result = executeSteps(fresh, tool.steps);
    expect(result.ok).toBe(true);

    const manual = cleanManually(rawSheet('Apr'), COLS_NORMAL);
    // Cell-by-cell values (including formulas) and formats.
    expect(result.state.data).toEqual(manual.data);
    expect(result.state.columnFormats).toEqual(manual.columnFormats);
    expect(result.state.rowStyles).toEqual(manual.rowStyles);
    expect(result.state.frozenRows).toEqual(manual.frozenRows);
    // The checker agrees it is a perfect score.
    expect(checkSheet(result.state, manual).score).toBe(1);
  });

  it('re-targets columns by header on a shuffled sheet', () => {
    const tool = minedCleanupTool(); // learned on normal column order
    const fresh = rawSheetShuffled('May'); // Amount is column 0 here
    const result = executeSteps(fresh, tool.steps);
    expect(result.ok).toBe(true);
    expect(result.state.columnFormats[0]).toBe('currency'); // Amount
    expect(result.state.columnFormats[1]).toBe('date'); // Date
    const manual = cleanManually(rawSheetShuffled('May'), COLS_SHUFFLED);
    expect(result.state.data).toEqual(manual.data);
    expect(result.state.columnFormats).toEqual(manual.columnFormats);
  });

  it('rolls back everything when a step cannot apply', () => {
    const tool = minedCleanupTool();
    // A sheet with no Amount column: step 4 must fail.
    const bad = makeSheet('Jun', [
      ['Date', 'Customer', 'Qty'],
      ['2026-06-01', 'Acme', 2],
      ['', '', ''],
      ['2026-06-02', 'Globex', 5],
    ]);
    const before = structuredClone(bad);
    const result = executeSteps(bad, tool.steps);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Amount/);
    expect(result.failedStep).toBeGreaterThan(0);
    expect(result.applied).toEqual([]);
    // Full rollback: nothing changed, not even the steps before the failure.
    expect(result.state).toEqual(before);
    expect(bad).toEqual(before);
  });

  it('exposed inputs override defaults', () => {
    const steps = [
      {
        cmd: 'freezeRows' as const,
        args: { count: { kind: 'input' as const, param: 'rows', default: 1 } },
      },
    ];
    const withDefault = executeSteps(rawSheet(), steps);
    expect(withDefault.state.frozenRows).toBe(1);
    const withInput = executeSteps(rawSheet(), steps, { rows: 2 });
    expect(withInput.state.frozenRows).toBe(2);
  });

  it('describeSteps produces plain English for every step', () => {
    const tool = minedCleanupTool();
    const lines = describeSteps(tool.steps);
    expect(lines.length).toBe(6);
    expect(lines[0]).toMatch(/empty rows/i);
    expect(lines.join(' ')).toMatch(/currency/);
    expect(lines.join(' ')).toMatch(/total/i);
  });
});
