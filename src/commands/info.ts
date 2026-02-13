import { type Address } from 'viem';
import { getPublicClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { ERC20_ABI } from '../abi/erc20';
import { fmt, printTokenInfo } from '../utils/format';

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
  const [creator, mintRoyalty, burnRoyalty, createdAt, reserveToken, reserveBalance] = bondRes.result!;
  printTokenInfo({
    name: nameRes.result ?? 'Unknown', symbol: symbolRes.result ?? 'Unknown', address: token,
    creator, reserveToken, reserveBalance, currentSupply: supplyRes.result ?? 0n, maxSupply: maxRes.result ?? 0n,
    mintRoyalty, burnRoyalty, createdAt: Number(createdAt), steps: stepsRes.result ?? [],
  });
  if (supplyRes.result && supplyRes.result > 0n) {
    try {
      const [cost] = await client.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, 10n ** 18n] });
      console.log(`\n💱 Current Price: ${fmt(cost)} reserve per 1 ${symbolRes.result ?? 'token'}`);
    } catch { console.log('\n⚠️  Could not fetch current price'); }
  }
}
