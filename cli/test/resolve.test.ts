/**
 * Tests for deterministic token address resolution
 *
 * Run: npx vitest run test/resolve.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
vi.setConfig({ testTimeout: 30_000 });

import { createPublicClient, http, fallback, type Address } from 'viem';
import { base } from 'viem/chains';
import { resolveToken, resolveTokenAsync, predictTokenAddress, TOKENS, TOKEN_IMPLEMENTATION, BOND } from '../src/config/contracts';
import { SIGNET, HUNT, USDC, MT } from './helpers';

const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
  'https://mainnet.base.org',
];

const client = createPublicClient({
  chain: base,
  transport: fallback(RPCS.map(url => http(url, { retryCount: 2, timeout: 10_000 }))),
});

// ─── predictTokenAddress (pure, no RPC) ────────────────────────────────────

describe('predictTokenAddress', () => {
  it('should predict SIGNET address correctly', () => {
    const predicted = predictTokenAddress('SIGNET', TOKEN_IMPLEMENTATION);
    expect(predicted.toLowerCase()).toBe(SIGNET.toLowerCase());
  });

  it('should predict different addresses for different symbols', () => {
    const a = predictTokenAddress('SIGNET', TOKEN_IMPLEMENTATION);
    const b = predictTokenAddress('H1', TOKEN_IMPLEMENTATION);
    expect(a).not.toBe(b);
  });

  it('should be case-sensitive (SIGNET !== signet)', () => {
    const upper = predictTokenAddress('SIGNET', TOKEN_IMPLEMENTATION);
    const lower = predictTokenAddress('signet', TOKEN_IMPLEMENTATION);
    expect(upper).not.toBe(lower);
  });
});

// ─── resolveToken (sync, hardcoded only) ───────────────────────────────────

describe('resolveToken (sync)', () => {
  it('should resolve ETH', () => {
    expect(resolveToken('ETH')).toBe('0x0000000000000000000000000000000000000000');
  });

  it('should resolve USDC (case-insensitive)', () => {
    expect(resolveToken('usdc').toLowerCase()).toBe(USDC.toLowerCase());
  });

  it('should resolve HUNT', () => {
    expect(resolveToken('HUNT').toLowerCase()).toBe(HUNT.toLowerCase());
  });

  it('should pass through 0x addresses', () => {
    expect(resolveToken(SIGNET)).toBe(SIGNET);
  });

  it('should throw for unknown symbols', () => {
    expect(() => resolveToken('SIGNET')).toThrow('Unknown token');
  });
});

// ─── resolveTokenAsync (with on-chain verification) ────────────────────────

describe('resolveTokenAsync', () => {
  it('should resolve hardcoded tokens instantly', async () => {
    const addr = await resolveTokenAsync('ETH', client);
    expect(addr).toBe('0x0000000000000000000000000000000000000000');
  });

  it('should resolve SIGNET by symbol', async () => {
    const addr = await resolveTokenAsync('SIGNET', client);
    expect(addr.toLowerCase()).toBe(SIGNET.toLowerCase());
  });

  it('should resolve signet (lowercase) by trying UPPERCASE', async () => {
    const addr = await resolveTokenAsync('signet', client);
    expect(addr.toLowerCase()).toBe(SIGNET.toLowerCase());
  });

  it('should resolve H1 token', async () => {
    const addr = await resolveTokenAsync('H1', client);
    // H1 should be a valid deployed contract
    const code = await client.getCode({ address: addr });
    expect(code).not.toBe('0x');
  });

  it('should pass through 0x addresses', async () => {
    const addr = await resolveTokenAsync(SIGNET, client);
    expect(addr).toBe(SIGNET);
  });

  it('should throw for non-existent token', async () => {
    await expect(resolveTokenAsync('ZZZZNONEXISTENT', client)).rejects.toThrow('not found');
  });
});
