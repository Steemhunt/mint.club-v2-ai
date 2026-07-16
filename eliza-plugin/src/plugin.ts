import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import {
  SUPPORTED_CHAINS,
  buildActionArgs,
  type MintClubActionName,
} from './commands.js';

const configSchema = z.object({
  PRIVATE_KEY: z.string().min(1).optional(),
});

const require = createRequire(import.meta.url);

export function resolveCliInvocation(argv: string[]): {
  command: string;
  args: string[];
} {
  const override = process.env.MINTCLUB_CLI;
  if (override) return { command: override, args: argv };

  try {
    const cliEntrypoint = require.resolve('@mint.club/v2-cli');
    return { command: process.execPath, args: [cliEntrypoint, ...argv] };
  } catch {
    throw new Error(
      '@mint.club/v2-cli 2.x is not installed; reinstall @mint.club/v2-eliza-plugin with production dependencies',
    );
  }
}

function runMcCommand(argv: string[]): string {
  try {
    const invocation = resolveCliInvocation(argv);
    return execFileSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      timeout: 300_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const failure = error as { message?: string; stderr?: Buffer | string };
    const stderr = failure.stderr?.toString().trim();
    throw new Error(`mc command failed: ${stderr || failure.message || 'unknown error'}`);
  }
}

type ActionSpec = {
  name: MintClubActionName;
  similes: string[];
  description: string;
  validateText: (text: string) => boolean;
  examplePrompt: string;
  exampleResult: string;
};

function createAction(spec: ActionSpec): Action {
  return {
    name: spec.name,
    similes: spec.similes,
    description: spec.description,
    validate: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state?: State,
    ): Promise<boolean> => spec.validateText(message.content.text || ''),
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state?: State,
      _options?: unknown,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      try {
        const result = runMcCommand(
          buildActionArgs(spec.name, message.content.text || ''),
        );
        if (callback) {
          await callback({
            text: result,
            actions: [spec.name],
            source: message.content.source,
          });
        }
        return { text: result, success: true };
      } catch (error) {
        logger.error({ error }, `Error in ${spec.name} action`);
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    examples: [
      [
        {
          name: '{{userName}}',
          content: { text: spec.examplePrompt, actions: [] },
        },
        {
          name: '{{agentName}}',
          content: { text: spec.exampleResult, actions: [spec.name] },
        },
      ],
    ],
  };
}

function canBuildActionArgs(name: MintClubActionName, text: string): boolean {
  try {
    buildActionArgs(name, text);
    return true;
  } catch {
    return false;
  }
}

const tokenInfoAction = createAction({
  name: 'TOKEN_INFO',
  similes: ['GET_TOKEN_INFO', 'MINT_CLUB_INFO', 'MC_INFO'],
  description: 'Get information about a Mint Club V2 token',
  validateText: (text) => /\b(info|details|about)\b/i.test(text),
  examplePrompt: 'Get info about SIGNET',
  exampleResult: 'Here is the token information for SIGNET.',
});

const tokenPriceAction = createAction({
  name: 'TOKEN_PRICE',
  similes: ['GET_TOKEN_PRICE', 'MINT_CLUB_PRICE', 'MC_PRICE'],
  description: 'Get a Mint Club V2 token price in reserve and USD',
  validateText: (text) => canBuildActionArgs('TOKEN_PRICE', text),
  examplePrompt: 'What is the price of SIGNET?',
  exampleResult: 'Here is the current SIGNET price.',
});

const buyTokenAction = createAction({
  name: 'BUY_TOKEN',
  similes: ['MINT_TOKEN', 'BOND_BUY'],
  description: 'Mint a token with its Bond reserve ERC-20',
  validateText: (text) =>
    canBuildActionArgs('BUY_TOKEN', text) &&
    !canBuildActionArgs('ZAP_BUY', text),
  examplePrompt: 'Buy 10 SIGNET',
  exampleResult: 'Minted 10 SIGNET through MCV2_Bond.',
});

const sellTokenAction = createAction({
  name: 'SELL_TOKEN',
  similes: ['BURN_TOKEN', 'BOND_SELL'],
  description: 'Burn a token for its Bond reserve ERC-20',
  validateText: (text) =>
    canBuildActionArgs('SELL_TOKEN', text) &&
    !canBuildActionArgs('ZAP_SELL', text),
  examplePrompt: 'Sell 5 SIGNET',
  exampleResult: 'Burned 5 SIGNET through MCV2_Bond.',
});

const zapBuyAction = createAction({
  name: 'ZAP_BUY',
  similes: ['BUY_WITH_ASSET', 'MINT_WITH_ASSET', 'ROUTED_MINT'],
  description:
    'Mint a Mint Club token from an exact amount of a routed native/ERC-20 asset via MCV2_ZapV2',
  validateText: (text) => canBuildActionArgs('ZAP_BUY', text),
  examplePrompt: 'Buy TOKEN with 10 USDC on Arbitrum',
  exampleResult: 'Minted TOKEN from 10 USDC through MCV2_ZapV2.',
});

