// npm run eval:llm — runs the real local model 50 times across task patterns
// and prints schema-valid rate, fallback rate, and median latency.
// Targets: > 95% valid, < 5 s median.

import type { GeneralizedPattern } from '@aw/core';
import { config } from '../src/config.ts';
import { checkOllama } from '../src/ollama.ts';
import { propose } from '../src/propose.ts';

const c = (v: unknown) => ({ kind: 'constant' as const, value: v });
const byHeader = (h: string) => ({ kind: 'columnByHeader' as const, header: h });
const cols = (hs: string[]) => ({ kind: 'columnsByHeader' as const, headers: hs });

const PATTERNS: { name: string; p: GeneralizedPattern }[] = [
  {
    name: 'full cleanup (6 steps)',
    p: {
      id: 'e1', support: 3, exposedParams: [],
      steps: [
        { cmd: 'deleteEmptyRows', args: { sheet: { kind: 'currentSheet' } } },
        { cmd: 'setRowStyle', args: { row: c(0), bold: c(true) } },
        { cmd: 'freezeRows', args: { count: c(1) } },
        { cmd: 'setNumberFormat', args: { column: byHeader('Amount'), format: c('currency') } },
        { cmd: 'setNumberFormat', args: { column: byHeader('Date'), format: c('date') } },
        { cmd: 'insertTotalRow', args: { columns: cols(['Amount', 'Qty']) } },
      ],
    },
  },
  {
    name: 'header fix (3 steps)',
    p: {
      id: 'e2', support: 4, exposedParams: [],
      steps: [
        { cmd: 'setRowStyle', args: { row: c(0), bold: c(true) } },
        { cmd: 'freezeRows', args: { count: c(1) } },
        { cmd: 'autoFitColumns', args: { columns: cols(['Date', 'Customer', 'Amount', 'Qty']) } },
      ],
    },
  },
  {
    name: 'sort+format (3 steps)',
    p: {
      id: 'e3', support: 3, exposedParams: [],
      steps: [
        { cmd: 'deleteEmptyRows', args: { sheet: { kind: 'currentSheet' } } },
        { cmd: 'sortBy', args: { column: byHeader('Date'), direction: c('asc') } },
        { cmd: 'setNumberFormat', args: { column: byHeader('Amount'), format: c('currency') } },
      ],
    },
  },
  {
    name: 'with exposed input (freeze count)',
    p: {
      id: 'e4', support: 3,
      exposedParams: [{ param: 'step2_count', default: 1 }],
      steps: [
        { cmd: 'setRowStyle', args: { row: c(0), bold: c(true), fill: c('#f3f4f6') } },
        { cmd: 'freezeRows', args: { count: { kind: 'input', param: 'step2_count', default: 1 } } },
        { cmd: 'setAlignment', args: { column: byHeader('Qty'), align: c('right') } },
      ],
    },
  },
  {
    name: 'totals only (3 steps)',
    p: {
      id: 'e5', support: 5, exposedParams: [],
      steps: [
        { cmd: 'insertTotalRow', args: { columns: cols(['Amount', 'Qty']) } },
        { cmd: 'setRowStyle', args: { row: { kind: 'lastRow' }, bold: c(true) } },
        { cmd: 'setAlignment', args: { column: byHeader('Amount'), align: c('right') } },
      ],
    },
  },
];

const RUNS = 50;

async function main() {
  const health = await checkOllama();
  if (!health.reachable) {
    console.error(`Ollama is not reachable at ${config.ollamaUrl}. Start it first.`);
    process.exit(1);
  }
  if (!health.modelAvailable) {
    console.error(`Model ${config.ollamaModel} not found. Run: ollama pull ${config.ollamaModel}`);
    process.exit(1);
  }

  const latencies: number[] = [];
  let firstTryValid = 0;
  let retryRecovered = 0;
  let fallback = 0;

  for (let i = 0; i < RUNS; i++) {
    const { name, p } = PATTERNS[i % PATTERNS.length];
    const r = await propose(p, p.support);
    latencies.push(r.latencyMs);
    if (r.path === 'llm') firstTryValid++;
    else if (r.path === 'llm_retry') retryRecovered++;
    else fallback++;
    const flag = r.path === 'llm' ? 'ok ' : r.path === 'llm_retry' ? 'RTY' : 'FBK';
    console.log(
      `${String(i + 1).padStart(2)}/${RUNS} [${flag}] ${r.latencyMs}ms ${name} -> "${r.proposal.label}"` +
        (r.errors.length ? `  (${r.errors.join(' | ')})` : ''),
    );
  }

  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)];
  const validRate = ((firstTryValid / RUNS) * 100).toFixed(1);
  const fallbackRate = ((fallback / RUNS) * 100).toFixed(1);
  console.log('\n=== eval:llm summary ===');
  console.log(`runs:                 ${RUNS} (model ${config.ollamaModel})`);
  console.log(`schema-valid (1st):   ${validRate}%   (target > 95%)`);
  console.log(`recovered by retry:   ${retryRecovered}`);
  console.log(`fallback rate:        ${fallbackRate}%`);
  console.log(`median latency:       ${median} ms   (target < 5000 ms)`);
  const pass = firstTryValid / RUNS > 0.95 && median < 5000;
  console.log(pass ? 'PASS' : 'MISS (see targets above)');
}

main();
