import { defineChain } from 'viem';

export const supportedChains = {
  base: defineChain({
    id: 8453,
    name: 'Base',
    network: 'base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://mainnet.base.org'] },
      default: { http: ['https://mainnet.base.org'] },
    },
    blockExplorers: {
      default: { name: 'BaseScan', url: 'https://basescan.org' },
    },
    contracts: {
      multicall3: {
        address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        blockCreated: 5022,
      },
    },
  }),

  mainnet: defineChain({
    id: 1,
    name: 'Ethereum',
    network: 'homestead',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://cloudflare-eth.com'] },
      default: { http: ['https://cloudflare-eth.com'] },
    },
    blockExplorers: {
      default: { name: 'Etherscan', url: 'https://etherscan.io' },
    },
  }),

  arbitrum: defineChain({
    id: 42161,
    name: 'Arbitrum One',
    network: 'arbitrum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://arb1.arbitrum.io/rpc'] },
      default: { http: ['https://arb1.arbitrum.io/rpc'] },
    },
    blockExplorers: {
      default: { name: 'Arbiscan', url: 'https://arbiscan.io' },
    },
  }),

  optimism: defineChain({
    id: 10,
    name: 'Optimism',
    network: 'optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://mainnet.optimism.io'] },
      default: { http: ['https://mainnet.optimism.io'] },
    },
    blockExplorers: {
      default: { name: 'Optimism Explorer', url: 'https://optimistic.etherscan.io' },
    },
  }),

  polygon: defineChain({
    id: 137,
    name: 'Polygon',
    network: 'matic',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://polygon-rpc.com'] },
      default: { http: ['https://polygon-rpc.com'] },
    },
    blockExplorers: {
      default: { name: 'PolygonScan', url: 'https://polygonscan.com' },
    },
  }),

  bsc: defineChain({
    id: 56,
    name: 'BNB Smart Chain',
    network: 'bsc',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://bsc-dataseed.binance.org'] },
      default: { http: ['https://bsc-dataseed.binance.org'] },
    },
    blockExplorers: {
      default: { name: 'BscScan', url: 'https://bscscan.com' },
    },
  }),

  avalanche: defineChain({
    id: 43114,
    name: 'Avalanche',
    network: 'avalanche',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://api.avax.network/ext/bc/C/rpc'] },
      default: { http: ['https://api.avax.network/ext/bc/C/rpc'] },
    },
    blockExplorers: {
      default: { name: 'SnowTrace', url: 'https://snowtrace.io' },
    },
  }),

  blast: defineChain({
    id: 81457,
    name: 'Blast',
    network: 'blast',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://rpc.blast.io'] },
      default: { http: ['https://rpc.blast.io'] },
    },
    blockExplorers: {
      default: { name: 'Blastscan', url: 'https://blastscan.io' },
    },
  }),

  degen: defineChain({
    id: 666666666,
    name: 'Degen',
    network: 'degen',
    nativeCurrency: { name: 'DEGEN', symbol: 'DEGEN', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://rpc.degen.tips'] },
      default: { http: ['https://rpc.degen.tips'] },
    },
    blockExplorers: {
      default: { name: 'Degen Explorer', url: 'https://explorer.degen.tips' },
    },
  }),

  zora: defineChain({
    id: 7777777,
    name: 'Zora',
    network: 'zora',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://rpc.zora.energy'] },
      default: { http: ['https://rpc.zora.energy'] },
    },
    blockExplorers: {
      default: { name: 'Zora Explorer', url: 'https://explorer.zora.energy' },
    },
  }),

  kaia: defineChain({
    id: 8217,
    name: 'Kaia',
    network: 'kaia',
    nativeCurrency: { name: 'KAIA', symbol: 'KAIA', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://public-en.node.kaia.io'] },
      default: { http: ['https://public-en.node.kaia.io'] },
    },
    blockExplorers: {
      default: { name: 'Kaia Explorer', url: 'https://klaytnscope.com' },
    },
  }),

  cyber: defineChain({
    id: 7560,
    name: 'Cyber',
    network: 'cyber',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://rpc.cyber.co'] },
      default: { http: ['https://rpc.cyber.co'] },
    },
    blockExplorers: {
      default: { name: 'Cyber Explorer', url: 'https://cyberscan.co' },
    },
  }),

  apeChain: defineChain({
    id: 33139,
    name: 'ApeChain',
    network: 'apechain',
    nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://apechain.calderachain.xyz'] },
      default: { http: ['https://apechain.calderachain.xyz'] },
    },
    blockExplorers: {
      default: { name: 'ApeChain Explorer', url: 'https://apechain.calderaexplorer.xyz' },
    },
  }),

  shibarium: defineChain({
    id: 109,
    name: 'Shibarium',
    network: 'shibarium',
    nativeCurrency: { name: 'BONE', symbol: 'BONE', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://www.shibrpc.com'] },
      default: { http: ['https://www.shibrpc.com'] },
    },
    blockExplorers: {
      default: { name: 'Shibarium Explorer', url: 'https://shibariumscan.io' },
    },
  }),

  unichain: defineChain({
    id: 1301,
    name: 'Unichain',
    network: 'unichain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['https://mainnet.unichain.org'] },
      default: { http: ['https://mainnet.unichain.org'] },
    },
    blockExplorers: {
      default: { name: 'Unichain Explorer', url: 'https://unichain-sepolia.blockscout.com' },
    },
  }),
} as const;

export const chainRpcs = {
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
} as const;

export type SupportedChain = keyof typeof supportedChains;