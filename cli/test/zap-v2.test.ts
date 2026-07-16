import { describe, expect, it, vi } from 'vitest';
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { ZAP_V2_ABI } from '../src/abi/zap-v2';
import {
  zapBuy,
  type ZapBuyParams,
} from '../src/commands/zap-buy';
import {
  zapSell,
  type ZapSellParams,
} from '../src/commands/zap-sell';
import type { ZapCommandDependencies } from '../src/utils/zap-v2';
import type { QuotedRoute } from '../src/utils/uniswap/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ZAP = '0x1111111111111111111111111111111111111111' as Address;
const MC_TOKEN = '0x2222222222222222222222222222222222222222' as Address;
const INPUT = '0x3333333333333333333333333333333333333333' as Address;
const RESERVE = '0x4444444444444444444444444444444444444444' as Address;
const OUTPUT = '0x5555555555555555555555555555555555555555' as Address;
const ACCOUNT = '0x6666666666666666666666666666666666666666' as Address;
const PRIVATE_KEY = `0x${'11'.repeat(32)}` as Hex;

function routingToken(address: Address, symbol: string, decimals: number) {
  return { address, chainId: 8453, symbol, decimals: String(decimals) };
}

function quotedRoute(
  input: Address,
  output: Address,
  amountIn: bigint,
  amountOut: bigint,
  protocol: QuotedRoute['protocol'] = 'v3',
): QuotedRoute {
  const inputToken = routingToken(input, 'IN', 6);
  const outputToken = routingToken(output, 'OUT', 6);
  return {
    protocol,
    inputToken,
    outputToken,
    amountIn,
    amountOut,
    pools:
      protocol === 'none'
        ? []
        : [
            {
              type: 'v3-pool',
              tokenIn: inputToken,
              tokenOut: outputToken,
              fee: '3000',
              sqrtRatioX96: '79228162514264337593543950336',
              liquidity: '1',
              tickCurrent: '0',
            },
          ],
  };
}

function dependencies(overrides: Partial<ZapCommandDependencies> = {}) {
  const publicClient = {
    simulateContract: vi.fn(async () => ({ result: [500n, 1_000n] })),
  };
  const walletClient = { account: { address: ACCOUNT } };
  const route = quotedRoute(INPUT, RESERVE, 10_000_000n, 1_000n);
  const deps: ZapCommandDependencies = {
    getZapV2Address: () => ZAP,
    setupClients: () => ({
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      account: ACCOUNT,
    }),
    getBondInfo: async () => ({
      creator: ACCOUNT,
      mintRoyalty: 0,
      burnRoyalty: 0,
      createdAt: 1,
      reserveToken: RESERVE,
      reserveBalance: 1_000n,
      reserveSymbol: 'RSV',
      reserveDecimals: 6,
      formatReserve: String,
    }),
    getBurnRefund: vi.fn(async () => ({
      refundAmount: 1_000n,
      royalty: 0n,
      netRefund: 1_000n,
    })),
    getDecimals: async (_client, address) =>
      address.toLowerCase() === MC_TOKEN.toLowerCase() ||
      address.toLowerCase() === ZERO.toLowerCase()
        ? 18
        : 6,
    getSymbol: async (_client: unknown, address: Address) =>
      address.toLowerCase() === MC_TOKEN.toLowerCase() ? 'MC' : 'ASSET',
    findBestRoute: vi.fn(async () => route),
    encodeUniversalRouterPlan: vi.fn(() => ({
      commands: '0x00',
      inputs: ['0x1234'],
      deadline: 1_001_200n,
      minimumAmountOut: 990n,
      value: 0n,
    })),
    ensureApproval: vi.fn(async () => undefined),
    ensureERC1155Approval: vi.fn(async () => undefined),
    executeTransaction: vi.fn(async () => undefined),
    nowSeconds: () => 1_000_000n,
    ...overrides,
  };
  return { deps, publicClient, walletClient };
}

const buyParams: ZapBuyParams = {
  privateKey: PRIVATE_KEY,
  token: MC_TOKEN,
  inputToken: INPUT,
  inputAmount: '10',
  slippageBps: 100,
  chain: 'base',
};

const sellParams: ZapSellParams = {
  privateKey: PRIVATE_KEY,
  token: MC_TOKEN,
  amount: '5',
  outputToken: OUTPUT,
  slippageBps: 100,
  chain: 'base',
};

describe('MCV2_ZapV2 ABI', () => {
  it('encodes the deployed zapMint and zapBurn selectors', () => {
    expect(
      encodeFunctionData({
        abi: ZAP_V2_ABI,
        functionName: 'zapMint',
        args: [MC_TOKEN, INPUT, 1n, 2n, '0x00', ['0x1234'], 3n, ACCOUNT],
      }).slice(0, 10),
    ).toBe('0x248c1022');
    expect(
      encodeFunctionData({
        abi: ZAP_V2_ABI,
        functionName: 'zapBurn',
        args: [MC_TOKEN, 1n, OUTPUT, 2n, '0x00', ['0x1234'], 3n, ACCOUNT],
      }).slice(0, 10),
    ).toBe('0xc5ed3e49');
  });
});

