import { type Address } from 'viem';
import { getPublicClient } from '../client';
import { CHAIN_CONFIGS, type SupportedChain } from '../config/chains';
import { printTokenInfo } from '../utils/format';
import { getTokenDetails, getTokenPricing, formatUsd } from '../utils/token-info';

export async function info(
  token: Address,
  chain: SupportedChain = 'base',
) {
  console.log(
    `🔍 Fetching token info for ${token} on ${CHAIN_CONFIGS[chain].chain.name}...\n`,
  );

  const client = getPublicClient(chain);
  const details = await getTokenDetails(client, token, chain);

  printTokenInfo({
    name: details.name,
    symbol: details.symbol,
    address: details.address,
    creator: details.bondInfo.creator,
    reserveToken: details.bondInfo.reserveToken,
    reserveSymbol: details.bondInfo.reserveSymbol,
    reserveDecimals: details.bondInfo.reserveDecimals,
    reserveBalance: details.bondInfo.reserveBalance,
    currentSupply: details.totalSupply,
    maxSupply: details.maxSupply,
    mintRoyalty: details.bondInfo.mintRoyalty,
    burnRoyalty: details.bondInfo.burnRoyalty,
    createdAt: details.bondInfo.createdAt,
    steps: details.steps ?? [],
  });

  if (details.totalSupply > 0n && details.currentPrice) {
    try {
      const pricing = await getTokenPricing(
        client,
        token,
        details.totalSupply,
        chain,
      );

      let priceText =
        `\n💱 Current Price: ${details.bondInfo.formatReserve(pricing.tokenPrice)}` +
        ` ${details.bondInfo.reserveSymbol} per 1 ${details.symbol}`;

      if (
        pricing.tokenUsd !== undefined &&
        pricing.reserveValue !== undefined
      ) {
        priceText += ` (~$${formatUsd(pricing.tokenUsd)})`;
        priceText += `\n💵 Reserve Value: ~$${formatUsd(pricing.reserveValue)}`;

        if (pricing.marketCap !== undefined) {
          priceText += `\n📊 Market Cap: ~$${formatUsd(pricing.marketCap)}`;
        }
      }

      console.log(priceText);
    } catch {
      console.log('\n⚠️  Could not fetch current price');
    }
  }
}
