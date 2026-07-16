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
import {
  buildActionArgs,
  type MintClubActionName,
} from './commands.js';

const configSchema = z.object({
  PRIVATE_KEY: z.string().min(1).optional(),
});

function runMcCommand(argv: string[]): string {
  try {
    return execFileSync(process.env.MINTCLUB_CLI ?? 'mc', argv, {
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
  validateText: (text) => /\b(price|worth)\b/i.test(text),
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
  examplePrompt: 'Show my Robinhood wallet balance',
  exampleResult: 'Here are your Robinhood Chain balances.',
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
      '',
      'Supported chains: Base (default) and Robinhood Chain.',
      'The mc CLI must be installed; write actions require CLI wallet configuration.',
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
  ],
  providers: [mintclubProvider],
};

export default mintclubPlugin;
