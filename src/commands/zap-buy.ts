import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress, getZapV2Address } from '../config/contracts';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { BOND_ABI } from '../abi/bond';
import { ERC20_ABI } from '../abi/erc20';
import { fmt, parse, shortHash } from '../utils/format';
import { encodeV3SwapInput, V3_SWAP_COMMAND, WRAP_ETH_COMMAND, encodeWrapEthInput, parsePath, encodeV3Path } from '../utils/swap';
import { findBestRoute, isRouteSupported } from '../utils/router';
import type { SupportedChain } from '../config/chains';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;
const WETH_BASE = '0x4200000000000000000000000000000000000006' as Address;

export async function zapBuy(
  token: Address, inputToken: Address, inputAmount: string,
  minTokens: string | undefined, pathStr: string | undefined,
  chain: SupportedChain, privateKey: `0x${string}`,
) {
  const zapV2 = getZapV2Address(chain);
  if (!zapV2) throw new Error(`ZapV2 not available on ${chain}`);

  const pub = getPublicClient(chain);
  const wallet = getWalletClient(chain, privateKey);
  const bond = getBondAddress(chain);
  const account = wallet.account;

  const amountIn = parse(inputAmount);
  const minOut = minTokens ? parse(minTokens) : 0n;
  const isETH = inputToken.toLowerCase() === ZERO_ADDR.toLowerCase()
    || inputToken.toUpperCase() === 'ETH';

  // Resolve input token
  const actualInputToken: Address = isETH ? ZERO_ADDR : inputToken;

  // Get reserve token for this MC token
  const bondData = await pub.readContract({
    address: bond, abi: BOND_ABI, functionName: 'tokenBond', args: [token],
  });
  const reserveToken = bondData[4] as Address;

  // Resolve swap path
  let path: `0x${string}`;
  let routeTokens: `0x${string}`[];
  let routeFees: number[];

  if (pathStr) {
    // User provided explicit path
    const parsed = parsePath(pathStr);
    routeTokens = parsed.tokens;
    routeFees = parsed.fees;
    path = encodeV3Path(routeTokens, routeFees);
  } else {
    // Auto-find best route
    if (!isRouteSupported(chain)) {
      throw new Error(`Auto routing not available on ${chain}. Provide --path manually.`);
    }

    const swapInput = isETH ? WETH_BASE : inputToken;
    const route = await findBestRoute(pub, chain, swapInput, reserveToken, amountIn);
    if (!route) {
      throw new Error('No swap route found. Try providing --path manually.');
    }

    path = route.path;
    routeTokens = route.tokens;
    routeFees = route.fees;
    console.log(`   Route: ${routeTokens.map(t => t.slice(0, 8)).join(' → ')}`);
    console.log(`   Expected swap output: ${fmt(route.amountOut)} reserve`);
  }

  console.log(`⚡ Spending ${inputAmount} ${isETH ? 'ETH' : inputToken.slice(0, 10)} to zap-buy ${token.slice(0, 10)}... on ${chain}`);

  const swapInput = encodeV3SwapInput(zapV2, amountIn, 0n, path);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // For ETH input: WRAP_ETH first (converts ETH→WETH in router), then V3_SWAP
  // For ERC-20 input: just V3_SWAP (ZapV2 transfers tokens to router)
  let commands: `0x${string}`;
  let inputs: `0x${string}`[];
  if (isETH) {
    const wrapInput = encodeWrapEthInput(amountIn);
    commands = ('0x' + WRAP_ETH_COMMAND.slice(2) + V3_SWAP_COMMAND.slice(2)) as `0x${string}`;
    inputs = [wrapInput, swapInput];
  } else {
    commands = V3_SWAP_COMMAND;
    inputs = [swapInput];
  }

  const args = [token, actualInputToken, amountIn, minOut, commands, inputs, deadline, account.address] as const;
  const { result } = await pub.simulateContract({
    account, address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });

  console.log(`   Expected: ${fmt(result[0])} tokens | Reserve used: ${fmt(result[1])}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({
    address: zapV2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });
  console.log(`   TX: ${shortHash(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`✅ Zap bought ${fmt(result[0])} tokens (block ${receipt.blockNumber})`);
  } else {
    throw new Error('Transaction failed');
  }
}
