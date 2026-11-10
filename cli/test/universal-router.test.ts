import { describe, expect, it } from 'vitest';
import { WETH9 } from '@uniswap/sdk-core';
import {
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
} from 'viem';
import {
  calculateMinimumAmountOut,
  assertZapCompatiblePlan,
  encodeUniversalRouterPlan,
  type UniversalRouterPlanOptions,
} from '../src/utils/uniswap/encode';
import type {
  QuotedRoute,
  RoutingToken,
} from '../src/utils/uniswap/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ZAP = '0x1111111111111111111111111111111111111111' as Address;
const ACCOUNT = '0x2222222222222222222222222222222222222222' as Address;
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address;
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Address;

const weth: RoutingToken = {
  address: WETH,
  chainId: 4663,
  symbol: 'WETH',
  decimals: '18',
};
const eth: RoutingToken = { ...weth, address: ZERO, symbol: 'ETH' };
const usdg: RoutingToken = {
  address: USDG,
  chainId: 4663,
  symbol: 'USDG',
  decimals: '6',
};

function route(
  protocol: QuotedRoute['protocol'],
  pools: QuotedRoute['pools'],
  inputToken = weth,
  outputToken = usdg,
  amountOut = 1_000n,
): QuotedRoute {
  return {
    protocol,
    inputToken,
    outputToken,
    amountIn: 1_000_000_000_000_000_000n,
    amountOut,
    pools,
  };
}

const options = {
  recipient: ZAP,
  universalRouterVersion: '2.0',
  slippageBps: 100,
  deadline: 2_000_000_000n,
} satisfies UniversalRouterPlanOptions;

const v3Pool: QuotedRoute['pools'][number] = {
  type: 'v3-pool',
  tokenIn: weth,
  tokenOut: usdg,
  fee: '3000',
  sqrtRatioX96: '79228162514264337593543950336',
  liquidity: '1',
  tickCurrent: '0',
};
const v2Pool: QuotedRoute['pools'][number] = {
  type: 'v2-pool',
  tokenIn: weth,
  tokenOut: usdg,
  reserve0: { token: weth, quotient: '1000000000000000000000' },
  reserve1: { token: usdg, quotient: '1000000000' },
};
const v4Pool: QuotedRoute['pools'][number] = {
  type: 'v4-pool',
  tokenIn: eth,
  tokenOut: usdg,
  fee: '3000',
  tickSpacing: '60',
  hooks: ZERO,
  sqrtRatioX96: '79228162514264337593543950336',
  liquidity: '1',
  tickCurrent: '0',
};

function routedOptions(inputToken: Address = WETH) {
  return {
    ...options,
    inputRefund: { token: inputToken, recipient: ACCOUNT },
  };
}

function commandBytes(commands: `0x${string}`): number[] {
  return commands
    .slice(2)
    .match(/.{2}/g)!
    .map((byte) => Number.parseInt(byte, 16) & 0x3f);
}

