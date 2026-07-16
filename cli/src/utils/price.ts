import type { Address } from 'viem';
import {
  CHAIN_CONFIGS,
  ZERO_ADDRESS,
  type SupportedChain,
} from '../config/chains';
import { getWrappedNativeAddress } from '../config/contracts';

const DEFILLAMA_CHAIN: Record<SupportedChain, string | null> = {
  ethereum: 'ethereum',
  optimism: 'optimism',
  arbitrum: 'arbitrum',
  avalanche: 'avax',
  base: 'base',
  polygon: 'polygon',
  bsc: 'bsc',
  blast: 'blast',
  zora: 'zora',
  unichain: 'unichain',
  robinhood: 'robinhood',
  sepolia: null,
};

export type UsdRateResolver = (
  chain: SupportedChain,
  token: Address,
) => Promise<number | null>;

export const defillamaUsdRate: UsdRateResolver = async (chain, token) => {
  const namespace = DEFILLAMA_CHAIN[chain];
  if (!namespace) return null;

  const key = `${namespace}:${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${key}`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      coins?: Record<string, { price?: number }>;
    };
    const price = data.coins?.[key]?.price;
    return typeof price === 'number' && Number.isFinite(price)
      ? price
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/** Return USD per whole token, or null when no reliable rate is available. */
export async function getUsdPrice(
  token: Address,
  chain: SupportedChain = 'base',
  resolveUsdRate: UsdRateResolver = defillamaUsdRate,
): Promise<number | null> {
  const source =
    token.toLowerCase() === ZERO_ADDRESS
      ? getWrappedNativeAddress(chain)
      : token;
  const stable = CHAIN_CONFIGS[chain].usdToken;

  if (stable && source.toLowerCase() === stable.toLowerCase()) return 1;
  return resolveUsdRate(chain, source);
}
