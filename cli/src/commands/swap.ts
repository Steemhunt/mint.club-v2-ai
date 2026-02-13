import { type Address, formatUnits, parseUnits, encodeAbiParameters, parseAbiParameters } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND, WETH, resolveToken, tokenSymbol, tokenDecimals } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { executeTransaction } from '../utils/transaction';
import { findBestRoute, type Route } from '../utils/router';
import { fmt, parse } from '../utils/format';
import { getBondInfo, getMintCost } from '../utils/bond';
import {
  WRAP_ETH_COMMAND,
  UNWRAP_WETH_COMMAND,
  encodeWrapEthInput,
  encodeUnwrapWethInput,
  parsePath,
  encodeV3Path,
} from '../utils/swap';
import { encodeV4SwapExactInSingle, V4_SWAP_COMMAND } from '../utils/v4swap';
import { parseZapToken, resolveZapPath, getZapDeadline } from '../utils/zap';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { ZAP_V2 } from '../config/contracts';
import {
  encodeV3SwapInput as encodeV3SwapInputFromSwap,
  V3_SWAP_COMMAND,
  WRAP_ETH_COMMAND as WRAP_CMD,
  encodeWrapEthInput as encodeWrapInput,
} from '../utils/swap';

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

/** Check if a token is a Mint Club bonding curve token. Returns bond info or null. */
async function checkMCToken(client: any, token: Address) {
  try {
    const bondData = await client.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token],
    });
    const [creator, mintRoyalty, burnRoyalty, createdAt, reserveToken, reserveBalance] = bondData;
    // If createdAt is 0, it's not a bonding curve token
    if (createdAt === 0n || createdAt === 0) return null;
    return { creator, mintRoyalty, burnRoyalty, createdAt, reserveToken: reserveToken as Address, reserveBalance };
  } catch {
    return null;
  }
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

  const inputDec = tokenDecimals(inputAddr);
  const amountIn = parseUnits(amount, inputDec);

  // Check if either token is a Mint Club bonding curve token
  const [outputBond, inputBond] = await Promise.all([
    checkMCToken(publicClient, outputAddr),
    checkMCToken(publicClient, inputAddr),
  ]);

  const inputSym = await getSymbol(publicClient, inputAddr).catch(() => tokenSymbol(inputAddr));
  const outputSym = await getSymbol(publicClient, outputAddr).catch(() => tokenSymbol(outputAddr));

  // ── Route 1: Output is MC token → BUY path ──────────────────────────
  if (outputBond) {
    const reserveToken = outputBond.reserveToken;
    const reserveSym = await getSymbol(publicClient, reserveToken).catch(() => tokenSymbol(reserveToken));
    const inputActual = isInputETH ? WETH : inputAddr;

    if (inputActual.toLowerCase() === reserveToken.toLowerCase()) {
      // Direct buy: input IS the reserve token
      // Amount is input (reserve) to spend. Need to estimate tokens out.
      console.log(`🎯 Smart route: Direct BUY via bonding curve (${inputSym} → ${outputSym})`);
      console.log(`   ${inputSym} is the reserve token — no swap needed`);

      // Binary search for how many tokens we can mint with amountIn reserve
      const tokensOut = await estimateTokensForReserve(publicClient, outputAddr, amountIn);
      if (tokensOut === 0n) throw new Error('Amount too small to mint any tokens');

      const { reserveAmount, royalty, totalCost } = await getMintCost(publicClient, outputAddr, tokensOut);
      console.log(`   Minting ~${fmt(tokensOut)} ${outputSym} for ${fmt(totalCost)} ${reserveSym} (incl. ${fmt(royalty)} royalty)`);

      await ensureApproval(publicClient, walletClient, reserveToken, BOND, totalCost);

      await executeTransaction(publicClient, walletClient, outputAddr, {
        address: BOND, abi: BOND_ABI, functionName: 'mint',
        args: [outputAddr, tokensOut, totalCost, account],
        value: 0n,
      }, `Bought ${fmt(tokensOut)} ${outputSym} for ${fmt(totalCost)} ${reserveSym}`);
      return;
    }

    // Zap buy: input is different from reserve → swap + buy
    console.log(`⚡ Smart route: ZAP BUY (${inputSym} → swap → ${reserveSym} → bond → ${outputSym})`);
    const inputInfo = await parseZapToken(publicClient, inputAddr, true);
    const minOut = minOutput ? parse(minOutput) : 0n;

    const zapPath = await resolveZapPath(publicClient, inputAddr, reserveToken, amountIn, pathStr);
    if (zapPath.description && zapPath.amountOut) {
      console.log(`   Swap route: ${zapPath.description}`);
      console.log(`   Expected swap output: ${fmt(zapPath.amountOut)} ${reserveSym}`);
    }

    const swapInput = encodeV3SwapInputFromSwap(ZAP_V2, amountIn, 0n, zapPath.path);
    const deadline = getZapDeadline();
    let commands: `0x${string}`;
    let inputs: `0x${string}`[];

    if (inputInfo.isETH) {
      commands = ('0x' + WRAP_CMD.slice(2) + V3_SWAP_COMMAND.slice(2)) as `0x${string}`;
      inputs = [encodeWrapInput(amountIn), swapInput];
    } else {
      commands = V3_SWAP_COMMAND;
      inputs = [swapInput];
      await ensureApproval(publicClient, walletClient, inputAddr, ZAP_V2, amountIn);
    }

    const { result } = await publicClient.simulateContract({
      account: walletClient.account,
      address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint',
      args: [outputAddr, inputInfo.actualToken, amountIn, minOut, commands, inputs, deadline, account],
      value: inputInfo.isETH ? amountIn : 0n,
    });

    console.log(`   Expected: ${fmt(result[0])} ${outputSym} | Reserve used: ${fmt(result[1])} ${reserveSym}`);

    await executeTransaction(publicClient, walletClient, outputAddr, {
      address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint',
      args: [outputAddr, inputInfo.actualToken, amountIn, minOut, commands, inputs, deadline, account],
      value: inputInfo.isETH ? amountIn : 0n,
    }, `Zap bought ${fmt(result[0])} ${outputSym} with ${amount} ${inputSym}`);
    return;
  }

  // ── Route 2: Input is MC token → SELL path ──────────────────────────
  if (inputBond) {
    const reserveToken = inputBond.reserveToken;
    const reserveSym = await getSymbol(publicClient, reserveToken).catch(() => tokenSymbol(reserveToken));
    const outputActual = isOutputETH ? WETH : outputAddr;

    if (outputActual.toLowerCase() === reserveToken.toLowerCase()) {
      // Direct sell: output IS the reserve token
      console.log(`🎯 Smart route: Direct SELL via bonding curve (${inputSym} → ${outputSym})`);

      const minRef = minOutput ? parse(minOutput, tokenDecimals(reserveToken)) : 0n;

      const { result } = await publicClient.simulateContract({
        account: walletClient.account,
        address: BOND, abi: BOND_ABI, functionName: 'burn',
        args: [inputAddr, amountIn, minRef, account],
      });

      console.log(`   Selling ${amount} ${inputSym} for ~${fmt(result[0])} ${reserveSym}`);

      await ensureApproval(publicClient, walletClient, inputAddr, BOND, amountIn);

      await executeTransaction(publicClient, walletClient, undefined, {
        address: BOND, abi: BOND_ABI, functionName: 'burn',
        args: [inputAddr, amountIn, minRef, account],
        value: 0n,
      }, `Sold ${amount} ${inputSym} for ${reserveSym}`);
      return;
    }

    // Zap sell: output is different from reserve → sell + swap
    console.log(`⚡ Smart route: ZAP SELL (${inputSym} → bond → ${reserveSym} → swap → ${outputSym})`);
    const outputInfo = await parseZapToken(publicClient, outputAddr, false);
    const minOut = minOutput ? parse(minOutput, tokenDecimals(outputAddr)) : 0n;

    const zapPath = await resolveZapPath(publicClient, reserveToken, outputAddr, 0n, pathStr);
    if (zapPath.description) {
      console.log(`   Swap route: ${zapPath.description}`);
    }

    const swapInput = encodeV3SwapInputFromSwap(
      outputInfo.isETH ? ADDRESS_THIS : account,
      0n, 0n, zapPath.path,
    );
    const deadline = getZapDeadline();
    let commands: `0x${string}`;
    let inputs: `0x${string}`[];

    if (outputInfo.isETH) {
      commands = ('0x' + V3_SWAP_COMMAND.slice(2) + UNWRAP_WETH_COMMAND.slice(2)) as `0x${string}`;
      inputs = [swapInput, encodeUnwrapWethInput(account, 0n)];
    } else {
      commands = V3_SWAP_COMMAND;
      inputs = [swapInput];
    }

    await ensureApproval(publicClient, walletClient, inputAddr, ZAP_V2, amountIn);

    const { result } = await publicClient.simulateContract({
      account: walletClient.account,
      address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapBurn',
      args: [inputAddr, amountIn, outputInfo.actualToken, minOut, commands, inputs, deadline, account],
    });

    console.log(`   Expected: ${fmt(result[0])} ${outputSym} | Reserve refunded: ${fmt(result[1])} ${reserveSym}`);

    await executeTransaction(publicClient, walletClient, undefined, {
      address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapBurn',
      args: [inputAddr, amountIn, outputInfo.actualToken, minOut, commands, inputs, deadline, account],
      value: 0n,
    }, `Zap sold ${amount} ${inputSym} for ${outputSym}`);
    return;
  }

  // ── Route 3: Neither is MC → Direct Uniswap swap ───────────────────
  console.log(`🔄 Smart route: Direct Uniswap swap (${inputSym} → ${outputSym})`);

  const actualOutput = isOutputETH ? WETH : outputAddr;
  const outputDec = await publicClient.readContract({
    address: actualOutput,
    abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' }],
    functionName: 'decimals',
  }).catch(() => tokenDecimals(outputAddr));

  let route: Route;
  if (pathStr) {
    const { tokens, fees } = parsePath(pathStr);
    route = { version: 'v3', path: encodeV3Path(tokens, fees), tokens, fees, amountOut: 0n, description: 'Manual V3 path' };
  } else {
    const found = await findBestRoute(publicClient, inputAddr, outputAddr, amountIn);
    if (!found) throw new Error(`No swap route found from ${inputSym} to ${outputSym}`);
    route = found;
  }

  const minOut = minOutput
    ? parseUnits(minOutput, Number(outputDec))
    : route.amountOut > 0n
      ? (route.amountOut * BigInt(Math.floor((100 - slippage) * 100))) / 10000n
      : 0n;

  if (route.amountOut > 0n) {
    console.log(`   Expected: ~${formatUnits(route.amountOut, Number(outputDec))} ${outputSym}`);
    console.log(`   Min output: ${formatUnits(minOut, Number(outputDec))} ${outputSym} (${slippage}% slippage)`);
  }

  const cmds: number[] = [];
  const inputs: `0x${string}`[] = [];
  let value = 0n;

  if (route.version === 'v4' && route.poolKey) {
    cmds.push(V4_SWAP_COMMAND);
    inputs.push(encodeV4SwapExactInSingle(route.poolKey, route.zeroForOne!, amountIn, minOut));
    if (isInputETH) value = amountIn;
  } else {
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

  if (!isInputETH && route.version === 'v3') {
    await ensureApproval(publicClient, walletClient, inputAddr, UNIVERSAL_ROUTER, amountIn);
  }

  await executeTransaction(publicClient, walletClient, undefined, {
    address: UNIVERSAL_ROUTER, abi: ROUTER_ABI, functionName: 'execute',
    args: [commandsHex, inputs, deadline],
    value,
  }, `Swapped ${amount} ${inputSym} → ${outputSym}`);
}

/**
 * Binary search: estimate how many tokens can be minted for a given reserve amount.
 * Returns the max tokens where totalCost <= reserveAmount.
 */
async function estimateTokensForReserve(
  client: any, token: Address, reserveAmount: bigint,
): Promise<bigint> {
  const UNIT = 10n ** 18n;
  let lo = UNIT / 100n; // 0.01 tokens
  let hi = reserveAmount * 100n; // rough upper bound
  let best = 0n;

  // First check if hi is too large
  try {
    const [cost, royalty] = await client.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, hi],
    });
    if (cost + royalty <= reserveAmount) return hi;
  } catch {
    hi = reserveAmount * 10n; // reduce upper bound
  }

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2n;
    if (mid === lo) break;
    try {
      const [cost, royalty] = await client.readContract({
        address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, mid],
      });
      if (cost + royalty <= reserveAmount) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    } catch {
      hi = mid;
    }
  }
  return best;
}
