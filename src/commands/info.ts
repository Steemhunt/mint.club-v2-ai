import { type Address } from 'viem';
import { getPublicClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { ERC20_ABI } from '../abi/erc20';
import { fmt, printTokenInfo } from '../utils/format';
import { getUsdPrice } from '../utils/price';
import { getSymbol } from '../utils/symbol';

export async function info(token: Address) {
  console.log(`🔍 Fetching token info for ${token} on Base...\n`);
  const client = getPublicClient();
  const [nameRes, symbolRes, supplyRes, bondRes, maxRes, stepsRes] = await client.multicall({
    contracts: [
      { address: token, abi: ERC20_ABI, functionName: 'name' },
      { address: token, abi: ERC20_ABI, functionName: 'symbol' },
      { address: token, abi: ERC20_ABI, functionName: 'totalSupply' },
      { address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] },
      { address: BOND, abi: BOND_ABI, functionName: 'maxSupply', args: [token] },
      { address: BOND, abi: BOND_ABI, functionName: 'getSteps', args: [token] },
    ],
  });
  if (bondRes.status === 'failure') throw new Error('Not a Mint Club token');
  // Cache symbol → address
  const [creator, mintRoyalty, burnRoyalty, createdAt, reserveToken, reserveBalance] = bondRes.result!;
  const reserveSym = await getSymbol(client, reserveToken as Address);
  printTokenInfo({
    name: nameRes.result ?? 'Unknown', symbol: symbolRes.result ?? 'Unknown', address: token,
    creator, reserveToken, reserveSymbol: reserveSym, reserveBalance, currentSupply: supplyRes.result ?? 0n, maxSupply: maxRes.result ?? 0n,
    mintRoyalty, burnRoyalty, createdAt: Number(createdAt), steps: stepsRes.result ?? [],
  });
  if (supplyRes.result && supplyRes.result > 0n) {
    try {
      const [cost] = await client.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, 10n ** 18n] });
      const sym = symbolRes.result ?? 'token';
      let priceStr = `\n💱 Current Price: ${fmt(cost)} ${reserveSym} per 1 ${sym}`;

      // Try to get USD price of reserve token via 1inch
      const reserveUsd = await getUsdPrice(reserveToken as Address);
      if (reserveUsd !== null) {
        const tokenUsd = (Number(cost) / 1e18) * reserveUsd;
        priceStr += ` (~$${tokenUsd < 0.01 ? tokenUsd.toExponential(2) : tokenUsd.toFixed(4)})`;

        // Show reserve balance in USD too
        const reserveBalUsd = (Number(reserveBalance) / 1e18) * reserveUsd;
        priceStr += `\n💵 Reserve Value: ~$${reserveBalUsd.toFixed(2)}`;

        // Market cap = supply * token price
        if (supplyRes.result) {
          const mcap = (Number(supplyRes.result) / 1e18) * tokenUsd;
          priceStr += `\n📊 Market Cap: ~$${mcap.toFixed(2)}`;
        }
      }
      console.log(priceStr);
    } catch { console.log('\n⚠️  Could not fetch current price'); }
  }
}
