// Standard toolbar: a button for every command, so the baseline condition is
// not artificially slow. Buttons only ever call dispatch(). Nothing in this
// toolbar ever changes during a session.

import { useState } from 'react';
import type { ColRef, NumberFormat } from '@aw/core';
import { useStore } from '../state/store';
import { useSelection } from '../grid/SheetGrid';

export function Toolbar() {
  const dispatch = useStore((s) => s.dispatch);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const sheet = useStore((s) => s.sheets[s.active]);
  const cols = useSelection((s) => s.cols);
  const rows = useSelection((s) => s.rows);
  const [widthOpen, setWidthOpen] = useState(false);
  const [widthVal, setWidthVal] = useState('120');

  if (!sheet) return <div className="aw-toolbar" id="aw-toolbar" />;

  const headers = (sheet.data[0] ?? []).map((h) => String(h ?? ''));
  const ref = (i: number): ColRef => ({ index: i, header: headers[i] ?? `Col${i + 1}` });

  const needCol = (): ColRef | null => {
    if (cols.length === 0) {
      useStore.setState({ toolMessage: 'Click a cell in the column first.' });
      return null;
    }
    return ref(cols[0]);
  };
  const selRefs = (): ColRef[] | null => {
    if (cols.length === 0) {
      useStore.setState({ toolMessage: 'Select the column(s) first.' });
      return null;
    }
    return cols.map(ref);
  };
  const needRow = (): number | null => {
    if (rows.length === 0) {
      useStore.setState({ toolMessage: 'Select the row first.' });
      return null;
    }
    return Math.min(...rows);
  };

  const fmt = (format: NumberFormat) => {
    const c = needCol();
    if (c) dispatch({ cmd: 'setNumberFormat', args: { column: c, format } }, 'manual');
  };
  const align = (a: 'left' | 'center' | 'right') => {
    const c = needCol();
    if (c) dispatch({ cmd: 'setAlignment', args: { column: c, align: a } }, 'manual');
  };

  return (
    <div className="aw-toolbar" id="aw-toolbar">
      <div className="aw-tb-group">
        <button disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">↷ Redo</button>
      </div>
      <div className="aw-tb-group">
        <button onClick={() => {
          const r = needRow();
          if (r === null) return;
          if (r === 0) { useStore.setState({ toolMessage: "That's the header row — pick a blank data row." }); return; }
          const isBlank = (sheet.data[r] ?? []).every((c) => c === null || c === undefined || String(c).trim() === '');
          if (!isBlank) { useStore.setState({ toolMessage: "That row isn't blank — select an empty row to delete." }); return; }
          dispatch({ cmd: 'deleteRow', args: { row: r } }, 'manual');
        }}
          title="Select a blank row, then delete it">Delete blank row</button>
        <button onClick={() => { const r = needRow(); if (r !== null) dispatch({ cmd: 'setRowStyle', args: { row: r, bold: true } }, 'manual'); }}
          title="Select the header row, then bold it">Bold row</button>
        <button onClick={() => dispatch({ cmd: 'freezeRows', args: { count: sheet.frozenRows > 0 ? 0 : 1 } }, 'manual')}
          title="Freeze / unfreeze the top row">{sheet.frozenRows > 0 ? 'Unfreeze' : 'Freeze top row'}</button>
      </div>
      <div className="aw-tb-group">
        <button onClick={() => { const r = selRefs(); if (r) dispatch({ cmd: 'autoFitColumns', args: { columns: r } }, 'manual'); }}
          title="Select the columns, then fit their widths">Fit columns</button>
        <div className="aw-popwrap">
          <button onClick={() => setWidthOpen(!widthOpen)} title="Set the selected column's width">Width…</button>
          {widthOpen && (
            <div className="aw-pop">
              <input type="number" value={widthVal} min={30} max={400}
                onChange={(e) => setWidthVal(e.target.value)} style={{ width: 64 }} />
              <button onClick={() => {
                const c = needCol();
                if (c) dispatch({ cmd: 'setColumnWidth', args: { column: c, width: Number(widthVal) || 120 } }, 'manual');
                setWidthOpen(false);
              }}>Apply</button>
            </div>
          )}
        </div>
      </div>
      <div className="aw-tb-group">
        <button onClick={() => fmt('currency')} title="Format selected column as currency">$ Currency</button>
        <button onClick={() => fmt('date')} title="Format selected column as dates">Date</button>
        <button onClick={() => fmt('percent')} title="Format selected column as percent">%</button>
        <button onClick={() => fmt('integer')} title="Format selected column as whole numbers">123</button>
      </div>
      <div className="aw-tb-group">
        <button onClick={() => align('left')} title="Align selected column left">⇤</button>
        <button onClick={() => align('center')} title="Center selected column">↔</button>
        <button onClick={() => align('right')} title="Align selected column right">⇥</button>
      </div>
      <div className="aw-tb-group">
        <button onClick={() => {
          const r = selRefs();
          if (r) dispatch({ cmd: 'insertTotalRow', args: { columns: r } }, 'manual');
        }} title="Add a total row (SUM) under the selected column(s)">Σ Total row</button>
        <button onClick={() => {
          const c = needCol();
          if (c) dispatch({ cmd: 'sortBy', args: { column: c, direction: 'asc' } }, 'manual');
        }} title="Sort rows by the selected column, ascending">Sort A→Z</button>
        <button onClick={() => {
          const c = needCol();
          if (c) dispatch({ cmd: 'sortBy', args: { column: c, direction: 'desc' } }, 'manual');
        }} title="Sort rows by the selected column, descending">Sort Z→A</button>
      </div>
    </div>
  );
}
