import { getPublicClient, getWalletClient } from '../client.js';
import { getZapV2Address, isZapV2Supported } from '../config/contracts.js';
import { MCV2_ZAP_V2_ABI } from '../abi/zap-v2.js';
import { formatAmount, parseAmount, formatTxHash } from '../utils/format.js';
import { encodeV3SwapPath, encodeV3SwapInput, createSwapCommands, parseSwapPath } from '../utils/swap.js';
import type { SupportedChain } from '../config/chains.js';

export async function zapSellCommand(
  tokenAddress: string,
  amount: string,
  outputToken: string,
  minOutput: string | undefined,
  path: string,
  chain: SupportedChain,
  privateKey: `0x${string}`
) {
  try {
    if (!isZapV2Supported(chain)) {
      throw new Error(`ZapV2 is not supported on ${chain}. Currently only available on Base.`);
    }
    
    console.log(`⚡ Zap selling ${amount} tokens of ${tokenAddress} for ${outputToken} on ${chain}...`);
    
    const publicClient = getPublicClient(chain);
    const walletClient = getWalletClient(chain, privateKey);
    const zapV2Address = getZapV2Address(chain);
    
    if (!zapV2Address) {
      throw new Error('ZapV2 contract not available on this chain');
    }
    
    const tokensToBurn = parseAmount(amount);
    const minOutputAmount = minOutput ? parseAmount(minOutput) : 0n;
    
    // Parse swap path (reverse direction for selling)
    const { tokens, fees } = parseSwapPath(path);
    console.log(`   Selling: ${amount} tokens`);
    console.log(`   Path: ${tokens.join(' -> ')} (fees: ${fees.join(', ')})`);
    console.log(`   Min output: ${minOutput || '0'} ${outputToken}`);
    
    // For selling, we typically want to go from reserve token to output token
    // So the path should start with reserve token and end with output token
    const swapPath = encodeV3SwapPath(tokens, fees);
    const commands = createSwapCommands();
    
    const swapInput = encodeV3SwapInput(
      walletClient.account!.address, // recipient (user gets the output tokens)
      0n, // amountIn will be determined by ZapV2 based on burn proceeds
      minOutputAmount,
      swapPath,
      false // payerIsUser = false (ZapV2 handles token transfers)
    );
    
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes from now
    
    console.log('🔍 Simulating zap transaction...');
    const { result } = await publicClient.simulateContract({
      account: walletClient.account,
      address: zapV2Address,
      abi: MCV2_ZAP_V2_ABI,
      functionName: 'zapBurn',
      args: [
        tokenAddress as `0x${string}`,
        tokensToBurn,
        outputToken as `0x${string}`,
        minOutputAmount,
        commands,
        [swapInput],
        deadline,
        walletClient.account!.address,
      ],
    });
    
    console.log(`   Expected output amount: ${formatAmount(result[0])}`);
    console.log(`   Reserve tokens received from burn: ${formatAmount(result[1])}`);
    
    // Execute the transaction
    console.log('📤 Sending transaction...');
    const hash = await walletClient.writeContract({
      chain: walletClient.chain,
      address: zapV2Address,
      abi: MCV2_ZAP_V2_ABI,
      functionName: 'zapBurn',
      args: [
        tokenAddress as `0x${string}`,
        tokensToBurn,
        outputToken as `0x${string}`,
        minOutputAmount,
        commands,
        [swapInput],
        deadline,
        walletClient.account!.address,
      ],
    });
    
    console.log(`   Transaction hash: ${formatTxHash(hash)}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Zap transaction confirmed!');
      console.log(`   Burned: ${amount} tokens`);
      console.log(`   Output received: ${formatAmount(result[0])} ${outputToken}`);
      console.log(`   Block: ${receipt.blockNumber}`);
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}