import { type Address, formatUnits } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { ZAP_V2 } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { fmt, parse } from '../utils/format';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';
import { getBondInfo, getBurnRefund } from '../utils/bond';
import { executeTransaction, setupClients } from '../utils/transaction';
import { parseZapToken, resolveZapPath, getZapDeadline } from '../utils/zap';
import {
  encodeV3SwapInput,
  V3_SWAP_COMMAND,
  UNWRAP_WETH_COMMAND,
  encodeUnwrapWethInput,
} from '../utils/swap';

export async function zapSell(
  token: Address,
  amount: string,
  outputToken: Address,
  minOutput: string | undefined,
  pathStr: string | undefined,
  privateKey: `0x${string}`,
) {
  const { publicClient, walletClient, account } = setupClients(
    getPublicClient,
    getWalletClient,
    privateKey,
  );

  const tokensToBurn = parse(amount);
  const minOut = minOutput ? parse(minOutput) : 0n;

  // Parse output token info
  const outputInfo = await parseZapToken(publicClient, outputToken, false);

  // Get token and bond info
  const [tokenSymbol, bondInfo] = await Promise.all([
    getSymbol(publicClient, token),
    getBondInfo(publicClient, token),
  ]);

  console.log(`⚡ Zap selling ${amount} ${tokenSymbol} for ${outputInfo.symbol}...`);

  // Get expected refund from burning
  const { refundAmount } = await getBurnRefund(publicClient, token, tokensToBurn);

  // Resolve swap path
  const zapPath = await resolveZapPath(
    publicClient,
    bondInfo.reserveToken,
    outputToken,
    refundAmount,
    pathStr,
  );

  if (zapPath.description && zapPath.amountOut) {
    console.log(`   Route: ${zapPath.description}`);
    console.log(`   Expected swap output: ${fmt(zapPath.amountOut)} ${outputInfo.symbol}`);
  }

  // Prepare swap commands
  const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;
  const swapRecipient = outputInfo.isETH ? ADDRESS_THIS : ZAP_V2;
  const swapInput = encodeV3SwapInput(swapRecipient, refundAmount, 0n, zapPath.path);
  const deadline = getZapDeadline();

  let commands: `0x${string}`;
  let inputs: `0x${string}`[];

  if (outputInfo.isETH) {
    commands = ('0x' + V3_SWAP_COMMAND.slice(2) + UNWRAP_WETH_COMMAND.slice(2)) as `0x${string}`;
    inputs = [swapInput, encodeUnwrapWethInput(ZAP_V2, minOut)];
  } else {
    commands = V3_SWAP_COMMAND;
    inputs = [swapInput];
  }

  // Approve token burning
  await ensureApproval(publicClient, walletClient, token, ZAP_V2, tokensToBurn);

  // Simulate to get expected results
  const { result } = await publicClient.simulateContract({
    account: walletClient.account,
    address: ZAP_V2,
    abi: ZAP_V2_ABI,
    functionName: 'zapBurn',
    args: [token, tokensToBurn, outputInfo.actualToken, minOut, commands, inputs, deadline, account],
  });

  console.log(
    `   Expected: ${formatUnits(result[0], outputInfo.decimals)} ${outputInfo.symbol} | Reserve burned: ${fmt(result[1])} ${bondInfo.reserveSymbol}`,
  );

  // Execute zap burn transaction
  await executeTransaction(
    publicClient,
    walletClient,
    token,
    {
      address: ZAP_V2,
      abi: ZAP_V2_ABI,
      functionName: 'zapBurn',
      args: [token, tokensToBurn, outputInfo.actualToken, minOut, commands, inputs, deadline, account],
    },
    `Zap sold ${amount} ${tokenSymbol} for ${formatUnits(result[0], outputInfo.decimals)} ${outputInfo.symbol}`,
  );
}