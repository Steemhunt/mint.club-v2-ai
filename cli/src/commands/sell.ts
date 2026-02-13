import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { getBondInfo, getBurnRefund } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';

export async function sell(
  token: Address,
  amount: string,
  minRefund: string | undefined,
  privateKey: `0x${string}`,
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
  );

  const tokensToBurn = parse(amount);
  const bondInfo = await getBondInfo(publicClient, token);
  const tokenSymbol = await getSymbol(publicClient, token);

  console.log(`🔥 Selling ${amount} ${tokenSymbol}...`);

  // Get burn refund
  const { refundAmount, royalty, netRefund } = await getBurnRefund(
    publicClient,
    token,
    tokensToBurn,
  );

  console.log(
    `   Refund: ${bondInfo.formatReserve(refundAmount)} - ${bondInfo.formatReserve(royalty)} royalty = ${bondInfo.formatReserve(netRefund)} ${bondInfo.reserveSymbol}`,
  );

  // Check minimum refund
  if (minRefund && netRefund < parse(minRefund)) {
    throw new Error(
      `Refund ${bondInfo.formatReserve(netRefund)} ${bondInfo.reserveSymbol} below minimum ${minRefund}`,
    );
  }

  const minRef = minRefund ? parse(minRefund) : 0n;
  
  // Approve token burning
  await ensureApproval(publicClient, walletClient, token, BOND, tokensToBurn);

  // Execute burn transaction
  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: BOND,
      abi: BOND_ABI,
      functionName: 'burn',
      args: [token, tokensToBurn, minRef, account],
    },
    `Sold ${amount} ${tokenSymbol} for ${bondInfo.formatReserve(netRefund)} ${bondInfo.reserveSymbol}`,
  );
}