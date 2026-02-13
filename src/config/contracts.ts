import type { Address } from 'viem';

// Protocol contracts
export const BOND: Address = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
export const ZAP_V2: Address = '0x7d999874eAe10f170C4813270173363468A559cD';

// Well-known tokens on Base
export const TOKENS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: 'ETH',  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'HUNT', address: '0x37f0A65b0491c49F4bDdE04F0b5dF27b214FfCf5', decimals: 18 },
  { symbol: 'MT',   address: '0xFf45161474C39cB00699070Dd49582e417b57a7E', decimals: 18 },
];

// Shorthand lookups
export const WETH: Address = TOKENS.find(t => t.symbol === 'WETH')!.address;

/** Resolve a symbol (e.g. "USDC", "ETH", "HUNT") or address to an Address */
export function resolveToken(input: string): Address {
  if (input.startsWith('0x') && input.length === 42) return input as Address;
  const token = TOKENS.find(t => t.symbol.toUpperCase() === input.toUpperCase());
  if (token) return token.address;
  throw new Error(`Unknown token "${input}". Use an address or one of: ${TOKENS.map(t => t.symbol).join(', ')}`);
}

/** Get symbol for an address (returns short address if unknown) */
export function tokenSymbol(address: string): string {
  const t = TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase());
  return t?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Get decimals for an address (defaults to 18) */
export function tokenDecimals(address: string): number {
  const t = TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase());
  return t?.decimals ?? 18;
}

// 1inch Spot Price Aggregator
export const SPOT_PRICE_AGGREGATOR: Address = '0x00000000000D6FFc74A8feb35aF5827bf57f6786';

// Router intermediaries (tokens to try 1-hop routes through)
export const INTERMEDIARIES = TOKENS.filter(t => ['WETH', 'USDC'].includes(t.symbol));
