import { type Address, type PublicClient } from 'viem';
import { WETH as WETH_ADDR, tokenDecimals } from '../config/contracts';
import { findBestRoute } from './router';
import { parsePath, encodeV3Path } from './swap';
import { getSymbol } from './symbol';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export interface ZapTokenInfo {
  isETH: boolean;
  actualToken: Address;
  symbol: string;
  decimals: number;
}

export interface ZapPath {
  path: `0x${string}`;
  tokens: `0x${string}`[];
  fees: number[];
  description?: string;
  amountOut?: bigint;
}

/**
 * Parse token info for zap operations (handles ETH vs ERC20)
 */
export async function parseZapToken(
  client: PublicClient,
  token: Address,
  isInput: boolean = true,
): Promise<ZapTokenInfo> {
  const isETH = token.toLowerCase() === ZERO_ADDR.toLowerCase();
  const actualToken = isETH ? ZERO_ADDR : token;
  const decimals = isETH ? 18 : tokenDecimals(token);
  const symbol = isETH ? 'ETH' : await getSymbol(client, token);

  return {
    isETH,
    actualToken,
    symbol,
    decimals,
  };
}

/**
 * Resolve swap path for zap operations (manual path or auto-route)
 */
export async function resolveZapPath(
  client: PublicClient,
  fromToken: Address,
  toToken: Address,
  amount: bigint,
  pathStr?: string,
): Promise<ZapPath> {
  if (pathStr) {
    const parsed = parsePath(pathStr);
    return {
      path: encodeV3Path(parsed.tokens, parsed.fees),
      tokens: parsed.tokens,
      fees: parsed.fees,
    };
  }

  // Auto-route using router
  const swapFrom = fromToken.toLowerCase() === ZERO_ADDR.toLowerCase() ? WETH_ADDR : fromToken;
  const swapTo = toToken.toLowerCase() === ZERO_ADDR.toLowerCase() ? WETH_ADDR : toToken;
  
  const route = await findBestRoute(client, swapFrom, swapTo, amount);
  if (!route) {
    throw new Error('No swap route found. Try providing --path manually.');
  }

  return {
    path: route.path,
    tokens: route.tokens,
    fees: route.fees,
    description: route.description,
    amountOut: route.amountOut,
  };
}

/**
 * Generate deadline for zap transactions (20 minutes from now)
 */
export function getZapDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 1200);
}