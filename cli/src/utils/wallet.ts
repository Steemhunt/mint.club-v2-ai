import { type Address, type PublicClient, formatUnits } from 'viem';
import { ERC20_ABI } from '../abi/erc20';
import { BOND_ABI } from '../abi/bond';
import { TOKENS, WETH, BOND } from '../config/contracts';
import { getUsdPrice } from './price';
import { getTokenPrice } from './bond';
import { loadTokens } from './tokens';

export interface WalletBalance {
  token: Address;
  symbol: string;
  balance: bigint;
  decimals: number;
  usdValue?: number;
}

export interface BalanceSummary {
  ethBalance: WalletBalance;
  erc20Balances: WalletBalance[];
  mcTokenBalances: WalletBalance[];
  totalUsd: number;
}

/**
 * Format USD values for display
 */
function formatUsd(value: number): string {
  if (value < 0.01) {
    return value.toExponential(2);
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/**
 * Get all wallet balances including ETH, ERC20s, and Mint Club tokens
 */
export async function getWalletBalances(
  client: PublicClient,
  address: Address,
): Promise<BalanceSummary> {
  let totalUsd = 0;

  // Get ETH balance
  const ethBalance = await client.getBalance({ address });
  const ethUsd = await getUsdPrice(WETH);
  const ethVal = Number(formatUnits(ethBalance, 18));
  const ethUsdVal = ethUsd !== null ? ethVal * ethUsd : undefined;
  if (ethUsdVal !== undefined) totalUsd += ethUsdVal;

  const ethBalanceInfo: WalletBalance = {
    token: '0x0000000000000000000000000000000000000000' as Address,
    symbol: 'ETH',
    balance: ethBalance,
    decimals: 18,
    usdValue: ethUsdVal,
  };

  // Get ERC20 token balances
  const erc20Tokens = TOKENS.filter(t => t.symbol !== 'ETH');
  const erc20Results = await client.multicall({
    contracts: erc20Tokens.map(t => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    })),
  });

  const erc20Balances: WalletBalance[] = [];
  for (let i = 0; i < erc20Tokens.length; i++) {
    const balance = erc20Results[i].status === 'success' ? erc20Results[i].result as bigint : 0n;
    if (balance > 0n) {
      const token = erc20Tokens[i];
      const amount = Number(formatUnits(balance, token.decimals));
      const tokenUsd = await getUsdPrice(token.address);
      const usdVal = tokenUsd !== null ? amount * tokenUsd : undefined;
      if (usdVal !== undefined) totalUsd += usdVal;

      erc20Balances.push({
        token: token.address,
        symbol: token.symbol,
        balance,
        decimals: token.decimals,
        usdValue: usdVal,
      });
    }
  }

  // Get Mint Club token balances
  const savedTokens = loadTokens();
  const knownAddrs = new Set(TOKENS.map(t => t.address.toLowerCase()));
  const mcTokenAddrs = savedTokens.filter(t => !knownAddrs.has(t.toLowerCase()));

  const mcTokenBalances: WalletBalance[] = [];
  if (mcTokenAddrs.length > 0) {
    // Batch: balanceOf + symbol + tokenBond for each
    const mcResults = await client.multicall({
      contracts: mcTokenAddrs.flatMap(t => [
        { address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] },
        { address: t, abi: ERC20_ABI, functionName: 'symbol' },
        { address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [t] },
      ]),
    });

    for (let i = 0; i < mcTokenAddrs.length; i++) {
      const balance = mcResults[i * 3].status === 'success' ? mcResults[i * 3].result as bigint : 0n;
      if (balance === 0n) continue;

      const symbol = mcResults[i * 3 + 1].status === 'success' 
        ? mcResults[i * 3 + 1].result as string 
        : mcTokenAddrs[i].slice(0, 10);

      let usdValue: number | undefined;

      // Try to get USD price via bond + 1inch
      if (mcResults[i * 3 + 2].status === 'success') {
        try {
          const [, , , , reserveToken] = mcResults[i * 3 + 2].result as any;
          const tokenPrice = await getTokenPrice(client, mcTokenAddrs[i] as Address);
          const reserveUsd = await getUsdPrice(reserveToken);
          
          if (reserveUsd !== null) {
            const reserveDecimals = TOKENS.find(t => 
              t.address.toLowerCase() === reserveToken.toLowerCase()
            )?.decimals ?? 18;
            const tokenUsd = (Number(tokenPrice) / 10 ** reserveDecimals) * reserveUsd;
            const val = (Number(balance) / 1e18) * tokenUsd;
            totalUsd += val;
            usdValue = val;
          }
        } catch {
          // Ignore pricing errors
        }
      }

      mcTokenBalances.push({
        token: mcTokenAddrs[i] as Address,
        symbol,
        balance,
        decimals: 18,
        usdValue,
      });
    }
  }

  return {
    ethBalance: ethBalanceInfo,
    erc20Balances,
    mcTokenBalances,
    totalUsd,
  };
}

/**
 * Display wallet balances in a formatted way
 */
export function displayWalletBalances(balances: BalanceSummary): void {
  const { ethBalance, erc20Balances, mcTokenBalances, totalUsd } = balances;

  console.log(`💰 Balances on Base:\n`);

  // ETH balance
  const ethDisplay = formatUnits(ethBalance.balance, ethBalance.decimals);
  const ethUsdDisplay = ethBalance.usdValue !== undefined 
    ? ` (~$${formatUsd(ethBalance.usdValue)})` 
    : '';
  console.log(`   ${ethBalance.symbol}: ${ethDisplay}${ethUsdDisplay}`);

  // ERC20 balances
  for (const balance of erc20Balances) {
    const display = formatUnits(balance.balance, balance.decimals);
    const usdDisplay = balance.usdValue !== undefined 
      ? ` (~$${formatUsd(balance.usdValue)})` 
      : '';
    console.log(`   ${balance.symbol}: ${display}${usdDisplay}`);
  }

  // Mint Club token balances
  if (mcTokenBalances.length > 0) {
    console.log(`\n🪙 Mint Club Tokens:\n`);
    
    for (const balance of mcTokenBalances) {
      const display = formatUnits(balance.balance, balance.decimals);
      const usdDisplay = balance.usdValue !== undefined 
        ? ` (~$${formatUsd(balance.usdValue)})` 
        : '';
      console.log(`   ${balance.symbol}: ${display}${usdDisplay}`);
    }
  }

  // Total USD value
  if (totalUsd > 0) {
    console.log(`\n💵 Total: ~$${formatUsd(totalUsd)}`);
  }
}