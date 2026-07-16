import { type PublicClient, type Address, type Abi } from 'viem';
import type { CliWalletClient } from '../client';
import type { SupportedChain } from '../config/chains';
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
  wallet: CliWalletClient,
  token: Address | undefined,
  options: TransactionOptions,
  successMessage: string,
  chain: SupportedChain = 'base',
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
  console.log(`   ${txUrl(hash, chain)}`);

  // Wait for confirmation
  const receipt = await client.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    if (token) saveToken(token, chain);
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
  walletClient: CliWalletClient;
  account: Address;
}

export function setupClients(
  getPublicClient: (chain: SupportedChain) => PublicClient,
  getWalletClient: (
    pk: `0x${string}`,
    chain: SupportedChain,
  ) => CliWalletClient,
  privateKey: `0x${string}`,
  chain: SupportedChain = 'base',
): ClientSetup {
  const publicClient = getPublicClient(chain);
  const walletClient = getWalletClient(privateKey, chain);
  const account = walletClient.account.address;

  return {
    publicClient,
    walletClient,
    account,
  };
}