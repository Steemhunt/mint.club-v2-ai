import { encodeAbiParameters, parseAbiParameters, type Address } from 'viem';

/** Command byte for V4_SWAP in UniversalRouter */
export const V4_SWAP_COMMAND: `0x${string}` = '0x10';

// V4 action IDs
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE = 0x0b;
const TAKE_ALL = 0x0f;

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/**
 * Sort two token addresses for V4 PoolKey (currency0 < currency1).
 * address(0) represents native ETH and is always lower.
 */
export function sortTokens(tokenA: Address, tokenB: Address): [Address, Address] {
  const a = tokenA.toLowerCase();
  const b = tokenB.toLowerCase();
  if (a === ZERO_ADDR.toLowerCase()) return [ZERO_ADDR, tokenB];
  if (b === ZERO_ADDR.toLowerCase()) return [ZERO_ADDR, tokenA];
  return BigInt(a) < BigInt(b) ? [tokenA, tokenB] : [tokenB, tokenA];
}

/**
 * Encode the V4_SWAP command input for a single-hop exact-in swap.
 * Actions: SWAP_EXACT_IN_SINGLE → SETTLE(payerIsUser=false) → TAKE_ALL(recipient)
 */
export function encodeV4SwapInput(
  poolKey: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
  amountOutMin: bigint,
  recipient: Address,
): `0x${string}` {
  // Pack action bytes
  const actions = `0x${SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, '0')}${SETTLE.toString(16).padStart(2, '0')}${TAKE_ALL.toString(16).padStart(2, '0')}` as `0x${string}`;

  // Param 1: SWAP_EXACT_IN_SINGLE — ExactInputSingleParams as raw struct
  const swapParams = encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address, bool, uint128, uint128, bytes'),
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      zeroForOne,
      amountIn,
      amountOutMin,
      '0x', // hookData
    ],
  );

  // Param 2: SETTLE — settle from router balance (payerIsUser = false)
  const settleToken = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const settleParams = encodeAbiParameters(
    parseAbiParameters('address, uint256, bool'),
    [settleToken, amountIn, false],
  );

  // Param 3: TAKE_ALL — take output to recipient
  const takeToken = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const takeParams = encodeAbiParameters(
    parseAbiParameters('address, address'),
    [takeToken, recipient],
  );

  // Encode the full V4_SWAP input: abi.encode(bytes actions, bytes[] params)
  const encoded = encodeAbiParameters(
    parseAbiParameters('bytes, bytes[]'),
    [actions, [swapParams, settleParams, takeParams]],
  );

  return encoded;
}
