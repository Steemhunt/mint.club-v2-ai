import { createPublicClient, createWalletClient, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN, getTransport } from './config/chains';

export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: CHAIN, transport: getTransport() }) as PublicClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWalletClient(privateKey: `0x${string}`): any {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: CHAIN, transport: getTransport() });
}
