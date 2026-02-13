import { createPublicClient, createWalletClient, http, fallback, type Chain, type Transport, type Account, type HttpTransport } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { supportedChains, chainRpcs, type SupportedChain } from './config/chains.js';

function createTransport(chain: SupportedChain) {
  const transports = chainRpcs[chain].map(url =>
    http(url, { retryCount: 0, timeout: 2000, batch: true })
  );
  return fallback(transports, { rank: false });
}

export function getPublicClient(chain: SupportedChain) {
  const c = supportedChains[chain];
  return createPublicClient({ chain: c, transport: createTransport(chain) }) as any;
}

export function getWalletClient(chain: SupportedChain, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const c = supportedChains[chain];
  return createWalletClient({ account, chain: c, transport: createTransport(chain) }) as any;
}

export function validateChain(chain: string): SupportedChain {
  if (!(chain in supportedChains)) {
    const supportedList = Object.keys(supportedChains).join(', ');
    throw new Error(`Unsupported chain: ${chain}. Supported chains: ${supportedList}`);
  }
  return chain as SupportedChain;
}