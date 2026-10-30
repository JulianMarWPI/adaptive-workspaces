// npm run eval:prompt — 25 written requests with their correct command
// sequences; prints exact-match accuracy against the real local model.

import type { GeneralizedStep } from '@aw/core';
import { config } from '../src/config.ts';
import { checkOllama } from '../src/ollama.ts';
import { promptToTool } from '../src/promptTool.ts';

const HEADERS = ['Date', 'Customer', 'Amount', 'Qty'];

/** Expected sequences in the same simplified shape the LLM produces. */
interface Expected {
  cmd: string;
  args: Record<string, unknown>;
}

const CASES: { request: string; expected: Expected[] }[] = [
  {
    request: 'button that removes empty rows and sorts by date',
    expected: [
      { cmd: 'deleteEmptyRows', args: {} },
      { cmd: 'sortBy', args: { column: 'Date', direction: 'asc' } },
    ],
  },
  { request: 'delete the blank rows', expected: [{ cmd: 'deleteEmptyRows', args: {} }] },
  {
    request: 'format the amount column as currency',
    expected: [{ cmd: 'setNumberFormat', args: { column: 'Amount', format: 'currency' } }],
  },
  {
    request: 'make the date column show as dates',
    expected: [{ cmd: 'setNumberFormat', args: { column: 'Date', format: 'date' } }],
  },
  {
    request: 'bold the header row',
    expected: [{ cmd: 'setRowStyle', args: { row: 0, bold: true } }],
  },
  {
    request: 'bold the header and freeze it',
    expected: [
      { cmd: 'setRowStyle', args: { row: 0, bold: true } },
      { cmd: 'freezeRows', args: { count: 1 } },
    ],
  },
  { request: 'freeze the top row', expected: [{ cmd: 'freezeRows', args: { count: 1 } }] },
  { request: 'freeze the top two rows', expected: [{ cmd: 'freezeRows', args: { count: 2 } }] },
  {
    request: 'right align the qty column',
    expected: [{ cmd: 'setAlignment', args: { column: 'Qty', align: 'right' } }],
  },
  {
    request: 'center the customer names',
    expected: [{ cmd: 'setAlignment', args: { column: 'Customer', align: 'center' } }],
  },
  {
    request: 'add totals under amount and qty',
    expected: [{ cmd: 'insertTotalRow', args: { columns: ['Amount', 'Qty'] } }],
  },
  {
    request: 'add a total row for the amount column',
    expected: [{ cmd: 'insertTotalRow', args: { columns: ['Amount'] } }],
  },
  {
    request: 'sort by amount, biggest first',
    expected: [{ cmd: 'sortBy', args: { column: 'Amount', direction: 'desc' } }],
  },
  {
    request: 'sort by date, oldest first',
    expected: [{ cmd: 'sortBy', args: { column: 'Date', direction: 'asc' } }],
  },
  {
    request: 'make all the columns fit their contents',
    expected: [{ cmd: 'autoFitColumns', args: { columns: ['*'] } }],
  },
  {
    request: 'autofit the customer column',
    expected: [{ cmd: 'autoFitColumns', args: { columns: ['Customer'] } }],
  },
  {
    request: 'set the date column 160 pixels wide',
    expected: [{ cmd: 'setColumnWidth', args: { column: 'Date', width: 160 } }],
  },
  {
    request: 'rename this sheet to Summary',
    expected: [{ cmd: 'renameSheet', args: { name: 'Summary' } }],
  },
  {
    request: 'clean up: remove blank rows, bold and freeze the header',
    expected: [
      { cmd: 'deleteEmptyRows', args: {} },
      { cmd: 'setRowStyle', args: { row: 0, bold: true } },
      { cmd: 'freezeRows', args: { count: 1 } },
    ],
  },
  {
    request: 'format amount as currency and right-align it',
    expected: [
      { cmd: 'setNumberFormat', args: { column: 'Amount', format: 'currency' } },
      { cmd: 'setAlignment', args: { column: 'Amount', align: 'right' } },
    ],
  },
  {
    request: 'sort by customer alphabetically and fit all columns',
    expected: [
      { cmd: 'sortBy', args: { column: 'Customer', direction: 'asc' } },
      { cmd: 'autoFitColumns', args: { columns: ['*'] } },
    ],
  },
  {
    request: 'qty should be whole numbers',
    expected: [{ cmd: 'setNumberFormat', args: { column: 'Qty', format: 'integer' } }],
  },
  {
    request: 'highlight the header row light gray',
    expected: [{ cmd: 'setRowStyle', args: { row: 0, fill: '*any*' } }],
  },
  {
    request: 'remove empty rows then add a total under amount',
    expected: [
      { cmd: 'deleteEmptyRows', args: {} },
      { cmd: 'insertTotalRow', args: { columns: ['Amount'] } },
    ],
  },
  {
    request: 'delete blank rows, sort by date, and format date as a date',
    expected: [
      { cmd: 'deleteEmptyRows', args: {} },
      { cmd: 'sortBy', args: { column: 'Date', direction: 'asc' } },
      { cmd: 'setNumberFormat', args: { column: 'Date', format: 'date' } },
    ],
  },
];

