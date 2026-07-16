import { describe, expect, it } from 'vitest';
import { getPublicClient } from '../src/client';
import {
  CHAIN_CONFIGS,
  CHAIN_REGISTRY,
  SUPPORTED_CHAIN_KEYS,
  getChainConfig,
  getTransport,
  validateChain,
} from '../src/config/chains';
import {
  getBondAddress,
  getWrappedNativeAddress,
  getZapV2Address,
  resolveToken,
} from '../src/config/contracts';
import { txUrl } from '../src/utils/format';
import { getSymbol } from '../src/utils/symbol';

const EXPECTED_CHAINS = [
  'ethereum',
  'optimism',
  'arbitrum',
  'avalanche',
  'base',
  'polygon',
  'bsc',
  'zora',
  'unichain',
  'robinhood',
  'sepolia',
  'base-sepolia',
] as const;

const EXPECTED_IDS = [
  1, 10, 42161, 43114, 8453, 137, 56, 7777777, 130, 4663, 11155111,
  84532,
];

const EXPECTED_ZAP_V2 = {
  ethereum: '0xf7e2cDe9E603F15118E6E389cF14f11f19C1afbc',
  optimism: '0x7B09b728ee8c6a714dC3F10367b5DF9b217FE633',
  arbitrum: '0x3a8a4BFCC487d0FE9D342B6180bf0323989f251B',
  avalanche: '0xD0586d5F4ae18650340fFc6f3b1307AB2Ca334f4',
  base: '0x96282046C0e19F727a92728198c0Dc4E260Ebe0b',
  polygon: '0x664f626516c82772F0F492Ff64f6FA826C86F5e1',
  bsc: '0x68f54a53d3E69e2191bCF586fB507c81E5353413',
  zora: '0x5b64cECC5cF3E4B1A668Abd895D16BdDC0c77a17',
  unichain: '0x06FD26c092Db44E5491abB7cDC580CE24D93030c',
  robinhood: '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
  sepolia: '0x69c94AF858FeCA41f97ff7888e3B5104b95D66D9',
  'base-sepolia': '0x60432191893c4F742205a2C834817a1891feC435',
} as const;

