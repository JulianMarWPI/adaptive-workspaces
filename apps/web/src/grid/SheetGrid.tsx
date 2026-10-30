// The spreadsheet grid. Handsontable renders; it never owns the data.
// Direct edits are intercepted in beforeChange and re-issued as commands
// through dispatch, so there is exactly one path for every grid change.

import { useEffect, useRef } from 'react';
import Handsontable from 'handsontable';
import { HyperFormula } from 'hyperformula';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/dist/handsontable.full.min.css';
import { create } from 'zustand';
import type { CellValue, SheetState } from '@aw/core';
import { useStore, type Highlight } from '../state/store';

registerAllModules();

/** Current grid selection (columns), for toolbar column operations.
 * Selection is intentionally NOT logged. */
export const useSelection = create<{ cols: number[]; setCols: (c: number[]) => void }>((set) => ({
  cols: [],
  setCols: (cols) => set({ cols }),
}));

function formatValue(v: CellValue, format?: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  switch (format) {
    case 'currency': {
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    case 'percent': {
      const n = Number(v);
      return Number.isNaN(n) ? String(v) : `${(n * 100).toFixed(0)}%`;
    }
    case 'integer': {
      const n = Number(v);
      return Number.isNaN(n) ? String(v) : String(Math.round(n));
    }
    case 'date': {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
    default:
      return null;
  }
}

function isHighlighted(h: Highlight | null, active: number, row: number, col: number): boolean {
  if (!h || h.sheetIndex !== active) return false;
  return h.touched.some((t) => {
    if (t.kind === 'all') return true;
    if (t.kind === 'cols') return t.cols.includes(col);
    if (t.kind === 'rows') return t.rows.includes(row);
    return t.row === row && t.col === col;
  });
}

export function SheetGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<Handsontable | null>(null);
  const sheet: SheetState | undefined = useStore((s) => s.sheets[s.active]);
  const active = useStore((s) => s.active);
  const gridVersion = useStore((s) => s.gridVersion);
  const highlight = useStore((s) => s.highlight);
  const dispatch = useStore((s) => s.dispatch);

  // Build the instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const hot = new Handsontable(containerRef.current, {
      data: [[]],
      licenseKey: 'non-commercial-and-evaluation', // academic research use
      formulas: { engine: HyperFormula },
      rowHeaders: true,
      colHeaders: true,
      height: '100%',
      width: '100%',
      stretchH: 'none',
      outsideClickDeselects: false,
      autoColumnSize: false,
      autoRowSize: false,
      undo: false, // our own command-based undo is the only undo
      beforeChange: (changes, source) => {
        if (source === 'loadData' || source === 'updateData') return;
        // Re-issue every direct edit as a setCellValue command.
        const st = useStore.getState();
        const cur = st.sheets[st.active];
        if (!cur) return false;
        const headers = cur.data[0] ?? [];
        for (const change of changes ?? []) {
          if (!change) continue;
          const [row, prop, , newVal] = change;
          const col = typeof prop === 'number' ? prop : parseInt(String(prop), 10);
          const header = String(headers[col] ?? `Col${col + 1}`);
          const value: CellValue =
            newVal === '' || newVal === null || newVal === undefined
              ? null
              : typeof newVal === 'number'
                ? newVal
                : !Number.isNaN(Number(newVal)) && String(newVal).trim() !== '' && !String(newVal).startsWith('=')
                  ? Number(newVal)
                  : String(newVal);
          st.dispatch({ cmd: 'setCellValue', args: { row, column: { index: col, header }, value } }, 'manual');
        }
        return false; // the dispatch above re-renders the grid
      },
      afterColumnResize: (newSize, col) => {
        const st = useStore.getState();
        const cur = st.sheets[st.active];
        if (!cur) return;
        if (cur.columnWidths[col] === newSize) return;
        const header = String(cur.data[0]?.[col] ?? `Col${col + 1}`);
        st.dispatch({ cmd: 'setColumnWidth', args: { column: { index: col, header }, width: newSize } }, 'manual');
      },
      afterSelectionEnd: (r1, c1, r2, c2) => {
        const lo = Math.max(0, Math.min(c1, c2));
        const hi = Math.max(c1, c2);
        const cols: number[] = [];
        for (let c = lo; c <= hi; c++) cols.push(c);
        useSelection.getState().setCols(cols);
      },
    });
    hotRef.current = hot;
    return () => {
      hot.destroy();
      hotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state -> grid on every change.
  useEffect(() => {
    const hot = hotRef.current;
    if (!hot || !sheet) return;
    const widths: number[] = (sheet.data[0] ?? []).map((_, i) => sheet.columnWidths[i] ?? 110);
    hot.updateSettings({
      data: structuredClone(sheet.data),
      fixedRowsTop: sheet.frozenRows,
      colWidths: widths.length ? widths : undefined,
      cells: (row: number, col: number) => {
        const meta: Handsontable.CellMeta = {};
        const style = sheet.rowStyles[row];
        const classes: string[] = [];
        if (style?.bold) classes.push('aw-bold');
        const align = sheet.columnAligns[col];
        if (align) classes.push(`ht${align[0].toUpperCase()}${align.slice(1)}`); // htLeft etc.
        if (isHighlighted(highlight, active, row, col)) classes.push('aw-flash');
        meta.className = classes.join(' ');
        if (style?.fill) meta.renderer = fillRenderer(style.fill, sheet, row);
        else meta.renderer = baseRenderer(sheet);
        return meta;
      },
    });
  }, [sheet, gridVersion, active, highlight]);

  // Clear the highlight flash shortly after it appears.
  useEffect(() => {
    if (!highlight) return;
    const id = window.setTimeout(() => {
      if (useStore.getState().highlight === highlight) {
        useStore.setState({ highlight: null });
      }
    }, 900);
    return () => window.clearTimeout(id);
  }, [highlight]);

  // Keyboard undo/redo through our command stacks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  void dispatch; // dispatch used inside hooks via getState
  return <div id="aw-grid" ref={containerRef} className="aw-grid" />;
}

function baseRenderer(sheet: SheetState) {
  return function render(
    this: unknown,
    instance: Handsontable,
    td: HTMLTableCellElement,
    row: number,
    col: number,
    prop: string | number,
    value: unknown,
    cellProperties: Handsontable.CellProperties,
  ) {
    const formatted = formatValue(value as CellValue, sheet.columnFormats[col]);
    Handsontable.renderers.TextRenderer.call(
      this, instance, td, row, col, prop, formatted ?? value, cellProperties,
    );
    if (formatted !== null && (sheet.columnFormats[col] === 'currency' || sheet.columnFormats[col] === 'integer')) {
      td.style.textAlign = sheet.columnAligns[col] ? '' : 'right';
    }
  };
}

function fillRenderer(fill: string, sheet: SheetState, _row: number) {
  const base = baseRenderer(sheet);
  return function render(
    this: unknown,
    instance: Handsontable,
    td: HTMLTableCellElement,
    row: number,
    col: number,
    prop: string | number,
    value: unknown,
    cellProperties: Handsontable.CellProperties,
  ) {
    base.call(this, instance, td, row, col, prop, value, cellProperties);
    td.style.backgroundColor = fill;
  };
}
