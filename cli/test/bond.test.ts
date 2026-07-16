import { describe, expect, it } from 'vitest';
import type { Address, PublicClient } from 'viem';
import {
  getBondInfo,
  getBurnRefund,
  getMintCost,
  resolveBurnLimit,
  resolveMintLimit,
} from '../src/utils/bond';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;

describe('bond quotes', () => {
  it('treats getReserveForToken reserveAmount as royalty-inclusive', async () => {
    const client = {
      readContract: async () => [110n, 10n] as const,
    } as unknown as PublicClient;

    await expect(getMintCost(client, TOKEN, 1n)).resolves.toEqual({
      reserveAmount: 110n,
      royalty: 10n,
      totalCost: 110n,
    });
  });

  it('uses an explicit max cost as the on-chain mint limit', () => {
    const quote = 90_000_000n;

    expect(resolveMintLimit(quote, '100', 6)).toBe(100_000_000n);
    expect(resolveMintLimit(quote, undefined, 6)).toBe(quote);
    expect(() => resolveMintLimit(quote, '89', 6)).toThrow(
      'exceeds max cost',
    );
  });

  it('treats getRefundForTokens refundAmount as royalty-exclusive', async () => {
    const client = {
      readContract: async () => [90n, 10n] as const,
    } as unknown as PublicClient;

    await expect(getBurnRefund(client, TOKEN, 1n)).resolves.toEqual({
      refundAmount: 90n,
      royalty: 10n,
      netRefund: 90n,
    });
  });

  it('uses the quoted refund as the default on-chain burn limit', () => {
    const quote = 90_000_000n;

    expect(resolveBurnLimit(quote, undefined, 6)).toBe(quote);
    expect(resolveBurnLimit(quote, '80', 6)).toBe(80_000_000n);
    expect(() => resolveBurnLimit(quote, '91', 6)).toThrow(
      'below minimum refund',
    );
  });

  it('reads bond data from the selected chain contract', async () => {
    const calls: Array<{ address: Address; functionName: string }> = [];
    const client = {
      readContract: async (request: { address: Address; functionName: string }) => {
        calls.push(request);
        if (request.functionName === 'tokenBond') {
          return [
            '0x0000000000000000000000000000000000000001',
            30,
            30,
            1,
            '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
            100n,
          ] as const;
        }
        if (request.functionName === 'symbol') return 'WETH';
        throw new Error(`Unexpected function: ${request.functionName}`);
      },
    } as unknown as PublicClient;

    const info = await getBondInfo(client, TOKEN, 'robinhood');
    const tokenBondCall = calls.find((call) => call.functionName === 'tokenBond');

    expect(tokenBondCall?.address).toBe(
      '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
    );
    expect(info.reserveSymbol).toBe('WETH');
    expect(info.reserveDecimals).toBe(18);
  });

  it('reads decimals for reserve tokens outside the selected chain known list', async () => {
    const reserve =
      '0x2222222222222222222222222222222222222222' as Address;
    const client = {
      readContract: async (request: { functionName: string }) => {
        if (request.functionName === 'tokenBond') {
          return [
            '0x0000000000000000000000000000000000000001',
            30,
            30,
            1,
            reserve,
            1_000_000n,
          ] as const;
        }
        if (request.functionName === 'symbol') return 'USDT';
        if (request.functionName === 'decimals') return 6;
        throw new Error(`Unexpected function: ${request.functionName}`);
      },
    } as unknown as PublicClient;

    const info = await getBondInfo(client, TOKEN, 'robinhood');

    expect(info.reserveSymbol).toBe('USDT');
    expect(info.reserveDecimals).toBe(6);
    expect(info.formatReserve(1_000_000n)).toBe('1');
  });

  it('rejects ERC-20 contracts that do not have a Mint Club bond', async () => {
    const client = {
      readContract: async (request: { functionName: string }) => {
        if (request.functionName === 'tokenBond') {
          return [
            '0x0000000000000000000000000000000000000000',
            0,
            0,
            0,
            '0x0000000000000000000000000000000000000000',
            0n,
          ];
        }
        throw new Error(`Unexpected function: ${request.functionName}`);
      },
    } as unknown as PublicClient;

    await expect(getBondInfo(client, TOKEN, 'robinhood')).rejects.toThrow(
      'not a Mint Club token on Robinhood Chain',
    );
  });
});
