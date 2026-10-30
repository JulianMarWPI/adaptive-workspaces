// Parameter generalizer: compares a pattern's occurrences argument by
// argument and decides, for each argument, whether it is
//   - a constant (same everywhere),
//   - bound at run time (always the current sheet / the column with the same
//     header / the last row), or
//   - a free input, exposed to the user with the most common value as default.
//
// Deterministic, pure, no DOM, no LLM.

import type { NormalizedCommand } from './normalize.ts';
import type { Binding, ColRef, GeneralizedPattern, GeneralizedStep } from './types.ts';
import type { Candidate } from './miner.ts';

const isColRef = (v: unknown): v is ColRef =>
  !!v && typeof v === 'object' && 'header' in (v as ColRef) && 'index' in (v as ColRef);

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function mostCommon<T>(values: T[]): T {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    const k = JSON.stringify(v);
    const e = counts.get(k);
    if (e) e.n++;
    else counts.set(k, { v, n: 1 });
  }
  let best = values[0];
  let bestN = 0;
  for (const { v, n } of counts.values()) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function generalizeArg(
  stepIndex: number,
  key: string,
  perOccurrence: { value: unknown; occ: NormalizedCommand }[],
): Binding {
  const values = perOccurrence.map((p) => p.value);

  // Constant: identical in every occurrence.
  if (values.every((v) => deepEqual(v, values[0]))) {
    return { kind: 'constant', value: values[0] };
  }

  // Context: always the sheet the command ran on.
  if (key === 'sheet' && perOccurrence.every((p) => p.value === p.occ.sheet)) {
    return { kind: 'currentSheet' };
  }

  // Context: always the last row of the sheet at the time.
  if (
    key === 'row' &&
    perOccurrence.every(
      (p) => p.occ.rowCount !== undefined && p.value === p.occ.rowCount - 1,
    )
  ) {
    return { kind: 'lastRow' };
  }

  // Context: a column with the same header, even if its index moved
  // (shuffled columns between sheets).
  if (values.every(isColRef)) {
    const headers = (values as ColRef[]).map((c) => c.header);
    if (headers.every((h) => h === headers[0])) {
      return { kind: 'columnByHeader', header: headers[0] };
    }
  }
  if (values.every((v) => Array.isArray(v) && v.every(isColRef))) {
    const headerLists = (values as ColRef[][]).map((cols) => cols.map((c) => c.header).join('|'));
    if (headerLists.every((h) => h === headerLists[0])) {
      return { kind: 'columnsByHeader', headers: (values[0] as ColRef[]).map((c) => c.header) };
    }
  }

  // No rule: expose as input, defaulting to the most common value.
  return { kind: 'input', param: `step${stepIndex + 1}_${key}`, default: mostCommon(values) };
}

export function generalize(candidate: Candidate): GeneralizedPattern {
  const n = candidate.tokens.length;
  const steps: GeneralizedStep[] = [];
  const exposedParams: { param: string; default: unknown }[] = [];

  for (let si = 0; si < n; si++) {
    const perStep = candidate.occurrences.map((occ) => occ[si]);
    const cmd = perStep[0].command.cmd;
    const argKeys = new Set<string>();
    for (const s of perStep) for (const k of Object.keys(s.command.args)) argKeys.add(k);

    const args: Record<string, Binding> = {};
    for (const key of argKeys) {
      const binding = generalizeArg(
        si,
        key,
        perStep.map((s) => ({
          value: (s.command.args as Record<string, unknown>)[key],
          occ: s,
        })),
      );
      args[key] = binding;
      if (binding.kind === 'input') {
        exposedParams.push({ param: binding.param, default: binding.default });
      }
    }
    steps.push({ cmd, args });
  }

  return {
    id: candidate.key,
    steps,
    support: candidate.support,
    exposedParams,
  };
}
