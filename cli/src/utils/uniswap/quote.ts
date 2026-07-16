import type { Address, PublicClient } from 'viem';
import {
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V3_QUOTER_V1_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V4_QUOTER_ABI,
} from '../../abi/uniswap';
import {
  CHAIN_CONFIGS,
  ZERO_ADDRESS,
  type SupportedChain,
} from '../../config/chains';
import {
  getNativeToken,
  getTokens,
} from '../../config/contracts';
import { getDecimals, getSymbol } from '../symbol';
import { encodeV3Path, generateRouteCandidates } from './candidates';
import type {
  ClassicPool,
  QuotedRoute,
  RouteCandidate,
  RoutingToken,
  UniswapProtocol,
  V2PoolState,
} from './types';
import {
  getV2AmountOut,
  orientV2Reserves,
  sortCurrencies,
} from './v2';

const SYNTHETIC_SQRT_RATIO_X96 = '79228162514264337593543950336';
const SYNTHETIC_LIQUIDITY = '1';
const SYNTHETIC_TICK = '0';
const MAX_UINT128 = (1n << 128n) - 1n;
const PROTOCOL_ORDER: Record<UniswapProtocol, number> = {
  v2: 0,
  v3: 1,
  v4: 2,
};

export interface QuoteBackend {
  getToken(address: Address): Promise<RoutingToken>;
  getV2Pool(tokenA: Address, tokenB: Address): Promise<V2PoolState | null>;
  quoteV3(candidate: RouteCandidate, amountIn: bigint): Promise<bigint | null>;
  quoteV4(candidate: RouteCandidate, amountIn: bigint): Promise<bigint | null>;
}

export interface FindBestRouteOptions {
  chain: SupportedChain;
  input: Address;
  output: Address;
  amountIn: bigint;
  client?: PublicClient;
  backend?: QuoteBackend;
  intermediaries?: readonly Address[];
  protocols?: readonly UniswapProtocol[];
  concurrency?: number;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function extractAmountOut(result: unknown): bigint {
  if (typeof result === 'bigint') return result;
  if (Array.isArray(result) && typeof result[0] === 'bigint') return result[0];
  if (
    result &&
    typeof result === 'object' &&
    'amountOut' in result &&
    typeof result.amountOut === 'bigint'
  ) {
    return result.amountOut;
  }
  throw new Error('Unexpected Uniswap quoter result');
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.name, current.message);
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      for (const key of ['shortMessage', 'details', 'reason']) {
        if (typeof record[key] === 'string') parts.push(record[key]);
      }
      current = record.cause;
    } else {
      break;
    }
  }
  return parts.join(' ').toLowerCase();
}

export function isExpectedQuoteFailure(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes('revert') ||
    text.includes('poolnotinitialized') ||
    text.includes('pool not initialized') ||
    text.includes('insufficient liquidity')
  );
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Quote concurrency must be a positive integer');
  }
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

