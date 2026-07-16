import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { BOND_ABI } from '../abi/bond';
import { parseTokenAmount } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getDecimals, getSymbol } from '../utils/symbol';
import {
  getBondInfo,
  getMintCost,
  resolveMintLimit,
} from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';

export async function buy(
  token: Address,
  amount: string,
  maxCost: string | undefined,
  privateKey: `0x${string}`,
  chain: SupportedChain = 'base',
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
    chain,
  );
  const bond = getBondAddress(chain);

  const [bondInfo, tokenDecimals, tokenSymbol] = await Promise.all([
    getBondInfo(publicClient, token, chain),
    getDecimals(publicClient, token, chain),
    getSymbol(publicClient, token, chain),
  ]);
  const tokensToMint = parseTokenAmount(amount, tokenDecimals);

  console.log(`🛒 Buying ${amount} ${tokenSymbol}...`);

  const { royalty, totalCost } = await getMintCost(
    publicClient,
    token,
    tokensToMint,
    chain,
  );
  const baseCost = totalCost - royalty;

  console.log(
    `   Cost: ${bondInfo.formatReserve(baseCost)} + ${bondInfo.formatReserve(royalty)} royalty = ${bondInfo.formatReserve(totalCost)} ${bondInfo.reserveSymbol}`,
  );

  const maxReserveAmount = resolveMintLimit(
    totalCost,
    maxCost,
    bondInfo.reserveDecimals,
  );
  if (maxReserveAmount > totalCost) {
    console.log(
      `   Max cost: ${bondInfo.formatReserve(maxReserveAmount)} ${bondInfo.reserveSymbol}`,
    );
  }

  await ensureApproval(
    publicClient,
    walletClient,
    bondInfo.reserveToken,
    bond,
    maxReserveAmount,
  );

  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: bond,
      abi: BOND_ABI,
      functionName: 'mint',
      args: [token, tokensToMint, maxReserveAmount, account],
    },
    `Bought ${amount} ${tokenSymbol} for ${bondInfo.formatReserve(totalCost)} ${bondInfo.reserveSymbol}`,
    chain,
  );
}
