import { createPublicClient, createWalletClient, http, fallback, Chain, Transport, PublicClient, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { supportedChains, chainRpcs, type SupportedChain } from './config/chains.js';

export function createTransport(chain: SupportedChain): Transport {
  const rpcUrls = chainRpcs[chain];
  const transports = rpcUrls.map(url => 
    http(url, { 
      retryCount: 0, 
      timeout: 2000, 
      batch: true 
    })
  );
  
  return fallback(transports, { rank: false });
}

export function getPublicClient(chain: SupportedChain): PublicClient {
  const chainConfig = supportedChains[chain];
  const transport = createTransport(chain);
  
  return createPublicClient({
    chain: chainConfig,
    transport,
  });
}

export function getWalletClient(chain: SupportedChain, privateKey: `0x${string}`): WalletClient {
  const chainConfig = supportedChains[chain];
  const transport = createTransport(chain);
  const account = privateKeyToAccount(privateKey);
  
  return createWalletClient({
    account,
    chain: chainConfig,
    transport,
  });
}

export function validateChain(chain: string): SupportedChain {
  if (!(chain in supportedChains)) {
    const supportedList = Object.keys(supportedChains).join(', ');
    throw new Error(`Unsupported chain: ${chain}. Supported chains: ${supportedList}`);
  }
  return chain as SupportedChain;
}