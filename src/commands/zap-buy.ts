import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getZapV2Address } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { fmt, parse, shortHash } from '../utils/format';
import { encodeV3Path, encodeV3SwapInput, V3_SWAP_COMMAND, parsePath } from '../utils/swap';
import type { SupportedChain } from '../config/chains';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export async function zapBuy(
  token: Address, inputToken: Address, inputAmount: string,
  minTokens: string | undefined, pathStr: string,
  chain: SupportedChain, privateKey: `0x${string}`,
) {
  const zapV2 = getZapV2Address(chain);
  if (!zapV2) throw new Error(`ZapV2 not available on ${chain} (Base only)`);

  const pub = getPublicClient(chain);
  const wallet = getWalletClient(chain, privateKey);
  const account = wallet.account;

  const amountIn = parse(inputAmount);
  const minOut = minTokens ? parse(minTokens) : 0n;
  const isETH = inputToken.toLowerCase() === ZERO_ADDR;

  const { tokens, fees } = parsePath(pathStr);
  console.log(`⚡ Zap buying ${token} with ${inputAmount} of ${inputToken} on ${chain}`);
  console.log(`   Path: ${tokens.map(t => t.slice(0, 8)).join(' → ')} (fees: ${fees.join(',')})`);

  const path = encodeV3Path(tokens, fees);
  const swapInput = encodeV3SwapInput(zapV2, amountIn, 0n, path);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const args = [token, inputToken, amountIn, minOut, V3_SWAP_COMMAND, [swapInput], deadline, account.address] as const;
  const { result } = await pub.simulateContract({
    account, address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });

  console.log(`   Expected: ${fmt(result[0])} tokens | Reserve used: ${fmt(result[1])}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({
    address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });
  console.log(`   TX: ${shortHash(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`✅ Zap bought ${fmt(result[0])} tokens (block ${receipt.blockNumber})`);
  } else {
    throw new Error('Transaction failed');
  }
}
