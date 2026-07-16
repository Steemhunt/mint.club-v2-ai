import chainRegistryData from '../../chain-registry.json';
import {
  defineChain,
  fallback,
  http,
  type Address,
  type Chain,
  type Transport,
} from 'viem';
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  mainnet,
  optimism,
  polygon,
  sepolia,
  unichain,
  zora,
} from 'viem/chains';

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const satisfies Address;

export type KnownToken = {
  address: Address;
  decimals: number;
  wrappedNative?: boolean;
  stable?: boolean;
};

export type V3QuoterConfig = {
  address: Address;
  version: 'v1' | 'v2';
};

export type ChainConfig = {
  chain: Chain;
  rpcs: readonly string[];
  contracts: {
    tokenImplementation: Address;
    bond: Address;
    zapV2: Address | null;
  };
  uniswap: {
    v2Factory: Address | null;
    v3Quoter: V3QuoterConfig;
    v4Quoter: Address;
  };
  tokens: Record<string, KnownToken>;
  routeIntermediaries: readonly Address[];
  usdToken: Address | null;
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

const STANDARD_IMPLEMENTATION =
  '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df' as Address;
const STANDARD_BOND =
  '0xc5a076cad94176c2996B32d8466Be1cE757FAa27' as Address;
const WETH_L2 = '0x4200000000000000000000000000000000000006' as Address;

function config(value: ChainConfig): ChainConfig {
  return value;
}

export const CHAIN_CONFIGS = {
  ethereum: config({
    chain: mainnet,
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      ...mainnet.rpcUrls.default.http,
    ],
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      v3Quoter: {
        address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        version: 'v2',
      },
      v4Quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        decimals: 18,
        wrappedNative: true,
      },
      USDC: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        stable: true,
      },
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
      },
      DAI: {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        decimals: 18,
      },
    },
    routeIntermediaries: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ],
    usdToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  }),
  optimism: config({
    chain: optimism,
    rpcs: optimism.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
      v3Quoter: {
        address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        version: 'v2',
      },
      v4Quoter: '0x1f3131a13296fb91c90870043742c3cdbff1a8d7',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: { address: WETH_L2, decimals: 18, wrappedNative: true },
      USDT: {
        address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      WETH_L2,
      '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    ],
    usdToken: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  }),
  arbitrum: config({
    chain: arbitrum,
    rpcs: arbitrum.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
      v3Quoter: {
        address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        version: 'v2',
      },
      v4Quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        decimals: 18,
        wrappedNative: true,
      },
      USDT: {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ],
    usdToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  }),
  avalanche: config({
    chain: avalanche,
    rpcs: avalanche.rpcUrls.default.http,
    contracts: {
      tokenImplementation: '0x5DaE94e149CF2112Ec625D46670047814aA9aC2a',
      bond: '0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1',
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
      v3Quoter: {
        address: '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
        version: 'v2',
      },
      v4Quoter: '0xbe40675bb704506a3c2ccfb762dcfd1e979845c2',
    },
    tokens: {
      AVAX: { address: ZERO_ADDRESS, decimals: 18 },
      WAVAX: {
        address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
        decimals: 18,
        wrappedNative: true,
      },
      USDT: {
        address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    ],
    usdToken: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  }),
  base: config({
    chain: base,
    rpcs: [
      'https://base-rpc.publicnode.com',
      ...base.rpcUrls.default.http,
    ],
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
      v3Quoter: {
        address: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
        version: 'v2',
      },
      v4Quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: { address: WETH_L2, decimals: 18, wrappedNative: true },
      USDC: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        stable: true,
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
    routeIntermediaries: [
      WETH_L2,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ],
    usdToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
  polygon: config({
    chain: polygon,
    rpcs: polygon.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
      v3Quoter: {
        address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        version: 'v2',
      },
      v4Quoter: '0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9',
    },
    tokens: {
      POL: { address: ZERO_ADDRESS, decimals: 18 },
      WPOL: {
        address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        decimals: 18,
        wrappedNative: true,
      },
      USDT: {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    ],
    usdToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  }),
  bsc: config({
    chain: bsc,
    rpcs: bsc.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
      v3Quoter: {
        address: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
        version: 'v2',
      },
      v4Quoter: '0x9f75dd27d6664c475b90e105573e550ff69437b0',
    },
    tokens: {
      BNB: { address: ZERO_ADDRESS, decimals: 18 },
      WBNB: {
        address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        decimals: 18,
        wrappedNative: true,
      },
      USDT: {
        address: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      '0x55d398326f99059fF775485246999027B3197955',
    ],
    usdToken: '0x55d398326f99059fF775485246999027B3197955',
  }),
  blast: config({
    chain: blast,
    rpcs: blast.rpcUrls.default.http,
    contracts: {
      tokenImplementation: '0x1349A9DdEe26Fe16D0D44E35B3CB9B0CA18213a4',
      bond: '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
      v3Quoter: {
        address: '0x6Cdcd65e03c1CEc3730AeeCd45bc140D57A25C77',
        version: 'v2',
      },
      v4Quoter: '0x6f71cdcb0d119ff72c6eb501abceb576fbf62bcf',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: {
        address: '0x4300000000000000000000000000000000000004',
        decimals: 18,
        wrappedNative: true,
      },
      USDB: {
        address: '0x4300000000000000000000000000000000000003',
        decimals: 18,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0x4300000000000000000000000000000000000004',
      '0x4300000000000000000000000000000000000003',
    ],
    usdToken: '0x4300000000000000000000000000000000000003',
  }),
  zora: config({
    chain: zora,
    rpcs: zora.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: null,
      v3Quoter: {
        address: '0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df',
        version: 'v1',
      },
      v4Quoter: '0x5edaccc0660e0a2c44b06e07ce8b915e625dc2c6',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: { address: WETH_L2, decimals: 18, wrappedNative: true },
    },
    routeIntermediaries: [WETH_L2],
    usdToken: null,
  }),
  unichain: config({
    chain: unichain,
    rpcs: unichain.rpcUrls.default.http,
    contracts: {
      tokenImplementation: STANDARD_IMPLEMENTATION,
      bond: STANDARD_BOND,
      zapV2: null,
    },
    uniswap: {
      v2Factory: null,
      v3Quoter: {
        address: '0x385a5cf5f83e99f7bb2852b6a19c3538b9fa7658',
        version: 'v2',
      },
      v4Quoter: '0x333e3c607b141b18ff6de9f258db6e77fe7491e0',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: { address: WETH_L2, decimals: 18, wrappedNative: true },
      USDC: {
        address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      WETH_L2,
      '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    ],
    usdToken: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
  }),
  robinhood: config({
    chain: robinhood,
    rpcs: ['https://rpc.mainnet.chain.robinhood.com'],
    contracts: {
      tokenImplementation: '0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387',
      bond: '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f',
      v3Quoter: {
        address: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
        version: 'v2',
      },
      v4Quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: {
        address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        decimals: 18,
        wrappedNative: true,
      },
      USDG: {
        address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
        decimals: 6,
        stable: true,
      },
    },
    routeIntermediaries: [
      '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
      '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    ],
    usdToken: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  }),
  sepolia: config({
    chain: sepolia,
    rpcs: sepolia.rpcUrls.default.http,
    contracts: {
      tokenImplementation: '0x749bA94344521727f55a3007c777FbeB5F52C2Eb',
      bond: '0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c',
      zapV2: null,
    },
    uniswap: {
      v2Factory: '0xB7f907f7A9eBC822a80BD25E224be42Ce0A698A0',
      v3Quoter: {
        address: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
        version: 'v2',
      },
      v4Quoter: '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
    },
    tokens: {
      ETH: { address: ZERO_ADDRESS, decimals: 18 },
      WETH: {
        address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        decimals: 18,
        wrappedNative: true,
      },
    },
    routeIntermediaries: [
      '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    ],
    usdToken: null,
  }),
} as const;

export type SupportedChain = keyof typeof CHAIN_CONFIGS;

export interface PublishedChainCapabilities {
  bond: boolean;
  zapV2Configured: boolean;
  uniswapV2: boolean;
  uniswapV3: boolean;
  uniswapV4: boolean;
  stableIntermediary: boolean;
}

export interface PublishedChainMetadata {
  key: string;
  name: string;
  chainId: number;
  nativeSymbol: string;
  aliases: readonly string[];
  capabilities: PublishedChainCapabilities;
}

export interface PublishedChainRegistry {
  schemaVersion: number;
  chains: readonly PublishedChainMetadata[];
}

export const CHAIN_REGISTRY = chainRegistryData as PublishedChainRegistry;

function validatePublishedRegistry(): void {
  const configKeys = Object.keys(CHAIN_CONFIGS).sort();
  const registryKeys = CHAIN_REGISTRY.chains.map(({ key }) => key).sort();
  if (
    registryKeys.length !== new Set(registryKeys).size ||
    configKeys.join(',') !== registryKeys.join(',')
  ) {
    throw new Error('chain-registry.json keys do not match CHAIN_CONFIGS');
  }

  for (const metadata of CHAIN_REGISTRY.chains) {
    const config = CHAIN_CONFIGS[metadata.key as SupportedChain];
    const nativeToken = Object.entries(config.tokens).find(
      ([, token]) => token.address.toLowerCase() === ZERO_ADDRESS,
    );
    const expectedCapabilities = {
      bond: Boolean(config.contracts.bond),
      zapV2Configured: config.contracts.zapV2 !== null,
      uniswapV2: config.uniswap.v2Factory !== null,
      uniswapV3: config.uniswap.v3Quoter !== null,
      uniswapV4: config.uniswap.v4Quoter !== null,
      stableIntermediary: config.routeIntermediaries.length > 1,
    };

    if (
      config.chain.id !== metadata.chainId ||
      nativeToken?.[0] !== metadata.nativeSymbol ||
      JSON.stringify(expectedCapabilities) !==
        JSON.stringify(metadata.capabilities)
    ) {
      throw new Error(
        `chain-registry.json metadata does not match CHAIN_CONFIGS for ${metadata.key}`,
      );
    }
  }
}

validatePublishedRegistry();

export const SUPPORTED_CHAIN_KEYS = Object.freeze(
  CHAIN_REGISTRY.chains.map(({ key }) => key),
) as readonly SupportedChain[];

const normalizeChainAlias = (input: string) =>
  input.toLowerCase().replace(/[\s_-]+/g, '');

const CHAIN_ALIASES = Object.fromEntries(
  CHAIN_REGISTRY.chains.flatMap(({ key, aliases }) =>
    [key, ...aliases].map((alias) => [
      normalizeChainAlias(alias),
      key as SupportedChain,
    ]),
  ),
) as Record<string, SupportedChain>;

export function validateChain(input: string): SupportedChain {
  const chain = CHAIN_ALIASES[normalizeChainAlias(input)];
  if (!chain) {
    throw new Error(
      `Unsupported chain "${input}". Supported chains: ${SUPPORTED_CHAIN_KEYS.join(', ')}`,
    );
  }
  return chain;
}

export function getChainConfig(input: string): ChainConfig {
  return CHAIN_CONFIGS[validateChain(input)];
}

export function getTransport(chain: SupportedChain = 'base'): Transport {
  const envName = `MINTCLUB_RPC_${chain.toUpperCase()}`;
  const override = process.env[envName]?.trim();
  const urls = [override, ...CHAIN_CONFIGS[chain].rpcs].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
  );

  return fallback(
    urls.map((url) =>
      http(url, { retryCount: 0, timeout: 10_000, batch: true }),
    ),
    { rank: false },
  );
}
