import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import {
  getV2AmountOut,
  orientV2Reserves,
  sortCurrencies,
} from '../src/utils/uniswap/v2';

const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;

describe('Uniswap V2 exact-input math', () => {
  it('matches the 0.30% constant-product quote', () => {
    expect(
      getV2AmountOut(
        1_000_000_000_000_000_000n,
        1_000_000_000_000_000_000_000n,
        1_000_000_000_000n,
      ),
    ).toBe(996_006_981n);
  });

  it('returns zero for an unusable amount or pool and rejects negative values', () => {
    expect(getV2AmountOut(0n, 1n, 1n)).toBe(0n);
    expect(getV2AmountOut(1n, 0n, 1n)).toBe(0n);
    expect(getV2AmountOut(1n, 1n, 0n)).toBe(0n);
    expect(() => getV2AmountOut(-1n, 1n, 1n)).toThrow(
      'V2 values cannot be negative',
    );
  });

  it('orients pair reserves for either swap direction', () => {
    expect(sortCurrencies(B, A)).toEqual([A, B]);
    expect(orientV2Reserves(A, B, 10n, 20n)).toEqual({
      reserveIn: 10n,
      reserveOut: 20n,
    });
    expect(orientV2Reserves(B, A, 10n, 20n)).toEqual({
      reserveIn: 20n,
      reserveOut: 10n,
    });
    expect(() => orientV2Reserves(A, A, 10n, 20n)).toThrow(
      'V2 currencies must be distinct',
    );
  });
});
