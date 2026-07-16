#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const CHAIN_PROPERTY = {
  type: 'string',
  enum: ['base', 'robinhood'],
  default: 'base',
  description: 'Chain to use',
} as const;

const tokenProperty = {
  type: 'string',
  description: 'Token address or chain-local symbol',
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: 'token_info',
    description:
      'Get Mint Club V2 token supply, reserve, bonding curve, price, and USD values',
    inputSchema: {
      type: 'object' as const,
      properties: { chain: CHAIN_PROPERTY, token: tokenProperty },
      required: ['token'],
    },
  },
  {
    name: 'token_price',
    description: 'Get a Mint Club token price in its reserve token and USD',
    inputSchema: {
      type: 'object' as const,
      properties: { chain: CHAIN_PROPERTY, token: tokenProperty },
      required: ['token'],
    },
  },
  {
    name: 'wallet_balance',
    description: 'Get the configured wallet address and chain-local balances',
    inputSchema: {
      type: 'object' as const,
      properties: { chain: CHAIN_PROPERTY },
    },
  },
  {
    name: 'buy_token',
    description: 'Mint tokens with the Bond reserve ERC-20',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        token: tokenProperty,
        amount: { type: 'string', description: 'Exact tokens to mint' },
        maxCost: {
          type: 'string',
          description: 'Maximum reserve-token cost (optional)',
        },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'sell_token',
    description: 'Burn tokens for the Bond reserve ERC-20',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        token: tokenProperty,
        amount: { type: 'string', description: 'Exact tokens to burn' },
        minRefund: {
          type: 'string',
          description: 'Minimum reserve-token refund (optional)',
        },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'zap_buy',
    description:
      'Mint a WETH-reserve token with native ETH via MCV2_ZapV1.mintWithEth',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        token: tokenProperty,
        amount: { type: 'string', description: 'Exact tokens to mint' },
        maxCost: {
          type: 'string',
          description: 'Maximum native ETH cost (optional)',
        },
        slippage: {
          type: 'string',
          description: 'Quote slippage percent when maxCost is omitted',
          default: '1',
        },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'zap_sell',
    description:
      'Burn a WETH-reserve token for native ETH via MCV2_ZapV1.burnToEth',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        token: tokenProperty,
        amount: { type: 'string', description: 'Exact tokens to burn' },
        minRefund: {
          type: 'string',
          description: 'Minimum native ETH refund (optional)',
        },
        slippage: {
          type: 'string',
          description: 'Quote slippage percent when minRefund is omitted',
          default: '1',
        },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'send_token',
    description: 'Send native ETH or an ERC-20 token',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        to: { type: 'string', description: 'Recipient address' },
        amount: { type: 'string', description: 'Amount to send' },
        token: {
          type: 'string',
          description: 'ERC-20 symbol/address; omit for native ETH',
        },
      },
      required: ['to', 'amount'],
    },
  },
  {
    name: 'create_token',
    description: 'Create a new Mint Club V2 bonding curve token',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: CHAIN_PROPERTY,
        name: { type: 'string', description: 'Token name' },
        symbol: { type: 'string', description: 'Token symbol' },
        reserve: {
          type: 'string',
          description: 'Reserve token address or chain-local symbol',
        },
        maxSupply: { type: 'string', description: 'Maximum supply' },
        curve: {
          type: 'string',
          enum: ['linear', 'exponential', 'logarithmic', 'flat'],
          description: 'Curve preset',
        },
        initialPrice: { type: 'string', description: 'Starting price' },
        finalPrice: { type: 'string', description: 'Final price' },
      },
      required: [
        'name',
        'symbol',
        'reserve',
        'maxSupply',
        'curve',
        'initialPrice',
        'finalPrice',
      ],
    },
  },
] as const;

type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];
type ToolArguments = Record<string, unknown> | undefined;

function requiredString(args: ToolArguments, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value;
}

function optionalString(args: ToolArguments, key: string): string | undefined {
  const value = args?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value;
}

function selectedChain(args: ToolArguments): 'base' | 'robinhood' {
  const chain = args?.chain ?? 'base';
  if (chain !== 'base' && chain !== 'robinhood') {
    throw new Error(`Unsupported chain: ${String(chain)}`);
  }
  return chain;
}

function appendOption(
  argv: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) argv.push(flag, value);
}

export function buildCliArgs(
  tool: ToolName,
  args: ToolArguments,
): string[] {
  const argv = ['--chain', selectedChain(args)];

  switch (tool) {
    case 'token_info':
      return [...argv, 'info', requiredString(args, 'token')];
    case 'token_price':
      return [...argv, 'price', requiredString(args, 'token')];
    case 'wallet_balance':
      return [...argv, 'wallet'];
    case 'buy_token': {
      argv.push(
        'buy',
        requiredString(args, 'token'),
        '--amount',
        requiredString(args, 'amount'),
      );
      appendOption(argv, '--max-cost', optionalString(args, 'maxCost'));
      return argv;
    }
    case 'sell_token': {
      argv.push(
        'sell',
        requiredString(args, 'token'),
        '--amount',
        requiredString(args, 'amount'),
      );
      appendOption(argv, '--min-refund', optionalString(args, 'minRefund'));
      return argv;
    }
    case 'zap_buy': {
      argv.push(
        'zap-buy',
        requiredString(args, 'token'),
        '--amount',
        requiredString(args, 'amount'),
      );
      appendOption(argv, '--max-cost', optionalString(args, 'maxCost'));
      appendOption(argv, '--slippage', optionalString(args, 'slippage'));
      return argv;
    }
    case 'zap_sell': {
      argv.push(
        'zap-sell',
        requiredString(args, 'token'),
        '--amount',
        requiredString(args, 'amount'),
      );
      appendOption(argv, '--min-refund', optionalString(args, 'minRefund'));
      appendOption(argv, '--slippage', optionalString(args, 'slippage'));
      return argv;
    }
    case 'send_token': {
      argv.push(
        'send',
        requiredString(args, 'to'),
        '--amount',
        requiredString(args, 'amount'),
      );
      appendOption(argv, '--token', optionalString(args, 'token'));
      return argv;
    }
    case 'create_token': {
      argv.push(
        'create',
        '--name',
        requiredString(args, 'name'),
        '--symbol',
        requiredString(args, 'symbol'),
        '--reserve',
        requiredString(args, 'reserve'),
        '--max-supply',
        requiredString(args, 'maxSupply'),
        '--curve',
        requiredString(args, 'curve'),
        '--initial-price',
        requiredString(args, 'initialPrice'),
        '--final-price',
        requiredString(args, 'finalPrice'),
        '--yes',
      );
      return argv;
    }
  }
}

export function runCli(argv: string[]): string {
  try {
    return execFileSync(process.env.MINTCLUB_CLI ?? 'mc', argv, {
      encoding: 'utf8',
      timeout: 300_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const failure = error as { message?: string; stderr?: Buffer | string };
    const stderr = failure.stderr?.toString().trim();
    throw new Error(stderr || failure.message || 'Mint Club CLI failed');
  }
}

export function createServer(execute = runCli): Server {
  const server = new Server(
    { name: 'mintclub', version: '0.1.6' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOL_DEFINITIONS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
      if (!definition) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
      const output = execute(buildCliArgs(definition.name, args));
      return { content: [{ type: 'text' as const, text: output }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export function createSandboxServer(): Server {
  return createServer();
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Mint Club MCP server running on stdio');
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (!process.env.SMITHERY_SCAN && entrypoint === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
