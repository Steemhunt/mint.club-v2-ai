import { createPublicClient, createWalletClient, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAINS, getTransport, type SupportedChain } from './config/chains';

export function getPublicClient(chain: SupportedChain): PublicClient {
  return createPublicClient({ chain: CHAINS[chain], transport: getTransport(chain) }) as PublicClient;
}

// Returns a wallet client with account & chain baked in.
// Using `any` to avoid viem's deeply nested generic types that break tsc serialization.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWalletClient(chain: SupportedChain, privateKey: `0x${string}`): any {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: CHAINS[chain], transport: getTransport(chain) });
}

export function validateChain(input: string): SupportedChain {
  if (!(input in CHAINS)) {
    throw new Error(`Unsupported chain: ${input}. Supported: ${Object.keys(CHAINS).join(', ')}`);
  }
  return input as SupportedChain;
}
