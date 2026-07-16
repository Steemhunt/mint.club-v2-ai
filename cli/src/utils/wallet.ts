import { type Address, type PublicClient, formatUnits } from 'viem';
import { ERC20_ABI } from '../abi/erc20';
import { ERC1155_BALANCE_ABI } from '../abi/erc1155';
import { BOND_ABI } from '../abi/bond';
import {
  getBondAddress,
  getNativeToken,
  getTokens,
  getWrappedNativeAddress,
} from '../config/contracts';
import { CHAIN_CONFIGS, type SupportedChain } from '../config/chains';
import { getUsdPrice } from './price';
import { getTokenPrice } from './bond';
import { getDecimals } from './symbol';
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
  chain: SupportedChain = 'base',
): Promise<BalanceSummary> {
  let totalUsd = 0;
  const knownTokens = getTokens(chain);
  const bond = getBondAddress(chain);

  // Get native-currency balance
  const nativeToken = getNativeToken(chain);
  const ethBalance = await client.getBalance({ address });
  const ethUsd = await getUsdPrice(getWrappedNativeAddress(chain), chain);
  const ethVal = Number(formatUnits(ethBalance, 18));
  const ethUsdVal = ethUsd !== null ? ethVal * ethUsd : undefined;
  if (ethUsdVal !== undefined) totalUsd += ethUsdVal;

  const ethBalanceInfo: WalletBalance = {
    token: nativeToken.address,
    symbol: nativeToken.symbol,
    balance: ethBalance,
    decimals: nativeToken.decimals,
    usdValue: ethUsdVal,
  };

  // Get ERC20 token balances
  const erc20Tokens = knownTokens.filter(
    (token) => token.address.toLowerCase() !== nativeToken.address.toLowerCase(),
  );
  const erc20Results = await client.multicall({
    contracts: erc20Tokens.map((token) => ({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    })),
  });

  const erc20Balances: WalletBalance[] = [];
  for (let i = 0; i < erc20Tokens.length; i++) {
    const balance =
      erc20Results[i].status === 'success'
        ? (erc20Results[i].result as bigint)
        : 0n;
    if (balance > 0n) {
      const token = erc20Tokens[i];
      const amount = Number(formatUnits(balance, token.decimals));
      const tokenUsd = await getUsdPrice(token.address, chain);
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
  const savedTokens = loadTokens(chain);
  const knownAddrs = new Set(
    knownTokens.map((token) => token.address.toLowerCase()),
  );
  const mcTokenAddrs = savedTokens.filter(
    (token) => !knownAddrs.has(token.toLowerCase()),
  );

  const mcTokenBalances: WalletBalance[] = [];
  if (mcTokenAddrs.length > 0) {
    const fieldsPerToken = 5;
    // Both balance selectors are attempted so ERC-20 and ERC-1155 metadata stays
    // in one multicall. The incompatible selector fails without failing the batch.
    const mcResults = await client.multicall({
      contracts: mcTokenAddrs.flatMap((token) => [
        { address: token, abi: ERC20_ABI, functionName: 'decimals' },
        {
          address: token,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        },
        {
          address: token,
          abi: ERC1155_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address, 0n],
        },
        { address: token, abi: ERC20_ABI, functionName: 'symbol' },
        {
          address: bond,
          abi: BOND_ABI,
          functionName: 'tokenBond',
          args: [token],
        },
      ]),
    });

    for (let i = 0; i < mcTokenAddrs.length; i++) {
      const offset = i * fieldsPerToken;
      const decimals =
        mcResults[offset].status === 'success'
          ? Number(mcResults[offset].result)
          : 18;
      const balanceResult = mcResults[offset + (decimals === 0 ? 2 : 1)];
      const balance =
        balanceResult.status === 'success'
          ? (balanceResult.result as bigint)
          : 0n;
      if (balance === 0n) continue;

      const symbol =
        mcResults[offset + 3].status === 'success'
          ? (mcResults[offset + 3].result as string)
          : mcTokenAddrs[i].slice(0, 10);

      let usdValue: number | undefined;

      // Try to get USD price via bond + chain-specific DefiLlama feed
      if (mcResults[offset + 4].status === 'success') {
        try {
          const bondData = mcResults[offset + 4].result as unknown as readonly [
            Address,
            number,
            number,
            number,
            Address,
            bigint,
          ];
          const reserveToken = bondData[4];
          const tokenPrice = await getTokenPrice(
            client,
            mcTokenAddrs[i] as Address,
            chain,
            decimals,
          );
          const reserveUsd = await getUsdPrice(reserveToken, chain);

          if (reserveUsd !== null) {
            const reserveDecimals = await getDecimals(
              client,
              reserveToken,
              chain,
            );
            const tokenUsd =
              (Number(tokenPrice) / 10 ** reserveDecimals) * reserveUsd;
            const val = (Number(balance) / 10 ** decimals) * tokenUsd;
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
        decimals,
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
export function displayWalletBalances(
  balances: BalanceSummary,
  chain: SupportedChain = 'base',
): void {
  const { ethBalance, erc20Balances, mcTokenBalances, totalUsd } = balances;

  console.log(`💰 Balances on ${CHAIN_CONFIGS[chain].chain.name}:\n`);

  // ETH balance
  const ethDisplay = formatUnits(ethBalance.balance, ethBalance.decimals);
  const ethUsdDisplay =
    ethBalance.usdValue !== undefined
      ? ` (~$${formatUsd(ethBalance.usdValue)})`
      : '';
  console.log(`   ${ethBalance.symbol}: ${ethDisplay}${ethUsdDisplay}`);

  // ERC20 balances
  for (const balance of erc20Balances) {
    const display = formatUnits(balance.balance, balance.decimals);
    const usdDisplay =
      balance.usdValue !== undefined
        ? ` (~$${formatUsd(balance.usdValue)})`
        : '';
    console.log(`   ${balance.symbol}: ${display}${usdDisplay}`);
  }

  // Mint Club token balances
  if (mcTokenBalances.length > 0) {
    console.log('\n🪙 Mint Club Tokens:\n');

    for (const balance of mcTokenBalances) {
      const display = formatUnits(balance.balance, balance.decimals);
      const usdDisplay =
        balance.usdValue !== undefined
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
