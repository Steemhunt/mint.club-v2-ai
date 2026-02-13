import { type Address, formatUnits } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND, ZAP_V2, WETH as WETH_ADDR, tokenDecimals } from '../config/contracts';
import { saveToken } from '../utils/tokens';
import { ensureApproval } from '../utils/approve';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash, txUrl } from '../utils/format';
import { encodeV3SwapInput, V3_SWAP_COMMAND, WRAP_ETH_COMMAND, encodeWrapEthInput, parsePath, encodeV3Path } from '../utils/swap';
import { findBestRoute } from '../utils/router';
import { getSymbol } from '../utils/symbol';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

export async function zapBuy(
  token: Address, inputToken: Address, inputAmount: string,
  minTokens: string | undefined, pathStr: string | undefined,
  privateKey: `0x${string}`,
) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;

  const isETH = inputToken.toLowerCase() === ZERO_ADDR.toLowerCase();
  const actualInputToken: Address = isETH ? ZERO_ADDR : inputToken;
  const inputDec = isETH ? 18 : tokenDecimals(inputToken);
  const amountIn = parse(inputAmount, inputDec);
  const minOut = minTokens ? parse(minTokens) : 0n;

  // Get symbols
  const [tokenSym, inputSym, reserveSym] = await Promise.all([
    getSymbol(pub, token),
    isETH ? Promise.resolve('ETH') : getSymbol(pub, inputToken),
    pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] })
      .then((d: any) => getSymbol(pub, d[4] as Address)),
  ]);

  const bondData = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] });
  const reserveToken = bondData[4] as Address;

  console.log(`⚡ Zap buying ${tokenSym} with ${inputAmount} ${inputSym}...`);

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
    console.log(`   Route: ${route.description}`);
    console.log(`   Expected swap output: ${fmt(route.amountOut)} ${reserveSym}`);
  }

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

  if (!isETH) await ensureApproval(pub, wallet, inputToken, ZAP_V2, amountIn);

  const args = [token, actualInputToken, amountIn, minOut, commands, inputs, deadline, account.address] as const;
  const { result } = await pub.simulateContract({
    account, address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint',
    args, value: isETH ? amountIn : 0n,
  });

  console.log(`   Expected: ${fmt(result[0])} ${tokenSym} | Reserve used: ${fmt(result[1])} ${reserveSym}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({ address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint', args, value: isETH ? amountIn : 0n });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') { saveToken(token); console.log(`✅ Zap bought ${fmt(result[0])} ${tokenSym} with ${inputAmount} ${inputSym}`); }
  else throw new Error('Transaction failed');
}
