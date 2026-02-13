import { type Address, type PublicClient, formatUnits } from 'viem';
import { BOND, tokenDecimals } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { getSymbol } from './symbol';

export interface BondInfo {
  creator: Address;
  mintRoyalty: bigint;
  burnRoyalty: bigint;
  createdAt: bigint;
  reserveToken: Address;
  reserveBalance: bigint;
  reserveSymbol: string;
  reserveDecimals: number;
  formatReserve: (value: bigint) => string;
}

/**
 * Get bond information for a token including reserve details and formatting helper
 */
export async function getBondInfo(client: PublicClient, token: Address): Promise<BondInfo> {
  const bondData = await client.readContract({
    address: BOND,
    abi: BOND_ABI,
    functionName: 'tokenBond',
    args: [token],
  });

  const [creator, mintRoyalty, burnRoyalty, createdAt, reserveToken, reserveBalance] = bondData;
  const reserveSymbol = await getSymbol(client, reserveToken as Address);
  const reserveDecimals = tokenDecimals(reserveToken as Address);
  const formatReserve = (value: bigint) => formatUnits(value, reserveDecimals);

  return {
    creator: creator as Address,
    mintRoyalty: mintRoyalty as bigint,
    burnRoyalty: burnRoyalty as bigint,
    createdAt: createdAt as bigint,
    reserveToken: reserveToken as Address,
    reserveBalance: reserveBalance as bigint,
    reserveSymbol,
    reserveDecimals,
    formatReserve,
  };
}

/**
 * Get the cost to mint tokens (including royalty)
 */
export async function getMintCost(
  client: PublicClient,
  token: Address,
  tokensToMint: bigint,
): Promise<{ reserveAmount: bigint; royalty: bigint; totalCost: bigint }> {
  const [reserveAmount, royalty] = await client.readContract({
    address: BOND,
    abi: BOND_ABI,
    functionName: 'getReserveForToken',
    args: [token, tokensToMint],
  });

  return {
    reserveAmount,
    royalty,
    totalCost: reserveAmount + royalty,
  };
}

/**
 * Get the refund for burning tokens (net of royalty)
 */
export async function getBurnRefund(
  client: PublicClient,
  token: Address,
  tokensToBurn: bigint,
): Promise<{ refundAmount: bigint; royalty: bigint; netRefund: bigint }> {
  const [refundAmount, royalty] = await client.readContract({
    address: BOND,
    abi: BOND_ABI,
    functionName: 'getRefundForTokens',
    args: [token, tokensToBurn],
  });

  return {
    refundAmount,
    royalty,
    netRefund: refundAmount - royalty,
  };
}

/**
 * Get the current price of 1 token in reserve token
 */
export async function getTokenPrice(
  client: PublicClient,
  token: Address,
): Promise<bigint> {
  const [price] = await client.readContract({
    address: BOND,
    abi: BOND_ABI,
    functionName: 'getReserveForToken',
    args: [token, 10n ** 18n], // 1 token (18 decimals)
  });
  return price;
}