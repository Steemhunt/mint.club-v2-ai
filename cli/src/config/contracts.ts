import { type Address, type PublicClient, encodePacked, keccak256, getCreate2Address, concat, toHex } from 'viem';
import { BOND_ABI } from '../abi/bond';

// Protocol contracts
export const BOND: Address = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
export const ZAP_V2: Address = '0x7d999874eAe10f170C4813270173363468A559cD';

// Well-known tokens on Base
export const TOKENS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: 'ETH',  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'HUNT', address: '0x37f0c2915CeCC7e977183B8543Fc0864d03E064C', decimals: 18 },
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

/**
 * Predict the deterministic address for a Mint Club bonding curve token.
 * Uses CREATE2 with EIP-1167 minimal proxy pattern, matching MCV2_Bond.sol:
 *   salt = keccak256(abi.encodePacked(address(this), symbol))
 *   address = Clones.predictDeterministicAddress(implementation, salt)
 */
function predictTokenAddress(symbol: string, implementation: Address): Address {
  const salt = keccak256(encodePacked(['address', 'string'], [BOND, symbol]));

  // EIP-1167 minimal proxy init code: creation code + runtime code with implementation
  const initCode = concat([
    '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
    implementation,
    '0x5af43d82803e903d91602b57fd5bf3',
  ]);
  const initCodeHash = keccak256(initCode);

  return getCreate2Address({ from: BOND, salt, bytecodeHash: initCodeHash });
}

// Cache the token implementation address (read once from Bond contract)
let _tokenImplementation: Address | null = null;

async function getTokenImplementation(client: PublicClient): Promise<Address> {
  if (_tokenImplementation) return _tokenImplementation;
  _tokenImplementation = await client.readContract({
    address: BOND,
    abi: BOND_ABI,
    functionName: 'tokenImplementation',
  }) as Address;
  return _tokenImplementation;
}

/**
 * Resolve a token symbol to an address, including Mint Club bonding curve tokens.
 * First checks hardcoded base tokens, then computes deterministic address and
 * verifies it's deployed on-chain.
 */
export async function resolveTokenAsync(input: string, client: PublicClient): Promise<Address> {
  // Direct address passthrough
  if (input.startsWith('0x') && input.length === 42) return input as Address;

  // Check hardcoded tokens first (instant)
  const token = TOKENS.find(t => t.symbol.toUpperCase() === input.toUpperCase());
  if (token) return token.address;

  // Compute deterministic address from symbol
  const implementation = await getTokenImplementation(client);

  // Try exact input first, then UPPERCASE (Mint Club symbols are typically uppercase)
  const candidates = [input];
  if (input !== input.toUpperCase()) candidates.push(input.toUpperCase());

  for (const symbol of candidates) {
    const predicted = predictTokenAddress(symbol, implementation);
    const code = await client.getCode({ address: predicted });
    if (code && code !== '0x') {
      return predicted;
    }
  }

  throw new Error(
    `Token "${input}" not found on Mint Club. ` +
    `Use a contract address, or one of: ${TOKENS.map(t => t.symbol).join(', ')}`
  );
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
