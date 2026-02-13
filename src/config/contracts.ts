import type { SupportedChain } from './chains.js';

// Default addresses used by most chains
const DEFAULT_BOND_ADDRESS = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27' as const;
const DEFAULT_ZAP_V1_ADDRESS = '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa' as const;

export const CONTRACT_ADDRESSES = {
  bond: {
    base: DEFAULT_BOND_ADDRESS,
    mainnet: DEFAULT_BOND_ADDRESS,
    arbitrum: DEFAULT_BOND_ADDRESS,
    optimism: DEFAULT_BOND_ADDRESS,
    polygon: DEFAULT_BOND_ADDRESS,
    bsc: DEFAULT_BOND_ADDRESS,
    avalanche: '0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1',
    blast: '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
    degen: '0x3bc6B601196752497a68B2625DB4f2205C3b150b',
    zora: DEFAULT_BOND_ADDRESS,
    kaia: DEFAULT_BOND_ADDRESS,
    cyber: DEFAULT_BOND_ADDRESS,
    apeChain: DEFAULT_BOND_ADDRESS,
    shibarium: DEFAULT_BOND_ADDRESS,
    unichain: DEFAULT_BOND_ADDRESS,
  },
  zapV1: {
    base: DEFAULT_ZAP_V1_ADDRESS,
    mainnet: DEFAULT_ZAP_V1_ADDRESS,
    arbitrum: DEFAULT_ZAP_V1_ADDRESS,
    optimism: DEFAULT_ZAP_V1_ADDRESS,
    polygon: DEFAULT_ZAP_V1_ADDRESS,
    bsc: DEFAULT_ZAP_V1_ADDRESS,
    avalanche: '0x29b0E6D2C2884aEa3FB4CB5dD1C7002A8E10c724',
    blast: '0x06FD26c092Db44E5491abB7cDC580CE24D93030c',
    degen: '0x1349A9DdEe26Fe16D0D44E35B3CB9B0CA18213a4',
    zora: DEFAULT_ZAP_V1_ADDRESS,
    kaia: DEFAULT_ZAP_V1_ADDRESS,
    cyber: DEFAULT_ZAP_V1_ADDRESS,
    apeChain: DEFAULT_ZAP_V1_ADDRESS,
    shibarium: DEFAULT_ZAP_V1_ADDRESS,
    unichain: DEFAULT_ZAP_V1_ADDRESS,
  },
  zapV2: {
    base: '0x7d999874eAe10f170C4813270173363468A559cD',
    // ZapV2 is only available on Base for now
  },
} as const;

export function getBondAddress(chain: SupportedChain): `0x${string}` {
  return CONTRACT_ADDRESSES.bond[chain];
}

export function getZapV1Address(chain: SupportedChain): `0x${string}` {
  return CONTRACT_ADDRESSES.zapV1[chain];
}

export function getZapV2Address(chain: SupportedChain): `0x${string}` | null {
  if (chain === 'base') {
    return CONTRACT_ADDRESSES.zapV2.base;
  }
  return null;
}

export function isZapV2Supported(chain: SupportedChain): boolean {
  return chain === 'base';
}