export function createOnchainQuoteBackend(
  client: PublicClient,
  chain: SupportedChain,
): QuoteBackend {
  const config = CHAIN_CONFIGS[chain];
  const pairCache = new Map<string, Promise<V2PoolState | null>>();
  const tokenCache = new Map<string, Promise<RoutingToken>>();

  const getToken = (address: Address): Promise<RoutingToken> => {
    const key = address.toLowerCase();
    const cached = tokenCache.get(key);
    if (cached) return cached;

    const request = (async () => {
      const known = getTokens(chain).find((token) =>
        sameAddress(token.address, address),
      );
      if (known) {
        return {
          address: known.address,
          chainId: config.chain.id,
          symbol: known.symbol,
          decimals: String(known.decimals),
        };
      }
      if (sameAddress(address, ZERO_ADDRESS)) {
        const native = getNativeToken(chain);
        return {
          address: ZERO_ADDRESS,
          chainId: config.chain.id,
          symbol: native.symbol,
          decimals: String(native.decimals),
        };
      }

      const [decimals, symbol] = await Promise.all([
        getDecimals(client, address, chain),
        getSymbol(client, address, chain),
      ]);
      return {
        address,
        chainId: config.chain.id,
        symbol,
        decimals: String(decimals),
      };
    })();
    tokenCache.set(key, request);
    return request;
  };

  const getV2Pool = (
    tokenA: Address,
    tokenB: Address,
  ): Promise<V2PoolState | null> => {
    const [token0, token1] = sortCurrencies(tokenA, tokenB);
    const key = `${token0.toLowerCase()}:${token1.toLowerCase()}`;
    const cached = pairCache.get(key);
    if (cached) return cached;

    const request = (async () => {
      if (!config.uniswap.v2Factory) return null;
      const pair = (await client.readContract({
        address: config.uniswap.v2Factory,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: 'getPair',
        args: [token0, token1],
      })) as Address;
      if (sameAddress(pair, ZERO_ADDRESS)) return null;

      const [reserve0, reserve1] = (await client.readContract({
        address: pair,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: 'getReserves',
      })) as readonly [bigint, bigint, number];
      return { token0, token1, reserve0, reserve1 };
    })();
    pairCache.set(key, request);
    return request;
  };

  const quoteV3 = async (
    candidate: RouteCandidate,
    amountIn: bigint,
  ): Promise<bigint | null> => {
    try {
      const { address, version } = config.uniswap.v3Quoter;
      const simulation = await client.simulateContract({
        address,
        abi:
          version === 'v2'
            ? UNISWAP_V3_QUOTER_V2_ABI
            : UNISWAP_V3_QUOTER_V1_ABI,
        functionName: 'quoteExactInput',
        args: [encodeV3Path(candidate.currencies, candidate.fees), amountIn],
      } as never);
      const amountOut = extractAmountOut(simulation.result);
      return amountOut > 0n ? amountOut : null;
    } catch (error) {
      if (isExpectedQuoteFailure(error)) return null;
      throw error;
    }
  };

  const quoteV4 = async (
    candidate: RouteCandidate,
    amountIn: bigint,
  ): Promise<bigint | null> => {
    if (amountIn > MAX_UINT128) {
      throw new Error('V4 exact input exceeds uint128');
    }
    try {
      const simulation = await client.simulateContract({
        address: config.uniswap.v4Quoter,
        abi: UNISWAP_V4_QUOTER_ABI,
        functionName: 'quoteExactInput',
        args: [
          {
            exactCurrency: candidate.currencies[0],
            path: candidate.fees.map((fee, index) => ({
              intermediateCurrency: candidate.currencies[index + 1],
              fee,
              tickSpacing: candidate.tickSpacings[index],
              hooks: ZERO_ADDRESS,
              hookData: '0x',
            })),
            exactAmount: amountIn,
          },
        ],
      } as never);
      const amountOut = extractAmountOut(simulation.result);
      return amountOut > 0n ? amountOut : null;
    } catch (error) {
      if (isExpectedQuoteFailure(error)) return null;
      throw error;
    }
  };

  return { getToken, getV2Pool, quoteV3, quoteV4 };
}

async function quoteV2Candidate(
  candidate: RouteCandidate,
  amountIn: bigint,
  backend: QuoteBackend,
): Promise<{ amountOut: bigint; pools: ClassicPool[] } | null> {
  const states = await Promise.all(
    candidate.currencies.slice(0, -1).map((currency, index) =>
      backend.getV2Pool(currency, candidate.currencies[index + 1]),
    ),
  );
  if (states.some((state) => !state)) return null;

  let currentAmount = amountIn;
  const pools: ClassicPool[] = [];
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!;
    const tokenInAddress = candidate.currencies[index];
    const tokenOutAddress = candidate.currencies[index + 1];
    const { reserveIn, reserveOut } = orientV2Reserves(
      tokenInAddress,
      tokenOutAddress,
      state.reserve0,
      state.reserve1,
    );
    currentAmount = getV2AmountOut(currentAmount, reserveIn, reserveOut);
    if (currentAmount === 0n) return null;

    const [tokenIn, tokenOut, token0, token1] = await Promise.all([
      backend.getToken(tokenInAddress),
      backend.getToken(tokenOutAddress),
      backend.getToken(state.token0),
      backend.getToken(state.token1),
    ]);
    pools.push({
      type: 'v2-pool',
      tokenIn,
      tokenOut,
      reserve0: { token: token0, quotient: state.reserve0.toString() },
      reserve1: { token: token1, quotient: state.reserve1.toString() },
    });
  }
  return { amountOut: currentAmount, pools };
}

async function quoteV3Candidate(
  candidate: RouteCandidate,
  amountIn: bigint,
  backend: QuoteBackend,
): Promise<{ amountOut: bigint; pools: ClassicPool[] } | null> {
  const amountOut = await backend.quoteV3(candidate, amountIn);
  if (!amountOut) return null;

  const pools = await Promise.all(
    candidate.fees.map(async (fee, index) => ({
      type: 'v3-pool' as const,
      tokenIn: await backend.getToken(candidate.currencies[index]),
      tokenOut: await backend.getToken(candidate.currencies[index + 1]),
      fee: String(fee),
      sqrtRatioX96: SYNTHETIC_SQRT_RATIO_X96,
      liquidity: SYNTHETIC_LIQUIDITY,
      tickCurrent: SYNTHETIC_TICK,
    })),
  );
  return { amountOut, pools };
}

