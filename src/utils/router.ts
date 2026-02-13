import { type Address, type PublicClient, encodePacked } from 'viem';
import { encodeV3Path } from './swap';

const QUOTER_V2_ABI = [
  {
    type: 'function', name: 'quoteExactInput', stateMutability: 'nonpayable',
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
      { name: 'initializedTicksCrossedList', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

// Chain-specific config for route finding
const ROUTE_CONFIG: Record<string, {
  quoterV2: Address;
  weth: Address;
  intermediaries: { address: Address; symbol: string }[];
}> = {
  base: {
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    weth: '0x4200000000000000000000000000000000000006',
    intermediaries: [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
      { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca', symbol: 'USDbC' },
    ],
  },
  mainnet: {
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    intermediaries: [
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
    ],
  },
  arbitrum: {
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    intermediaries: [
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
      { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC' },
      { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT' },
    ],
  },
  optimism: {
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0x4200000000000000000000000000000000000006',
    intermediaries: [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
      { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC' },
      { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT' },
    ],
  },
};

const FEE_TIERS = [100, 500, 3000, 10000];
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export interface Route {
  path: `0x${string}`;
  tokens: `0x${string}`[];
  fees: number[];
  amountOut: bigint;
  description: string;
}

/**
 * Try quoting a path via QuoterV2. Returns amountOut or null if it fails.
 */
async function tryQuote(
  client: PublicClient,
  quoter: Address,
  path: `0x${string}`,
  amountIn: bigint,
): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      address: quoter,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInput',
      args: [path, amountIn],
    });
    return result[0];
  } catch {
    return null;
  }
}

/**
 * Find the best swap route from inputToken to outputToken.
 * Tries direct pairs across all fee tiers, then 1-hop through intermediaries.
 */
export async function findBestRoute(
  client: PublicClient,
  chain: string,
  inputToken: Address,
  outputToken: Address,
  amountIn: bigint,
): Promise<Route | null> {
  const config = ROUTE_CONFIG[chain];
  if (!config) return null;

  // If input is ETH (0x0), use WETH for routing
  const actualInput = inputToken.toLowerCase() === ZERO_ADDR ? config.weth : inputToken;

  // Skip if same token
  if (actualInput.toLowerCase() === outputToken.toLowerCase()) return null;

  const candidates: Route[] = [];

  // 1. Try direct: inputToken → outputToken (all fee tiers)
  console.log('🔍 Finding best swap route...');
  const directPromises = FEE_TIERS.map(async (fee) => {
    const path = encodeV3Path([actualInput, outputToken], [fee]);
    const out = await tryQuote(client, config.quoterV2, path, amountIn);
    if (out && out > 0n) {
      candidates.push({
        path, tokens: [actualInput, outputToken], fees: [fee], amountOut: out,
        description: `Direct (fee: ${fee / 10000}%)`,
      });
    }
  });

  // 2. Try 1-hop: inputToken → intermediary → outputToken (all fee tier combos)
  const hopPromises = config.intermediaries.flatMap((mid) => {
    // Skip if intermediary is input or output
    if (mid.address.toLowerCase() === actualInput.toLowerCase()) return [];
    if (mid.address.toLowerCase() === outputToken.toLowerCase()) return [];

    return FEE_TIERS.flatMap((fee1) =>
      FEE_TIERS.map(async (fee2) => {
        const path = encodeV3Path([actualInput, mid.address as `0x${string}`, outputToken], [fee1, fee2]);
        const out = await tryQuote(client, config.quoterV2, path, amountIn);
        if (out && out > 0n) {
          candidates.push({
            path, tokens: [actualInput, mid.address as `0x${string}`, outputToken],
            fees: [fee1, fee2], amountOut: out,
            description: `via ${mid.symbol} (fees: ${fee1 / 10000}% → ${fee2 / 10000}%)`,
          });
        }
      }),
    );
  });

  await Promise.all([...directPromises, ...hopPromises]);

  if (candidates.length === 0) return null;

  // Sort by best output
  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = candidates[0];
  console.log(`   ✅ Best route: ${best.description} → ${candidates.length} routes checked`);

  return best;
}

export function isRouteSupported(chain: string): boolean {
  return chain in ROUTE_CONFIG;
}
