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
  zora: 'zora',
  unichain: 'unichain',
  robinhood: 'robinhood',
  elysium: null,
  sepolia: null,
  'base-sepolia': null,
};

const ELYSIUM_TOKENS = CHAIN_CONFIGS.elysium.tokens;

/**
 * DefiLlama does not list Elysium. Its canonical tokens are Arbitrum-bridge
 * representations of HyperEVM assets, so they are priced through their HyperEVM
 * originals under DefiLlama's hyperliquid slug, matching the Mint Club SDK.
 */
const DEFILLAMA_COIN_OVERRIDES: Partial<
  Record<SupportedChain, Record<string, string>>
> = {
  elysium: Object.fromEntries(
    (
      [
        [ELYSIUM_TOKENS.WHYPE, '0x5555555555555555555555555555555555555555'],
        [ELYSIUM_TOKENS.USDC, '0xb88339CB7199b77E23DB6E890353E22632Ba630f'],
        [ELYSIUM_TOKENS.KNTQ, '0x000000000000780555bD0BCA3791f89f9542c2d6'],
        [ELYSIUM_TOKENS.kHYPE, '0xfD739d4e423301CE9385c1fb8850539D657C296D'],
        [ELYSIUM_TOKENS.USDT0, '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'],
        [ELYSIUM_TOKENS.UBTC, '0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463'],
        [ELYSIUM_TOKENS.UETH, '0xBe6727B535545C67d5cAa73dEa54865B92CF7907'],
      ] as const
    ).map(([token, origin]) => [
      token.address.toLowerCase(),
      `hyperliquid:${origin}`,
    ]),
  ),
};

/** DefiLlama coin key (`<chain slug>:<address>`), or null when the token is unpriced. */
export function defillamaCoinKey(
  chain: SupportedChain,
  token: Address,
): string | null {
  const override = DEFILLAMA_COIN_OVERRIDES[chain]?.[token.toLowerCase()];
  if (override) return override;
  const namespace = DEFILLAMA_CHAIN[chain];
  return namespace ? `${namespace}:${token}` : null;
}

export type UsdRateResolver = (
  chain: SupportedChain,
  token: Address,
) => Promise<number | null>;

export const defillamaUsdRate: UsdRateResolver = async (chain, token) => {
  const key = defillamaCoinKey(chain, token);
  if (!key) return null;

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
