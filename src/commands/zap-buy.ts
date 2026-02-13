import { getPublicClient, getWalletClient } from '../client.js';
import { getZapV2Address, isZapV2Supported } from '../config/contracts.js';
import { MCV2_ZAP_V2_ABI } from '../abi/zap-v2.js';
import { formatAmount, parseAmount, formatTxHash } from '../utils/format.js';
import { encodeV3SwapPath, encodeV3SwapInput, createSwapCommands, parseSwapPath } from '../utils/swap.js';
import type { SupportedChain } from '../config/chains.js';

export async function zapBuyCommand(
  tokenAddress: string,
  inputToken: string,
  inputAmount: string,
  minTokens: string | undefined,
  path: string,
  chain: SupportedChain,
  privateKey: `0x${string}`
) {
  try {
    if (!isZapV2Supported(chain)) {
      throw new Error(`ZapV2 is not supported on ${chain}. Currently only available on Base.`);
    }
    
    console.log(`⚡ Zap buying ${tokenAddress} with ${inputAmount} ${inputToken} on ${chain}...`);
    
    const publicClient = getPublicClient(chain);
    const walletClient = getWalletClient(chain, privateKey);
    const zapV2Address = getZapV2Address(chain);
    
    if (!zapV2Address) {
      throw new Error('ZapV2 contract not available on this chain');
    }
    
    const inputAmountWei = parseAmount(inputAmount);
    const minTokensOut = minTokens ? parseAmount(minTokens) : 0n;
    
    // Parse swap path
    const { tokens, fees } = parseSwapPath(path);
    console.log(`   Input: ${inputAmount} ${inputToken}`);
    console.log(`   Path: ${tokens.join(' -> ')} (fees: ${fees.join(', ')})`);
    console.log(`   Min tokens out: ${minTokens || '0'}`);
    
    // Encode swap path and commands
    const swapPath = encodeV3SwapPath(tokens, fees);
    const commands = createSwapCommands();
    
    const swapInput = encodeV3SwapInput(
      zapV2Address, // recipient (ZapV2 contract)
      inputAmountWei,
      0n, // amountOutMin for swap (we'll enforce minTokensOut at the zap level)
      swapPath,
      false // payerIsUser = false (ZapV2 handles token transfers)
    );
    
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes from now
    
    // Check if input token is ETH (0x0000000000000000000000000000000000000000)
    const isETH = inputToken.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
                  inputToken.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    console.log('🔍 Simulating zap transaction...');
    const { result } = await publicClient.simulateContract({
      account: walletClient.account,
      address: zapV2Address,
      abi: MCV2_ZAP_V2_ABI,
      functionName: 'zapMint',
      args: [
        tokenAddress as `0x${string}`,
        inputToken as `0x${string}`,
        inputAmountWei,
        minTokensOut,
        commands,
        [swapInput],
        deadline,
        walletClient.account!.address,
      ],
      value: isETH ? inputAmountWei : 0n,
    });
    
    console.log(`   Expected tokens received: ${formatAmount(result[0])}`);
    console.log(`   Reserve tokens used: ${formatAmount(result[1])}`);
    
    // Execute the transaction
    console.log('📤 Sending transaction...');
    const hash = await walletClient.writeContract({
      chain: walletClient.chain,
      address: zapV2Address,
      abi: MCV2_ZAP_V2_ABI,
      functionName: 'zapMint',
      args: [
        tokenAddress as `0x${string}`,
        inputToken as `0x${string}`,
        inputAmountWei,
        minTokensOut,
        commands,
        [swapInput],
        deadline,
        walletClient.account!.address,
      ],
      value: isETH ? inputAmountWei : 0n,
    });
    
    console.log(`   Transaction hash: ${formatTxHash(hash)}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Zap transaction confirmed!');
      console.log(`   Input: ${inputAmount} ${inputToken}`);
      console.log(`   Tokens received: ${formatAmount(result[0])}`);
      console.log(`   Block: ${receipt.blockNumber}`);
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}