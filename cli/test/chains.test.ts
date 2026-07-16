import { describe, expect, it } from 'vitest';
import { getPublicClient } from '../src/client';
import {
  CHAIN_CONFIGS,
  CHAIN_REGISTRY,
  SUPPORTED_CHAIN_KEYS,
  getChainConfig,
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
  'blast',
  'zora',
  'unichain',
  'robinhood',
  'sepolia',
] as const;

const EXPECTED_IDS = [
  1, 10, 42161, 43114, 8453, 137, 56, 81457, 7777777, 130, 4663,
  11155111,
];

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
    expect(getChainConfig('blast').contracts).toMatchObject({
      tokenImplementation: '0x1349A9DdEe26Fe16D0D44E35B3CB9B0CA18213a4',
      bond: '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
    });
    expect(getChainConfig('sepolia').contracts).toMatchObject({
      tokenImplementation: '0x749bA94344521727f55a3007c777FbeB5F52C2Eb',
      bond: '0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c',
    });
    expect(getChainConfig('robinhood').contracts).toMatchObject({
      tokenImplementation: '0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387',
      bond: '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
    });
  });

  it('leaves every ZapV2 deployment unset and fails closed', () => {
    for (const chain of EXPECTED_CHAINS) {
      expect(CHAIN_CONFIGS[chain].contracts.zapV2).toBeNull();
      expect(() => getZapV2Address(chain)).toThrow(
        `MCV2_ZapV2 is not configured on ${CHAIN_CONFIGS[chain].chain.name}`,
      );
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
    expect(CHAIN_CONFIGS.zora.uniswap.v2Factory).toBeNull();
    expect(CHAIN_CONFIGS.zora.uniswap.v3Quoter).toMatchObject({
      address: '0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df',
      version: 'v1',
    });
    expect(CHAIN_CONFIGS.unichain.uniswap.v2Factory).toBeNull();
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
    expect(() => validateChain('degen')).toThrow('Unsupported chain "degen"');
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
    expect(CHAIN_CONFIGS.base.routeIntermediaries).toEqual([
      '0x4200000000000000000000000000000000000006',
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ]);
  });

  it('creates clients and explorer links for non-default chains', () => {
    expect(getPublicClient('ethereum').chain?.id).toBe(1);
    expect(getPublicClient('avalanche').chain?.id).toBe(43114);
    expect(getPublicClient('robinhood').chain?.id).toBe(4663);
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
    expect(getBondAddress('blast')).toBe(
      '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
    );
  });
});