describe('chain configuration', () => {
  it('exposes exactly the Mint Club and Uniswap chain intersection', () => {
    expect(SUPPORTED_CHAIN_KEYS).toEqual(EXPECTED_CHAINS);
    expect(Object.keys(CHAIN_CONFIGS)).toEqual(EXPECTED_CHAINS);
    expect(EXPECTED_CHAINS.map((key) => CHAIN_CONFIGS[key].chain.id)).toEqual(
      EXPECTED_IDS,
    );
  });

  it('derives published keys and capabilities from the central registry', () => {
    expect(CHAIN_REGISTRY.schemaVersion).toBe(1);
    expect(CHAIN_REGISTRY.chains.map(({ key }) => key)).toEqual(
      EXPECTED_CHAINS,
    );
    for (const metadata of CHAIN_REGISTRY.chains) {
      const config = CHAIN_CONFIGS[metadata.key as keyof typeof CHAIN_CONFIGS];
      expect(metadata.chainId).toBe(config.chain.id);
      expect(metadata.capabilities).toEqual({
        bond: true,
        zapV2Configured: config.contracts.zapV2 !== null,
        uniswapV2: config.uniswap.v2Factory !== null,
        uniswapV3: config.uniswap.v3Quoter !== null,
        uniswapV4: config.uniswap.v4Quoter !== null,
        stableIntermediary: config.routeIntermediaries.length > 1,
      });
    }
  });

  it('uses the current Mint Club deployment table including special chains', () => {
    expect(getChainConfig('ethereum').contracts).toMatchObject({
      tokenImplementation: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
      bond: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
    });
    expect(getChainConfig('avalanche').contracts).toMatchObject({
      tokenImplementation: '0x5DaE94e149CF2112Ec625D46670047814aA9aC2a',
      bond: '0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1',
    });
    expect(getChainConfig('sepolia').contracts).toMatchObject({
      tokenImplementation: '0x749bA94344521727f55a3007c777FbeB5F52C2Eb',
      bond: '0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c',
    });
    expect(getChainConfig('robinhood').contracts).toMatchObject({
      tokenImplementation: '0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387',
      bond: '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
    });
    expect(getChainConfig('base-sepolia').contracts).toMatchObject({
      tokenImplementation: '0x37F540de37afE8bDf6C722d87CB019F30e5E406a',
      bond: '0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d',
    });
  });

  it('uses the published ZapV2 deployment on every supported chain', () => {
    for (const chain of EXPECTED_CHAINS) {
      expect(CHAIN_CONFIGS[chain].contracts.zapV2).toBe(
        EXPECTED_ZAP_V2[chain],
      );
      expect(getZapV2Address(chain)).toBe(EXPECTED_ZAP_V2[chain]);
    }
  });

  it('configures optional V2 plus V3 and V4 quoters per chain', () => {
    expect(CHAIN_CONFIGS.ethereum.uniswap).toMatchObject({
      v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      v3Quoter: {
        address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        version: 'v2',
      },
      v4Quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
    });
    expect(CHAIN_CONFIGS.zora.uniswap.v2Factory).toBe(
      '0x0F797dC7efaEA995bB916f268D919d0a1950eE3C',
    );
    expect(CHAIN_CONFIGS.zora.uniswap.v3Quoter).toMatchObject({
      address: '0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df',
      version: 'v2',
    });
    expect(CHAIN_CONFIGS.unichain.uniswap.v2Factory).toBe(
      '0x1f98400000000000000000000000000000000002',
    );
    expect(CHAIN_CONFIGS.sepolia.uniswap.v2Factory).toBe(
      '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    );
    expect(CHAIN_CONFIGS['base-sepolia'].uniswap).toMatchObject({
      v2Factory: null,
      v3Quoter: {
        address: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
        version: 'v2',
      },
      v4Quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
    });
    expect(CHAIN_CONFIGS.robinhood.uniswap).toMatchObject({
      v2Factory: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f',
      v3Quoter: {
        address: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
        version: 'v2',
      },
      v4Quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
    });
  });

  it('normalizes chain aliases and rejects unsupported Mint Club chains', () => {
    expect(validateChain('MAINNET')).toBe('ethereum');
    expect(validateChain('bnb chain')).toBe('bsc');
    expect(validateChain('Robinhood Chain')).toBe('robinhood');
    expect(validateChain('Base Sepolia')).toBe('base-sepolia');
    expect(validateChain('basesepolia')).toBe('base-sepolia');
    expect(validateChain('base_testnet')).toBe('base-sepolia');
    expect(() => validateChain('blast')).toThrow('Unsupported chain "blast"');
    expect(() => validateChain('degen')).toThrow('Unsupported chain "degen"');
  });

  it('uses unique public RPC fallbacks and the normalized override name', () => {
    for (const chain of EXPECTED_CHAINS) {
      const config = CHAIN_CONFIGS[chain];
      expect(config.rpcs).toEqual([...new Set(config.rpcs)]);
      expect(config.rpcs).toEqual(
        expect.arrayContaining([...config.chain.rpcUrls.default.http]),
      );
      expect(config.rpcs.every((url) => url.startsWith('https://'))).toBe(true);
      expect(config.rpcs.some((url) => /(?:api[_-]?key|token)=/i.test(url))).toBe(
        false,
      );
    }

    process.env.MINTCLUB_RPC_BASE_SEPOLIA = 'https://override.example';
    try {
      const transport = getTransport('base-sepolia')({
        chain: CHAIN_CONFIGS['base-sepolia'].chain,
      });
      const urls = (
        transport.value as {
          transports: Array<{ value: { url: string } }>;
        }
      ).transports.map(({ value }) => value.url);
      expect(urls[0]).toBe('https://override.example');
    } finally {
      delete process.env.MINTCLUB_RPC_BASE_SEPOLIA;
    }
  });

  it('resolves chain-local native, wrapped-native, and stable symbols', () => {
    expect(resolveToken('AVAX', 'avalanche')).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(resolveToken('WAVAX', 'avalanche')).toBe(
      '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    );
    expect(resolveToken('NATIVE', 'bsc')).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(getWrappedNativeAddress('polygon')).toBe(
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    );
    expect(resolveToken('USDG', 'robinhood')).toBe(
      '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    );
    expect(getWrappedNativeAddress('base-sepolia')).toBe(
      '0x4200000000000000000000000000000000000006',
    );
    expect(CHAIN_CONFIGS.base.routeIntermediaries).toEqual([
      '0x4200000000000000000000000000000000000006',
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ]);
  });

  it('creates clients and explorer links for non-default chains', () => {
    expect(getPublicClient('ethereum').chain?.id).toBe(1);
    expect(getPublicClient('avalanche').chain?.id).toBe(43114);
    expect(getPublicClient('robinhood').chain?.id).toBe(4663);
    expect(getPublicClient('base-sepolia').chain?.id).toBe(84532);
    expect(txUrl('0xabc', 'arbitrum')).toBe('https://arbiscan.io/tx/0xabc');
  });

  it('recognizes configured token symbols without an RPC read', async () => {
    const client = {
      readContract: async () => {
        throw new Error('configured tokens should not require an RPC read');
      },
    };
    await expect(
      getSymbol(
        client,
        '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        'robinhood',
      ),
    ).resolves.toBe('WETH');
    expect(getBondAddress('base-sepolia')).toBe(
      '0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d',
    );
  });
});
