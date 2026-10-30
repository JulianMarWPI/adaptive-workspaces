import { describe, expect, it } from 'vitest';
import { dropUndone, normalize, tokenize } from '../src/normalize.ts';
import { cmdEvent, ev, sheetSwitch } from './fixtures.ts';

describe('tokenize', () => {
  it('abstracts the sheet name', () => {
    expect(tokenize({ cmd: 'deleteEmptyRows', args: { sheet: 'Feb' } })).toBe('deleteEmptyRows()');
  });
  it('uses the header for column refs, regardless of index', () => {
    const a = tokenize({
      cmd: 'setNumberFormat',
      args: { column: { index: 2, header: 'Amount' }, format: 'currency' },
    });
    const b = tokenize({
      cmd: 'setNumberFormat',
      args: { column: { index: 0, header: 'Amount' }, format: 'currency' },
    });
    expect(a).toBe('setNumberFormat(column=Amount,format="currency")');
    expect(a).toBe(b);
  });
  it('abstracts a row index equal to the last row', () => {
    const a = tokenize(
      { cmd: 'setRowStyle', args: { row: 9, bold: true } },
      { rowCount: 10 },
    );
    const b = tokenize(
      { cmd: 'setRowStyle', args: { row: 14, bold: true } },
      { rowCount: 15 },
    );
    expect(a).toBe(b);
    expect(a).toContain('row=last');
  });
});

describe('dropUndone', () => {
  it('removes a command that was undone before the next command', () => {
    const events = [
      cmdEvent('Jan', { cmd: 'freezeRows', args: { count: 1 } }),
      cmdEvent('Jan', { cmd: 'freezeRows', args: { count: 3 } }),
      ev({ kind: 'undo' }),
      cmdEvent('Jan', { cmd: 'renameSheet', args: { name: 'January' } }),
    ];
    const kept = dropUndone(events).filter((e) => e.kind === 'command');
    expect(kept.map((e) => e.cmd)).toEqual(['freezeRows', 'renameSheet']);
    expect(kept[0].args).toEqual({ count: 1 });
  });
  it('redo restores the undone command', () => {
    const events = [
      cmdEvent('Jan', { cmd: 'freezeRows', args: { count: 1 } }),
      ev({ kind: 'undo' }),
      ev({ kind: 'redo' }),
    ];
    const kept = dropUndone(events).filter((e) => e.kind === 'command');
    expect(kept.length).toBe(1);
  });
});

describe('normalize', () => {
  it('splits episodes at sheet switches', () => {
    const events = [
      cmdEvent('Jan', { cmd: 'deleteEmptyRows', args: { sheet: 'Jan' } }),
      cmdEvent('Jan', { cmd: 'freezeRows', args: { count: 1 } }),
      sheetSwitch('Feb'),
      cmdEvent('Feb', { cmd: 'deleteEmptyRows', args: { sheet: 'Feb' } }),
    ];
    const episodes = normalize(events);
    expect(episodes.length).toBe(2);
    expect(episodes[0].length).toBe(2);
    expect(episodes[1][0].token).toBe('deleteEmptyRows()');
    // same action on different sheets -> same token
    expect(episodes[0][0].token).toBe(episodes[1][0].token);
  });
});
