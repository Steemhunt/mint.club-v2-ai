import { getPublicClient, getWalletClient } from '../client.js';
import { getBondAddress } from '../config/contracts.js';
import { MCV2_BOND_ABI } from '../abi/bond.js';
import { formatAmount, parseAmount, parseStepsInput, formatTxHash } from '../utils/format.js';
import type { SupportedChain } from '../config/chains.js';

export async function createCommand(
  name: string,
  symbol: string,
  reserveToken: string,
  maxSupply: string,
  steps: string,
  chain: SupportedChain,
  privateKey: `0x${string}`,
  mintRoyalty: number = 0,
  burnRoyalty: number = 0
) {
  try {
    console.log(`🚀 Creating token "${name}" (${symbol}) on ${chain}...`);
    
    const publicClient = getPublicClient(chain);
    const walletClient = getWalletClient(chain, privateKey);
    const bondAddress = getBondAddress(chain);
    
    // Parse inputs
    const maxSupplyWei = parseAmount(maxSupply);
    const { stepRanges, stepPrices } = parseStepsInput(steps);
    
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Reserve Token: ${reserveToken}`);
    console.log(`   Max Supply: ${maxSupply}`);
    console.log(`   Mint Royalty: ${mintRoyalty / 100}%`);
    console.log(`   Burn Royalty: ${burnRoyalty / 100}%`);
    console.log(`   Steps: ${stepRanges.length} configured`);
    
    // Get creation fee
    console.log('💰 Checking creation fee...');
    const creationFee = await publicClient.readContract({
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'creationFee',
    });
    
    console.log(`   Creation fee: ${formatAmount(creationFee)} ETH`);
    
    // Prepare parameters
    const tokenParam = {
      name,
      symbol,
    };
    
    const bondParam = {
      mintRoyalty: mintRoyalty,
      burnRoyalty: burnRoyalty,
      reserveToken: reserveToken as `0x${string}`,
      maxSupply: maxSupplyWei,
      stepRanges: stepRanges,
      stepPrices: stepPrices,
    };
    
    // Simulate the transaction first
    console.log('🔍 Simulating transaction...');
    const { result } = await publicClient.simulateContract({
      account: walletClient.account,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'createToken',
      args: [tokenParam, bondParam],
      value: creationFee,
    });
    
    console.log(`   Expected token address: ${result}`);
    
    // Execute the transaction
    console.log('📤 Sending transaction...');
    const hash = await walletClient.writeContract({
      chain: walletClient.chain,
      address: bondAddress,
      abi: MCV2_BOND_ABI,
      functionName: 'createToken',
      args: [tokenParam, bondParam],
      value: creationFee,
    });
    
    console.log(`   Transaction hash: ${formatTxHash(hash)}`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      console.log('✅ Token created successfully!');
      console.log(`   Token Address: ${result}`);
      console.log(`   Name: ${name} (${symbol})`);
      console.log(`   Block: ${receipt.blockNumber}`);
      
      // Show helpful next steps
      console.log('\n🔗 Next steps:');
      console.log(`   View info: mintclub info ${result} --chain ${chain}`);
      console.log(`   Buy tokens: mintclub buy ${result} --amount 1 --chain ${chain}`);
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}