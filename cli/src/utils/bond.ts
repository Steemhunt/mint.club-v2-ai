import {
  type Address,
  type PublicClient,
  formatUnits,
} from 'viem';
import { getBondAddress } from '../config/contracts';
import {
  CHAIN_CONFIGS,
  type SupportedChain,
} from '../config/chains';
import { BOND_ABI } from '../abi/bond';
import { getDecimals, getSymbol } from './symbol';
import { parseTokenAmount } from './format';

export interface BondInfo {
  creator: Address;
  mintRoyalty: number;
  burnRoyalty: number;
  createdAt: number;
  reserveToken: Address;
  reserveBalance: bigint;
  reserveSymbol: string;
  reserveDecimals: number;
  formatReserve: (value: bigint) => string;
}

/**
 * Get bond information for a token including reserve details and formatting helper
 */
export async function getBondInfo(
  client: PublicClient,
  token: Address,
  chain: SupportedChain = 'base',
): Promise<BondInfo> {
  const bondData = await client.readContract({
    address: getBondAddress(chain),
    abi: BOND_ABI,
    functionName: 'tokenBond',
    args: [token],
  });

  const [creator, mintRoyalty, burnRoyalty, createdAt, reserveToken, reserveBalance] =
    bondData;

  if (
    Number(createdAt) === 0 ||
    (reserveToken as Address).toLowerCase() ===
      '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      `${token} is not a Mint Club token on ${CHAIN_CONFIGS[chain].chain.name}`,
    );
  }

  const [reserveSymbol, reserveDecimals] = await Promise.all([
    getSymbol(client, reserveToken as Address, chain),
    getDecimals(client, reserveToken as Address, chain),
  ]);
  const formatReserve = (value: bigint) => formatUnits(value, reserveDecimals);

  return {
    creator,
    mintRoyalty,
    burnRoyalty,
    createdAt,
    reserveToken,
    reserveBalance,
    reserveSymbol,
    reserveDecimals,
    formatReserve,
  };
}

export function resolveMintLimit(
  quotedCost: bigint,
  maxCost: string | undefined,
  reserveDecimals: number,
): bigint {
  if (maxCost === undefined) return quotedCost;

  const limit = parseTokenAmount(maxCost, reserveDecimals);
  if (limit < quotedCost) {
    throw new Error(
      `Cost ${formatUnits(quotedCost, reserveDecimals)} exceeds max cost ${maxCost}`,
    );
  }
  return limit;
}

/**
 * Get the cost to mint tokens (including royalty)
 */
export async function getMintCost(
  client: PublicClient,
  token: Address,
  tokensToMint: bigint,
  chain: SupportedChain = 'base',
): Promise<{ reserveAmount: bigint; royalty: bigint; totalCost: bigint }> {
  const [reserveAmount, royalty] = await client.readContract({
    address: getBondAddress(chain),
    abi: BOND_ABI,
    functionName: 'getReserveForToken',
    args: [token, tokensToMint],
  });

  return {
    reserveAmount,
    royalty,
    // MCV2_Bond already includes mint royalty in reserveAmount.
    totalCost: reserveAmount,
  };
}

export function resolveBurnLimit(
  quotedRefund: bigint,
  minRefund: string | undefined,
  reserveDecimals: number,
): bigint {
  if (minRefund === undefined) return quotedRefund;

  const limit = parseTokenAmount(minRefund, reserveDecimals);
  if (limit > quotedRefund) {
    throw new Error(
      `Refund ${formatUnits(quotedRefund, reserveDecimals)} is below minimum refund ${minRefund}`,
    );
  }
  return limit;
}

/**
 * Get the refund for burning tokens (net of royalty)
 */
export async function getBurnRefund(
  client: PublicClient,
  token: Address,
  tokensToBurn: bigint,
  chain: SupportedChain = 'base',
): Promise<{ refundAmount: bigint; royalty: bigint; netRefund: bigint }> {
  const [refundAmount, royalty] = await client.readContract({
    address: getBondAddress(chain),
    abi: BOND_ABI,
    functionName: 'getRefundForTokens',
    args: [token, tokensToBurn],
  });

  return {
    refundAmount,
    royalty,
    // MCV2_Bond already subtracts burn royalty from refundAmount.
    netRefund: refundAmount,
  };
}

/**
 * Get the current price of 1 token in reserve token
 */
export async function getTokenPrice(
  client: PublicClient,
  token: Address,
  chain: SupportedChain = 'base',
  tokenDecimals?: number,
): Promise<bigint> {
  const decimals =
    tokenDecimals ?? (await getDecimals(client, token, chain));
  const [price] = await client.readContract({
    address: getBondAddress(chain),
    abi: BOND_ABI,
    functionName: 'getReserveForToken',
    args: [token, 10n ** BigInt(decimals)],
  });
  return price;
}
