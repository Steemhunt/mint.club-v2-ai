import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import {
  V3_FEE_TIERS,
  V4_POOL_VARIANTS,
  encodeV3Path,
  generateRouteCandidates,
} from '../src/utils/uniswap/candidates';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;
const WNATIVE = '0x3333333333333333333333333333333333333333' as Address;
const STABLE = '0x4444444444444444444444444444444444444444' as Address;

describe('bounded Uniswap route candidates', () => {
  it('enumerates direct and one-intermediary homogeneous V2/V3/V4 routes', () => {
    const candidates = generateRouteCandidates({
      input: A,
      output: B,
      wrappedNative: WNATIVE,
      intermediaries: [WNATIVE, STABLE],
    });

    expect(candidates.filter(({ protocol }) => protocol === 'v2')).toHaveLength(3);
    expect(candidates.filter(({ protocol }) => protocol === 'v3')).toHaveLength(36);
    expect(candidates.filter(({ protocol }) => protocol === 'v4')).toHaveLength(36);
    expect(candidates).toHaveLength(75);
    expect(candidates.every(({ currencies }) => currencies.length <= 3)).toBe(true);
  });

  it('uses all canonical V3 fees and hookless V4 fee/tick pairs', () => {
    expect(V3_FEE_TIERS).toEqual([100, 500, 3000, 10000]);
    expect(V4_POOL_VARIANTS).toEqual([
      { fee: 100, tickSpacing: 1 },
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
      { fee: 10000, tickSpacing: 200 },
    ]);

    const direct = generateRouteCandidates({
      input: A,
      output: B,
      wrappedNative: WNATIVE,
      intermediaries: [],
    });
    expect(direct.filter(({ protocol }) => protocol === 'v3').map(({ fees }) => fees)).toEqual(
      [[100], [500], [3000], [10000]],
    );
    expect(
      direct
        .filter(({ protocol }) => protocol === 'v4')
        .map(({ fees, tickSpacings }) => [fees, tickSpacings]),
    ).toEqual([
      [[100], [1]],
      [[500], [10]],
      [[3000], [60]],
      [[10000], [200]],
    ]);
  });

  it('wraps native currency for V2/V3 and preserves it for V4', () => {
    const candidates = generateRouteCandidates({
      input: ZERO,
      output: B,
      wrappedNative: WNATIVE,
      intermediaries: [WNATIVE, STABLE],
    });

    const v2v3 = candidates.filter(({ protocol }) => protocol !== 'v4');
    expect(v2v3.every(({ currencies }) => currencies[0] === WNATIVE)).toBe(true);
    expect(v2v3.every(({ currencies }) => currencies[1] !== WNATIVE)).toBe(true);

    const v4 = candidates.filter(({ protocol }) => protocol === 'v4');
    expect(v4.every(({ currencies }) => currencies[0] === ZERO)).toBe(true);
    expect(v4.some(({ currencies }) => currencies[1] === WNATIVE)).toBe(true);
  });

  it('deduplicates intermediaries and removes input/output currencies', () => {
    const candidates = generateRouteCandidates({
      input: A,
      output: B,
      wrappedNative: WNATIVE,
      intermediaries: [A, B, WNATIVE, WNATIVE, STABLE, STABLE],
    });
    const v2Paths = candidates
      .filter(({ protocol }) => protocol === 'v2')
      .map(({ currencies }) => currencies);

    expect(v2Paths).toEqual([
      [A, B],
      [A, WNATIVE, B],
      [A, STABLE, B],
    ]);
  });

  it('encodes a canonical multi-hop V3 packed path', () => {
    expect(encodeV3Path([A, WNATIVE, B], [500, 3000])).toBe(
      `0x${A.slice(2)}0001f4${WNATIVE.slice(2)}000bb8${B.slice(2)}`.toLowerCase(),
    );
    expect(() => encodeV3Path([A, B], [])).toThrow('V3 path length mismatch');
  });
});
