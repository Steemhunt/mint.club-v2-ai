import type { Address } from 'viem';

// Protocol contracts
export const BOND: Address = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
export const ZAP_V2: Address = '0x7d999874eAe10f170C4813270173363468A559cD';

// Well-known tokens on Base
export const TOKENS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'USDbC', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca', decimals: 6 },
  { symbol: 'HUNT', address: '0x37f0A65b0491c49F4bDdE04F0b5dF27b214FfCf5', decimals: 18 },
  { symbol: 'MT', address: '0xFf45161474C39cB00699070Dd49582e417b57a7E', decimals: 18 },
];

// Shorthand lookups
export const WETH: Address = TOKENS.find(t => t.symbol === 'WETH')!.address;

// Router intermediaries (tokens to try 1-hop routes through)
export const INTERMEDIARIES = TOKENS.filter(t => ['WETH', 'USDC', 'USDbC'].includes(t.symbol));
