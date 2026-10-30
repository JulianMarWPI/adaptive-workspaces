import type { GeneralizedPattern } from '@aw/core';
import type { FetchLike } from '../src/ollama.ts';

/** The canonical mined cleanup pattern used across server tests. */
export function cleanupPattern(): GeneralizedPattern {
  return {
    id: 'p_test_4',
    support: 3,
    steps: [
      { cmd: 'deleteEmptyRows', args: { sheet: { kind: 'currentSheet' } } },
      {
        cmd: 'setRowStyle',
        args: { row: { kind: 'constant', value: 0 }, bold: { kind: 'constant', value: true } },
      },
      { cmd: 'freezeRows', args: { count: { kind: 'constant', value: 1 } } },
      {
        cmd: 'setNumberFormat',
        args: {
          column: { kind: 'columnByHeader', header: 'Amount' },
          format: { kind: 'constant', value: 'currency' },
        },
      },
    ],
    exposedParams: [],
  };
}

export const VALID_PROPOSAL = {
  label: 'Clean monthly sheet',
  summary: 'Deletes empty rows, bolds and freezes the header, and applies currency to Amount.',
  card_text: "You've cleaned 3 sheets the same way (4 steps). Add a button that does it in one click?",
  element: 'button',
  exposed_inputs: [],
};

/** A fetch mock that returns each queued Ollama response in order.
 * A queue item can be an object (returned as the chat content), the string
 * 'HTTP500', or 'UNREACHABLE'. */
export function mockOllama(queue: (object | string)[]): { fetchFn: FetchLike; calls: number[] } {
  const calls: number[] = [];
  const fetchFn: FetchLike = async () => {
    const item = queue.shift();
    calls.push(Date.now());
    if (item === undefined) throw new Error('mockOllama: queue empty');
    if (item === 'UNREACHABLE') throw new TypeError('fetch failed');
    if (item === 'HTTP500') return new Response('oops', { status: 500 });
    const content = typeof item === 'string' ? item : JSON.stringify(item);
    return new Response(JSON.stringify({ message: { content } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchFn, calls };
}
