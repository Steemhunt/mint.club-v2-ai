import { type Address, encodeAbiParameters, parseAbiParameters, concat, toHex } from 'viem';

/**
 * V4 Actions (from Uniswap v4-periphery Actions.sol)
 */
export const V4_ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
} as const;

/** UniversalRouter command for V4_SWAP */
export const V4_SWAP_COMMAND = 0x10;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

const POOL_KEY_ABI = '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)';

/**
 * Encode V4_SWAP input for UniversalRouter.
 * Format: abi.encode(bytes actions, bytes[] params)
 *
 * For exactInputSingle:
 *   actions = [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]
 *   params[0] = ExactInputSingleParams
 *   params[1] = SETTLE_ALL(inputCurrency, maxAmount)
 *   params[2] = TAKE_ALL(outputCurrency, minAmount)
 */
export function encodeV4SwapExactInSingle(
  poolKey: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
  amountOutMinimum: bigint,
): `0x${string}` {
  // Determine input/output currencies
  const inputCurrency = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const outputCurrency = zeroForOne ? poolKey.currency1 : poolKey.currency0;

  // Actions bytes
  const actions = toHex(new Uint8Array([
    V4_ACTIONS.SWAP_EXACT_IN_SINGLE,
    V4_ACTIONS.SETTLE_ALL,
    V4_ACTIONS.TAKE_ALL,
  ]));

  // Param 0: ExactInputSingleParams
  // struct ExactInputSingleParams { PoolKey poolKey; bool zeroForOne; uint128 amountIn; uint128 amountOutMinimum; bytes hookData; }
  const swapParams = encodeAbiParameters(
    parseAbiParameters(`${POOL_KEY_ABI} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData`),
    [
      {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      zeroForOne,
      amountIn,
      amountOutMinimum,
      '0x', // hookData
    ] as any,
  );

  // Param 1: SETTLE_ALL(currency, maxAmount)
  const settleParams = encodeAbiParameters(
    parseAbiParameters('address currency, uint256 maxAmount'),
    [inputCurrency, amountIn + (amountIn / 100n)], // 1% buffer for maxAmount
  );

  // Param 2: TAKE_ALL(currency, minAmount)
  const takeParams = encodeAbiParameters(
    parseAbiParameters('address currency, uint256 minAmount'),
    [outputCurrency, amountOutMinimum],
  );

  // Outer encoding: abi.encode(bytes actions, bytes[] params)
  return encodeAbiParameters(
    parseAbiParameters('bytes actions, bytes[] params'),
    [actions, [swapParams, settleParams, takeParams]],
  );
}
