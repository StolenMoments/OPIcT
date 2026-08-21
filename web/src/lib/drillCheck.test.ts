import { describe, expect, it } from 'vitest';
import { checkDrillAnswer, normalize } from './drillCheck';

describe('normalize', () => {
  it('lowercases, expands common contractions, and collapses punctuation/whitespace', () => {
    expect(normalize("  I'm going to the park, right now!  ")).toBe('i am going to the park right now');
    expect(normalize("I don't think it's ready.")).toBe('i do not think it is ready');
  });

  it('normalizes an unmapped contraction consistently without guessing its expansion', () => {
    expect(normalize("I'd gone there.")).toBe(normalize("I'd gone there."));
    expect(normalize("I'd go there.")).toBe('i d go there');
  });
});

describe('checkDrillAnswer', () => {
  it('marks an exact match after normalization even with different casing, punctuation, and contractions', () => {
    const result = checkDrillAnswer("i'm not sure", "I'm not sure.");
    expect(result.exact).toBe(true);
  });

  it('flags a real mismatch and produces a word-level diff against the reference', () => {
    const result = checkDrillAnswer('I go there yesterday', 'I went there yesterday');
    expect(result.exact).toBe(false);
    expect(result.diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'delete', text: expect.stringContaining('go') }),
        expect.objectContaining({ type: 'insert', text: expect.stringContaining('went') }),
      ]),
    );
  });
});
