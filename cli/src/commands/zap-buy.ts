import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { ZAP_V2 } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { fmt, parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { getBondInfo } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';
import { parseZapToken, resolveZapPath, getZapDeadline } from '../utils/zap';
import {
  encodeV3SwapInput,
  V3_SWAP_COMMAND,
  WRAP_ETH_COMMAND,
  encodeWrapEthInput,
} from '../utils/swap';

export async function zapBuy(
  token: Address,
  inputToken: Address,
  inputAmount: string,
  minTokens: string | undefined,
  pathStr: string | undefined,
  privateKey: `0x${string}`,
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
  );

  // Parse input token info
  const inputInfo = await parseZapToken(publicClient, inputToken, true);
  const amountIn = parse(inputAmount, inputInfo.decimals);
  const minOut = minTokens ? parse(minTokens) : 0n;

  // Get token and bond info
  const [tokenSymbol, bondInfo] = await Promise.all([
    getSymbol(publicClient, token),
    getBondInfo(publicClient, token),
  ]);

  console.log(`⚡ Zap buying ${tokenSymbol} with ${inputAmount} ${inputInfo.symbol}...`);

  // Resolve swap path
  const zapPath = await resolveZapPath(
    publicClient,
    inputToken,
    bondInfo.reserveToken,
    amountIn,
    pathStr,
  );

  if (zapPath.description && zapPath.amountOut) {
    console.log(`   Route: ${zapPath.description}`);
    console.log(`   Expected swap output: ${fmt(zapPath.amountOut)} ${bondInfo.reserveSymbol}`);
  }

  // Prepare swap commands
  const swapInput = encodeV3SwapInput(ZAP_V2, amountIn, 0n, zapPath.path);
  const deadline = getZapDeadline();

  let commands: `0x${string}`;
  let inputs: `0x${string}`[];

  if (inputInfo.isETH) {
    commands = ('0x' + WRAP_ETH_COMMAND.slice(2) + V3_SWAP_COMMAND.slice(2)) as `0x${string}`;
    inputs = [encodeWrapEthInput(amountIn), swapInput];
  } else {
    commands = V3_SWAP_COMMAND;
    inputs = [swapInput];
    // Approve input token spending
    await ensureApproval(publicClient, walletClient, inputToken, ZAP_V2, amountIn);
  }

  // Simulate to get expected results
  const { result } = await publicClient.simulateContract({
    account: walletClient.account,
    address: ZAP_V2,
    abi: ZAP_V2_ABI,
    functionName: 'zapMint',
    args: [token, inputInfo.actualToken, amountIn, minOut, commands, inputs, deadline, account],
    value: inputInfo.isETH ? amountIn : 0n,
  });

  console.log(
    `   Expected: ${fmt(result[0])} ${tokenSymbol} | Reserve used: ${fmt(result[1])} ${bondInfo.reserveSymbol}`,
  );

  // Execute zap mint transaction
  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: ZAP_V2,
      abi: ZAP_V2_ABI,
      functionName: 'zapMint',
      args: [token, inputInfo.actualToken, amountIn, minOut, commands, inputs, deadline, account],
      value: inputInfo.isETH ? amountIn : 0n,
    },
    `Zap bought ${fmt(result[0])} ${tokenSymbol} with ${inputAmount} ${inputInfo.symbol}`,
  );
}