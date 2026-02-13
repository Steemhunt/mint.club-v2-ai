import { encodePacked, encodeAbiParameters, parseAbiParameters } from 'viem';

// UniversalRouter V3_SWAP_EXACT_IN command
export const V3_SWAP_EXACT_IN = '0x00';

export function encodeV3SwapPath(tokens: string[], fees: number[]): `0x${string}` {
  if (tokens.length !== fees.length + 1) {
    throw new Error('Invalid path: tokens length must be fees length + 1');
  }

  let path = tokens[0] as `0x${string}`;
  
  for (let i = 0; i < fees.length; i++) {
    // Encode fee as 3 bytes (uint24)
    const feeHex = fees[i].toString(16).padStart(6, '0');
    path = encodePacked(['bytes', 'bytes', 'bytes'], [path, `0x${feeHex}`, tokens[i + 1] as `0x${string}`]);
  }
  
  return path;
}

export function encodeV3SwapInput(
  recipient: `0x${string}`,
  amountIn: bigint,
  amountOutMin: bigint,
  path: `0x${string}`,
  payerIsUser: boolean
): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address,uint256,uint256,bytes,bool'),
    [recipient, amountIn, amountOutMin, path, payerIsUser]
  );
}

export function createSwapCommands(swapCommand: string = V3_SWAP_EXACT_IN): `0x${string}` {
  return swapCommand as `0x${string}`;
}

export function parseSwapPath(pathStr: string): { tokens: string[]; fees: number[] } {
  const parts = pathStr.split(',').map(s => s.trim());
  const tokens: string[] = [];
  const fees: number[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Token address
      if (!parts[i].startsWith('0x') || parts[i].length !== 42) {
        throw new Error(`Invalid token address: ${parts[i]}`);
      }
      tokens.push(parts[i]);
    } else {
      // Fee
      const fee = parseInt(parts[i]);
      if (isNaN(fee) || fee < 0) {
        throw new Error(`Invalid fee: ${parts[i]}`);
      }
      fees.push(fee);
    }
  }
  
  if (tokens.length !== fees.length + 1) {
    throw new Error('Invalid path format. Expected: token0,fee0,token1,fee1,token2,...');
  }
  
  return { tokens, fees };
}