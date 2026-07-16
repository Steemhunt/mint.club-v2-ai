import type { Address } from 'viem';

const compareAddresses = (left: Address, right: Address) =>
  left.toLowerCase().localeCompare(right.toLowerCase());

export function sortCurrencies(
  left: Address,
  right: Address,
): readonly [Address, Address] {
  if (left.toLowerCase() === right.toLowerCase()) {
    throw new Error('V2 currencies must be distinct');
  }
  return compareAddresses(left, right) < 0 ? [left, right] : [right, left];
}

export function orientV2Reserves(
  tokenIn: Address,
  tokenOut: Address,
  reserve0: bigint,
  reserve1: bigint,
): { reserveIn: bigint; reserveOut: bigint } {
  const [token0] = sortCurrencies(tokenIn, tokenOut);
  return tokenIn.toLowerCase() === token0.toLowerCase()
    ? { reserveIn: reserve0, reserveOut: reserve1 }
    : { reserveIn: reserve1, reserveOut: reserve0 };
}

/** Standard Uniswap V2 exact-input quote with the 0.30% LP fee. */
export function getV2AmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn < 0n || reserveIn < 0n || reserveOut < 0n) {
    throw new Error('V2 values cannot be negative');
  }
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;

  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) /
    (reserveIn * 1000n + amountInWithFee);
}
