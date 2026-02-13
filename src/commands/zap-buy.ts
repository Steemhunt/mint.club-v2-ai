import { cacheTokenIfNeeded } from '../utils/tokens';
import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND, ZAP_V2, WETH as WETH_ADDR } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash, txUrl } from '../utils/format';
import { encodeV3SwapInput, V3_SWAP_COMMAND, WRAP_ETH_COMMAND, encodeWrapEthInput, parsePath, encodeV3Path } from '../utils/swap';
import { findBestRoute } from '../utils/router';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export async function zapBuy(
  token: Address, inputToken: Address, inputAmount: string,
  minTokens: string | undefined, pathStr: string | undefined,
  privateKey: `0x${string}`,
) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;

  const amountIn = parse(inputAmount);
  const minOut = minTokens ? parse(minTokens) : 0n;
  const isETH = inputToken.toLowerCase() === ZERO_ADDR.toLowerCase() || inputToken.toUpperCase() === 'ETH';
  const actualInputToken: Address = isETH ? ZERO_ADDR : inputToken;

  cacheTokenIfNeeded(token, pub).catch(() => {});
  // Get reserve token
  const bondData = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] });
  const reserveToken = bondData[4] as Address;

  // Resolve swap path
  let path: `0x${string}`, routeTokens: `0x${string}`[], routeFees: number[];

  if (pathStr) {
    const parsed = parsePath(pathStr);
    routeTokens = parsed.tokens; routeFees = parsed.fees;
    path = encodeV3Path(routeTokens, routeFees);
  } else {
    const swapInput = isETH ? WETH_ADDR : inputToken;
    const route = await findBestRoute(pub, swapInput, reserveToken, amountIn);
    if (!route) throw new Error('No swap route found. Try providing --path manually.');
    path = route.path; routeTokens = route.tokens; routeFees = route.fees;
    console.log(`   Route: ${routeTokens.map(t => t.slice(0, 8)).join(' → ')}`);
    console.log(`   Expected swap output: ${fmt(route.amountOut)} reserve`);
  }

  console.log(`⚡ Spending ${inputAmount} ${isETH ? 'ETH' : inputToken.slice(0, 10)} to zap-buy ${token.slice(0, 10)}... on Base`);

  const swapInput = encodeV3SwapInput(ZAP_V2, amountIn, 0n, path);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  let commands: `0x${string}`, inputs: `0x${string}`[];
  if (isETH) {
    commands = ('0x' + WRAP_ETH_COMMAND.slice(2) + V3_SWAP_COMMAND.slice(2)) as `0x${string}`;
    inputs = [encodeWrapEthInput(amountIn), swapInput];
  } else {
    commands = V3_SWAP_COMMAND;
    inputs = [swapInput];
  }

  const args = [token, actualInputToken, amountIn, minOut, commands, inputs, deadline, account.address] as const;
  const { result } = await pub.simulateContract({
    account, address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });

  console.log(`   Expected: ${fmt(result[0])} tokens | Reserve used: ${fmt(result[1])}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({ address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint', args, value: isETH ? amountIn : 0n });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') console.log(`✅ Zap bought ${fmt(result[0])} tokens (block ${receipt.blockNumber})`);
  else throw new Error('Transaction failed');
}
