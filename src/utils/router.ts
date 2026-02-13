import { type Address, type PublicClient } from 'viem';
import { encodeV3Path } from './swap';
import { WETH, INTERMEDIARIES } from '../config/contracts';

const QUOTER_V2: Address = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';

const QUOTER_V2_ABI = [{
  type: 'function', name: 'quoteExactInput', stateMutability: 'nonpayable',
  inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96AfterList', type: 'uint160[]' }, { name: 'initializedTicksCrossedList', type: 'uint32[]' }, { name: 'gasEstimate', type: 'uint256' }],
}] as const;

const FEE_TIERS = [100, 500, 3000, 10000];
const ZERO = '0x0000000000000000000000000000000000000000';

export interface Route {
  path: `0x${string}`;
  tokens: `0x${string}`[];
  fees: number[];
  amountOut: bigint;
  description: string;
}

async function tryQuote(client: PublicClient, path: `0x${string}`, amountIn: bigint): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      address: QUOTER_V2, abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', args: [path, amountIn],
    });
    return result[0];
  } catch { return null; }
}

export async function findBestRoute(
  client: PublicClient, inputToken: Address, outputToken: Address, amountIn: bigint,
): Promise<Route | null> {
  const actualInput = inputToken.toLowerCase() === ZERO ? WETH : inputToken;
  if (actualInput.toLowerCase() === outputToken.toLowerCase()) return null;

  const candidates: Route[] = [];
  console.log('🔍 Finding best swap route...');

  const directPromises = FEE_TIERS.map(async (fee) => {
    const path = encodeV3Path([actualInput, outputToken], [fee]);
    const out = await tryQuote(client, path, amountIn);
    if (out && out > 0n) candidates.push({ path, tokens: [actualInput, outputToken], fees: [fee], amountOut: out, description: `Direct (fee: ${fee / 10000}%)` });
  });

  const hopPromises = INTERMEDIARIES.flatMap((mid) => {
    if (mid.address.toLowerCase() === actualInput.toLowerCase() || mid.address.toLowerCase() === outputToken.toLowerCase()) return [];
    return FEE_TIERS.flatMap((fee1) => FEE_TIERS.map(async (fee2) => {
      const path = encodeV3Path([actualInput, mid.address as `0x${string}`, outputToken], [fee1, fee2]);
      const out = await tryQuote(client, path, amountIn);
      if (out && out > 0n) candidates.push({ path, tokens: [actualInput, mid.address as `0x${string}`, outputToken], fees: [fee1, fee2], amountOut: out, description: `via ${mid.symbol} (fees: ${fee1 / 10000}% → ${fee2 / 10000}%)` });
    }));
  });

  await Promise.all([...directPromises, ...hopPromises]);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = candidates[0];
  console.log(`   ✅ Best route: ${best.description} → ${candidates.length} routes checked`);
  return best;
}