describe('Universal Router SDK encoding for ZapV2', () => {
  it('encodes V2 with ZapV2 as recipient and payerIsUser=false', () => {
    const plan = encodeUniversalRouterPlan(
      route(
        'v2',
        [
          {
            type: 'v2-pool',
            tokenIn: weth,
            tokenOut: usdg,
            reserve0: { token: weth, quotient: '1000000000000000000000' },
            reserve1: { token: usdg, quotient: '1000000000' },
          },
        ],
        weth,
        usdg,
        996_006n,
      ),
      routedOptions(),
    );

    expect(commandBytes(plan.commands)).toEqual([0x08, 0x04]);
    const [recipient, amountIn, amountOutMin, path, payerIsUser] =
      decodeAbiParameters(
        parseAbiParameters('address,uint256,uint256,address[],bool'),
        plan.inputs[0],
      );
    expect(recipient).toBe(ZAP.toLowerCase());
    expect(amountIn).toBe(1_000_000_000_000_000_000n);
    expect(amountOutMin).toBe(986_045n);
    expect(path).toEqual([WETH, USDG]);
    expect(payerIsUser).toBe(false);
    expect(plan.value).toBe(0n);
  });

  it('encodes V3 with ZapV2 as recipient and payerIsUser=false', () => {
    const plan = encodeUniversalRouterPlan(
      route('v3', [
        {
          type: 'v3-pool',
          tokenIn: weth,
          tokenOut: usdg,
          fee: '3000',
          sqrtRatioX96: '79228162514264337593543950336',
          liquidity: '1',
          tickCurrent: '0',
        },
      ]),
      routedOptions(),
    );

    expect(commandBytes(plan.commands)).toEqual([0x00, 0x04]);
    const [recipient, amountIn, amountOutMin, , payerIsUser] =
      decodeAbiParameters(
        parseAbiParameters('address,uint256,uint256,bytes,bool'),
        plan.inputs[0],
      );
    expect(recipient).toBe(ZAP.toLowerCase());
    expect(amountIn).toBe(1_000_000_000_000_000_000n);
    expect(amountOutMin).toBe(990n);
    expect(payerIsUser).toBe(false);
  });

  it('sweeps unused routed input to the specified account', () => {
    const plan = encodeUniversalRouterPlan(
      route('v3', [
        {
          type: 'v3-pool',
          tokenIn: weth,
          tokenOut: usdg,
          fee: '3000',
          sqrtRatioX96: '79228162514264337593543950336',
          liquidity: '1',
          tickCurrent: '0',
        },
      ]),
      {
        ...options,
        inputRefund: { token: WETH, recipient: ACCOUNT },
      },
    );

    expect(commandBytes(plan.commands)).toEqual([0x00, 0x04]);
    const [token, recipient, amountMinimum] = decodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      plan.inputs[1],
    );
    expect(token.toLowerCase()).toBe(WETH.toLowerCase());
    expect(recipient.toLowerCase()).toBe(ACCOUNT.toLowerCase());
    expect(amountMinimum).toBe(0n);
  });

  it('unwraps a V3 native output from router custody into ZapV2', () => {
    const plan = encodeUniversalRouterPlan(
      {
        protocol: 'v3',
        inputToken: usdg,
        outputToken: eth,
        amountIn: 1_000_000n,
        amountOut: 1_000_000_000_000_000n,
        pools: [
          {
            type: 'v3-pool',
            tokenIn: usdg,
            tokenOut: weth,
            fee: '3000',
            sqrtRatioX96: '79228162514264337593543950336',
            liquidity: '1',
            tickCurrent: '0',
          },
        ],
      },
      routedOptions(USDG),
    );

    expect(commandBytes(plan.commands)).toEqual([0x00, 0x0c, 0x04]);
    const [swapRecipient, , , , payerIsUser] = decodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,bytes,bool'),
      plan.inputs[0],
    );
    expect(swapRecipient).toBe(
      '0x0000000000000000000000000000000000000002',
    );
    expect(payerIsUser).toBe(false);
    const [unwrapRecipient] = decodeAbiParameters(
      parseAbiParameters('address,uint256'),
      plan.inputs[1],
    );
    expect(unwrapRecipient).toBe(ZAP.toLowerCase());
    expect(plan.value).toBe(0n);
  });

  it('wraps native V3 input from forwarded value without Permit2', () => {
    const plan = encodeUniversalRouterPlan(
      {
        protocol: 'v3',
        inputToken: eth,
        outputToken: usdg,
        amountIn: 1_000_000_000_000_000_000n,
        amountOut: 1_000n,
        pools: [
          {
            type: 'v3-pool',
            tokenIn: weth,
            tokenOut: usdg,
            fee: '3000',
            sqrtRatioX96: '79228162514264337593543950336',
            liquidity: '1',
            tickCurrent: '0',
          },
        ],
      },
      routedOptions(ZERO),
    );

    expect(commandBytes(plan.commands)).toEqual([0x0b, 0x00, 0x0c]);
    const [wrapRecipient] = decodeAbiParameters(
      parseAbiParameters('address,uint256'),
      plan.inputs[0],
    );
    expect(wrapRecipient).toBe(
      '0x0000000000000000000000000000000000000002',
    );
    const [swapRecipient, , , , payerIsUser] = decodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,bytes,bool'),
      plan.inputs[1],
    );
    expect(swapRecipient).toBe(ZAP.toLowerCase());
    expect(payerIsUser).toBe(false);
    const [refundRecipient, refundMinimum] = decodeAbiParameters(
      parseAbiParameters('address,uint256'),
      plan.inputs[2],
    );
    expect(refundRecipient).toBe(ACCOUNT.toLowerCase());
    expect(refundMinimum).toBe(0n);
    expect(plan.value).toBe(1_000_000_000_000_000_000n);
  });

  it('encodes native V4 input with a nested minimum and no Permit2 ingress', () => {
    const plan = encodeUniversalRouterPlan(
      route(
        'v4',
        [
          {
            type: 'v4-pool',
            tokenIn: eth,
            tokenOut: usdg,
            fee: '3000',
            tickSpacing: '60',
            hooks: ZERO,
            sqrtRatioX96: '79228162514264337593543950336',
            liquidity: '1',
            tickCurrent: '0',
          },
        ],
        eth,
      ),
      routedOptions(ZERO),
    );

    const commands = commandBytes(plan.commands);
    expect(commands).toEqual([0x10, 0x04]);
    expect(commands).not.toContain(0x02);
    expect(commands).not.toContain(0x03);
    expect(commands).not.toContain(0x0a);
    expect(commands).not.toContain(0x0d);
    const [actions, actionParams] = decodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      plan.inputs[0],
    );
    expect(actions).toBe('0x070b0e');
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        '(address,(address,uint256,int24,address,bytes)[],uint128,uint128)',
      ),
      actionParams[0],
    );
    expect(swap[2]).toBe(1_000_000_000_000_000_000n);
    expect(swap[3]).toBe(990n);

    const [refundCurrency, recipient, amountMinimum] = decodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      plan.inputs[1],
    );
    expect(refundCurrency).toBe(ZERO);
    expect(recipient).toBe(ACCOUNT.toLowerCase());
    expect(amountMinimum).toBe(0n);
    expect(plan.value).toBe(1_000_000_000_000_000_000n);
  });

  it.each(['2.1.1', '2.2.0'] as const)(
    'encodes V2 and V3 swaps for Universal Router %s with an empty minHopPriceX36',
    (universalRouterVersion) => {
      const v3Plan = encodeUniversalRouterPlan(route('v3', [v3Pool]), {
        ...routedOptions(),
        universalRouterVersion,
      });
      expect(commandBytes(v3Plan.commands)).toEqual([0x00, 0x04]);
      expect(v3Plan.inputs[0]).toHaveLength(2 + 320 * 2);
      const [recipient, amountIn, amountOutMin, , payerIsUser, minHopPriceX36] =
        decodeAbiParameters(
          parseAbiParameters('address,uint256,uint256,bytes,bool,uint256[]'),
          v3Plan.inputs[0],
        );
      expect(recipient).toBe(ZAP.toLowerCase());
      expect(amountIn).toBe(1_000_000_000_000_000_000n);
      expect(amountOutMin).toBe(990n);
      expect(payerIsUser).toBe(false);
      expect(minHopPriceX36).toEqual([]);

      const v2Plan = encodeUniversalRouterPlan(
        route('v2', [v2Pool], weth, usdg, 996_006n),
        { ...routedOptions(), universalRouterVersion },
      );
      expect(commandBytes(v2Plan.commands)).toEqual([0x08, 0x04]);
      const [, , v2AmountOutMin, path, , v2MinHopPriceX36] = decodeAbiParameters(
        parseAbiParameters('address,uint256,uint256,address[],bool,uint256[]'),
        v2Plan.inputs[0],
      );
      expect(v2AmountOutMin).toBe(986_045n);
      expect(path).toEqual([WETH, USDG]);
      expect(v2MinHopPriceX36).toEqual([]);
    },
  );

  it('encodes a V4 swap for Universal Router 2.2.0 with the minHopPriceX36 struct field', () => {
    const plan = encodeUniversalRouterPlan(route('v4', [v4Pool], eth), {
      ...routedOptions(ZERO),
      universalRouterVersion: '2.2.0',
    });

    expect(commandBytes(plan.commands)).toEqual([0x10, 0x04]);
    const [actions, actionParams] = decodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      plan.inputs[0],
    );
    expect(actions).toBe('0x070b0e');
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        '(address,(address,uint24,int24,address,bytes)[],uint256[],uint128,uint128)',
      ),
      actionParams[0],
    );
    expect(swap[2]).toEqual([]);
    expect(swap[3]).toBe(1_000_000_000_000_000_000n);
    expect(swap[4]).toBe(990n);
    expect(plan.value).toBe(1_000_000_000_000_000_000n);
  });

  it('rejects swap inputs laid out for a different Universal Router release', () => {
    const refund = { token: WETH, recipient: ACCOUNT };
    const legacy = encodeUniversalRouterPlan(route('v3', [v3Pool]), routedOptions());
    const current = encodeUniversalRouterPlan(route('v3', [v3Pool]), {
      ...routedOptions(),
      universalRouterVersion: '2.1.1',
    });
    expect(legacy.inputs[0]).toHaveLength(2 + 256 * 2);
    expect(current.inputs[0]).toHaveLength(2 + 320 * 2);

    expect(() =>
      assertZapCompatiblePlan(legacy.commands, legacy.inputs, ZAP, '2.1.1', refund),
    ).toThrow('does not match the configured router version layout');
    expect(() =>
      assertZapCompatiblePlan(current.commands, current.inputs, ZAP, '2.0', refund),
    ).toThrow('does not match the configured router version layout');
    expect(() =>
      assertZapCompatiblePlan(current.commands, current.inputs, ZAP, '2.2.0', refund),
    ).not.toThrow();

    const v4Refund = { token: ZERO, recipient: ACCOUNT };
    const legacyV4 = encodeUniversalRouterPlan(route('v4', [v4Pool], eth), routedOptions(ZERO));
    const currentV4 = encodeUniversalRouterPlan(route('v4', [v4Pool], eth), {
      ...routedOptions(ZERO),
      universalRouterVersion: '2.2.0',
    });
    expect(() =>
      assertZapCompatiblePlan(legacyV4.commands, legacyV4.inputs, ZAP, '2.2.0', v4Refund),
    ).toThrow('does not match the configured router version layout');
    expect(() =>
      assertZapCompatiblePlan(currentV4.commands, currentV4.inputs, ZAP, '2.0', v4Refund),
    ).toThrow('does not match the configured router version layout');
  });

  it('registers wrapped natives the Uniswap SDK does not ship so native routes encode on new chains', () => {
    const WHYPE = '0xbA876237B0F021A6c6D852d6c26E107997cC5E81' as Address;
    const ELYSIUM_USDC = '0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65' as Address;
    expect(WETH9[99901]?.address.toLowerCase()).toBe(WHYPE.toLowerCase());

    const whype: RoutingToken = {
      address: WHYPE,
      chainId: 99901,
      symbol: 'WHYPE',
      decimals: '18',
    };
    const plan = encodeUniversalRouterPlan(
      {
        protocol: 'v3',
        inputToken: { ...whype, address: ZERO, symbol: 'HYPE' },
        outputToken: {
          address: ELYSIUM_USDC,
          chainId: 99901,
          symbol: 'USDC',
          decimals: '6',
        },
        amountIn: 10_000_000_000_000_000n,
        amountOut: 63_800n,
        pools: [
          {
            type: 'v3-pool',
            tokenIn: whype,
            tokenOut: {
              address: ELYSIUM_USDC,
              chainId: 99901,
              symbol: 'USDC',
              decimals: '6',
            },
            fee: '10000',
            sqrtRatioX96: '79228162514264337593543950336',
            liquidity: '1',
            tickCurrent: '0',
          },
        ],
      },
      { ...routedOptions(ZERO), universalRouterVersion: '2.2.0' },
    );

    expect(commandBytes(plan.commands)).toEqual([0x0b, 0x00, 0x0c]);
    expect(plan.inputs[1]).toHaveLength(2 + 320 * 2);
    expect(plan.value).toBe(10_000_000_000_000_000n);
  });

  it('returns an empty plan for a no-swap reserve path', () => {
    const plan = encodeUniversalRouterPlan(
      {
        protocol: 'none',
        inputToken: usdg,
        outputToken: usdg,
        amountIn: 1_000n,
        amountOut: 1_000n,
        pools: [],
      },
      options,
    );

    expect(plan).toEqual({
      commands: '0x',
      inputs: [],
      deadline: 2_000_000_000n,
      minimumAmountOut: 990n,
      value: 0n,
    });
  });

  it('forwards native value for a direct native-to-wrapped path', () => {
    const amount = 1_000_000_000_000_000_000n;
    const plan = encodeUniversalRouterPlan(
      {
        protocol: 'none',
        inputToken: eth,
        outputToken: weth,
        amountIn: amount,
        amountOut: amount,
        pools: [],
      },
      options,
    );

    expect(plan).toMatchObject({
      commands: '0x',
      inputs: [],
      value: amount,
    });
  });

  it('rejects Permit2 ingress and malicious payer or recipient fields', () => {
    expect(() => assertZapCompatiblePlan('0x02', ['0x'], ZAP, '2.0')).toThrow(
      'forbidden Permit2 ingress',
    );

    const payerIsUser = encodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,bytes,bool'),
      [ZAP, 1n, 1n, '0x', true],
    );
    expect(() =>
      assertZapCompatiblePlan('0x00', [payerIsUser], ZAP, '2.0'),
    ).toThrow('payerIsUser=true');

    const wrongRecipient = encodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,address[],bool'),
      [
        '0x2222222222222222222222222222222222222222',
        1n,
        1n,
        [WETH, USDG],
        false,
      ],
    );
    expect(() =>
      assertZapCompatiblePlan('0x08', [wrongRecipient], ZAP, '2.0'),
    ).toThrow('does not target ZapV2');

    expect(() => assertZapCompatiblePlan('0x05', ['0x'], ZAP, '2.0')).toThrow(
      'unsupported command 0x05',
    );

    const wrongWrapRecipient = encodeAbiParameters(
      parseAbiParameters('address,uint256'),
      [ACCOUNT, 1n],
    );
    expect(() =>
      assertZapCompatiblePlan('0x0b', [wrongWrapRecipient], ZAP, '2.0'),
    ).toThrow('WRAP_ETH does not target router custody');

    const maliciousSettle = encodeAbiParameters(
      parseAbiParameters('address,uint256,bool'),
      [WETH, 1n, true],
    );
    const v4Input = encodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      ['0x0b', [maliciousSettle]],
    );
    expect(() => assertZapCompatiblePlan('0x10', [v4Input], ZAP, '2.0')).toThrow(
      'V4 SETTLE payerIsUser=true',
    );

    const validSettle = encodeAbiParameters(
      parseAbiParameters('address,uint256,bool'),
      [WETH, 1n, false],
    );
    const validTake = encodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      [USDG, ZAP, 1n],
    );
    const missingV4Swap = encodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      ['0x0b0e', [validSettle, validTake]],
    );
    expect(() =>
      assertZapCompatiblePlan('0x10', [missingV4Swap], ZAP, '2.0'),
    ).toThrow('exactly one exact-input swap');

    const unknownV4Action = encodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      ['0x06', ['0x']],
    );
    expect(() =>
      assertZapCompatiblePlan('0x10', [unknownV4Action], ZAP, '2.0'),
    ).toThrow('unsupported action 0x06');

    const externalSweep = encodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      [WETH, ACCOUNT, 0n],
    );
    expect(() =>
      assertZapCompatiblePlan('0x04', [externalSweep], ZAP, '2.0'),
    ).toThrow('does not target the input refund recipient');
    expect(() =>
      assertZapCompatiblePlan('0x04', [externalSweep], ZAP, '2.0', {
        token: USDG,
        recipient: ACCOUNT,
      }),
    ).toThrow('does not target the input refund recipient');
    expect(() =>
      assertZapCompatiblePlan('0x04', [externalSweep], ZAP, '2.0', {
        token: WETH,
        recipient: ACCOUNT,
      }),
    ).not.toThrow();

    const zapSweep = encodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      [WETH, ZAP, 0n],
    );
    expect(() =>
      assertZapCompatiblePlan('0x04', [zapSweep], ZAP, '2.0'),
    ).toThrow('does not target the input refund recipient');
    expect(() =>
      assertZapCompatiblePlan('0x04', [zapSweep], ZAP, '2.0', {
        token: WETH,
        recipient: ACCOUNT,
      }),
    ).toThrow('does not target the input refund recipient');

    const nonzeroZapSweep = encodeAbiParameters(
      parseAbiParameters('address,address,uint256'),
      [WETH, ZAP, 1n],
    );
    expect(() =>
      assertZapCompatiblePlan('0x04', [nonzeroZapSweep], ZAP, '2.0', {
        token: WETH,
        recipient: ZAP,
      }),
    ).toThrow('Input refund recipient must be the user account');
  });

  it('validates slippage and deadline and floors integer output', () => {
    expect(calculateMinimumAmountOut(1_000n, 100)).toBe(990n);
    expect(calculateMinimumAmountOut(1n, 1)).toBe(0n);
    expect(() => calculateMinimumAmountOut(1n, -1)).toThrow(
      'Slippage must be an integer from 0 to 10000 bps',
    );
    expect(() =>
      encodeUniversalRouterPlan(route('none', []), {
        ...options,
        deadline: 0n,
      }),
    ).toThrow('Deadline must be a positive safe integer');
  });
});
