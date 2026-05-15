import { type Address } from 'viem';
import { getPublicClient } from '../client';
import { fmt, printTokenInfo } from '../utils/format';
import { getTokenDetails, getTokenPricing, formatUsd } from '../utils/token-info';

export async function info(token: Address) {
  console.log(`🔍 Fetching token info for ${token} on Base...\n`);
  
  const client = getPublicClient();
  const details = await getTokenDetails(client, token);

  // Print basic token info
  printTokenInfo({
    name: details.name,
    symbol: details.symbol,
    address: details.address,
    creator: details.bondInfo.creator,
    reserveToken: details.bondInfo.reserveToken,
    reserveSymbol: details.bondInfo.reserveSymbol,
    reserveBalance: details.bondInfo.reserveBalance,
    currentSupply: details.totalSupply,
    maxSupply: details.maxSupply,
    mintRoyalty: details.bondInfo.mintRoyalty,
    burnRoyalty: details.bondInfo.burnRoyalty,
    createdAt: details.bondInfo.createdAt,
    steps: details.steps ?? [],
  });

  // Show pricing info if token has supply
  if (details.totalSupply > 0n && details.currentPrice) {
    try {
      const pricing = await getTokenPricing(client, token, details.totalSupply);
      
      let priceStr = `\n💱 Current Price: ${fmt(pricing.tokenPrice)} ${details.bondInfo.reserveSymbol} per 1 ${details.symbol}`;

      if (pricing.tokenUsd !== undefined && pricing.reserveValue !== undefined) {
        priceStr += ` (~$${formatUsd(pricing.tokenUsd)})`;
        priceStr += `\n💵 Reserve Value: ~$${formatUsd(pricing.reserveValue)}`;

        if (pricing.marketCap !== undefined) {
          priceStr += `\n📊 Market Cap: ~$${formatUsd(pricing.marketCap)}`;
        }
      }

      console.log(priceStr);
    } catch {
      console.log('\n⚠️  Could not fetch current price');
    }
  }
}