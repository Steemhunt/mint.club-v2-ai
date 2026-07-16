import {
  type Address,
  type PublicClient,
  concat,
  encodePacked,
  getAddress,
  getCreate2Address,
  isAddress,
  keccak256,
} from 'viem';
import {
  CHAIN_CONFIGS,
  ZERO_ADDRESS,
  type KnownToken,
  type SupportedChain,
} from './chains';

export interface KnownTokenConfig extends KnownToken {
  symbol: string;
}

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

export function getTokenImplementation(
  chain: SupportedChain = 'base',
): Address {
  return getContracts(chain).tokenImplementation;
}

export function getZapV2Address(chain: SupportedChain = 'base'): Address {
  const address = getContracts(chain).zapV2;
  if (!address) {
    throw new Error(
      `MCV2_ZapV2 is not configured on ${CHAIN_CONFIGS[chain].chain.name}`,
    );
  }
  return address;
}

export function getNativeToken(
  chain: SupportedChain = 'base',
): KnownTokenConfig {
  const token = getTokens(chain).find(
    ({ address }) => address.toLowerCase() === ZERO_ADDRESS,
  );
  if (!token) throw new Error(`Native token is not configured on ${chain}`);
  return token;
}

export function getWrappedNativeToken(
  chain: SupportedChain = 'base',
): KnownTokenConfig {
  const token = getTokens(chain).find(({ wrappedNative }) => wrappedNative);
  if (!token) throw new Error(`Wrapped native token is not configured on ${chain}`);
  return token;
}

export function getWrappedNativeAddress(
  chain: SupportedChain = 'base',
): Address {
  return getWrappedNativeToken(chain).address;
}

/** Resolve a configured symbol, NATIVE, or a literal ERC-20 address. */
export function resolveToken(
  input: string,
  chain: SupportedChain = 'base',
): Address {
  if (isAddress(input)) return getAddress(input);

  const normalized = input.trim().toUpperCase();
  if (normalized === 'NATIVE') return ZERO_ADDRESS;

  const token = getTokens(chain).find(
    ({ symbol }) => symbol.toUpperCase() === normalized,
  );
  if (!token) {
    throw new Error(
      `Unknown token "${input}" on ${CHAIN_CONFIGS[chain].chain.name}. Use a configured symbol or token address.`,
    );
  }
  return token.address;
}

/** Predict an MCV2 bonding-curve token's deterministic CREATE2 address. */
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

/** Resolve configured and deterministic Mint Club token symbols. */
export async function resolveTokenAsync(
  input: string,
  client: PublicClient,
  chain: SupportedChain = 'base',
): Promise<Address> {
  if (isAddress(input)) return getAddress(input);

  const normalized = input.trim().toUpperCase();
  if (normalized === 'NATIVE') return ZERO_ADDRESS;

  const known = getTokens(chain).find(
    ({ symbol }) => symbol.toUpperCase() === normalized,
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
      `Use a contract address, or one of: ${getTokens(chain)
        .map(({ symbol }) => symbol)
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
