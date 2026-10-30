import { describe, expect, it } from 'vitest';
import { executeSteps } from '@aw/core';
import { hydrateCommands, promptToTool } from '../src/promptTool.ts';
import { mockOllama } from './helpers.ts';

const HEADERS = ['Date', 'Customer', 'Amount', 'Qty'];

describe('hydrateCommands', () => {
  it('maps header strings to header-bound steps (case-insensitive)', () => {
    const { steps, error } = hydrateCommands(
      [
        { cmd: 'deleteEmptyRows', args: {} },
        { cmd: 'sortBy', args: { column: 'date', direction: 'asc' } },
      ],
      HEADERS,
    );
    expect(error).toBeUndefined();
    expect(steps![0].args.sheet).toEqual({ kind: 'currentSheet' });
    expect(steps![1].args.column).toEqual({ kind: 'columnByHeader', header: 'Date' });
    expect(steps![1].args.direction).toEqual({ kind: 'constant', value: 'asc' });
  });

  it('expands ["*"] to every header', () => {
    const { steps } = hydrateCommands(
      [{ cmd: 'autoFitColumns', args: { columns: ['*'] } }],
      HEADERS,
    );
    expect(steps![0].args.columns).toEqual({ kind: 'columnsByHeader', headers: HEADERS });
  });

  it('rejects unknown columns, commands, and bad args', () => {
    expect(
      hydrateCommands([{ cmd: 'sortBy', args: { column: 'Price', direction: 'asc' } }], HEADERS).error,
    ).toMatch(/Price/);
    expect(hydrateCommands([{ cmd: 'dropTable', args: {} }], HEADERS).error).toMatch(/unknown/);
    expect(
      hydrateCommands([{ cmd: 'sortBy', args: { column: 'Date', direction: 'sideways' } }], HEADERS).error,
    ).toMatch(/expected one of/);
    expect(
      hydrateCommands([{ cmd: 'freezeRows', args: { count: 1, evil: true } }], HEADERS).error,
    ).toMatch(/unexpected/);
  });

  it('hydrated steps actually run on a sheet', () => {
    const { steps } = hydrateCommands(
      [
        { cmd: 'deleteEmptyRows', args: {} },
        { cmd: 'setNumberFormat', args: { column: 'Amount', format: 'currency' } },
      ],
      HEADERS,
    );
    const sheet = {
      name: 'Jan',
      data: [HEADERS.slice(), ['2026-01-01', 'A', 5, 1], ['', '', '', '']],
      columnWidths: {},
      frozenRows: 0,
      rowStyles: {},
      columnFormats: {},
      columnAligns: {},
    };
    const r = executeSteps(sheet, steps!);
    expect(r.ok).toBe(true);
    expect(r.state.data.length).toBe(2);
    expect(r.state.columnFormats[2]).toBe('currency');
  });
});

describe('promptToTool', () => {
  it('valid model output -> a ready tool', async () => {
    const { fetchFn } = mockOllama([
      {
        label: 'Clean & sort by date',
        commands: [
          { cmd: 'deleteEmptyRows', args: {} },
          { cmd: 'sortBy', args: { column: 'Date', direction: 'asc' } },
        ],
      },
    ]);
    const r = await promptToTool('button that removes empty rows and sorts by date', HEADERS, fetchFn);
    expect(r.ok).toBe(true);
    expect(r.label).toBe('Clean & sort by date');
    expect(r.steps!.length).toBe(2);
  });

  it('model names a missing column -> friendly error, no tool', async () => {
    const { fetchFn } = mockOllama([
      { label: 'X', commands: [{ cmd: 'sortBy', args: { column: 'Price', direction: 'asc' } }] },
    ]);
    const r = await promptToTool('sort by price', HEADERS, fetchFn);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Price/);
  });

  it('unreachable model -> friendly error', async () => {
    const { fetchFn } = mockOllama(['UNREACHABLE']);
    const r = await promptToTool('anything', HEADERS, fetchFn);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not reachable/);
  });

  it('empty request -> rejected without calling the model', async () => {
    const r = await promptToTool('   ', HEADERS);
    expect(r.ok).toBe(false);
  });
});
