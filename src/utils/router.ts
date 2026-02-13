import { type Address, type PublicClient, getAddress } from 'viem';
import { encodeV3Path } from './swap';
import { type PoolKey } from './v4swap';
import { WETH, INTERMEDIARIES, TOKENS } from '../config/contracts';

const QUOTER_V2: Address = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const V4_QUOTER: Address = '0x0d5e0f971ed27fbff6c2837bf31316121532048d';

const QUOTER_V2_ABI = [{
  type: 'function', name: 'quoteExactInput', stateMutability: 'nonpayable',
  inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96AfterList', type: 'uint160[]' }, { name: 'initializedTicksCrossedList', type: 'uint32[]' }, { name: 'gasEstimate', type: 'uint256' }],
}] as const;

const V4_QUOTER_ABI = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{
    name: 'params', type: 'tuple', components: [
      { name: 'poolKey', type: 'tuple', components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' },
      ]},
      { name: 'zeroForOne', type: 'bool' },
      { name: 'exactAmount', type: 'uint128' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
      { name: 'hookData', type: 'bytes' },
    ],
  }],
  outputs: [{ name: 'deltaAmounts', type: 'int128[]' }, { name: 'sqrtPriceX96After', type: 'uint160' }, { name: 'initializedTicksCrossed', type: 'uint32' }],
}] as const;

const V3_FEE_TIERS = [100, 500, 3000, 10000];
const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** Known V4 pool keys on Base */
const V4_POOLS: PoolKey[] = [
  {
    currency0: ZERO, // native ETH
    currency1: getAddress('0x37f0c2915CeCC7e977183B8543Fc0864d03E064C'), // HUNT
    fee: 49,
    tickSpacing: 1,
    hooks: ZERO,
  },
];

export type RouteVersion = 'v3' | 'v4';

export interface Route {
  version: RouteVersion;
  // V3 fields
  path: `0x${string}`;
  tokens: `0x${string}`[];
  fees: number[];
  // V4 fields
  poolKey?: PoolKey;
  zeroForOne?: boolean;
  // Common
  amountOut: bigint;
  description: string;
}

async function tryV3Quote(client: PublicClient, path: `0x${string}`, amountIn: bigint): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      address: QUOTER_V2, abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', args: [path, amountIn],
    });
    return result[0];
  } catch { return null; }
}

async function tryV4Quote(
  client: PublicClient, poolKey: PoolKey, zeroForOne: boolean, amountIn: bigint,
): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      address: V4_QUOTER,
      abi: V4_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne,
        exactAmount: amountIn,
        sqrtPriceLimitX96: 0n,
        hookData: '0x',
      }],
    });
    // deltaAmounts: [delta0, delta1] — the positive one is the output
    const deltas = result[0];
    const outIdx = zeroForOne ? 1 : 0;
    const outAmount = deltas[outIdx];
    return outAmount > 0n ? outAmount : -outAmount;
  } catch { return null; }
}

/**
 * Resolve a token to its V4 currency (ETH = address(0), WETH maps to address(0) for V4 native pools)
 */
function toV4Currency(token: Address): Address {
  if (token.toLowerCase() === WETH.toLowerCase() || token.toLowerCase() === ZERO.toLowerCase()) {
    return ZERO;
  }
  return token;
}

export async function findBestRoute(
  client: PublicClient, inputToken: Address, outputToken: Address, amountIn: bigint,
): Promise<Route | null> {
  const actualInput = inputToken.toLowerCase() === ZERO ? WETH : inputToken;
  const v4Input = toV4Currency(inputToken);
  const v4Output = toV4Currency(outputToken);
  
  if (actualInput.toLowerCase() === outputToken.toLowerCase()) return null;

  const candidates: Route[] = [];
  console.log('🔍 Finding best swap route (V3 + V4)...');

  // === V3 routes ===
  const v3Output = outputToken.toLowerCase() === ZERO ? WETH : outputToken;
  if (actualInput.toLowerCase() !== v3Output.toLowerCase()) {
    const directPromises = V3_FEE_TIERS.map(async (fee) => {
      const path = encodeV3Path([actualInput, v3Output], [fee]);
      const out = await tryV3Quote(client, path, amountIn);
      if (out && out > 0n) candidates.push({
        version: 'v3', path, tokens: [actualInput, v3Output], fees: [fee],
        amountOut: out, description: `V3 Direct (fee: ${fee / 10000}%)`,
      });
    });

    const hopPromises = INTERMEDIARIES.flatMap((mid) => {
      if (mid.address.toLowerCase() === actualInput.toLowerCase() || mid.address.toLowerCase() === v3Output.toLowerCase()) return [];
      return V3_FEE_TIERS.flatMap((fee1) => V3_FEE_TIERS.map(async (fee2) => {
        const path = encodeV3Path([actualInput, mid.address as `0x${string}`, v3Output], [fee1, fee2]);
        const out = await tryV3Quote(client, path, amountIn);
        if (out && out > 0n) candidates.push({
          version: 'v3', path, tokens: [actualInput, mid.address as `0x${string}`, v3Output], fees: [fee1, fee2],
          amountOut: out, description: `V3 via ${mid.symbol} (fees: ${fee1 / 10000}% → ${fee2 / 10000}%)`,
        });
      }));
    });

    await Promise.all([...directPromises, ...hopPromises]);
  }

  // === V4 routes ===
  const v4Promises = V4_POOLS.map(async (poolKey) => {
    const c0 = poolKey.currency0.toLowerCase();
    const c1 = poolKey.currency1.toLowerCase();
    const inp = v4Input.toLowerCase();
    const outp = v4Output.toLowerCase();

    let zeroForOne: boolean | null = null;
    if (inp === c0 && outp === c1) zeroForOne = true;
    else if (inp === c1 && outp === c0) zeroForOne = false;
    if (zeroForOne === null) return;

    const out = await tryV4Quote(client, poolKey, zeroForOne, amountIn);
    if (out && out > 0n) {
      const feeStr = poolKey.fee < 100 ? `${poolKey.fee}bp` : `${poolKey.fee / 10000}%`;
      candidates.push({
        version: 'v4', path: '0x' as `0x${string}`, tokens: [], fees: [],
        poolKey, zeroForOne, amountOut: out,
        description: `V4 Direct (fee: ${feeStr})`,
      });
    }
  });

  await Promise.all(v4Promises);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = candidates[0];
  console.log(`   ✅ Best route: ${best.description} → ${candidates.length} routes checked`);
  return best;
}
