import { type Address, formatEther, parseEther } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getWethAddress, getZapAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';
import { parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { getBondInfo, getBurnRefund } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';
import { buildZapBurnCall, subtractSlippage } from '../utils/zap-v1';

export async function zapSell(
  token: Address,
  amount: string,
  minRefund: string | undefined,
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

  const tokensToBurn = parse(amount);
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

  const { netRefund } = await getBurnRefund(
    publicClient,
    token,
    tokensToBurn,
    chain,
  );
  const minEthRefund = minRefund
    ? parseEther(minRefund)
    : subtractSlippage(netRefund, slippage);

  if (minEthRefund > netRefund) {
    throw new Error(
      `Refund ${formatEther(netRefund)} ETH is below minimum ${formatEther(minEthRefund)} ETH`,
    );
  }

  console.log(`⚡ Zap selling ${amount} ${tokenSymbol} for native ETH...`);
  console.log(`   Quote: ${formatEther(netRefund)} ETH`);
  console.log(`   Min refund: ${formatEther(minEthRefund)} ETH`);

  await ensureApproval(
    publicClient,
    walletClient,
    token,
    getZapAddress(chain),
    tokensToBurn,
  );

  await executeTransaction(
    publicClient,
    walletClient,
    token,
    buildZapBurnCall({
      chain,
      token,
      tokensToBurn,
      minEthRefund,
      receiver: account,
    }),
    `Zap sold ${amount} ${tokenSymbol} for ${formatEther(netRefund)} ETH`,
    chain,
  );
}
