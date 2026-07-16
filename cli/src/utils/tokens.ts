import { dirname, resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { type Address, getAddress } from 'viem';
import type { SupportedChain } from '../config/chains';

const TOKEN_FILE = resolve(homedir(), '.mintclub', 'tokens.json');

type TokenStore = Partial<Record<SupportedChain, Address[]>>;

function normalizeTokenStore(data: unknown): TokenStore {
  if (Array.isArray(data)) return { base: data as Address[] };
  if (!data || typeof data !== 'object') return {};

  const input = data as Partial<Record<SupportedChain, unknown>>;
  return {
    ...(Array.isArray(input.base) ? { base: input.base as Address[] } : {}),
    ...(Array.isArray(input.robinhood)
      ? { robinhood: input.robinhood as Address[] }
      : {}),
  };
}

function readTokenStore(tokenFile: string): TokenStore {
  if (!existsSync(tokenFile)) return {};
  try {
    return normalizeTokenStore(JSON.parse(readFileSync(tokenFile, 'utf-8')));
  } catch {
    return {};
  }
}

export function mergeTrackedToken(
  data: unknown,
  address: Address,
  chain: SupportedChain,
): TokenStore {
  const store = normalizeTokenStore(data);
  const checksummed = getAddress(address);
  const tokens = [...(store[chain] ?? [])];
  if (!tokens.some((token) => token.toLowerCase() === checksummed.toLowerCase())) {
    tokens.push(checksummed);
  }
  return { ...store, [chain]: tokens };
}

/** Load saved token addresses for one chain. Legacy arrays belong to Base. */
export function loadTokens(
  chain: SupportedChain = 'base',
  tokenFile: string = TOKEN_FILE,
): Address[] {
  return readTokenStore(tokenFile)[chain] ?? [];
}

/** Save a token address by chain (deduped, checksummed). */
export function saveToken(
  address: Address,
  chain: SupportedChain = 'base',
  tokenFile: string = TOKEN_FILE,
): void {
  let data: unknown = {};
  if (existsSync(tokenFile)) {
    try {
      data = JSON.parse(readFileSync(tokenFile, 'utf-8'));
    } catch {
      data = {};
    }
  }

  const store = mergeTrackedToken(data, address, chain);
  mkdirSync(dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(store, null, 2) + '\n');
}
