import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { type Address, getAddress } from 'viem';

const TOKEN_FILE = resolve(homedir(), '.mintclub', 'tokens.json');

type TokenMap = Record<string, string>; // symbol (uppercase) → address

function load(): TokenMap {
  if (!existsSync(TOKEN_FILE)) return {};
  try { return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')); } catch { return {}; }
}

function save(map: TokenMap) {
  mkdirSync(resolve(homedir(), '.mintclub'), { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(map, null, 2) + '\n');
}

/** Save a token symbol → address mapping */
export function saveToken(symbol: string, address: Address) {
  const map = load();
  map[symbol.toUpperCase()] = address;
  save(map);
}

/** Resolve a token input: if it looks like an address return it, otherwise look up symbol */
export function resolveToken(input: string): Address {
  // Already an address
  if (input.startsWith('0x') && input.length === 42) return getAddress(input);

  // Special case
  if (input.toUpperCase() === 'ETH') return 'ETH' as Address;

  // Look up symbol
  const map = load();
  const addr = map[input.toUpperCase()];
  if (!addr) throw new Error(`Unknown token symbol "${input}". Use the full address, or interact with it once to cache it.`);
  return getAddress(addr);
}

/** Check if an address is already cached */
export function isTokenCached(address: Address): boolean {
  const map = load();
  const addr = address.toLowerCase();
  return Object.values(map).some(a => a.toLowerCase() === addr);
}

/** List all saved tokens */
export function listTokens(): Record<string, string> {
  return load();
}

/** Cache a token's symbol if not already cached. Fetches symbol from chain. */
export async function cacheTokenIfNeeded(address: Address, client: any) {
  if (isTokenCached(address)) return;
  try {
    const symbol = await client.readContract({
      address,
      abi: [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }] as const,
      functionName: 'symbol',
    });
    if (symbol) saveToken(symbol, address);
  } catch { /* not an ERC-20, skip */ }
}
