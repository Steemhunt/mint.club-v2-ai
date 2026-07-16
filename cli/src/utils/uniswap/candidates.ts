import type { Address, Hex } from 'viem';
import { ZERO_ADDRESS } from '../../config/chains';
import type {
  CandidateRequest,
  RouteCandidate,
  UniswapProtocol,
} from './types';

export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
export const V4_POOL_VARIANTS = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
] as const;

const sameAddress = (left: Address, right: Address) =>
  left.toLowerCase() === right.toLowerCase();

function uniqueAddresses(addresses: readonly Address[]): Address[] {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function protocolCurrency(
  currency: Address,
  protocol: UniswapProtocol,
  wrappedNative: Address,
): Address {
  return protocol !== 'v4' && sameAddress(currency, ZERO_ADDRESS)
    ? wrappedNative
    : currency;
}

function currencyPaths(
  protocol: UniswapProtocol,
  request: CandidateRequest,
): Address[][] {
  const input = protocolCurrency(request.input, protocol, request.wrappedNative);
  const output = protocolCurrency(request.output, protocol, request.wrappedNative);
  const intermediaries = uniqueAddresses(request.intermediaries).filter(
    (currency) =>
      !sameAddress(currency, input) && !sameAddress(currency, output),
  );

  return [
    [input, output],
    ...intermediaries.map((currency) => [input, currency, output]),
  ];
}

function combinations<T>(values: readonly T[], length: number): T[][] {
  if (length === 0) return [[]];
  const suffixes = combinations(values, length - 1);
  return values.flatMap((value) => suffixes.map((suffix) => [value, ...suffix]));
}

function v2Candidates(request: CandidateRequest): RouteCandidate[] {
  return currencyPaths('v2', request).map((currencies) => ({
    protocol: 'v2',
    currencies,
    fees: [],
    tickSpacings: [],
  }));
}

function v3Candidates(request: CandidateRequest): RouteCandidate[] {
  return currencyPaths('v3', request).flatMap((currencies) =>
    combinations(V3_FEE_TIERS, currencies.length - 1).map((fees) => ({
      protocol: 'v3' as const,
      currencies,
      fees,
      tickSpacings: [],
    })),
  );
}

function v4Candidates(request: CandidateRequest): RouteCandidate[] {
  return currencyPaths('v4', request).flatMap((currencies) =>
    combinations(V4_POOL_VARIANTS, currencies.length - 1).map((variants) => ({
      protocol: 'v4' as const,
      currencies,
      fees: variants.map(({ fee }) => fee),
      tickSpacings: variants.map(({ tickSpacing }) => tickSpacing),
    })),
  );
}

export function generateRouteCandidates(
  request: CandidateRequest,
): RouteCandidate[] {
  if (sameAddress(request.input, request.output)) return [];
  return [
    ...v2Candidates(request),
    ...v3Candidates(request),
    ...v4Candidates(request),
  ];
}

export function encodeV3Path(
  currencies: readonly Address[],
  fees: readonly number[],
): Hex {
  if (currencies.length < 2 || fees.length !== currencies.length - 1) {
    throw new Error('V3 path length mismatch');
  }

  let encoded = currencies[0].slice(2);
  for (let index = 0; index < fees.length; index += 1) {
    const fee = fees[index];
    if (!Number.isInteger(fee) || fee < 0 || fee > 0xffffff) {
      throw new Error(`Invalid V3 fee: ${fee}`);
    }
    encoded += fee.toString(16).padStart(6, '0');
    encoded += currencies[index + 1].slice(2);
  }
  return `0x${encoded.toLowerCase()}` as Hex;
}
