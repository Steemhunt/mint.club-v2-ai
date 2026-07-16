import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { getUsdPrice } from '../src/utils/price';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const ROBINHOOD_USDG =
  '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address;

describe('USD pricing', () => {
  it('delegates pricing with the selected chain', async () => {
    const calls: Array<{ chain: string; token: Address }> = [];
    const resolveUsdRate = async (chain: string, token: Address) => {
      calls.push({ chain, token });
      return 2.5;
    };

    const price = await getUsdPrice(TOKEN, 'robinhood', resolveUsdRate);
    expect(calls).toEqual([{ chain: 'robinhood', token: TOKEN }]);
    expect(price).toBe(2.5);
  });

  it('returns one dollar for the selected chain stablecoin without a resolver call', async () => {
    let called = false;
    const price = await getUsdPrice(
      ROBINHOOD_USDG,
      'robinhood',
      async () => {
        called = true;
        return 999;
      },
    );

    expect(price).toBe(1);
    expect(called).toBe(false);
  });
});
