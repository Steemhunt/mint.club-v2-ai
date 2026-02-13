import { type Address, formatUnits, parseUnits, encodeAbiParameters, parseAbiParameters } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { WETH, resolveToken, tokenSymbol, tokenDecimals } from '../config/contracts';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { executeTransaction } from '../utils/transaction';
import { findBestRoute, type Route } from '../utils/router';
import {
  WRAP_ETH_COMMAND,
  UNWRAP_WETH_COMMAND,
  encodeWrapEthInput,
  encodeUnwrapWethInput,
  parsePath,
  encodeV3Path,
} from '../utils/swap';
import { encodeV4SwapExactInSingle, V4_SWAP_COMMAND } from '../utils/v4swap';

const UNIVERSAL_ROUTER: Address = '0x6fF5693b99212Da76ad316178A184AB56D299b43';
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const V3_SWAP = 0x00;

const ROUTER_ABI = [{
  type: 'function', name: 'execute', stateMutability: 'payable',
  inputs: [
    { name: 'commands', type: 'bytes' },
    { name: 'inputs', type: 'bytes[]' },
    { name: 'deadline', type: 'uint256' },
  ],
  outputs: [],
}] as const;

function encodeV3SwapInput(
  recipient: Address, amountIn: bigint, amountOutMin: bigint, path: `0x${string}`, payerIsUser: boolean,
): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256, uint256, bytes, bool'),
    [recipient, amountIn, amountOutMin, path, payerIsUser],
  );
}

export async function swap(
  inputTokenStr: string,
  outputTokenStr: string,
  amount: string,
  minOutput: string | undefined,
  pathStr: string | undefined,
  slippage: number,
  privateKey: `0x${string}`,
) {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient(privateKey);
  const account = walletClient.account!.address;

  const inputAddr = resolveToken(inputTokenStr);
  const outputAddr = resolveToken(outputTokenStr);
  const isInputETH = inputAddr.toLowerCase() === ZERO.toLowerCase();
  const isOutputETH = outputAddr.toLowerCase() === ZERO.toLowerCase();

  // Get decimals and symbols
  const inputDec = tokenDecimals(inputAddr);
  const actualOutput = isOutputETH ? WETH : outputAddr;
  const [inputSym, outputSym, outputDec] = await Promise.all([
    getSymbol(publicClient, inputAddr).catch(() => tokenSymbol(inputAddr)),
    getSymbol(publicClient, outputAddr).catch(() => tokenSymbol(outputAddr)),
    publicClient.readContract({
      address: actualOutput,
      abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' }],
      functionName: 'decimals',
    }).catch(() => tokenDecimals(outputAddr)),
  ]);

  const amountIn = parseUnits(amount, inputDec);

  // Find route (checks both V3 and V4)
  let route: Route;
  if (pathStr) {
    const { tokens, fees } = parsePath(pathStr);
    route = { version: 'v3', path: encodeV3Path(tokens, fees), tokens, fees, amountOut: 0n, description: 'Manual V3 path' };
  } else {
    const found = await findBestRoute(publicClient, inputAddr, outputAddr, amountIn);
    if (!found) throw new Error(`No swap route found from ${inputSym} to ${outputSym}`);
    route = found;
  }

  // Calculate min output with slippage
  const minOut = minOutput
    ? parseUnits(minOutput, Number(outputDec))
    : route.amountOut > 0n
      ? (route.amountOut * BigInt(Math.floor((100 - slippage) * 100))) / 10000n
      : 0n;

  console.log(`🔄 Swapping ${amount} ${inputSym} → ${outputSym} (${route.version.toUpperCase()})`);
  if (route.amountOut > 0n) {
    console.log(`   Expected: ~${formatUnits(route.amountOut, Number(outputDec))} ${outputSym}`);
    console.log(`   Min output: ${formatUnits(minOut, Number(outputDec))} ${outputSym} (${slippage}% slippage)`);
  }

  // Build UniversalRouter commands
  const cmds: number[] = [];
  const inputs: `0x${string}`[] = [];
  let value = 0n;

  if (route.version === 'v4' && route.poolKey) {
    // V4 swap: the UniversalRouter handles ETH natively for V4 (no WRAP needed)
    cmds.push(V4_SWAP_COMMAND);
    inputs.push(encodeV4SwapExactInSingle(route.poolKey, route.zeroForOne!, amountIn, minOut));
    if (isInputETH) value = amountIn;
  } else {
    // V3 swap
    if (isInputETH) {
      cmds.push(parseInt(WRAP_ETH_COMMAND, 16));
      inputs.push(encodeWrapEthInput(amountIn));
      value = amountIn;
    }

    const swapRecipient = isOutputETH ? ADDRESS_THIS : account;
    cmds.push(V3_SWAP);
    inputs.push(encodeV3SwapInput(swapRecipient, amountIn, minOut, route.path, !isInputETH));

    if (isOutputETH) {
      cmds.push(parseInt(UNWRAP_WETH_COMMAND, 16));
      inputs.push(encodeUnwrapWethInput(account, minOut));
    }
  }

  const commandsHex = ('0x' + cmds.map(c => c.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

  // Approve if ERC20 input (for V3; V4 with native ETH doesn't need approval)
  if (!isInputETH && route.version === 'v3') {
    await ensureApproval(publicClient, walletClient, inputAddr, UNIVERSAL_ROUTER, amountIn);
  }
  // For V4 with ERC20 input, the router uses Permit2 — but for now we handle native ETH only
  // TODO: Add Permit2 support for V4 ERC20 swaps

  await executeTransaction(
    publicClient, walletClient, undefined,
    {
      address: UNIVERSAL_ROUTER, abi: ROUTER_ABI, functionName: 'execute',
      args: [commandsHex, inputs, deadline],
      value,
    },
    `Swapped ${amount} ${inputSym} → ${outputSym}`,
  );
}