describe('zap-buy', () => {
  it('fails before client setup or approval when ZapV2 is not configured', async () => {
    const setupClients = vi.fn();
    const ensureApproval = vi.fn();
    const { deps } = dependencies({
      getZapV2Address: () => {
        throw new Error('MCV2_ZapV2 is not configured on Base');
      },
      setupClients,
      ensureApproval,
    });

    await expect(zapBuy(buyParams, deps)).rejects.toThrow(
      'MCV2_ZapV2 is not configured on Base',
    );
    expect(setupClients).not.toHaveBeenCalled();
    expect(ensureApproval).not.toHaveBeenCalled();
  });

  it('approves ERC20 input and derives minTokensOut from a preview', async () => {
    const { deps, publicClient, walletClient } = dependencies();
    await zapBuy(buyParams, deps);

    expect(deps.findBestRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'base',
        input: INPUT,
        output: RESERVE,
        amountIn: parseUnits('10', 6),
      }),
    );
    expect(deps.ensureApproval).toHaveBeenCalledWith(
      expect.anything(),
      walletClient,
      INPUT,
      ZAP,
      parseUnits('10', 6),
    );
    expect(deps.encodeUniversalRouterPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inputRefund: { token: INPUT, recipient: ACCOUNT },
      }),
    );
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ZAP,
        functionName: 'zapMint',
        args: [
          MC_TOKEN,
          INPUT,
          parseUnits('10', 6),
          0n,
          '0x00',
          ['0x1234'],
          1_001_200n,
          ACCOUNT,
        ],
        value: 0n,
      }),
    );
    expect(deps.executeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      walletClient,
      MC_TOKEN,
      expect.objectContaining({
        address: ZAP,
        functionName: 'zapMint',
        args: [
          MC_TOKEN,
          INPUT,
          parseUnits('10', 6),
          495n,
          '0x00',
          ['0x1234'],
          1_001_200n,
          ACCOUNT,
        ],
        value: 0n,
      }),
      expect.stringContaining('MC'),
      'base',
    );
  });

  it('sends native value, skips approval, and honors explicit min tokens', async () => {
    const amount = parseUnits('0.25', 18);
    const route = quotedRoute(ZERO, RESERVE, amount, 1_000n);
    route.inputToken = routingToken(ZERO, 'ETH', 18);
    const { deps, publicClient } = dependencies({
      findBestRoute: vi.fn(async () => route),
      encodeUniversalRouterPlan: vi.fn(() => ({
        commands: '0x10',
        inputs: ['0x1234'],
        deadline: 1_001_200n,
        minimumAmountOut: 990n,
        value: amount,
      })),
    });

    await zapBuy(
      {
        ...buyParams,
        inputToken: ZERO,
        inputAmount: '0.25',
        minTokens: '2',
      },
      deps,
    );

    expect(deps.ensureApproval).not.toHaveBeenCalled();
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
    expect(deps.executeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MC_TOKEN,
      expect.objectContaining({
        value: amount,
        args: expect.arrayContaining([parseUnits('2', 18), ACCOUNT]),
      }),
      expect.any(String),
      'base',
    );
  });

  it('rejects an explicit negative minimum before approving the input token', async () => {
    const { deps } = dependencies();

    await expect(
      zapBuy({ ...buyParams, minTokens: '-1' }, deps),
    ).rejects.toThrow('Minimum token output cannot be negative');
    expect(deps.ensureApproval).not.toHaveBeenCalled();
    expect(deps.findBestRoute).not.toHaveBeenCalled();
    expect(deps.executeTransaction).not.toHaveBeenCalled();
  });

  it('rejects exact input precision beyond the input token decimals', async () => {
    const { deps } = dependencies();

    await expect(
      zapBuy({ ...buyParams, inputAmount: '0.0000005' }, deps),
    ).rejects.toThrow('Amount has more than 6 decimal places');
    expect(deps.findBestRoute).not.toHaveBeenCalled();
    expect(deps.ensureApproval).not.toHaveBeenCalled();
  });

  it('rejects a fractional ERC-1155 output minimum', async () => {
    const { deps } = dependencies({
      getDecimals: async (_client, address) =>
        address.toLowerCase() === MC_TOKEN.toLowerCase() ? 0 : 6,
    });

    await expect(
      zapBuy({ ...buyParams, minTokens: '1.5' }, deps),
    ).rejects.toThrow('Amount must be a whole number');
    expect(deps.findBestRoute).not.toHaveBeenCalled();
    expect(deps.ensureApproval).not.toHaveBeenCalled();
  });
});

