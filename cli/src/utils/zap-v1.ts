import type { Address } from 'viem';
import { ZAP_ABI } from '../abi/zap';
import { getZapAddress } from '../config/contracts';
import type { SupportedChain } from '../config/chains';

function slippageBasisPoints(percent: number): bigint {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Slippage must be between 0 and 100');
  }
  return BigInt(Math.round(percent * 100));
}

export function addSlippage(amount: bigint, percent: number): bigint {
  const basisPoints = slippageBasisPoints(percent);
  const adjustment = (amount * basisPoints + 9_999n) / 10_000n;
  return amount + adjustment;
}

export function subtractSlippage(amount: bigint, percent: number): bigint {
  const basisPoints = slippageBasisPoints(percent);
  return amount - (amount * basisPoints) / 10_000n;
}

export type ZapMintCallParams = {
  chain: SupportedChain;
  token: Address;
  tokensToMint: bigint;
  maxEthAmount: bigint;
  receiver: Address;
};

export function buildZapMintCall(params: ZapMintCallParams) {
  const { chain, token, tokensToMint, maxEthAmount, receiver } = params;
  return {
    address: getZapAddress(chain),
    abi: ZAP_ABI,
    functionName: 'mintWithEth' as const,
    args: [token, tokensToMint, receiver] as const,
    value: maxEthAmount,
  };
}

export type ZapBurnCallParams = {
  chain: SupportedChain;
  token: Address;
  tokensToBurn: bigint;
  minEthRefund: bigint;
  receiver: Address;
};

export function buildZapBurnCall(params: ZapBurnCallParams) {
  const { chain, token, tokensToBurn, minEthRefund, receiver } = params;
  return {
    address: getZapAddress(chain),
    abi: ZAP_ABI,
    functionName: 'burnToEth' as const,
    args: [token, tokensToBurn, minEthRefund, receiver] as const,
  };
}
