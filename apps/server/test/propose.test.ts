import { describe, expect, it } from 'vitest';
import { fallbackProposal, propose, validateProposal } from '../src/propose.ts';
import { cleanupPattern, mockOllama, VALID_PROPOSAL } from './helpers.ts';

describe('validateProposal', () => {
  const pattern = cleanupPattern();

  it('accepts a valid proposal', () => {
    expect(validateProposal(VALID_PROPOSAL, pattern)).toBeNull();
  });

  it('rejects an over-long label', () => {
    expect(
      validateProposal({ ...VALID_PROPOSAL, label: 'x'.repeat(31) }, pattern),
    ).toMatch(/label too long/);
  });

  it('rejects exposed inputs that are not real parameters', () => {
    expect(
      validateProposal(
        { ...VALID_PROPOSAL, exposed_inputs: [{ param: 'ghost', friendly_name: 'Ghost' }] },
        pattern,
      ),
    ).toMatch(/not a real parameter/);
  });

  it('rejects a summary that mentions operations not in the pattern', () => {
    expect(
      validateProposal(
        { ...VALID_PROPOSAL, summary: 'Deletes empty rows and sorts by date.' },
        pattern,
      ),
    ).toMatch(/sorts/);
    expect(
      validateProposal(
        { ...VALID_PROPOSAL, summary: 'Cleans the sheet and adds a total row.' },
        pattern,
      ),
    ).toMatch(/total/);
  });

  it('allows generic spreadsheet words in the summary', () => {
    expect(
      validateProposal(
        { ...VALID_PROPOSAL, summary: 'Cleans up the sheet: rows, columns, header and the Amount column.' },
        pattern,
      ),
    ).toBeNull();
  });
});

describe('propose: paths', () => {
  const pattern = cleanupPattern();

  it('valid output on the first call -> path llm', async () => {
    const { fetchFn } = mockOllama([VALID_PROPOSAL]);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('llm');
    expect(r.proposal.label).toBe('Clean monthly sheet');
    expect(r.errors).toEqual([]);
  });

  it('invalid then valid -> path llm_retry', async () => {
    const bad = { ...VALID_PROPOSAL, summary: 'Sorts the data by date.' };
    const { fetchFn } = mockOllama([bad, VALID_PROPOSAL]);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('llm_retry');
    expect(r.errors.length).toBe(1);
  });

  it('invalid twice -> deterministic fallback', async () => {
    const bad = { ...VALID_PROPOSAL, label: 'x'.repeat(40) };
    const { fetchFn } = mockOllama([bad, bad]);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('fallback');
    expect(r.proposal.label.length).toBeLessThanOrEqual(30);
    expect(r.proposal.card_text).toMatch(/4 steps/);
  });

  it('unreachable -> fallback without hanging', async () => {
    const { fetchFn } = mockOllama(['UNREACHABLE', 'UNREACHABLE']);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('fallback');
    expect(r.errors[0]).toMatch(/ollama/);
  });

  it('HTTP error then valid -> retry succeeds', async () => {
    const { fetchFn } = mockOllama(['HTTP500', VALID_PROPOSAL]);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('llm_retry');
  });

  it('non-JSON content -> counts as invalid, falls back after two', async () => {
    const { fetchFn } = mockOllama(['not json at all', 'still not json']);
    const r = await propose(pattern, 3, fetchFn);
    expect(r.path).toBe('fallback');
  });
});

describe('fallbackProposal', () => {
  it('is always schema-valid for its own pattern', () => {
    const pattern = cleanupPattern();
    pattern.exposedParams = [{ param: 'step3_count', default: 1 }];
    const p = fallbackProposal(pattern, 5);
    expect(validateProposal(p, pattern)).toBeNull();
    expect(p.element).toBe('button_with_input');
    expect(p.exposed_inputs[0].param).toBe('step3_count');
  });
});
