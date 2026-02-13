import { http, fallback, type Chain } from 'viem';
import {
  base, mainnet, arbitrum, optimism, polygon, bsc, avalanche,
  blast, degen, zora, kaia, cyber, apeChain, shibarium, unichain,
} from 'viem/chains';

export const CHAINS = {
  base, mainnet, arbitrum, optimism, polygon, bsc, avalanche,
  blast, degen, zora, kaia, cyber, apeChain, shibarium, unichain,
} as const;

export type SupportedChain = keyof typeof CHAINS;

const RPCS: Record<SupportedChain, string[]> = {
  base: [
    'https://base-rpc.publicnode.com',
    'https://base.meowrpc.com',
    'https://mainnet.base.org',
    'https://developer-access-mainnet.base.org',
    'https://base-mainnet.public.blastapi.io',
    'https://base-public.nodies.app',
    'https://1rpc.io/base',
  ],
  mainnet: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth-pokt.nodies.app',
    'https://gateway.tenderly.co/public/mainnet',
    'https://rpc.flashbots.net/fast',
    'https://rpc.mevblocker.io',
  ],
  arbitrum: [
    'https://arbitrum-one.publicnode.com',
    'https://arbitrum.meowrpc.com',
    'https://arb-pokt.nodies.app',
  ],
  optimism: [
    'https://optimism-rpc.publicnode.com',
    'https://optimism.meowrpc.com',
    'https://optimism.drpc.org',
  ],
  polygon: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://rpc-mainnet.matic.quiknode.pro',
    'https://polygon.meowrpc.com',
  ],
  bsc: [
    'https://bsc-rpc.publicnode.com',
    'https://bscrpc.com',
    'https://rpc.ankr.com/bsc',
  ],
  avalanche: [
    'https://avalanche-c-chain-rpc.publicnode.com',
    'https://avax.meowrpc.com',
    'https://api.avax.network/ext/bc/C/rpc',
  ],
  blast: [
    'https://blast-rpc.publicnode.com',
    'https://rpc.blast.io',
    'https://blast.din.dev/rpc',
  ],
  degen: ['https://rpc.degen.tips'],
  zora: ['https://rpc.zora.energy', 'https://zora.drpc.org'],
  kaia: ['https://public-en.node.kaia.io', 'https://rpc.ankr.com/kaia'],
  cyber: ['https://rpc.cyber.co/', 'https://cyber.alt.technology/'],
  apeChain: ['https://apechain.calderachain.xyz'],
  shibarium: ['https://www.shibrpc.com'],
  unichain: ['https://unichain-rpc.publicnode.com', 'https://mainnet.unichain.org'],
};

export function getTransport(chain: SupportedChain) {
  return fallback(
    RPCS[chain].map(url => http(url, { retryCount: 0, timeout: 2_000, batch: true })),
    { rank: false },
  );
}