describe('zap-sell', () => {
  it('approves the MC token and uses the route-derived output floor', async () => {
    const route = quotedRoute(RESERVE, OUTPUT, 1_000n, 900n);
    const { deps, walletClient } = dependencies({
      findBestRoute: vi.fn(async () => route),
      encodeUniversalRouterPlan: vi.fn(() => ({
        commands: '0x00',
        inputs: ['0x1234'],
        deadline: 1_001_200n,
        minimumAmountOut: 891n,
        value: 0n,
      })),
    });

    await zapSell(sellParams, deps);

    expect(deps.getBurnRefund).toHaveBeenCalledWith(
      expect.anything(),
      MC_TOKEN,
      parseUnits('5', 18),
      'base',
    );
    expect(deps.encodeUniversalRouterPlan).toHaveBeenCalledWith(
      route,
      expect.objectContaining({
        inputRefund: {
          token: RESERVE,
          recipient: ACCOUNT,
        },
      }),
    );
    expect(deps.ensureApproval).toHaveBeenCalledWith(
      expect.anything(),
      walletClient,
      MC_TOKEN,
      ZAP,
      parseUnits('5', 18),
    );
    expect(deps.executeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      walletClient,
      undefined,
      expect.objectContaining({
        functionName: 'zapBurn',
        args: [
          MC_TOKEN,
          parseUnits('5', 18),
          OUTPUT,
          891n,
          '0x00',
          ['0x1234'],
          1_001_200n,
          ACCOUNT,
        ],
      }),
      expect.stringContaining('ASSET'),
      'base',
    );
  });

  it('uses ERC-1155 operator approval for a multi-token sell', async () => {
    const route = quotedRoute(RESERVE, OUTPUT, 5n, 900n);
    const { deps, walletClient } = dependencies({
      getDecimals: async (_client, address) =>
        address.toLowerCase() === MC_TOKEN.toLowerCase() ? 0 : 6,
      getBurnRefund: vi.fn(async () => ({
        refundAmount: 5n,
        royalty: 0n,
        netRefund: 5n,
      })),
      findBestRoute: vi.fn(async () => route),
      encodeUniversalRouterPlan: vi.fn(() => ({
        commands: '0x00',
        inputs: ['0x1234'],
        deadline: 1_001_200n,
        minimumAmountOut: 891n,
        value: 0n,
      })),
    });

    await zapSell(sellParams, deps);

    expect(deps.ensureApproval).not.toHaveBeenCalled();
    expect(deps.ensureERC1155Approval).toHaveBeenCalledWith(
      expect.anything(),
      walletClient,
      MC_TOKEN,
      ZAP,
    );
  });

  it('rejects a fractional ERC-1155 burn amount', async () => {
    const { deps } = dependencies({
      getDecimals: async (_client, address) =>
        address.toLowerCase() === MC_TOKEN.toLowerCase() ? 0 : 6,
    });

    await expect(
      zapSell({ ...sellParams, amount: '1.5' }, deps),
    ).rejects.toThrow('Amount must be a whole number');
    expect(deps.getBurnRefund).not.toHaveBeenCalled();
    expect(deps.ensureERC1155Approval).not.toHaveBeenCalled();
  });

  it('rejects a negative minimum before approving the Mint Club token', async () => {
    const { deps } = dependencies();
    await expect(
      zapSell(
        {
          privateKey: PRIVATE_KEY,
          token: MC_TOKEN,
          amount: '5',
          outputToken: OUTPUT,
          minOutput: '-1',
          slippageBps: 100,
          chain: 'base',
        },
        deps,
      ),
    ).rejects.toThrow('Minimum output cannot be negative');
    expect(deps.getBurnRefund).not.toHaveBeenCalled();
    expect(deps.findBestRoute).not.toHaveBeenCalled();
    expect(deps.ensureApproval).not.toHaveBeenCalled();
    expect(deps.executeTransaction).not.toHaveBeenCalled();
  });

  it('rejects output minimum precision beyond the output token decimals', async () => {
    const { deps } = dependencies();

    await expect(
      zapSell({ ...sellParams, minOutput: '0.0000005' }, deps),
    ).rejects.toThrow('Amount has more than 6 decimal places');
    expect(deps.getBurnRefund).not.toHaveBeenCalled();
    expect(deps.findBestRoute).not.toHaveBeenCalled();
    expect(deps.ensureApproval).not.toHaveBeenCalled();
  });

  it('requires the exact refund for a no-swap reserve output', async () => {
    const route = quotedRoute(RESERVE, RESERVE, 1_000n, 1_000n, 'none');
    const { deps } = dependencies({
      findBestRoute: vi.fn(async () => route),
      encodeUniversalRouterPlan: vi.fn(() => ({
        commands: '0x',
        inputs: [],
        deadline: 1_001_200n,
        minimumAmountOut: 990n,
        value: 0n,
      })),
    });

    await zapSell({ ...sellParams, outputToken: RESERVE }, deps);
    expect(deps.encodeUniversalRouterPlan).toHaveBeenCalledWith(
      route,
      expect.not.objectContaining({ inputRefund: expect.anything() }),
    );
    expect(deps.executeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ args: expect.arrayContaining([1_000n]) }),
      expect.any(String),
      'base',
    );
  });
});
