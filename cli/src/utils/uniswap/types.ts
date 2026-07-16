import type { Address } from 'viem';

export type UniswapProtocol = 'v2' | 'v3' | 'v4';

export interface RouteCandidate {
  protocol: UniswapProtocol;
  currencies: readonly Address[];
  fees: readonly number[];
  tickSpacings: readonly number[];
}

export interface CandidateRequest {
  input: Address;
  output: Address;
  wrappedNative: Address;
  intermediaries: readonly Address[];
}

export interface RoutingToken {
  address: Address;
  chainId: number;
  symbol: string;
  decimals: string;
}

interface ClassicPoolBase {
  tokenIn: RoutingToken;
  tokenOut: RoutingToken;
}

export interface V2ClassicPool extends ClassicPoolBase {
  type: 'v2-pool';
  reserve0: { token: RoutingToken; quotient: string };
  reserve1: { token: RoutingToken; quotient: string };
}

export interface V3ClassicPool extends ClassicPoolBase {
  type: 'v3-pool';
  fee: string;
  sqrtRatioX96: string;
  liquidity: string;
  tickCurrent: string;
}

export interface V4ClassicPool extends ClassicPoolBase {
  type: 'v4-pool';
  fee: string;
  tickSpacing: string;
  hooks: Address;
  sqrtRatioX96: string;
  liquidity: string;
  tickCurrent: string;
}

export type ClassicPool = V2ClassicPool | V3ClassicPool | V4ClassicPool;

export interface QuotedRoute {
  protocol: UniswapProtocol | 'none';
  inputToken: RoutingToken;
  outputToken: RoutingToken;
  amountIn: bigint;
  amountOut: bigint;
  pools: ClassicPool[];
}

export interface V2PoolState {
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
}
