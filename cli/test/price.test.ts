import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { getUsdPrice } from '../src/utils/price';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ROBINHOOD_USDG =
  '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address;
const UNICHAIN_USDC =
  '0x078D782b760474a361dDA0AF3839290b0EF57AD6' as Address;

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

  it('returns one dollar for each configured chain stablecoin without a resolver call', async () => {
    let calls = 0;
    const resolve = async () => {
      calls += 1;
      return 999;
    };

    await expect(getUsdPrice(ROBINHOOD_USDG, 'robinhood', resolve)).resolves.toBe(1);
    await expect(getUsdPrice(UNICHAIN_USDC, 'unichain', resolve)).resolves.toBe(1);
    expect(calls).toBe(0);
  });

  it('maps native currency to the selected chain wrapped-native token', async () => {
    const calls: Array<{ chain: string; token: Address }> = [];
    await getUsdPrice(ZERO, 'avalanche', async (chain, token) => {
      calls.push({ chain, token });
      return 20;
    });

    expect(calls).toEqual([
      {
        chain: 'avalanche',
        token: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      },
    ]);
  });
});
