import { type Address } from 'viem';
import { getPublicClient } from '../client';
import { SPOT_PRICE_AGGREGATOR, TOKENS, WETH } from '../config/contracts';

const USDC = TOKENS.find(t => t.symbol === 'USDC')!.address;

const SPOT_ABI = [{
  type: 'function', name: 'getRate', stateMutability: 'view',
  inputs: [
    { name: 'srcToken', type: 'address' },
    { name: 'dstToken', type: 'address' },
    { name: 'useWrappers', type: 'bool' },
  ],
  outputs: [{ name: 'weightedRate', type: 'uint256' }],
}] as const;

/** Get token price in USD via 1inch spot price aggregator. Returns price or null on failure. */
export async function getUsdPrice(token: Address): Promise<number | null> {
  const pub = getPublicClient();

  // ETH / WETH → get WETH price
  const src = token === '0x0000000000000000000000000000000000000000' ? WETH : token;

  // If it's USDC itself, price is 1
  if (src.toLowerCase() === USDC.toLowerCase()) return 1;

  try {
    const rate = await pub.readContract({
      address: SPOT_PRICE_AGGREGATOR,
      abi: SPOT_ABI,
      functionName: 'getRate',
      args: [src, USDC, false],
    });
    // rate is in USDC units (6 decimals) per 1 full unit of srcToken (18 decimals)
    return Number(rate) / 1e6;
  } catch {
    return null;
  }
}
