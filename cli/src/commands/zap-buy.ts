import {
  formatUnits,
  parseUnits,
  type Address,
} from 'viem';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import { ZERO_ADDRESS, type SupportedChain } from '../config/chains';
import { calculateMinimumAmountOut } from '../utils/uniswap/encode';
import {
  DEFAULT_ZAP_DEPENDENCIES,
  createZapDeadline,
  previewTokensReceived,
  type ZapCommandDependencies,
} from '../utils/zap-v2';

export interface ZapBuyParams {
  privateKey: `0x${string}`;
  token: Address;
  inputToken: Address;
  inputAmount: string;
  minTokens?: string;
  slippageBps: number;
  chain?: SupportedChain;
}

export async function zapBuy(
  params: ZapBuyParams,
  dependencies: ZapCommandDependencies = DEFAULT_ZAP_DEPENDENCIES,
): Promise<void> {
  const chain = params.chain ?? 'base';
  // Resolve deployment before creating clients or allowing any approval side effect.
  const zapV2 = dependencies.getZapV2Address(chain);
  const { publicClient, walletClient, account } = dependencies.setupClients(
    params.privateKey,
    chain,
  );

  const [bondInfo, inputDecimals, tokenDecimals, tokenSymbol, inputSymbol] =
    await Promise.all([
      dependencies.getBondInfo(publicClient, params.token, chain),
      dependencies.getDecimals(publicClient, params.inputToken, chain),
      dependencies.getDecimals(publicClient, params.token, chain),
      dependencies.getSymbol(publicClient, params.token, chain),
      dependencies.getSymbol(publicClient, params.inputToken, chain),
    ]);
  const inputAmount = parseUnits(params.inputAmount, inputDecimals);
  if (inputAmount <= 0n) throw new Error('Input amount must be greater than zero');

  const deadline = createZapDeadline(dependencies.nowSeconds());
  console.log(
    `⚡ Zapping ${params.inputAmount} ${inputSymbol} into ${tokenSymbol}...`,
  );
  const route = await dependencies.findBestRoute({
    client: publicClient,
    chain,
    input: params.inputToken,
    output: bondInfo.reserveToken,
    amountIn: inputAmount,
  });
  const plan = dependencies.encodeUniversalRouterPlan(route, {
    recipient: zapV2,
    slippageBps: params.slippageBps,
    deadline,
  });

  const nativeInput =
    params.inputToken.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  const value = nativeInput ? inputAmount : 0n;
  if (plan.value !== value) {
    throw new Error(
      `Universal Router value mismatch: expected ${value}, encoded ${plan.value}`,
    );
  }

  console.log(
    `   Route: ${route.protocol.toUpperCase()} (${route.pools.length} pool${route.pools.length === 1 ? '' : 's'})`,
  );
  console.log(
    `   Quoted reserve: ${bondInfo.formatReserve(route.amountOut)} ${bondInfo.reserveSymbol}`,
  );

  if (!nativeInput) {
    await dependencies.ensureApproval(
      publicClient,
      walletClient,
      params.inputToken,
      zapV2,
      inputAmount,
    );
  }

  const argsWithMinimum = (minTokensOut: bigint) =>
    [
      params.token,
      params.inputToken,
      inputAmount,
      minTokensOut,
      plan.commands,
      plan.inputs,
      plan.deadline,
    ] as const;

  let minTokensOut: bigint;
  if (params.minTokens !== undefined) {
    minTokensOut = parseUnits(params.minTokens, tokenDecimals);
  } else {
    const preview = await publicClient.simulateContract({
      account,
      address: zapV2,
      abi: ZAP_V2_ABI,
      functionName: 'zapMint',
      args: argsWithMinimum(0n),
      value,
    });
    const expectedTokens = previewTokensReceived(preview.result);
    minTokensOut = calculateMinimumAmountOut(
      expectedTokens,
      params.slippageBps,
    );
    console.log(
      `   Expected: ${formatUnits(expectedTokens, tokenDecimals)} ${tokenSymbol}`,
    );
  }

  if (minTokensOut < 0n) throw new Error('Minimum token output cannot be negative');
  console.log(
    `   Minimum: ${formatUnits(minTokensOut, tokenDecimals)} ${tokenSymbol}`,
  );

  await dependencies.executeTransaction(
    publicClient,
    walletClient,
    params.token,
    {
      address: zapV2,
      abi: ZAP_V2_ABI,
      functionName: 'zapMint',
      args: argsWithMinimum(minTokensOut),
      value,
    },
    `Zapped ${params.inputAmount} ${inputSymbol} into ${tokenSymbol}`,
    chain,
  );
}
