import type { Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getZapV2Address } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { ensureApproval } from './approve';
import { getBondInfo, getBurnRefund } from './bond';
import { getDecimals, getSymbol } from './symbol';
import {
  executeTransaction,
  setupClients,
  type ClientSetup,
} from './transaction';
import { encodeUniversalRouterPlan } from './uniswap/encode';
import { findBestRoute } from './uniswap/quote';

export const DEFAULT_DEADLINE_SECONDS = 1_200n;

export interface ZapCommandDependencies {
  getZapV2Address(chain: SupportedChain): Address;
  setupClients(
    privateKey: `0x${string}`,
    chain: SupportedChain,
  ): ClientSetup;
  getBondInfo: typeof getBondInfo;
  getBurnRefund: typeof getBurnRefund;
  getDecimals: typeof getDecimals;
  getSymbol: typeof getSymbol;
  findBestRoute: typeof findBestRoute;
  encodeUniversalRouterPlan: typeof encodeUniversalRouterPlan;
  ensureApproval: typeof ensureApproval;
  executeTransaction: typeof executeTransaction;
  nowSeconds(): bigint;
}

export const DEFAULT_ZAP_DEPENDENCIES: ZapCommandDependencies = {
  getZapV2Address,
  setupClients: (privateKey, chain) =>
    setupClients(
      getPublicClient,
      getWalletClient,
      privateKey,
      chain,
    ),
  getBondInfo,
  getBurnRefund,
  getDecimals,
  getSymbol,
  findBestRoute,
  encodeUniversalRouterPlan,
  ensureApproval,
  executeTransaction,
  nowSeconds: () => BigInt(Math.floor(Date.now() / 1_000)),
};

export function createZapDeadline(
  nowSeconds: bigint,
  ttlSeconds = DEFAULT_DEADLINE_SECONDS,
): bigint {
  if (nowSeconds < 0n || ttlSeconds <= 0n) {
    throw new Error('Zap deadline inputs must be positive');
  }
  return nowSeconds + ttlSeconds;
}

/** Parse a percentage string such as "1" or "0.5" to integer basis points. */
export function parseSlippageBps(percent: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(percent.trim());
  if (!match) {
    throw new Error('Slippage must be a percentage from 0 to 100 with at most 2 decimals');
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const bps = whole * 100 + fraction;
  if (bps > 10_000) {
    throw new Error('Slippage must be a percentage from 0 to 100 with at most 2 decimals');
  }
  return bps;
}

export function previewTokensReceived(result: unknown): bigint {
  if (Array.isArray(result) && typeof result[0] === 'bigint') return result[0];
  if (
    result &&
    typeof result === 'object' &&
    'tokensReceived' in result &&
    typeof result.tokensReceived === 'bigint'
  ) {
    return result.tokensReceived;
  }
  throw new Error('Unexpected MCV2_ZapV2 zapMint preview result');
}
