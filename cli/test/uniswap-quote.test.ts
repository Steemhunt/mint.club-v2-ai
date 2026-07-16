import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import {
  createOnchainQuoteBackend,
  findBestRoute,
  type QuoteBackend,
} from '../src/utils/uniswap/quote';
import type {
  RouteCandidate,
  RoutingToken,
} from '../src/utils/uniswap/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const PAIR = '0x5555555555555555555555555555555555555555' as Address;

function token(address: Address, symbol = 'TKN', decimals = 18): RoutingToken {
  return { address, chainId: 8453, symbol, decimals: String(decimals) };
}

function mockBackend(overrides: Partial<QuoteBackend> = {}): QuoteBackend {
  return {
    getToken: async (address) => token(address),
    getV2Pool: async () => null,
    quoteV3: async () => null,
    quoteV4: async () => null,
    ...overrides,
  };
}

describe('local Uniswap route quoting', () => {
  it('selects the highest-output route with deterministic tie breakers', async () => {
    const backend = mockBackend({
      quoteV3: async (candidate) =>
        candidate.currencies.length === 2 && candidate.fees[0] === 3000
          ? 150n
          : null,
      quoteV4: async (candidate) =>
        candidate.currencies.length === 2 && candidate.fees[0] === 500
          ? 200n
          : null,
    });

    const route = await findBestRoute({
      chain: 'base',
      input: A,
      output: B,
      amountIn: 100n,
      backend,
    });

    expect(route.protocol).toBe('v4');
    expect(route.amountIn).toBe(100n);
    expect(route.amountOut).toBe(200n);
    expect(route.pools).toHaveLength(1);
    expect(route.pools[0]).toMatchObject({
      type: 'v4-pool',
      fee: '500',
      tickSpacing: '10',
    });
  });

  it('returns a no-swap route without quote calls when currencies match', async () => {
    const quoteV3 = vi.fn();
    const backend = mockBackend({ quoteV3 });

    const route = await findBestRoute({
      chain: 'base',
      input: A,
      output: A,
      amountIn: 77n,
      backend,
    });

    expect(route).toMatchObject({
      protocol: 'none',
      amountIn: 77n,
      amountOut: 77n,
      pools: [],
    });
    expect(quoteV3).not.toHaveBeenCalled();
  });

  it.each([
    ['native to wrapped native', ZERO, WETH],
    ['wrapped native to native', WETH, ZERO],
  ] as const)('returns a direct route for %s', async (_name, input, output) => {
    const getV2Pool = vi.fn();
    const quoteV3 = vi.fn();
    const quoteV4 = vi.fn();
    const backend = mockBackend({ getV2Pool, quoteV3, quoteV4 });

    const route = await findBestRoute({
      chain: 'base',
      input,
      output,
      amountIn: 77n,
      backend,
    });

    expect(route).toMatchObject({
      protocol: 'none',
      amountIn: 77n,
      amountOut: 77n,
      pools: [],
    });
    expect(getV2Pool).not.toHaveBeenCalled();
    expect(quoteV3).not.toHaveBeenCalled();
    expect(quoteV4).not.toHaveBeenCalled();
  });

  it('quotes and builds a two-pool V2 route from cached reserves', async () => {
    const backend = mockBackend({
      getV2Pool: async (left, right) => {
        const pair = new Set([left.toLowerCase(), right.toLowerCase()]);
        if (pair.has(A.toLowerCase()) && pair.has(B.toLowerCase())) {
          return null;
        }
        const [token0, token1] = [left, right].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        ) as [Address, Address];
        return { token0, token1, reserve0: 10_000n, reserve1: 10_000n };
      },
    });

    const route = await findBestRoute({
      chain: 'base',
      input: A,
      output: B,
      amountIn: 100n,
      backend,
      intermediaries: [WETH],
      protocols: ['v2'],
    });

    expect(route.protocol).toBe('v2');
    expect(route.pools).toHaveLength(2);
    expect(route.amountOut).toBeGreaterThan(0n);
    expect(route.pools[0]).toMatchObject({ type: 'v2-pool' });
  });

  it('reports a genuine no-route result clearly', async () => {
    await expect(
      findBestRoute({
        chain: 'base',
        input: A,
        output: B,
        amountIn: 100n,
        backend: mockBackend(),
      }),
    ).rejects.toThrow('No bounded Uniswap route found on Base');
  });
});

