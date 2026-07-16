import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';
import { printTokenInfo } from '../src/utils/format';
import { getTokenPricing } from '../src/utils/token-info';

vi.mock('../src/utils/price', () => ({
  getUsdPrice: vi.fn().mockResolvedValue(1),
}));

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const RESERVE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

describe('ERC-1155 token information', () => {
  it('uses whole ERC-1155 units for USD price and market cap', async () => {
    const client = {
      readContract: async (request: { functionName: string }) => {
        if (request.functionName === 'decimals') return 0;
        if (request.functionName === 'getReserveForToken') {
          return [2_000_000n, 0n] as const;
        }
        if (request.functionName === 'tokenBond') {
          return [
            '0x0000000000000000000000000000000000000001',
            0,
            0,
            1,
            RESERVE,
            20_000_000n,
          ] as const;
        }
        throw new Error(`Unexpected function: ${request.functionName}`);
      },
    } as unknown as PublicClient;

    await expect(getTokenPricing(client, TOKEN, 5n)).resolves.toEqual({
      tokenPrice: 2_000_000n,
      tokenUsd: 2,
      reserveUsd: 1,
      reserveValue: 20,
      marketCap: 10,
    });
  });

  it('formats ERC-1155 current and maximum supply as integer units', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    printTokenInfo({
      name: 'Multi Token',
      symbol: 'MT',
      address: TOKEN,
      creator: '0x0000000000000000000000000000000000000001',
      reserveToken: RESERVE,
      reserveSymbol: 'USDC',
      reserveDecimals: 6,
      tokenDecimals: 0,
      reserveBalance: 20_000_000n,
      currentSupply: 5n,
      maxSupply: 10n,
      mintRoyalty: 0,
      burnRoyalty: 0,
      createdAt: 1,
      steps: [],
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('📊 Supply: 5 / 10'));
    log.mockRestore();
  });
});
