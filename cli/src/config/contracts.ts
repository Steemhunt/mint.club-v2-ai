import {
  type Address,
  type PublicClient,
  concat,
  encodePacked,
  getCreate2Address,
  keccak256,
} from 'viem';
import { CHAIN_CONFIGS, type SupportedChain } from './chains';

export type KnownTokenConfig = {
  symbol: string;
  address: Address;
  decimals: number;
};

export function getContracts(chain: SupportedChain = 'base') {
  return CHAIN_CONFIGS[chain].contracts;
}

export function getTokens(chain: SupportedChain = 'base'): KnownTokenConfig[] {
  return Object.entries(CHAIN_CONFIGS[chain].tokens).map(
    ([symbol, token]) => ({ symbol, ...token }) as KnownTokenConfig,
  );
}

export function getBondAddress(chain: SupportedChain = 'base'): Address {
  return getContracts(chain).bond;
}

export function getZapAddress(chain: SupportedChain = 'base'): Address {
  return getContracts(chain).zap;
}

export function getTokenImplementation(chain: SupportedChain = 'base'): Address {
  return getContracts(chain).tokenImplementation;
}

export function getWethAddress(chain: SupportedChain = 'base'): Address {
  return getTokens(chain).find((token) => token.symbol === 'WETH')!.address;
}

/** Resolve a known symbol or pass through a token address on the selected chain. */
export function resolveToken(
  input: string,
  chain: SupportedChain = 'base',
): Address {
  if (input.startsWith('0x') && input.length === 42) return input as Address;

  const tokens = getTokens(chain);
  const token = tokens.find(
    (candidate) => candidate.symbol.toUpperCase() === input.toUpperCase(),
  );
  if (token) return token.address;

  const chainName = CHAIN_CONFIGS[chain].chain.name;
  throw new Error(
    `Unknown token "${input}" on ${chainName}. Use an address or one of: ${tokens
      .map((candidate) => candidate.symbol)
      .join(', ')}`,
  );
}

/**
 * Predict the deterministic address for a Mint Club bonding curve token.
 * Uses CREATE2 with the EIP-1167 minimal proxy pattern used by MCV2_Bond.
 */
export function predictTokenAddress(
  symbol: string,
  implementation: Address = getTokenImplementation('base'),
  bond: Address = getBondAddress('base'),
): Address {
  const salt = keccak256(encodePacked(['address', 'string'], [bond, symbol]));
  const initCode = concat([
    '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
    implementation,
    '0x5af43d82803e903d91602b57fd5bf3',
  ]);

  return getCreate2Address({
    from: bond,
    salt,
    bytecodeHash: keccak256(initCode),
  });
}

/** Resolve known and deterministic Mint Club token symbols on the selected chain. */
export async function resolveTokenAsync(
  input: string,
  client: PublicClient,
  chain: SupportedChain = 'base',
): Promise<Address> {
  if (input.startsWith('0x') && input.length === 42) return input as Address;

  const tokens = getTokens(chain);
  const known = tokens.find(
    (candidate) => candidate.symbol.toUpperCase() === input.toUpperCase(),
  );
  if (known) return known.address;

  const candidates = [input];
  if (input !== input.toUpperCase()) candidates.push(input.toUpperCase());

  for (const symbol of candidates) {
    const predicted = predictTokenAddress(
      symbol,
      getTokenImplementation(chain),
      getBondAddress(chain),
    );
    const code = await client.getCode({ address: predicted });
    if (code && code !== '0x') return predicted;
  }

  throw new Error(
    `Token "${input}" not found on ${CHAIN_CONFIGS[chain].chain.name}. ` +
      `Use a contract address, or one of: ${tokens
        .map((candidate) => candidate.symbol)
        .join(', ')}`,
  );
}

export function tokenSymbol(
  address: string,
  chain: SupportedChain = 'base',
): string {
  const token = getTokens(chain).find(
    (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
  );
  return token?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function tokenDecimals(
  address: string,
  chain: SupportedChain = 'base',
): number {
  const token = getTokens(chain).find(
    (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
  );
  return token?.decimals ?? 18;
}
