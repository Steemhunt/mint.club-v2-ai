import { fallback, http, type Address, type Chain, type Transport } from 'viem';
import { base } from 'viem/chains';
import { defineChain } from 'viem';

export type KnownToken = {
  address: Address;
  decimals: number;
};

export type ChainConfig = {
  chain: Chain;
  rpcs: readonly string[];
  contracts: {
    tokenImplementation: Address;
    bond: Address;
    zap: Address;
  };
  tokens: Record<string, KnownToken>;
};

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  network: 'robinhood',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
    },
    public: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
});

export const CHAIN_CONFIGS = {
  base: {
    chain: base,
    rpcs: [
      'https://base-rpc.publicnode.com',
      'https://base.meowrpc.com',
      'https://mainnet.base.org',
      'https://developer-access-mainnet.base.org',
      'https://base-mainnet.public.blastapi.io',
      'https://base-public.nodies.app',
      'https://1rpc.io/base',
    ],
    contracts: {
      tokenImplementation: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
      bond: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
      zap: '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
    },
    tokens: {
      ETH: {
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
      },
      WETH: {
        address: '0x4200000000000000000000000000000000000006',
        decimals: 18,
      },
      USDC: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
      },
      HUNT: {
        address: '0x37f0c2915CeCC7e977183B8543Fc0864d03E064C',
        decimals: 18,
      },
      MT: {
        address: '0xFf45161474C39cB00699070Dd49582e417b57a7E',
        decimals: 18,
      },
    },
  },
  robinhood: {
    chain: robinhood,
    rpcs: ['https://rpc.mainnet.chain.robinhood.com'],
    contracts: {
      tokenImplementation: '0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387',
      bond: '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
      zap: '0xA3dCf3Ca587D9929d540868c924f208726DC9aB6',
    },
    tokens: {
      ETH: {
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
      },
      WETH: {
        address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        decimals: 18,
      },
      USDG: {
        address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
        decimals: 6,
      },
    },
  },
} as const satisfies Record<string, ChainConfig>;

export type SupportedChain = keyof typeof CHAIN_CONFIGS;

export function validateChain(input: string): SupportedChain {
  const normalized = input.toLowerCase();
  if (!(normalized in CHAIN_CONFIGS)) {
    throw new Error(
      `Unsupported chain "${input}". Supported chains: ${Object.keys(CHAIN_CONFIGS).join(', ')}`,
    );
  }
  return normalized as SupportedChain;
}

export function getChainConfig(input: string): ChainConfig {
  return CHAIN_CONFIGS[validateChain(input)];
}

export function getTransport(chain: SupportedChain = 'base'): Transport {
  return fallback(
    CHAIN_CONFIGS[chain].rpcs.map((url) =>
      http(url, { retryCount: 0, timeout: 10_000, batch: true }),
    ),
    { rank: false },
  );
}
