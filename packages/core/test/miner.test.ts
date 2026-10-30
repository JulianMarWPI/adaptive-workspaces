import { describe, expect, it } from 'vitest';
import { mine, newPolicyState, pickProposal } from '../src/miner.ts';
import { normalize } from '../src/normalize.ts';
import type { Command, LogEvent } from '../src/types.ts';
import { cleanupCommands, cmdEvent, COLS_NORMAL, sheetSwitch } from './fixtures.ts';

let noiseN = 0;
/** A command that never repeats (unique value every time). */
function noise(sheet: string): Command {
  noiseN += 1;
  return {
    cmd: 'setCellValue',
    args: { row: 1, column: { index: 1, header: 'Customer' }, value: `note-${noiseN}` },
  };
}

function buildLog(episodes: Command[][], sheets: string[]): LogEvent[] {
  const events: LogEvent[] = [];
  episodes.forEach((cmds, i) => {
    if (i > 0) events.push(sheetSwitch(sheets[i]));
    for (const c of cmds) events.push(cmdEvent(sheets[i], c));
  });
  return events;
}

/** Precision/recall of mined token-sequences against the planted set. */
function prf(mined: string[][], planted: string[][]) {
  const key = (t: string[]) => t.join(' ');
  const minedSet = new Set(mined.map(key));
  const plantedSet = new Set(planted.map(key));
  const tp = [...minedSet].filter((k) => plantedSet.has(k)).length;
  return {
    precision: minedSet.size === 0 ? 1 : tp / minedSet.size,
    recall: plantedSet.size === 0 ? 1 : tp / plantedSet.size,
  };
}

const SHEETS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const plant = (sheet: string) => cleanupCommands(sheet, COLS_NORMAL); // 6 steps

describe('miner: planted repeats', () => {
  it('exact repeats: finds exactly the planted 6-step pattern (P=R=1.0)', () => {
    const episodes = SHEETS.slice(0, 4).map((s) => plant(s));
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    const plantedTokens = normalize(buildLog([plant('X')], ['X']))[0].map((c) => c.token);
    const { precision, recall } = prf(mined.map((m) => m.tokens), [plantedTokens]);
    expect(precision).toBe(1.0);
    expect(recall).toBe(1.0);
    expect(mined[0].support).toBe(4);
    expect(mined[0].length).toBe(6);
  });

  it('noise around the plant does not create false patterns (P=R=1.0)', () => {
    const episodes = SHEETS.slice(0, 4).map((s) => [
      noise(s),
      ...plant(s),
      noise(s),
      noise(s),
    ]);
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    const plantedTokens = normalize(buildLog([plant('X')], ['X']))[0].map((c) => c.token);
    const { precision, recall } = prf(mined.map((m) => m.tokens), [plantedTokens]);
    expect(precision).toBe(1.0);
    expect(recall).toBe(1.0);
  });

  it('a mid-sequence interruption breaks that occurrence', () => {
    // 3 clean occurrences + 1 interrupted between step 1 and 2 (fragments of
    // length 1 and 5): the full pattern keeps support 3, and the 5-step
    // suffix reaches support 4 — both are correct maximal patterns.
    const interrupted = plant('Apr');
    const episodes = [
      plant('Jan'),
      plant('Feb'),
      plant('Mar'),
      [interrupted[0], noise('Apr'), ...interrupted.slice(1)],
    ];
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    const full = mined.find((m) => m.length === 6)!;
    expect(full.support).toBe(3);
    const suffix = mined.find((m) => m.length === 5)!;
    expect(suffix.support).toBe(4);
  });

  it('near-repeats that differ by one middle step are not merged (P=R=1.0)', () => {
    // 5-step plant, near-plant differs only at the middle step (percent vs
    // currency) so shared fragments are too short to mine on their own.
    const five = (sheet: string) => plant(sheet).slice(0, 5);
    const near = (sheet: string) => {
      const p = five(sheet);
      p[2] = { cmd: 'freezeRows', args: { count: 2 } }; // middle step differs
      return p;
    };
    const episodes = [five('Jan'), five('Feb'), five('Mar'), near('Apr'), near('May')];
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    const plantedTokens = normalize(buildLog([five('X')], ['X']))[0].map((c) => c.token);
    const { precision, recall } = prf(mined.map((m) => m.tokens), [plantedTokens]);
    expect(precision).toBe(1.0);
    expect(recall).toBe(1.0);
    expect(mined[0].support).toBe(3); // the near-repeat (support 2) stayed out
  });

  it('below threshold: nothing is proposed', () => {
    const episodes = [plant('Jan'), plant('Feb')]; // support 2 < K=3
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    expect(mined).toEqual([]);
  });

  it('K is configurable', () => {
    const episodes = [plant('Jan'), plant('Feb')];
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 2);
    expect(mined.length).toBe(1);
    expect(mined[0].support).toBe(2);
  });

  it('subsequences with the same support are dropped (maximality)', () => {
    const episodes = SHEETS.slice(0, 3).map((s) => plant(s));
    const mined = mine(normalize(buildLog(episodes, SHEETS)), 3);
    expect(mined.length).toBe(1); // only the maximal 6-step sequence
  });
});

describe('proposal policy', () => {
  const candidates = () => {
    const episodes = SHEETS.slice(0, 4).map((s) => plant(s));
    return mine(normalize(buildLog(episodes, SHEETS)), 3);
  };

  it('proposes the top candidate when no card is open', () => {
    const c = pickProposal(candidates(), newPolicyState());
    expect(c).not.toBeNull();
  });

  it('never proposes while a card is open', () => {
    const state = newPolicyState();
    state.openCardKey = 'whatever';
    expect(pickProposal(candidates(), state)).toBeNull();
  });

  it('"Not now" re-proposes only after 2 more occurrences', () => {
    const cands = candidates(); // support 4
    const state = newPolicyState();
    state.deferred.set(cands[0].key, 4);
    expect(pickProposal(cands, state)).toBeNull();
    // simulate 2 more occurrences -> support 6
    const more = SHEETS.map((s) => plant(s)); // 6 episodes
    const cands6 = mine(normalize(buildLog(more, SHEETS)), 3);
    expect(cands6[0].key).toBe(cands[0].key); // same pattern key
    expect(pickProposal(cands6, state)?.key).toBe(cands[0].key);
  });

  it('"Don\'t suggest this" suppresses for the session; accepted is never re-proposed', () => {
    const cands = candidates();
    const sup = newPolicyState();
    sup.suppressed.add(cands[0].key);
    expect(pickProposal(cands, sup)).toBeNull();
    const acc = newPolicyState();
    acc.accepted.add(cands[0].key);
    expect(pickProposal(cands, acc)).toBeNull();
  });
});
