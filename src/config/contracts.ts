import type { Address } from 'viem';
import type { SupportedChain } from './chains';

const DEFAULT_BOND: Address = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
const DEFAULT_ZAP: Address = '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa';

const BOND_OVERRIDES: Partial<Record<SupportedChain, Address>> = {
  avalanche: '0x3Fd5B4DcDa968C8e22898523f5343177F94ccfd1',
  blast: '0x621c335b4BD8f2165E120DC70d3AfcAfc6628681',
  degen: '0x3bc6B601196752497a68B2625DB4f2205C3b150b',
};

const ZAP_V1_OVERRIDES: Partial<Record<SupportedChain, Address>> = {
  avalanche: '0x29b0E6D2C2884aEa3FB4CB5dD1C7002A8E10c724',
  blast: '0x06FD26c092Db44E5491abB7cDC580CE24D93030c',
  degen: '0x1349A9DdEe26Fe16D0D44E35B3CB9B0CA18213a4',
};

const ZAP_V2: Partial<Record<SupportedChain, Address>> = {
  base: '0x7d999874eAe10f170C4813270173363468A559cD',
};

export const getBondAddress = (chain: SupportedChain): Address =>
  BOND_OVERRIDES[chain] ?? DEFAULT_BOND;

export const getZapV1Address = (chain: SupportedChain): Address =>
  ZAP_V1_OVERRIDES[chain] ?? DEFAULT_ZAP;

export const getZapV2Address = (chain: SupportedChain): Address | null =>
  ZAP_V2[chain] ?? null;
