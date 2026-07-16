import {
  formatUnits,
  type Address,
} from 'viem';
import { ZAP_V2_ABI } from '../abi/zap-v2';
import type { SupportedChain } from '../config/chains';
import { parseTokenAmount } from '../utils/format';
import {
  DEFAULT_ZAP_DEPENDENCIES,
  createZapDeadline,
  type ZapCommandDependencies,
} from '../utils/zap-v2';

export interface ZapSellParams {
  privateKey: `0x${string}`;
  token: Address;
  amount: string;
  outputToken: Address;
  minOutput?: string;
  slippageBps: number;
  chain?: SupportedChain;
}

export async function zapSell(
  params: ZapSellParams,
  dependencies: ZapCommandDependencies = DEFAULT_ZAP_DEPENDENCIES,
): Promise<void> {
  const chain = params.chain ?? 'base';
  // Resolve deployment before creating clients or allowing any approval side effect.
  const zapV2 = dependencies.getZapV2Address(chain);
  const { publicClient, walletClient, account } = dependencies.setupClients(
    params.privateKey,
    chain,
  );

  const [bondInfo, tokenDecimals, outputDecimals, tokenSymbol, outputSymbol] =
    await Promise.all([
      dependencies.getBondInfo(publicClient, params.token, chain),
      dependencies.getDecimals(publicClient, params.token, chain),
      dependencies.getDecimals(publicClient, params.outputToken, chain),
      dependencies.getSymbol(publicClient, params.token, chain),
      dependencies.getSymbol(publicClient, params.outputToken, chain),
    ]);
  const amount = parseTokenAmount(params.amount, tokenDecimals);
  if (amount <= 0n) throw new Error('Sell amount must be greater than zero');
  const explicitMinOutput =
    params.minOutput === undefined
      ? undefined
      : parseTokenAmount(params.minOutput, outputDecimals);
  if (explicitMinOutput !== undefined && explicitMinOutput < 0n) {
    throw new Error('Minimum output cannot be negative');
  }

  console.log(
    `⚡ Zapping ${params.amount} ${tokenSymbol} into ${outputSymbol}...`,
  );
  const { netRefund } = await dependencies.getBurnRefund(
    publicClient,
    params.token,
    amount,
    chain,
  );
  const deadline = createZapDeadline(dependencies.nowSeconds());
  const route = await dependencies.findBestRoute({
    client: publicClient,
    chain,
    input: bondInfo.reserveToken,
    output: params.outputToken,
    amountIn: netRefund,
  });
  const plan = dependencies.encodeUniversalRouterPlan(route, {
    recipient: zapV2,
    slippageBps: params.slippageBps,
    deadline,
    ...(route.protocol === 'none'
      ? {}
      : {
          inputRefund: {
            token: bondInfo.reserveToken,
            recipient: account,
          },
        }),
  });
  if (plan.value !== 0n) {
    throw new Error(
      `Zap burn route unexpectedly requires native value: ${plan.value}`,
    );
  }

  const minOutputAmount =
    explicitMinOutput !== undefined
      ? explicitMinOutput
      : route.protocol === 'none'
        ? route.amountOut
        : plan.minimumAmountOut;
  if (minOutputAmount > route.amountOut) {
    throw new Error(
      `Minimum output ${formatUnits(minOutputAmount, outputDecimals)} exceeds quoted output ${formatUnits(route.amountOut, outputDecimals)} ${outputSymbol}`,
    );
  }

  console.log(
    `   Route: ${route.protocol.toUpperCase()} (${route.pools.length} pool${route.pools.length === 1 ? '' : 's'})`,
  );
  console.log(
    `   Quote: ${formatUnits(route.amountOut, outputDecimals)} ${outputSymbol}`,
  );
  console.log(
    `   Minimum: ${formatUnits(minOutputAmount, outputDecimals)} ${outputSymbol}`,
  );

  if (tokenDecimals === 0) {
    await dependencies.ensureERC1155Approval(
      publicClient,
      walletClient,
      params.token,
      zapV2,
    );
  } else {
    await dependencies.ensureApproval(
      publicClient,
      walletClient,
      params.token,
      zapV2,
      amount,
    );
  }

  await dependencies.executeTransaction(
    publicClient,
    walletClient,
    undefined,
    {
      address: zapV2,
      abi: ZAP_V2_ABI,
      functionName: 'zapBurn',
      args: [
        params.token,
        amount,
        params.outputToken,
        minOutputAmount,
        plan.commands,
        plan.inputs,
        plan.deadline,
        account,
      ],
    },
    `Zapped ${params.amount} ${tokenSymbol} into ${outputSymbol}`,
    chain,
  );
}
