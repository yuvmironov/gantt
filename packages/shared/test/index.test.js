import { describe, expect, it } from 'vitest';
import { clamp, isNonEmptyString, toArray } from '../src/index.js';

describe('shared', () => {
  it('detects non-empty strings', () => {
    expect(isNonEmptyString('value')).toBe(true);
    expect(isNonEmptyString('  ')).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('normalizes values to arrays', () => {
    expect(toArray(undefined)).toEqual([]);
    expect(toArray('value')).toEqual(['value']);
    expect(toArray([1, 2])).toEqual([1, 2]);
  });

  it('clamps numbers', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
