import { getPublicClient, getWalletClient } from '../client.js';
import { getBondAddress } from '../config/contracts.js';
import { MCV2_BOND_ABI } from '../abi/bond.js';
import { formatAmount, parseAmount, formatTxHash } from '../utils/format.js';
import type { SupportedChain } from '../config/chains.js';

export async function buyCommand(
  tokenAddress: string,
  amount: string,
  maxCost: string | undefined,
  chain: SupportedChain,
  privateKey: `0x${string}`
) {
  try {
    console.log(`🛒 Buying ${amount} tokens of ${tokenAddress} on ${chain}...`);
    
    const publicClient = getPublicClient(chain);
    const walletClient = getWalletClient(chain, privateKey);
    const bondAddress = getBondAddress(chain);
    
    const tokensToMint = parseAmount(amount);
    
    // Get the required reserve amount
    console.log('💰 Calculating required reserve amount...');
    const [reserveAmount, royalty] = await publicClient.readContract({
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'getReserveForToken',
      args: [tokenAddress as `0x${string}`, tokensToMint],
    });
    
    const totalCost = reserveAmount + royalty;
    console.log(`   Reserve needed: ${formatAmount(reserveAmount)}`);
    console.log(`   Royalty: ${formatAmount(royalty)}`);
    console.log(`   Total cost: ${formatAmount(totalCost)}`);
    
    // Check max cost if provided
    if (maxCost) {
      const maxCostWei = parseAmount(maxCost);
      if (totalCost > maxCostWei) {
        throw new Error(`Cost ${formatAmount(totalCost)} exceeds max cost ${formatAmount(maxCostWei)}`);
      }
    }
    
    // Simulate the transaction first
    console.log('🔍 Simulating transaction...');
    await publicClient.simulateContract({
      account: walletClient.account,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'mint',
      args: [
        tokenAddress as `0x${string}`,
        tokensToMint,
        totalCost, // Use total cost as max to ensure it doesn't revert
        walletClient.account!.address,
      ],
    });
    
    // Execute the transaction
    console.log('📤 Sending transaction...');
    const hash = await walletClient.writeContract({
      chain: walletClient.chain,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'mint',
      args: [
        tokenAddress as `0x${string}`,
        tokensToMint,
        totalCost,
        walletClient.account!.address,
      ],
    });
    
    console.log(`   Transaction hash: ${formatTxHash(hash)}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Transaction confirmed!');
      console.log(`   Bought: ${amount} tokens`);
      console.log(`   Cost: ${formatAmount(totalCost)} reserve tokens`);
      console.log(`   Block: ${receipt.blockNumber}`);
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}