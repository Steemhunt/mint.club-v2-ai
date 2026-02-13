import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { type Address, getAddress } from 'viem';

const TOKEN_FILE = resolve(homedir(), '.mintclub', 'tokens.json');

/** Load saved token addresses */
export function loadTokens(): Address[] {
  if (!existsSync(TOKEN_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    if (Array.isArray(data)) return data;
    // Migrate old {symbol: address} format
    if (typeof data === 'object' && data !== null) {
      const addrs = Object.values(data).filter(v => typeof v === 'string' && (v as string).startsWith('0x')) as Address[];
      writeFileSync(TOKEN_FILE, JSON.stringify(addrs, null, 2) + '\n');
      return addrs;
    }
    return [];
  } catch { return []; }
}

/** Save a token address (deduped, checksummed) */
export function saveToken(address: Address) {
  const tokens = loadTokens();
  const checksummed = getAddress(address);
  if (tokens.some(t => t.toLowerCase() === checksummed.toLowerCase())) return;
  tokens.push(checksummed);
  mkdirSync(resolve(homedir(), '.mintclub'), { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2) + '\n');
}
