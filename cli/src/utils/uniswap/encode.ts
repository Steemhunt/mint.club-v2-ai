import { Percent, TradeType } from '@uniswap/sdk-core';
import {
  PoolType,
  RouterTradeAdapter,
  SwapRouter,
  UniversalRouterVersion,
  type PartialClassicQuote,
  type V2PoolInRoute,
  type V3PoolInRoute,
  type V4PoolInRoute,
} from '@uniswap/universal-router-sdk';
import {
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { ZERO_ADDRESS } from '../../config/chains';
import type { ClassicPool, QuotedRoute } from './types';

const PERMIT2_INGRESS_COMMANDS = new Set([0x02, 0x03, 0x0a, 0x0d]);

export interface UniversalRouterPlan {
  commands: Hex;
  inputs: Hex[];
  deadline: bigint;
  minimumAmountOut: bigint;
  value: bigint;
}

export interface UniversalRouterPlanOptions {
  recipient: Address;
  slippageBps: number;
  deadline: bigint;
  inputRefund?: {
    token: Address;
    recipient: Address;
  };
}

function validateDeadline(deadline: bigint): void {
  if (deadline <= 0n || deadline > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Deadline must be a positive safe integer');
  }
}

export function calculateMinimumAmountOut(
  amountOut: bigint,
  slippageBps: number,
): bigint {
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    throw new Error('Slippage must be an integer from 0 to 10000 bps');
  }
  if (amountOut < 0n) throw new Error('Output amount cannot be negative');
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

function sdkPoolType(pool: ClassicPool): PoolType {
  if (pool.type === 'v2-pool') return PoolType.V2Pool;
  if (pool.type === 'v3-pool') return PoolType.V3Pool;
  return PoolType.V4Pool;
}

function toSdkPools(route: QuotedRoute): PartialClassicQuote['route'][number] {
  return route.pools.map((pool, index) => {
    const amounts = {
      ...(index === 0 ? { amountIn: route.amountIn.toString() } : {}),
      ...(index === route.pools.length - 1
        ? { amountOut: route.amountOut.toString() }
        : {}),
    };
    const converted = {
      ...pool,
      type: sdkPoolType(pool),
      ...amounts,
    };
    if (pool.type === 'v2-pool') return converted as V2PoolInRoute;
    if (pool.type === 'v3-pool') return converted as V3PoolInRoute;
    return converted as V4PoolInRoute;
  });
}

const UNIVERSAL_ROUTER_SELF = '0x0000000000000000000000000000000000000002';
const V2_SWAP_EXACT_IN_PARAMS = parseAbiParameters(
  'address,uint256,uint256,address[],bool',
);
const V3_SWAP_EXACT_IN_PARAMS = parseAbiParameters(
  'address,uint256,uint256,bytes,bool',
);
const SWEEP_PARAMS = parseAbiParameters('address,address,uint256');
const WRAP_ETH_PARAMS = parseAbiParameters('address,uint256');
const UNWRAP_WETH_PARAMS = parseAbiParameters('address,uint256');
const V4_COMMAND_PARAMS = parseAbiParameters('bytes,bytes[]');
const V4_SETTLE_PARAMS = parseAbiParameters('address,uint256,bool');
const V4_TAKE_PARAMS = parseAbiParameters('address,address,uint256');

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertSwapRecipient(recipient: Address, zapV2: Address): boolean {
  if (sameAddress(recipient, zapV2)) return false;
  if (sameAddress(recipient, UNIVERSAL_ROUTER_SELF)) return true;
  throw new Error(`Universal Router swap does not target ZapV2: ${recipient}`);
}

function assertV4Plan(
  input: Hex,
  zapV2: Address,
): { usesRouterCustody: boolean } {
  const [actions, params] = decodeAbiParameters(V4_COMMAND_PARAMS, input);
  const actionBytes = actions.slice(2).match(/.{2}/g) ?? [];
  if (actionBytes.length !== params.length) {
    throw new Error('V4 action/parameter length mismatch');
  }

  let settlements = 0;
  let takes = 0;
  let usesRouterCustody = false;
  let exactInputSwaps = 0;
  for (let index = 0; index < actionBytes.length; index += 1) {
    const action = Number.parseInt(actionBytes[index], 16);
    if (action === 0x07) {
      exactInputSwaps += 1;
    } else if (action === 0x0b) {
      const [, , payerIsUser] = decodeAbiParameters(
        V4_SETTLE_PARAMS,
        params[index],
      );
      if (payerIsUser) throw new Error('V4 SETTLE payerIsUser=true');
      settlements += 1;
    } else if (action === 0x0c) {
      throw new Error('V4 SETTLE_ALL does not encode payerIsUser=false');
    } else if (action === 0x0e) {
      const [, recipient] = decodeAbiParameters(V4_TAKE_PARAMS, params[index]);
      usesRouterCustody = assertSwapRecipient(recipient, zapV2);
      takes += 1;
    } else {
      throw new Error(
        `V4 plan contains unsupported action 0x${action.toString(16).padStart(2, '0')}`,
      );
    }
  }

  if (exactInputSwaps !== 1 || settlements !== 1 || takes !== 1) {
    throw new Error(
      'V4 plan must contain exactly one exact-input swap, SETTLE, and TAKE',
    );
  }
  return { usesRouterCustody };
}

export function assertZapCompatiblePlan(
  commands: Hex,
  inputs: readonly Hex[],
  zapV2: Address,
  inputRefund?: UniversalRouterPlanOptions['inputRefund'],
): void {
  const commandBytes = commands.slice(2).match(/.{2}/g) ?? [];
  if (commandBytes.length !== inputs.length) {
    throw new Error('Universal Router command/input length mismatch');
  }
  if (
    inputRefund &&
    (sameAddress(inputRefund.recipient, zapV2) ||
      sameAddress(inputRefund.recipient, ZERO_ADDRESS))
  ) {
    throw new Error('Input refund recipient must be the user account');
  }

  let usesRouterCustody = false;
  let unwrapsToZap = false;
  let returnsInputRefund = false;
  for (let index = 0; index < commandBytes.length; index += 1) {
    const command = Number.parseInt(commandBytes[index], 16) & 0x3f;
    if (PERMIT2_INGRESS_COMMANDS.has(command)) {
      throw new Error(
        `Universal Router plan contains forbidden Permit2 ingress command 0x${command.toString(16).padStart(2, '0')}`,
      );
    }

    if (![0x00, 0x04, 0x08, 0x0b, 0x0c, 0x10].includes(command)) {
      throw new Error(
        `Universal Router plan contains unsupported command 0x${command.toString(16).padStart(2, '0')}`,
      );
    }

    if (command === 0x00 || command === 0x08) {
      const [recipient, , , , payerIsUser] = decodeAbiParameters(
        command === 0x00 ? V3_SWAP_EXACT_IN_PARAMS : V2_SWAP_EXACT_IN_PARAMS,
        inputs[index],
      );
      if (payerIsUser) {
        throw new Error(
          `Universal Router command 0x${command.toString(16).padStart(2, '0')} has payerIsUser=true`,
        );
      }
      usesRouterCustody =
        assertSwapRecipient(recipient, zapV2) || usesRouterCustody;
    } else if (command === 0x04) {
      const [token, recipient, amountMinimum] = decodeAbiParameters(
        SWEEP_PARAMS,
        inputs[index],
      );
      const matchesInputRefund =
        inputRefund &&
        sameAddress(token, inputRefund.token) &&
        sameAddress(recipient, inputRefund.recipient) &&
        amountMinimum === 0n;
      if (!matchesInputRefund) {
        throw new Error(
          `Universal Router SWEEP does not target the input refund recipient: ${recipient}`,
        );
      }
      returnsInputRefund = true;
    } else if (command === 0x0b) {
      const [recipient] = decodeAbiParameters(WRAP_ETH_PARAMS, inputs[index]);
      if (!sameAddress(recipient, UNIVERSAL_ROUTER_SELF)) {
        throw new Error(
          `Universal Router WRAP_ETH does not target router custody: ${recipient}`,
        );
      }
    } else if (command === 0x0c) {
      const [recipient, amountMinimum] = decodeAbiParameters(
        UNWRAP_WETH_PARAMS,
        inputs[index],
      );
      if (sameAddress(recipient, zapV2)) {
        unwrapsToZap = true;
      } else if (
        inputRefund &&
        sameAddress(inputRefund.token, ZERO_ADDRESS) &&
        sameAddress(recipient, inputRefund.recipient) &&
        amountMinimum === 0n
      ) {
        returnsInputRefund = true;
      } else {
        throw new Error(
          `Universal Router UNWRAP_WETH has an invalid recipient: ${recipient}`,
        );
      }
    } else if (command === 0x10) {
      const result = assertV4Plan(inputs[index], zapV2);
      usesRouterCustody = result.usesRouterCustody || usesRouterCustody;
    }
  }

  if (usesRouterCustody && !unwrapsToZap) {
    throw new Error('Universal Router custody output is not unwrapped to ZapV2');
  }
  if (unwrapsToZap && !usesRouterCustody) {
    throw new Error('Universal Router unexpectedly unwraps input to ZapV2');
  }
  if (inputRefund && !returnsInputRefund) {
    throw new Error('Universal Router plan is missing input refund settlement');
  }
}

export function encodeUniversalRouterPlan(
  route: QuotedRoute,
  options: UniversalRouterPlanOptions,
): UniversalRouterPlan {
  validateDeadline(options.deadline);
  const minimumAmountOut = calculateMinimumAmountOut(
    route.amountOut,
    options.slippageBps,
  );

  if (route.protocol === 'none') {
    if (route.pools.length !== 0 || route.amountIn !== route.amountOut) {
      throw new Error('Invalid no-swap route');
    }
    if (options.inputRefund) {
      throw new Error('Input refund SWEEP requires a routed swap');
    }
    return {
      commands: '0x',
      inputs: [],
      deadline: options.deadline,
      minimumAmountOut,
      value: sameAddress(route.inputToken.address, ZERO_ADDRESS)
        ? route.amountIn
        : 0n,
    };
  }
  if (route.pools.length === 0) throw new Error('Swap route has no pools');
  if (!options.inputRefund) {
    throw new Error('Routed swaps require an input refund recipient');
  }
  if (!sameAddress(options.inputRefund.token, route.inputToken.address)) {
    throw new Error('Input refund token does not match the routed input');
  }

  const quote: PartialClassicQuote = {
    tokenIn: route.inputToken.address,
    tokenOut: route.outputToken.address,
    tradeType: TradeType.EXACT_INPUT,
    route: [toSdkPools(route)],
  };
  const trade = RouterTradeAdapter.fromClassicQuote(quote);
  const encoded = SwapRouter.swapCallParameters(trade, {
    slippageTolerance: new Percent(options.slippageBps, 10_000),
    recipient: options.recipient,
    useRouterBalance: true,
    deadlineOrPreviousBlockhash: options.deadline.toString(),
    urVersion: UniversalRouterVersion.V2_0,
  });
  const decoded = SwapRouter.INTERFACE.decodeFunctionData(
    'execute(bytes,bytes[],uint256)',
    encoded.calldata,
  );
  let commands = decoded.commands as Hex;
  const inputs = Array.from(decoded.inputs as readonly string[]) as Hex[];
  const commandBytes = commands.slice(2).match(/.{2}/g) ?? [];
  let returnsInputRefund = false;

  for (let index = 0; index < commandBytes.length; index += 1) {
    const command = Number.parseInt(commandBytes[index], 16) & 0x3f;
    if (command === 0x04) {
      const [token, recipient, amountMinimum] = decodeAbiParameters(
        SWEEP_PARAMS,
        inputs[index],
      );
      if (
        sameAddress(token, options.inputRefund.token) &&
        sameAddress(recipient, options.recipient) &&
        amountMinimum === 0n
      ) {
        inputs[index] = encodeAbiParameters(SWEEP_PARAMS, [
          token,
          options.inputRefund.recipient,
          0n,
        ]);
        returnsInputRefund = true;
      }
    } else if (
      command === 0x0c &&
      sameAddress(options.inputRefund.token, ZERO_ADDRESS)
    ) {
      const [recipient, amountMinimum] = decodeAbiParameters(
        UNWRAP_WETH_PARAMS,
        inputs[index],
      );
      if (sameAddress(recipient, options.recipient) && amountMinimum === 0n) {
        inputs[index] = encodeAbiParameters(UNWRAP_WETH_PARAMS, [
          options.inputRefund.recipient,
          0n,
        ]);
        returnsInputRefund = true;
      }
    }
  }

  if (!returnsInputRefund) {
    if (
      sameAddress(options.inputRefund.token, ZERO_ADDRESS) &&
      route.protocol !== 'v4'
    ) {
      commands = `${commands}0c` as Hex;
      inputs.push(
        encodeAbiParameters(UNWRAP_WETH_PARAMS, [
          options.inputRefund.recipient,
          0n,
        ]),
      );
    } else {
      commands = `${commands}04` as Hex;
      inputs.push(
        encodeAbiParameters(SWEEP_PARAMS, [
          options.inputRefund.token,
          options.inputRefund.recipient,
          0n,
        ]),
      );
    }
  }
  assertZapCompatiblePlan(
    commands,
    inputs,
    options.recipient,
    options.inputRefund,
  );

  return {
    commands,
    inputs,
    deadline: options.deadline,
    minimumAmountOut,
    value: BigInt(encoded.value),
  };
}
