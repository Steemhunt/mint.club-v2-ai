import { type Address, formatUnits } from 'viem';
import { getPublicClient } from '../client';
import { BOND, TOKENS } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { ERC20_ABI } from '../abi/erc20';
import { getUsdPrice } from '../utils/price';

export async function price(token: Address) {
  const pub = getPublicClient();

  // Get token info + bond info
  const [symbolRes, supplyRes, bondRes] = await pub.multicall({
    contracts: [
      { address: token, abi: ERC20_ABI, functionName: 'symbol' },
      { address: token, abi: ERC20_ABI, functionName: 'totalSupply' },
      { address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] },
    ],
  });

  if (bondRes.status === 'failure') throw new Error('Not a Mint Club token');

  const symbol = symbolRes.result ?? 'Unknown';
  const supply = supplyRes.result ?? 0n;
  const [, , , , reserveToken, reserveBalance] = bondRes.result!;

  // Get reserve token info
  const knownReserve = TOKENS.find(t => t.address.toLowerCase() === (reserveToken as string).toLowerCase());
  let reserveSymbol = knownReserve?.symbol ?? 'RESERVE';
  let reserveDecimals = knownReserve?.decimals ?? 18;

  if (!knownReserve) {
    try {
      const [symRes, decRes] = await pub.multicall({
        contracts: [
          { address: reserveToken as Address, abi: ERC20_ABI, functionName: 'symbol' },
          { address: reserveToken as Address, abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const, functionName: 'decimals' },
        ],
      });
      if (symRes.status === 'success') reserveSymbol = symRes.result as string;
      if (decRes.status === 'success') reserveDecimals = decRes.result as number;
    } catch {}
  }

  console.log(`💱 ${symbol} (${token})\n`);

  if (supply === 0n) {
    console.log('   No supply yet — token has not been minted.');
    return;
  }

  // Price: cost of 1 token in reserve
  const [costFor1] = await pub.readContract({
    address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, 10n ** BigInt(18)],
  });

  const reservePriceStr = formatUnits(costFor1, reserveDecimals);
  console.log(`   Price: ${reservePriceStr} ${reserveSymbol}`);

  // USD value via 1inch
  const reserveUsd = await getUsdPrice(reserveToken as Address);
  if (reserveUsd !== null) {
    const tokenUsd = (Number(costFor1) / 10 ** reserveDecimals) * reserveUsd;
    const fmtUsd = (v: number) => v < 0.01 ? v.toExponential(2) : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

    console.log(`   Price (USD): $${fmtUsd(tokenUsd)}`);
    console.log(`   Reserve: ${formatUnits(reserveBalance, reserveDecimals)} ${reserveSymbol} (~$${fmtUsd((Number(reserveBalance) / 10 ** reserveDecimals) * reserveUsd)})`);

    const mcap = (Number(supply) / 1e18) * tokenUsd;
    console.log(`   Market Cap: ~$${fmtUsd(mcap)}`);
  } else {
    console.log(`   Reserve: ${formatUnits(reserveBalance, reserveDecimals)} ${reserveSymbol}`);
    console.log(`   ⚠️  Could not fetch USD price for reserve token`);
  }
}
