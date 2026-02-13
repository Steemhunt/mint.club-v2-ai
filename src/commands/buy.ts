import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { getBondInfo, getMintCost } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';

export async function buy(
  token: Address,
  amount: string,
  maxCost: string | undefined,
  privateKey: `0x${string}`,
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
  );

  const tokensToMint = parse(amount);
  const bondInfo = await getBondInfo(publicClient, token);
  const tokenSymbol = await getSymbol(publicClient, token);

  console.log(`🛒 Buying ${amount} ${tokenSymbol}...`);

  // Get mint cost
  const { reserveAmount, royalty, totalCost } = await getMintCost(
    publicClient,
    token,
    tokensToMint,
  );

  console.log(
    `   Cost: ${bondInfo.formatReserve(reserveAmount)} + ${bondInfo.formatReserve(royalty)} royalty = ${bondInfo.formatReserve(totalCost)} ${bondInfo.reserveSymbol}`,
  );

  // Check max cost limit
  if (maxCost && totalCost > parse(maxCost)) {
    throw new Error(
      `Cost ${bondInfo.formatReserve(totalCost)} ${bondInfo.reserveSymbol} exceeds max ${maxCost}`,
    );
  }

  // Approve reserve token spending
  await ensureApproval(publicClient, walletClient, bondInfo.reserveToken, BOND, totalCost);

  // Execute mint transaction
  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: BOND,
      abi: BOND_ABI,
      functionName: 'mint',
      args: [token, tokensToMint, totalCost, account],
    },
    `Bought ${amount} ${tokenSymbol} for ${bondInfo.formatReserve(totalCost)} ${bondInfo.reserveSymbol}`,
  );
}