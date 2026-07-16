import { describe, expect, it } from 'vitest';
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
} from '../src/utils/uniswap/encode';
import type {
  QuotedRoute,
  RoutingToken,
} from '../src/utils/uniswap/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ZAP = '0x1111111111111111111111111111111111111111' as Address;
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
  slippageBps: 100,
  deadline: 2_000_000_000n,
};

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
      options,
    );

    expect(commandBytes(plan.commands)).toEqual([0x08]);
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
      options,
    );

    expect(commandBytes(plan.commands)).toEqual([0x00]);
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
      options,
    );

    expect(commandBytes(plan.commands)).toEqual([0x00, 0x0c]);
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
      options,
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
    expect(recipient).toBe(ZAP.toLowerCase());
    expect(amountMinimum).toBe(0n);
    expect(plan.value).toBe(1_000_000_000_000_000_000n);
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

  it('rejects Permit2 ingress and malicious payer or recipient fields', () => {
    expect(() => assertZapCompatiblePlan('0x02', ['0x'], ZAP)).toThrow(
      'forbidden Permit2 ingress',
    );

    const payerIsUser = encodeAbiParameters(
      parseAbiParameters('address,uint256,uint256,bytes,bool'),
      [ZAP, 1n, 1n, '0x', true],
    );
    expect(() =>
      assertZapCompatiblePlan('0x00', [payerIsUser], ZAP),
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
      assertZapCompatiblePlan('0x08', [wrongRecipient], ZAP),
    ).toThrow('does not target ZapV2');

    const maliciousSettle = encodeAbiParameters(
      parseAbiParameters('address,uint256,bool'),
      [WETH, 1n, true],
    );
    const v4Input = encodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      ['0x0b', [maliciousSettle]],
    );
    expect(() => assertZapCompatiblePlan('0x10', [v4Input], ZAP)).toThrow(
      'V4 SETTLE payerIsUser=true',
    );
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
