import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { BOND_ABI } from '../abi/bond';
import { parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
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

  const tokensToBurn = parse(amount);
  const bondInfo = await getBondInfo(publicClient, token, chain);
  const tokenSymbol = await getSymbol(publicClient, token, chain);

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

  await ensureApproval(publicClient, walletClient, token, bond, tokensToBurn);

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
