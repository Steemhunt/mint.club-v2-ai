import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

const TOKEN = '0x1234567890123456789012345678901234567890' as Address;
const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const RESERVE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

vi.mock('../src/utils/tokens', () => ({
  loadTokens: () => [TOKEN],
}));
vi.mock('../src/utils/price', () => ({
  getUsdPrice: vi.fn().mockResolvedValue(1),
}));

const { getWalletBalances } = await import('../src/utils/wallet');

describe('ERC-1155 wallet balances', () => {
  it('reads token id 0 and preserves integer token units', async () => {
    const multicall = vi.fn(async ({ contracts }: { contracts: readonly any[] }) =>
      contracts.map((contract) => {
        if (contract.functionName === 'tokenBond') {
          return {
            status: 'success',
            result: [ACCOUNT, 0, 0, 1, RESERVE, 6_000_000n],
          };
        }
        if (contract.address.toLowerCase() !== TOKEN.toLowerCase()) {
          return { status: 'success', result: 0n };
        }
        if (contract.functionName === 'decimals') {
          return { status: 'success', result: 0 };
        }
        if (contract.functionName === 'balanceOf' && contract.args.length === 1) {
          return { status: 'failure', error: new Error('wrong selector') };
        }
        if (contract.functionName === 'balanceOf' && contract.args.length === 2) {
          return { status: 'success', result: 3n };
        }
        if (contract.functionName === 'symbol') {
          return { status: 'success', result: 'MT' };
        }
        throw new Error(`Unexpected call: ${contract.functionName}`);
      }),
    );
    const client = {
      getBalance: vi.fn().mockResolvedValue(0n),
      multicall,
      readContract: vi.fn().mockResolvedValue([2_000_000n, 0n]),
    } as unknown as PublicClient;

    const balances = await getWalletBalances(client, ACCOUNT);

    expect(balances.mcTokenBalances).toEqual([
      {
        token: TOKEN,
        symbol: 'MT',
        balance: 3n,
        decimals: 0,
        usdValue: 6,
      },
    ]);
    expect(balances.totalUsd).toBe(6);
    expect(
      multicall.mock.calls[1][0].contracts.find(
        (contract: any) =>
          contract.functionName === 'balanceOf' && contract.args.length === 2,
      ).args,
    ).toEqual([ACCOUNT, 0n]);
  });
});
