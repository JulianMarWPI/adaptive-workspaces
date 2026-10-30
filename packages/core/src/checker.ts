// Correctness checker: compares a sheet to its target state and produces a
// per-sheet score logged at block end.

import type { SheetState } from './types.ts';

export interface CheckDetail {
  check: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
}

export interface SheetScore {
  sheet: string;
  passed: number;
  total: number;
  score: number; // passed / total
  details: CheckDetail[];
}

const norm = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

export function checkSheet(actual: SheetState, target: SheetState): SheetScore {
  const details: CheckDetail[] = [];
  const add = (check: string, pass: boolean, expected?: unknown, actualV?: unknown) =>
    details.push({ check, pass, expected, actual: actualV });

  // Values (including formula strings such as the total row SUMs)
  let cellMismatches = 0;
  const rows = Math.max(actual.data.length, target.data.length);
  for (let r = 0; r < rows; r++) {
    const cols = Math.max(actual.data[r]?.length ?? 0, target.data[r]?.length ?? 0);
    for (let c = 0; c < cols; c++) {
      if (norm(actual.data[r]?.[c]) !== norm(target.data[r]?.[c])) cellMismatches++;
    }
  }
  add('values', cellMismatches === 0, 0, cellMismatches);
  add('rowCount', actual.data.length === target.data.length, target.data.length, actual.data.length);

  // Frozen rows
  add('frozenRows', actual.frozenRows === target.frozenRows, target.frozenRows, actual.frozenRows);

  // Header style (bold)
  const headerBold = !!actual.rowStyles[0]?.bold;
  const targetHeaderBold = !!target.rowStyles[0]?.bold;
  add('headerBold', headerBold === targetHeaderBold, targetHeaderBold, headerBold);

  // Column formats
  for (const [col, fmt] of Object.entries(target.columnFormats)) {
    add(
      `format:col${col}`,
      actual.columnFormats[Number(col)] === fmt,
      fmt,
      actual.columnFormats[Number(col)],
    );
  }

  // Total row formulas: every formula cell in the target's last row
  const tLast = target.data[target.data.length - 1] ?? [];
  const aLast = actual.data[actual.data.length - 1] ?? [];
  const hasFormulas = tLast.some((v) => typeof v === 'string' && v.startsWith('=SUM'));
  if (hasFormulas) {
    let ok = true;
    for (let c = 0; c < tLast.length; c++) {
      const t = tLast[c];
      if (typeof t === 'string' && t.startsWith('=SUM') && norm(aLast[c]) !== norm(t)) ok = false;
    }
    add('totalRowFormulas', ok, tLast.filter((v) => typeof v === 'string' && String(v).startsWith('=SUM')), undefined);
  }

  const passed = details.filter((d) => d.pass).length;
  return {
    sheet: actual.name,
    passed,
    total: details.length,
    score: details.length === 0 ? 1 : passed / details.length,
    details,
  };
}
