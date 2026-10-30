// Task workbook generation: equivalent workbooks of six raw "monthly export"
// sheets with seeded data, plus per-sheet target states for the checker and
// the Latin-square counterbalancing.

import { applyCommand, type CellValue, type Command, type SheetState } from '@aw/core';

export type Cond = 'default' | 'proactive' | 'prompted';
export type WorkbookId = 'A' | 'B' | 'C';

// Deterministic PRNG (mulberry32) so every workbook is reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  'Acme Supplies', 'Globex', 'Initech', 'Umbrella Co', 'Stark Industries',
  'Wayne Parts', 'Soylent Foods', 'Hooli', 'Vandelay Imports', 'Cyberdyne',
  'Pied Piper', 'Dunder Mifflin',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const NORMAL_HEADERS = ['Date', 'Customer', 'Amount', 'Qty'];
const SHUFFLED_HEADERS = ['Amount', 'Date', 'Qty', 'Customer'];

export const WORKBOOK_SEEDS: Record<WorkbookId, number> = { A: 10013, B: 20029, C: 30047 };

function blankRow(width: number): CellValue[] {
  return new Array(width).fill(null);
}

function makeRawSheet(name: string, monthIndex: number, shuffled: boolean, rand: () => number): SheetState {
  const headers = shuffled ? SHUFFLED_HEADERS : NORMAL_HEADERS;
  const col = (h: string) => headers.indexOf(h);
  const nRows = 12 + Math.floor(rand() * 7); // 12..18 data rows
  const rows: CellValue[][] = [headers.slice()];
  for (let i = 0; i < nRows; i++) {
    const r = blankRow(headers.length);
    const day = 1 + Math.floor(rand() * 27);
    r[col('Date')] = `2026-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    r[col('Customer')] = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
    r[col('Amount')] = Math.round(rand() * 95000 + 500) / 100; // 5.00 .. 955.00
    r[col('Qty')] = 1 + Math.floor(rand() * 9);
    rows.push(r);
    // Mix in blank rows (roughly 1 in 5)
    if (rand() < 0.2) rows.push(blankRow(headers.length));
  }
  if (rows.length === nRows + 1) rows.splice(3, 0, blankRow(headers.length)); // guarantee at least one
  return {
    name,
    data: rows,
    columnWidths: {},
    frozenRows: 0,
    rowStyles: {},
    columnFormats: {},
    columnAligns: {},
  };
}

/** The canonical cleanup, exactly as the task instructions describe it. */
export function cleanupSteps(sheet: SheetState): Command[] {
  const headers = sheet.data[0] as string[];
  const ref = (h: string) => ({ index: headers.indexOf(h), header: h });
  return [
    { cmd: 'deleteEmptyRows', args: { sheet: sheet.name } },
    { cmd: 'setRowStyle', args: { row: 0, bold: true } },
    { cmd: 'freezeRows', args: { count: 1 } },
    { cmd: 'autoFitColumns', args: { columns: headers.map(ref) } },
    { cmd: 'setNumberFormat', args: { column: ref('Amount'), format: 'currency' } },
    { cmd: 'setNumberFormat', args: { column: ref('Date'), format: 'date' } },
    { cmd: 'insertTotalRow', args: { columns: [ref('Amount'), ref('Qty')] } },
  ];
}

export function targetFor(raw: SheetState): SheetState {
  let s = structuredClone(raw);
  for (const c of cleanupSteps(s)) s = applyCommand(s, c).next;
  return s;
}

export interface Workbook {
  id: WorkbookId;
  sheets: SheetState[];
  targets: SheetState[];
}

export function generateWorkbook(id: WorkbookId): Workbook {
  const rand = rng(WORKBOOK_SEEDS[id]);
  // Shuffle column order on 2 of the 6 sheets (never the first two, so the
  // pattern is learned on the normal layout first).
  const shuffledAt = new Set([3, 5]);
  const sheets = MONTHS.map((m, i) => makeRawSheet(m, i, shuffledAt.has(i), rand));
  return { id, sheets, targets: sheets.map(targetFor) };
}

/** Small practice sheet (2-minute warm-up; not scored). */
export function practiceSheet(): SheetState {
  const rand = rng(777);
  const s = makeRawSheet('Practice', 8, false, rand);
  s.data = s.data.slice(0, 9);
  return s;
}

export const TASK_INSTRUCTIONS =
  'For each month sheet: delete empty rows · bold + freeze the header · fit columns · ' +
  'Amount as currency · Date as date · total row under Amount and Qty';

// ---------------------------------------------------------------------------
// Counterbalancing: condition order and workbook assignment from the
// participant ID via Latin squares.
// ---------------------------------------------------------------------------

const COND_SQUARE: Cond[][] = [
  ['default', 'proactive', 'prompted'],
  ['proactive', 'prompted', 'default'],
  ['prompted', 'default', 'proactive'],
];
const PILOT_SQUARE: Cond[][] = [
  ['default', 'proactive'],
  ['proactive', 'default'],
];
const WB_SQUARE: WorkbookId[][] = [
  ['A', 'B', 'C'],
  ['B', 'C', 'A'],
  ['C', 'A', 'B'],
];

export function pidNumber(pid: string): number {
  const m = pid.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function counterbalance(pid: string, pilot: boolean): { conds: Cond[]; workbooks: WorkbookId[] } {
  const n = pidNumber(pid);
  if (pilot) {
    return { conds: PILOT_SQUARE[n % 2].slice(), workbooks: n % 2 === 0 ? ['A', 'B'] : ['B', 'A'] };
  }
  return { conds: COND_SQUARE[n % 3].slice(), workbooks: WB_SQUARE[n % 3].slice() };
}
