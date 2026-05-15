import { type Address, formatUnits } from 'viem';
import { getPublicClient } from '../client';
import { getBondInfo, getTokenPrice } from '../utils/bond';
import { getTokenPricing, formatUsd } from '../utils/token-info';
import { getSymbol } from '../utils/symbol';
import { ERC20_ABI } from '../abi/erc20';

export async function price(token: Address) {
  const client = getPublicClient();

  // Get basic token info
  const [symbol, supply, bondInfo] = await Promise.all([
    getSymbol(client, token),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'totalSupply' }),
    getBondInfo(client, token).catch(() => { throw new Error('Not a Mint Club token'); }),
  ]);

  console.log(`💱 ${symbol} (${token})\n`);

  if (supply === 0n) {
    console.log('   No supply yet — token has not been minted.');
    return;
  }

  // Get pricing information
  const pricing = await getTokenPricing(client, token, supply);

  // Format reserve price
  const reservePriceStr = formatUnits(pricing.tokenPrice, bondInfo.reserveDecimals);
  console.log(`   Price: ${reservePriceStr} ${bondInfo.reserveSymbol}`);

  // Show USD pricing if available
  if (pricing.tokenUsd !== undefined && pricing.reserveValue !== undefined) {
    console.log(`   Price (USD): $${formatUsd(pricing.tokenUsd)}`);
    console.log(
      `   Reserve: ${bondInfo.formatReserve(bondInfo.reserveBalance)} ${bondInfo.reserveSymbol} (~$${formatUsd(pricing.reserveValue)})`,
    );

    if (pricing.marketCap !== undefined) {
      console.log(`   Market Cap: ~$${formatUsd(pricing.marketCap)}`);
    }
  } else {
    console.log(
      `   Reserve: ${bondInfo.formatReserve(bondInfo.reserveBalance)} ${bondInfo.reserveSymbol}`,
    );
    console.log(`   ⚠️  Could not fetch USD price for reserve token`);
  }
}