async function quoteV4Candidate(
  candidate: RouteCandidate,
  amountIn: bigint,
  backend: QuoteBackend,
): Promise<{ amountOut: bigint; pools: ClassicPool[] } | null> {
  const amountOut = await backend.quoteV4(candidate, amountIn);
  if (!amountOut) return null;

  const pools = await Promise.all(
    candidate.fees.map(async (fee, index) => ({
      type: 'v4-pool' as const,
      tokenIn: await backend.getToken(candidate.currencies[index]),
      tokenOut: await backend.getToken(candidate.currencies[index + 1]),
      fee: String(fee),
      tickSpacing: String(candidate.tickSpacings[index]),
      hooks: ZERO_ADDRESS,
      sqrtRatioX96: SYNTHETIC_SQRT_RATIO_X96,
      liquidity: SYNTHETIC_LIQUIDITY,
      tickCurrent: SYNTHETIC_TICK,
    })),
  );
  return { amountOut, pools };
}

async function quoteCandidate(
  candidate: RouteCandidate,
  amountIn: bigint,
  backend: QuoteBackend,
): Promise<{ candidate: RouteCandidate; amountOut: bigint; pools: ClassicPool[] } | null> {
  const result =
    candidate.protocol === 'v2'
      ? await quoteV2Candidate(candidate, amountIn, backend)
      : candidate.protocol === 'v3'
        ? await quoteV3Candidate(candidate, amountIn, backend)
        : await quoteV4Candidate(candidate, amountIn, backend);
  return result ? { candidate, ...result } : null;
}

export async function findBestRoute(
  options: FindBestRouteOptions,
): Promise<QuotedRoute> {
  if (options.amountIn <= 0n) {
    throw new Error('Exact input amount must be greater than zero');
  }

  const backend =
    options.backend ??
    (options.client
      ? createOnchainQuoteBackend(options.client, options.chain)
      : undefined);
  if (!backend) throw new Error('A public client or quote backend is required');

  const [inputToken, outputToken] = await Promise.all([
    backend.getToken(options.input),
    backend.getToken(options.output),
  ]);
  if (sameAddress(options.input, options.output)) {
    return {
      protocol: 'none',
      inputToken,
      outputToken,
      amountIn: options.amountIn,
      amountOut: options.amountIn,
      pools: [],
    };
  }

  const config = CHAIN_CONFIGS[options.chain];
  const allowed = new Set<UniswapProtocol>(
    options.protocols ?? ['v2', 'v3', 'v4'],
  );
  const wrappedNative = getTokens(options.chain).find(
    ({ wrappedNative }) => wrappedNative,
  );
  if (!wrappedNative) {
    throw new Error(`Wrapped native token is not configured on ${config.chain.name}`);
  }

  const candidates = generateRouteCandidates({
    input: options.input,
    output: options.output,
    wrappedNative: wrappedNative.address,
    intermediaries: options.intermediaries ?? config.routeIntermediaries,
  }).filter(({ protocol }) => allowed.has(protocol));

  const results = await mapWithConcurrency(
    candidates,
    options.concurrency ?? 8,
    (candidate) => quoteCandidate(candidate, options.amountIn, backend),
  );
  const successful = results.filter(
    (result): result is NonNullable<typeof result> => Boolean(result),
  );
  successful.sort((left, right) => {
    if (left.amountOut !== right.amountOut) {
      return left.amountOut > right.amountOut ? -1 : 1;
    }
    if (left.pools.length !== right.pools.length) {
      return left.pools.length - right.pools.length;
    }
    return (
      PROTOCOL_ORDER[left.candidate.protocol] -
      PROTOCOL_ORDER[right.candidate.protocol]
    );
  });

  const best = successful[0];
  if (!best) {
    throw new Error(
      `No bounded Uniswap route found on ${config.chain.name} for ${options.input} -> ${options.output}`,
    );
  }

  return {
    protocol: best.candidate.protocol,
    inputToken,
    outputToken,
    amountIn: options.amountIn,
    amountOut: best.amountOut,
    pools: best.pools,
  };
}