/** Render hydrated steps back to the simplified shape for comparison. */
function simplify(steps: GeneralizedStep[]): Expected[] {
  return steps.map((s) => {
    const args: Record<string, unknown> = {};
    for (const [k, b] of Object.entries(s.args)) {
      if (b.kind === 'currentSheet') continue; // implicit
      else if (b.kind === 'columnByHeader') args[k] = b.header;
      else if (b.kind === 'columnsByHeader') args[k] = b.headers;
      else if (b.kind === 'constant') args[k] = b.value;
      else if (b.kind === 'lastRow') args[k] = 'last';
      else args[k] = b.default;
    }
    return { cmd: s.cmd, args };
  });
}

function matches(actual: Expected[], expected: Expected[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i].cmd !== expected[i].cmd) return false;
    for (const [k, v] of Object.entries(expected[i].args)) {
      const got = actual[i].args[k];
      if (v === '*any*') {
        if (got === undefined) return false;
      } else if (Array.isArray(v) && v.length === 1 && v[0] === '*') {
        if (!Array.isArray(got) || got.length !== HEADERS.length) return false;
      } else if (JSON.stringify(got) !== JSON.stringify(v)) {
        return false;
      }
    }
  }
  return true;
}

async function main() {
  const health = await checkOllama();
  if (!health.reachable || !health.modelAvailable) {
    console.error(
      `Ollama/${config.ollamaModel} not available at ${config.ollamaUrl}. ` +
        `Start Ollama and run: ollama pull ${config.ollamaModel}`,
    );
    process.exit(1);
  }

  let exact = 0;
  const latencies: number[] = [];
  for (let i = 0; i < CASES.length; i++) {
    const { request, expected } = CASES[i];
    const r = await promptToTool(request, HEADERS);
    latencies.push(r.latencyMs);
    const ok = r.ok && matches(simplify(r.steps!), expected);
    if (ok) exact++;
    console.log(
      `${String(i + 1).padStart(2)}/25 [${ok ? 'ok  ' : 'MISS'}] ${r.latencyMs}ms "${request}"`,
    );
    if (!ok) {
      console.log(`   expected: ${JSON.stringify(expected)}`);
      console.log(`   got:      ${r.ok ? JSON.stringify(simplify(r.steps!)) : r.error}`);
    }
  }
  latencies.sort((a, b) => a - b);
  console.log('\n=== eval:prompt summary ===');
  console.log(`exact-match accuracy: ${exact}/25 (${((exact / 25) * 100).toFixed(0)}%)`);
  console.log(`median latency:       ${latencies[12]} ms`);
}

main();
