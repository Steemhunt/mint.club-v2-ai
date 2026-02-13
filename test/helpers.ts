import { type Address } from 'viem';

// Well-known token addresses
export const HUNT: Address = '0x37f0c2915CeCC7e977183B8543Fc0864d03E064C';
export const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SIGNET: Address = '0xDF2B673Ec06d210C8A8Be89441F8de60B5C679c9';
export const MT: Address = '0xFf45161474C39cB00699070Dd49582e417b57a7E';

// Whale address with large balances (for impersonation)
export const WHALE: Address = '0xCB3f3e0E992435390e686D7b638FCb8baBa6c5c7';

// Test constants
export const FORK_BLOCK = 28_000_000n; // pinned block for deterministic tests

// Spot price aggregator ABI
export const SPOT_ABI = [{
  type: 'function', 
  name: 'getRate', 
  stateMutability: 'view',
  inputs: [
    { name: 'srcToken', type: 'address' },
    { name: 'dstToken', type: 'address' },
    { name: 'useWrappers', type: 'bool' },
  ],
  outputs: [
    { name: 'weightedRate', type: 'uint256' },
    { name: 'srcDecimals', type: 'uint8' },
    { name: 'dstDecimals', type: 'uint8' },
  ],
}] as const;

// Common test utilities
export function isCloseEnough(a: bigint, b: bigint, tolerance = 0.01): boolean {
  const diff = a > b ? a - b : b - a;
  const avg = (a + b) / 2n;
  if (avg === 0n) return diff === 0n;
  return Number(diff) / Number(avg) <= tolerance;
}