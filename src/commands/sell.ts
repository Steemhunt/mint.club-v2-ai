import { getPublicClient, getWalletClient } from '../client.js';
import { getBondAddress } from '../config/contracts.js';
import { MCV2_BOND_ABI } from '../abi/bond.js';
import { formatAmount, parseAmount, formatTxHash } from '../utils/format.js';
import type { SupportedChain } from '../config/chains.js';

export async function sellCommand(
  tokenAddress: string,
  amount: string,
  minRefund: string | undefined,
  chain: SupportedChain,
  privateKey: `0x${string}`
) {
  try {
    console.log(`🔥 Selling ${amount} tokens of ${tokenAddress} on ${chain}...`);
    
    const publicClient = getPublicClient(chain);
    const walletClient = getWalletClient(chain, privateKey);
    const bondAddress = getBondAddress(chain);
    
    const tokensToBurn = parseAmount(amount);
    
    // Get the expected refund amount
    console.log('💰 Calculating refund amount...');
    const [refundAmount, royalty] = await publicClient.readContract({
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'getRefundForTokens',
      args: [tokenAddress as `0x${string}`, tokensToBurn],
    });
    
    const netRefund = BigInt(refundAmount) - BigInt(royalty);
    console.log(`   Gross refund: ${formatAmount(BigInt(refundAmount))}`);
    console.log(`   Royalty: ${formatAmount(BigInt(royalty))}`);
    console.log(`   Net refund: ${formatAmount(netRefund)}`);
    
    // Check min refund if provided
    if (minRefund) {
      const minRefundWei = parseAmount(minRefund);
      if (netRefund < minRefundWei) {
        throw new Error(`Refund ${formatAmount(netRefund)} is below minimum ${formatAmount(minRefundWei)}`);
      }
    }
    
    // Simulate the transaction first
    console.log('🔍 Simulating transaction...');
    await publicClient.simulateContract({
      account: walletClient.account,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'burn',
      args: [
        tokenAddress as `0x${string}`,
        tokensToBurn,
        minRefund ? parseAmount(minRefund) : 0n,
        walletClient.account!.address,
      ],
    });
    
    // Execute the transaction
    console.log('📤 Sending transaction...');
    const hash = await walletClient.writeContract({
      chain: walletClient.chain,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'burn',
      args: [
        tokenAddress as `0x${string}`,
        tokensToBurn,
        minRefund ? parseAmount(minRefund) : 0n,
        walletClient.account!.address,
      ],
    });
    
    console.log(`   Transaction hash: ${formatTxHash(hash)}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Transaction confirmed!');
      console.log(`   Sold: ${amount} tokens`);
      console.log(`   Refund: ${formatAmount(netRefund)} reserve tokens`);
      console.log(`   Block: ${receipt.blockNumber}`);
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}