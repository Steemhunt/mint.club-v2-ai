import { type PublicClient, type WalletClient, type Address, type Abi } from 'viem';
import { shortHash, txUrl } from './format';
import { saveToken } from './tokens';

export interface TransactionOptions {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

/**
 * Execute a transaction with simulation, gas estimation, and error handling
 */
export async function executeTransaction(
  client: PublicClient,
  wallet: WalletClient,
  token: Address,
  options: TransactionOptions,
  successMessage: string,
): Promise<void> {
  const account = wallet.account;
  
  // Simulate the transaction
  await client.simulateContract({
    account,
    ...options,
  });

  console.log('📤 Sending...');
  
  // Execute the transaction
  const hash = await wallet.writeContract(options);
  
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);

  // Wait for confirmation
  const receipt = await client.waitForTransactionReceipt({ hash });
  
  if (receipt.status === 'success') {
    saveToken(token);
    console.log(`✅ ${successMessage}`);
  } else {
    throw new Error('Transaction failed');
  }
}

/**
 * Setup clients and account for a command
 */
export interface ClientSetup {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
}

export function setupClients(
  getPublicClient: () => PublicClient,
  getWalletClient: (pk: `0x${string}`) => WalletClient,
  privateKey: `0x${string}`,
): ClientSetup {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient(privateKey);
  const account = walletClient.account.address;

  return {
    publicClient,
    walletClient,
    account,
  };
}