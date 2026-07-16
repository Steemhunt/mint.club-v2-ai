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
    const cliEntrypoint = require.resolve('mint.club-cli');
    return { command: process.execPath, args: [cliEntrypoint, ...argv] };
  } catch {
    throw new Error(
      'mint.club-cli 2.x is not installed; reinstall @elizaos/plugin-mintclub with production dependencies',
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
    /\b(buy|mint)\b/i.test(text) &&
    !/\bzap\b|\bwith\s+(?:native\s+)?eth\b/i.test(text),
  examplePrompt: 'Buy 10 SIGNET',
  exampleResult: 'Minted 10 SIGNET through MCV2_Bond.',
});

const sellTokenAction = createAction({
  name: 'SELL_TOKEN',
  similes: ['BURN_TOKEN', 'BOND_SELL'],
  description: 'Burn a token for its Bond reserve ERC-20',
  validateText: (text) =>
    /\b(sell|burn)\b/i.test(text) &&
    !/\bzap\b|\bfor\s+(?:native\s+)?eth\b/i.test(text),
  examplePrompt: 'Sell 5 SIGNET',
  exampleResult: 'Burned 5 SIGNET through MCV2_Bond.',
});

const zapBuyAction = createAction({
  name: 'ZAP_BUY',
  similes: ['BUY_WITH_ETH', 'MINT_WITH_ETH'],
  description:
    'Mint a WETH-reserve token with native ETH via MCV2_ZapV1',
  validateText: (text) =>
    /\b(buy|mint)\b/i.test(text) &&
    (/\bzap\b/i.test(text) || /\bwith\s+(?:native\s+)?eth\b/i.test(text)),
  examplePrompt: 'Buy 10 TOKEN with ETH on Robinhood',
  exampleResult: 'Minted 10 TOKEN with native ETH through MCV2_ZapV1.',
});

const zapSellAction = createAction({
  name: 'ZAP_SELL',
  similes: ['SELL_FOR_ETH', 'BURN_TO_ETH'],
  description:
    'Burn a WETH-reserve token for native ETH via MCV2_ZapV1',
  validateText: (text) =>
    /\b(sell|burn)\b/i.test(text) &&
    (/\bzap\b/i.test(text) || /\bfor\s+(?:native\s+)?eth\b/i.test(text)),
  examplePrompt: 'Sell 5 TOKEN for ETH on Robinhood',
  exampleResult: 'Burned 5 TOKEN for native ETH through MCV2_ZapV1.',
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
  description: 'Send native ETH or an ERC-20 token to an address',
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
    'Provides context about Mint Club V2 protocol operations on Base and Robinhood Chain',
  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ): Promise<ProviderResult> => ({
    text: [
      'Mint Club V2 bonding curve actions:',
      '- TOKEN_INFO / TOKEN_PRICE: read token data',
      '- BUY_TOKEN / SELL_TOKEN: MCV2_Bond mint and burn with reserve ERC-20',
      '- ZAP_BUY / ZAP_SELL: MCV2_ZapV1 native ETH operations for WETH-reserve tokens',
      '- WALLET_BALANCE: show chain-local wallet balances',
      '- SEND_TOKEN: send native ETH or ERC-20 tokens',
      '- CREATE_TOKEN: create an ERC-20 bonding curve token',
      '',
      'Supported chains: Base (default) and Robinhood Chain.',
      'The compatible mc CLI is installed as a plugin dependency; write actions require CLI wallet configuration.',
    ].join('\n'),
    values: {
      platform: 'Mint Club V2',
      cli: 'mint.club-cli',
      chains: 'base,robinhood',
    },
    data: {},
  }),
};

export const mintclubPlugin: Plugin = {
  name: 'plugin-mintclub',
  description:
    'Mint Club V2 plugin for protocol-native bonding curve operations on Base and Robinhood Chain',
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
