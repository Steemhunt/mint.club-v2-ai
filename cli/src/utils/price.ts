import type { Address } from 'viem';
import {
  CHAIN_CONFIGS,
  type SupportedChain,
} from '../config/chains';
import { getWethAddress } from '../config/contracts';

const NATIVE = '0x0000000000000000000000000000000000000000';
const DEFILLAMA_CHAIN: Record<SupportedChain, string> = {
  base: 'base',
  robinhood: 'robinhood',
};

export type UsdRateResolver = (
  chain: SupportedChain,
  token: Address,
) => Promise<number | null>;

export const defillamaUsdRate: UsdRateResolver = async (chain, token) => {
  const key = `${DEFILLAMA_CHAIN[chain]}:${token}`;
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
    token.toLowerCase() === NATIVE ? getWethAddress(chain) : token;
  const stable =
    chain === 'base'
      ? CHAIN_CONFIGS.base.tokens.USDC
      : CHAIN_CONFIGS.robinhood.tokens.USDG;

  if (source.toLowerCase() === stable.address.toLowerCase()) return 1;
  return resolveUsdRate(chain, source);
}
