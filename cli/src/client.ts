import {
  createPublicClient,
  createWalletClient,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  CHAIN_CONFIGS,
  getTransport,
  type SupportedChain,
} from './config/chains';

export type CliWalletClient = WalletClient<Transport, Chain, PrivateKeyAccount>;

export function getPublicClient(
  chain: SupportedChain = 'base',
): PublicClient {
  return createPublicClient({
    chain: CHAIN_CONFIGS[chain].chain,
    transport: getTransport(chain),
  }) as PublicClient;
}

export function getWalletClient(
  privateKey: `0x${string}`,
  chain: SupportedChain = 'base',
): CliWalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: CHAIN_CONFIGS[chain].chain,
    transport: getTransport(chain),
  });
}
