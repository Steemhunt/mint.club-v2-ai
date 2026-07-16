import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { BOND_ABI } from '../abi/bond';
import { parseTokenAmount } from '../utils/format';
import { ensureApproval, ensureERC1155Approval } from '../utils/approve';
import { getDecimals, getSymbol } from '../utils/symbol';
import {
  getBondInfo,
  getBurnRefund,
  resolveBurnLimit,
} from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';

export async function sell(
  token: Address,
  amount: string,
  minRefund: string | undefined,
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
  const tokensToBurn = parseTokenAmount(amount, tokenDecimals);

  console.log(`🔥 Selling ${amount} ${tokenSymbol}...`);

  const { royalty, netRefund } = await getBurnRefund(
    publicClient,
    token,
    tokensToBurn,
    chain,
  );
  const grossRefund = netRefund + royalty;

  console.log(
    `   Refund: ${bondInfo.formatReserve(grossRefund)} - ${bondInfo.formatReserve(royalty)} royalty = ${bondInfo.formatReserve(netRefund)} ${bondInfo.reserveSymbol}`,
  );

  const minRef = resolveBurnLimit(
    netRefund,
    minRefund,
    bondInfo.reserveDecimals,
  );
  if (minRef < netRefund) {
    console.log(
      `   Min refund: ${bondInfo.formatReserve(minRef)} ${bondInfo.reserveSymbol}`,
    );
  }

  if (tokenDecimals === 0) {
    await ensureERC1155Approval(publicClient, walletClient, token, bond);
  } else {
    await ensureApproval(publicClient, walletClient, token, bond, tokensToBurn);
  }

  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: bond,
      abi: BOND_ABI,
      functionName: 'burn',
      args: [token, tokensToBurn, minRef, account],
    },
    `Sold ${amount} ${tokenSymbol} for ${bondInfo.formatReserve(netRefund)} ${bondInfo.reserveSymbol}`,
    chain,
  );
}
