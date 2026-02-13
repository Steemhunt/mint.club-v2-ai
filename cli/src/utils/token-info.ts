import { type Address, type PublicClient, formatUnits } from 'viem';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { ERC20_ABI } from '../abi/erc20';
import { getBondInfo, getTokenPrice } from './bond';
import { getUsdPrice } from './price';
import { getSymbol } from './symbol';

export interface TokenDetails {
  name: string;
  symbol: string;
  address: Address;
  totalSupply: bigint;
  maxSupply: bigint;
  bondInfo: Awaited<ReturnType<typeof getBondInfo>>;
  currentPrice?: bigint;
  steps?: readonly any[];
}

export interface TokenPricing {
  tokenPrice: bigint;
  tokenUsd?: number;
  reserveUsd?: number;
  reserveValue?: number;
  marketCap?: number;
}

/**
 * Fetch comprehensive token details including bond info
 */
export async function getTokenDetails(client: PublicClient, token: Address): Promise<TokenDetails> {
  const [nameRes, symbolRes, supplyRes, bondRes, maxRes, stepsRes] = await client.multicall({
    contracts: [
      { address: token, abi: ERC20_ABI, functionName: 'name' },
      { address: token, abi: ERC20_ABI, functionName: 'symbol' },
      { address: token, abi: ERC20_ABI, functionName: 'totalSupply' },
      { address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] },
      { address: BOND, abi: BOND_ABI, functionName: 'maxSupply', args: [token] },
      { address: BOND, abi: BOND_ABI, functionName: 'getSteps', args: [token] },
    ],
  });

  if (bondRes.status === 'failure') {
    throw new Error('Not a Mint Club token');
  }

  const bondInfo = await getBondInfo(client, token);

  let currentPrice: bigint | undefined;
  if (supplyRes.result && supplyRes.result > 0n) {
    try {
      currentPrice = await getTokenPrice(client, token);
    } catch {
      // Ignore price fetch errors
    }
  }

  return {
    name: nameRes.result ?? 'Unknown',
    symbol: symbolRes.result ?? 'Unknown',
    address: token,
    totalSupply: supplyRes.result ?? 0n,
    maxSupply: maxRes.result ?? 0n,
    bondInfo,
    currentPrice,
    steps: stepsRes.result,
  };
}

/**
 * Calculate token pricing information including USD values
 */
export async function getTokenPricing(
  client: PublicClient,
  token: Address,
  supply: bigint,
): Promise<TokenPricing> {
  const tokenPrice = await getTokenPrice(client, token);
  const bondInfo = await getBondInfo(client, token);

  // Get USD price of reserve token
  const reserveUsd = await getUsdPrice(bondInfo.reserveToken);
  let tokenUsd: number | undefined;
  let reserveValue: number | undefined;
  let marketCap: number | undefined;

  if (reserveUsd !== null) {
    const reservePriceNum = Number(tokenPrice) / (10 ** bondInfo.reserveDecimals);
    tokenUsd = reservePriceNum * reserveUsd;

    const reserveBalanceNum = Number(bondInfo.reserveBalance) / (10 ** bondInfo.reserveDecimals);
    reserveValue = reserveBalanceNum * reserveUsd;

    if (supply > 0n) {
      const supplyNum = Number(supply) / 1e18;
      marketCap = supplyNum * tokenUsd;
    }
  }

  return {
    tokenPrice,
    tokenUsd,
    reserveUsd,
    reserveValue,
    marketCap,
  };
}

/**
 * Format USD values consistently
 */
export function formatUsd(value: number): string {
  if (value < 0.01) {
    return value.toExponential(2);
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}