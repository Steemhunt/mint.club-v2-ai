import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { ZAP_V2, BOND, WETH as WETH_ADDR } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash, txUrl } from '../utils/format';
import { encodeV3Path, encodeV3SwapInput, V3_SWAP_COMMAND, parsePath, UNWRAP_WETH_COMMAND, encodeUnwrapWethInput } from '../utils/swap';
import { findBestRoute } from '../utils/router';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export async function zapSell(
  token: Address, amount: string, outputToken: Address,
  minOutput: string | undefined, pathStr: string | undefined,
  privateKey: `0x${string}`,
) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;

  const tokensToBurn = parse(amount);
  const minOut = minOutput ? parse(minOutput) : 0n;
  const isETH = outputToken.toLowerCase() === ZERO_ADDR.toLowerCase() || outputToken.toUpperCase() === 'ETH';
  const actualOutputToken: Address = isETH ? ZERO_ADDR : outputToken;

  const bondData = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] });
  const reserveToken = bondData[4] as Address;

  const [refundAmount] = await pub.readContract({
    address: BOND, abi: BOND_ABI, functionName: 'getRefundForTokens', args: [token, tokensToBurn],
  });

  let path: `0x${string}`, routeTokens: `0x${string}`[], routeFees: number[];

  if (pathStr) {
    const parsed = parsePath(pathStr);
    routeTokens = parsed.tokens; routeFees = parsed.fees;
    path = encodeV3Path(routeTokens, routeFees);
  } else {
    const swapOutput = isETH ? WETH_ADDR : outputToken;
    const route = await findBestRoute(pub, reserveToken, swapOutput, refundAmount);
    if (!route) throw new Error('No swap route found. Try providing --path manually.');
    path = route.path; routeTokens = route.tokens; routeFees = route.fees;
    console.log(`   Route: ${routeTokens.map(t => t.slice(0, 8)).join(' → ')}`);
    console.log(`   Expected swap output: ${fmt(route.amountOut)}`);
  }

  console.log(`⚡ Zap selling ${amount} tokens of ${token.slice(0, 10)}... for ${isETH ? 'ETH' : outputToken.slice(0, 10)} on Base`);

  const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;
  const swapRecipient = isETH ? ADDRESS_THIS : ZAP_V2;
  const swapInput = encodeV3SwapInput(swapRecipient, refundAmount, 0n, path);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  let commands: `0x${string}`, inputs: `0x${string}`[];
  if (isETH) {
    commands = ('0x' + V3_SWAP_COMMAND.slice(2) + UNWRAP_WETH_COMMAND.slice(2)) as `0x${string}`;
    inputs = [swapInput, encodeUnwrapWethInput(ZAP_V2, minOut)];
  } else {
    commands = V3_SWAP_COMMAND;
    inputs = [swapInput];
  }

  const args = [token, tokensToBurn, actualOutputToken, minOut, commands, inputs, deadline, account.address] as const;
  const { result } = await pub.simulateContract({ account, address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapBurn', args });

  console.log(`   Expected output: ${fmt(result[0])} | Reserve from burn: ${fmt(result[1])}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({ address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapBurn', args });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') console.log(`✅ Zap sold ${amount} tokens for ${fmt(result[0])} output (block ${receipt.blockNumber})`);
  else throw new Error('Transaction failed');
}
