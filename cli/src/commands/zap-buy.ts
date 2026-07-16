import { type Address, formatEther, parseEther } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getWethAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { parse } from '../utils/format';
import { getSymbol } from '../utils/symbol';
import { getBondInfo, getMintCost } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';
import { addSlippage, buildZapMintCall } from '../utils/zap-v1';

export async function zapBuy(
  token: Address,
  amount: string,
  maxCost: string | undefined,
  slippage: number,
  privateKey: `0x${string}`,
  chain: SupportedChain = 'base',
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
    chain,
  );

  const tokensToMint = parse(amount);
  const [tokenSymbol, bondInfo] = await Promise.all([
    getSymbol(publicClient, token, chain),
    getBondInfo(publicClient, token, chain),
  ]);

  if (
    bondInfo.reserveToken.toLowerCase() !==
    getWethAddress(chain).toLowerCase()
  ) {
    throw new Error(
      `Zap requires a WETH-reserve token; ${tokenSymbol} uses ${bondInfo.reserveSymbol}`,
    );
  }

  const { totalCost } = await getMintCost(
    publicClient,
    token,
    tokensToMint,
    chain,
  );
  const maxEthAmount = maxCost
    ? parseEther(maxCost)
    : addSlippage(totalCost, slippage);

  if (maxEthAmount < totalCost) {
    throw new Error(
      `Cost ${formatEther(totalCost)} ETH exceeds max ${formatEther(maxEthAmount)} ETH`,
    );
  }

  console.log(`⚡ Zap buying ${amount} ${tokenSymbol} with native ETH...`);
  console.log(`   Quote: ${formatEther(totalCost)} ETH`);
  console.log(`   Max cost: ${formatEther(maxEthAmount)} ETH`);

  await executeTransaction(
    publicClient,
    walletClient,
    token,
    buildZapMintCall({
      chain,
      token,
      tokensToMint,
      maxEthAmount,
      receiver: account,
    }),
    `Zap bought ${amount} ${tokenSymbol} for ${formatEther(totalCost)} ETH`,
    chain,
  );
}
