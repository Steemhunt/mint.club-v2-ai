import { type Address, formatUnits } from 'viem';
import { getPublicClient } from '../client';
import type { SupportedChain } from '../config/chains';
import { getBondInfo } from '../utils/bond';
import { getTokenPricing, formatUsd } from '../utils/token-info';
import { getSymbol } from '../utils/symbol';
import { ERC20_ABI } from '../abi/erc20';

export async function price(
  token: Address,
  chain: SupportedChain = 'base',
) {
  const client = getPublicClient(chain);

  const [symbol, supply, bondInfo] = await Promise.all([
    getSymbol(client, token, chain),
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
    }),
    getBondInfo(client, token, chain).catch(() => {
      throw new Error('Not a Mint Club token');
    }),
  ]);

  console.log(`💱 ${symbol} (${token})\n`);

  if (supply === 0n) {
    console.log('   No supply yet — token has not been minted.');
    return;
  }

  const pricing = await getTokenPricing(client, token, supply, chain);
  const reservePrice = formatUnits(
    pricing.tokenPrice,
    bondInfo.reserveDecimals,
  );
  console.log(`   Price: ${reservePrice} ${bondInfo.reserveSymbol}`);

  if (
    pricing.tokenUsd !== undefined &&
    pricing.reserveValue !== undefined
  ) {
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
    console.log('   ⚠️  Could not fetch USD price for reserve token');
  }
}