describe('viem on-chain quote backend', () => {
  it('caches unordered V2 pair and reserve reads', async () => {
    const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'getPair') return PAIR;
      if (functionName === 'getReserves') return [10n, 20n, 0] as const;
      throw new Error(`unexpected ${functionName}`);
    });
    const backend = createOnchainQuoteBackend(
      { readContract, simulateContract: vi.fn() } as never,
      'base',
    );

    await expect(backend.getV2Pool(A, B)).resolves.toMatchObject({
      token0: A,
      token1: B,
      reserve0: 10n,
      reserve1: 20n,
    });
    await backend.getV2Pool(B, A);

    expect(readContract).toHaveBeenCalledTimes(2);
    expect(readContract.mock.calls[0][0]).toMatchObject({
      address: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
      functionName: 'getPair',
      args: [A, B],
    });
  });

  it('builds V3 QuoterV2 exact-input calls and reads amountOut', async () => {
    const simulateContract = vi.fn(async () => ({
      result: [123n, [], [], 45_000n] as const,
    }));
    const backend = createOnchainQuoteBackend(
      { readContract: vi.fn(), simulateContract } as never,
      'base',
    );
    const candidate: RouteCandidate = {
      protocol: 'v3',
      currencies: [A, WETH, B],
      fees: [500, 3000],
      tickSpacings: [],
    };

    await expect(backend.quoteV3(candidate, 100n)).resolves.toBe(123n);
    expect(simulateContract).toHaveBeenCalledOnce();
    expect(simulateContract.mock.calls[0][0]).toMatchObject({
      address: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      functionName: 'quoteExactInput',
      args: [
        `0x${A.slice(2)}0001f4${WETH.slice(2)}000bb8${B.slice(2)}`.toLowerCase(),
        100n,
      ],
    });
  });

  it('uses the configured V3 QuoterV2 on Zora', async () => {
    const simulateContract = vi.fn(async () => ({
      result: [321n, [], [], 45_000n] as const,
    }));
    const backend = createOnchainQuoteBackend(
      { readContract: vi.fn(), simulateContract } as never,
      'zora',
    );
    const candidate: RouteCandidate = {
      protocol: 'v3',
      currencies: [A, B],
      fees: [3000],
      tickSpacings: [],
    };

    await expect(backend.quoteV3(candidate, 100n)).resolves.toBe(321n);
    expect(simulateContract.mock.calls[0][0]).toMatchObject({
      address: '0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df',
      functionName: 'quoteExactInput',
    });
  });

  it('builds the current V4 exact-input path tuple', async () => {
    const simulateContract = vi.fn(async () => ({ result: [456n, 90_000n] }));
    const backend = createOnchainQuoteBackend(
      { readContract: vi.fn(), simulateContract } as never,
      'base',
    );
    const candidate: RouteCandidate = {
      protocol: 'v4',
      currencies: [ZERO, WETH, B],
      fees: [500, 3000],
      tickSpacings: [10, 60],
    };

    await expect(backend.quoteV4(candidate, 100n)).resolves.toBe(456n);
    expect(simulateContract.mock.calls[0][0]).toMatchObject({
      address: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
      functionName: 'quoteExactInput',
      args: [
        {
          exactCurrency: ZERO,
          exactAmount: 100n,
          path: [
            {
              intermediateCurrency: WETH,
              fee: 500,
              tickSpacing: 10,
              hooks: ZERO,
              hookData: '0x',
            },
            {
              intermediateCurrency: B,
              fee: 3000,
              tickSpacing: 60,
              hooks: ZERO,
              hookData: '0x',
            },
          ],
        },
      ],
    });
  });

  it('suppresses expected pool reverts but propagates transport failures', async () => {
    const revertBackend = createOnchainQuoteBackend(
      {
        readContract: vi.fn(),
        simulateContract: vi.fn(async () => {
          throw new Error('execution reverted: PoolNotInitialized');
        }),
      } as never,
      'base',
    );
    const outageBackend = createOnchainQuoteBackend(
      {
        readContract: vi.fn(),
        simulateContract: vi.fn(async () => {
          throw new Error('HTTP request failed: 429 rate limit');
        }),
      } as never,
      'base',
    );
    const candidate: RouteCandidate = {
      protocol: 'v3',
      currencies: [A, B],
      fees: [3000],
      tickSpacings: [],
    };

    await expect(revertBackend.quoteV3(candidate, 100n)).resolves.toBeNull();
    await expect(outageBackend.quoteV3(candidate, 100n)).rejects.toThrow(
      'HTTP request failed',
    );
  });
});
