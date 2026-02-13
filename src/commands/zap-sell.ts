import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getZapV2Address, getBondAddress } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash } from '../utils/format';
import { encodeV3Path, encodeV3SwapInput, V3_SWAP_COMMAND, parsePath } from '../utils/swap';
import type { SupportedChain } from '../config/chains';

export async function zapSell(
  token: Address, amount: string, outputToken: Address,
  minOutput: string | undefined, pathStr: string,
  chain: SupportedChain, privateKey: `0x${string}`,
) {
  const zapV2 = getZapV2Address(chain);
  if (!zapV2) throw new Error(`ZapV2 not available on ${chain} (Base only)`);

  const pub = getPublicClient(chain);
  const wallet = getWalletClient(chain, privateKey);
  const bond = getBondAddress(chain);
  const account = wallet.account;

  const tokensToBurn = parse(amount);
  const minOut = minOutput ? parse(minOutput) : 0n;

  const { tokens, fees } = parsePath(pathStr);
  console.log(`⚡ Zap selling ${amount} tokens of ${token} for ${outputToken} on ${chain}`);
  console.log(`   Path: ${tokens.map(t => t.slice(0, 8)).join(' → ')} (fees: ${fees.join(',')})`);

  // Get the expected burn refund to use as exact amountIn for the swap
  const [refundAmount] = await pub.readContract({
    address: bond, abi: BOND_ABI, functionName: 'getRefundForTokens',
    args: [token, tokensToBurn],
  });

  const path = encodeV3Path(tokens, fees);
  // Recipient = zapV2 (contract measures balance delta, then forwards to receiver)
  const swapInput = encodeV3SwapInput(zapV2, refundAmount, minOut, path);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const args = [token, tokensToBurn, outputToken, minOut, V3_SWAP_COMMAND, [swapInput], deadline, account.address] as const;
  const { result } = await pub.simulateContract({
    account, address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapBurn', args,
  });

  console.log(`   Expected output: ${fmt(result[0])} | Reserve from burn: ${fmt(result[1])}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({
    address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapBurn', args,
  });
  console.log(`   TX: ${shortHash(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`✅ Zap sold ${amount} tokens for ${fmt(result[0])} output (block ${receipt.blockNumber})`);
  } else {
    throw new Error('Transaction failed');
  }
}
