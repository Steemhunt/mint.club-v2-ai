import {
  createPublicClient,
  createWalletClient,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { CHAIN, getTransport } from './config/chains';

export type CliWalletClient = WalletClient<Transport, Chain, PrivateKeyAccount>;

export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: CHAIN, transport: getTransport() }) as PublicClient;
}

export function getWalletClient(privateKey: `0x${string}`): CliWalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: CHAIN, transport: getTransport() });
}
