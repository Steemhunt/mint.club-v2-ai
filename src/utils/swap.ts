import { encodePacked, encodeAbiParameters, parseAbiParameters } from 'viem';

/** Encode a Uniswap V3 multi-hop path: addr(20) + fee(3) + addr(20) + ... */
export function encodeV3Path(tokens: `0x${string}`[], fees: number[]): `0x${string}` {
  if (tokens.length !== fees.length + 1) {
    throw new Error('tokens.length must equal fees.length + 1');
  }

  let path: `0x${string}` = tokens[0];
  for (let i = 0; i < fees.length; i++) {
    const feeHex = `0x${fees[i].toString(16).padStart(6, '0')}` as `0x${string}`;
    path = encodePacked(['bytes', 'bytes', 'bytes'], [path, feeHex, tokens[i + 1]]);
  }
  return path;
}

/** ABI-encode a V3_SWAP_EXACT_IN input for the UniversalRouter */
export function encodeV3SwapInput(
  recipient: `0x${string}`,
  amountIn: bigint,
  amountOutMin: bigint,
  path: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256, uint256, bytes, bool'),
    [recipient, amountIn, amountOutMin, path, false], // payerIsUser = false
  );
}

/** Command byte for V3_SWAP_EXACT_IN */
export const V3_SWAP_COMMAND: `0x${string}` = '0x00';

/** Command byte for WRAP_ETH */
export const WRAP_ETH_COMMAND: `0x${string}` = '0x0b';

/** UniversalRouter sentinel for address(this) */
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;

/** ABI-encode WRAP_ETH input: (address recipient, uint256 amountMin) */
export function encodeWrapEthInput(amountMin: bigint): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256'),
    [ADDRESS_THIS, amountMin],
  );
}

/** Command byte for UNWRAP_WETH */
export const UNWRAP_WETH_COMMAND: `0x${string}` = '0x0c';

/** ABI-encode UNWRAP_WETH input: (address recipient, uint256 amountMin) */
export function encodeUnwrapWethInput(recipient: `0x${string}`, amountMin: bigint): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256'),
    [recipient, amountMin],
  );
}

/**
 * Parse CLI path string: "0xAddr1,fee1,0xAddr2,fee2,0xAddr3"
 * Returns tokens and fees arrays for V3 path encoding.
 */
export function parsePath(input: string): { tokens: `0x${string}`[]; fees: number[] } {
  const parts = input.split(',').map(s => s.trim());
  const tokens: `0x${string}`[] = [];
  const fees: number[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!parts[i].startsWith('0x') || parts[i].length !== 42) {
        throw new Error(`Invalid token address at position ${i}: ${parts[i]}`);
      }
      tokens.push(parts[i] as `0x${string}`);
    } else {
      const fee = parseInt(parts[i]);
      if (isNaN(fee) || fee <= 0) throw new Error(`Invalid fee: ${parts[i]}`);
      fees.push(fee);
    }
  }

  if (tokens.length !== fees.length + 1) {
    throw new Error('Path format: token0,fee,token1,fee,token2,...');
  }

  return { tokens, fees };
}