const zapSellAction = createAction({
  name: 'ZAP_SELL',
  similes: ['SELL_FOR_ASSET', 'BURN_TO_ASSET', 'ROUTED_BURN'],
  description:
    'Burn a Mint Club token into a routed native/ERC-20 output asset via MCV2_ZapV2',
  validateText: (text) => canBuildActionArgs('ZAP_SELL', text),
  examplePrompt: 'Sell 5 TOKEN for USDC on Unichain',
  exampleResult: 'Burned 5 TOKEN into USDC through MCV2_ZapV2.',
});

const walletBalanceAction = createAction({
  name: 'WALLET_BALANCE',
  similes: ['CHECK_BALANCE', 'MY_WALLET', 'MC_WALLET'],
  description: 'Show chain-local balances for the configured wallet',
  validateText: (text) => /\b(wallet|balance|holdings)\b/i.test(text),
  examplePrompt: 'Show my wallet balance on Robinhood',
  exampleResult: 'Here are your Robinhood Chain balances.',
});

const sendTokenAction = createAction({
  name: 'SEND_TOKEN',
  similes: ['TRANSFER_TOKEN', 'SEND_ASSET'],
  description: 'Send native currency or an ERC-20 token to an address',
  validateText: (text) => canBuildActionArgs('SEND_TOKEN', text),
  examplePrompt:
    'Send 10 USDG to 0x1111111111111111111111111111111111111111 on Robinhood',
  exampleResult: 'Sent 10 USDG on Robinhood Chain.',
});

const createTokenAction = createAction({
  name: 'CREATE_TOKEN',
  similes: ['LAUNCH_TOKEN', 'CREATE_BONDING_CURVE'],
  description: 'Create an ERC-20 Mint Club V2 bonding curve token',
  validateText: (text) => canBuildActionArgs('CREATE_TOKEN', text),
  examplePrompt:
    'Create token "My Token" (MYT) backed by USDG with max supply 1000000 using a linear curve from 0.01 to 1 on Robinhood',
  exampleResult: 'Created the MYT bonding curve token on Robinhood Chain.',
});

const mintclubProvider: Provider = {
  name: 'MINTCLUB_PROVIDER',
  description:
    'Provides context about Mint Club V2 protocol operations across supported Uniswap chains',
  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ): Promise<ProviderResult> => ({
    text: [
      'Mint Club V2 bonding curve actions:',
      '- TOKEN_INFO / TOKEN_PRICE: read token data',
      '- BUY_TOKEN / SELL_TOKEN: MCV2_Bond mint and burn of ERC-20/1155 targets with reserve ERC-20',
      '- ZAP_BUY / ZAP_SELL: MCV2_ZapV2 exact-input local Uniswap routing for native/ERC-20 assets',
      '- WALLET_BALANCE: show chain-local wallet balances',
      '- SEND_TOKEN: send native currency or ERC-20 tokens',
      '- CREATE_TOKEN: create an ERC-20 bonding curve token',
      '',
      `Supported chains: ${SUPPORTED_CHAINS.join(', ')}. Base is the default.`,
      'Zap routing enumerates direct and one-intermediary V2/V3/V4 candidates and uses the configured per-chain ZapV2 deployment.',
      'The compatible mc CLI is installed as a plugin dependency; write actions require PRIVATE_KEY or the CLI wallet file.',
    ].join('\n'),
    values: {
      platform: 'Mint Club V2',
      cli: '@mint.club/v2-cli',
      chains: SUPPORTED_CHAINS.join(','),
    },
    data: {},
  }),
};

export const mintclubPlugin: Plugin = {
  name: 'plugin-mintclub',
  description:
    'Mint Club V2 plugin for bonding curves and bounded local Uniswap ZapV2 routing across supported chains',
  config: { PRIVATE_KEY: process.env.PRIVATE_KEY },
  async init(config: Record<string, string>) {
    logger.info('Initializing Mint Club V2 plugin');
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      if (validatedConfig.PRIVATE_KEY) {
        process.env.PRIVATE_KEY = validatedConfig.PRIVATE_KEY;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((issue) => issue.message).join(', ');
        throw new Error(`Invalid plugin configuration: ${messages}`);
      }
      throw error;
    }
  },
  actions: [
    tokenInfoAction,
    tokenPriceAction,
    buyTokenAction,
    sellTokenAction,
    zapBuyAction,
    zapSellAction,
    walletBalanceAction,
    sendTokenAction,
    createTokenAction,
  ],
  providers: [mintclubProvider],
};

export default mintclubPlugin;
