#!/usr/bin/env node
/**
 * Mint Club V2 MCP Server
 *
 * Exposes Mint Club V2 operations as MCP tools for AI assistants.
 * Uses viem directly for on-chain reads and the mc CLI for writes.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  type Address,
  getAddress,
} from 'viem';
import { base } from 'viem/chains';
import { execSync } from 'child_process';

// ── Contracts ────────────────────────────────────────────────────────────

const BOND: Address = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
const SPOT: Address = '0x00000000000D6FFc74A8feb35aF5827bf57f6786';
const WETH: Address = '0x4200000000000000000000000000000000000006';
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const TOKENS: Record<string, { address: Address; decimals: number }> = {
  ETH:  { address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  WETH: { address: WETH, decimals: 18 },
  USDC: { address: USDC, decimals: 6 },
  HUNT: { address: '0x37f0c2915CeCC7e977183B8543Fc0864d03E064C', decimals: 18 },
  MT:   { address: '0xFf45161474C39cB00699070Dd49582e417b57a7E', decimals: 18 },
};

// ── ABIs (minimal) ──────────────────────────────────────────────────────

const BOND_ABI = [
  { type: 'function', name: 'tokenBond', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' }, { name: 'mintRoyalty', type: 'uint16' },
      { name: 'burnRoyalty', type: 'uint16' }, { name: 'createdAt', type: 'uint40' },
      { name: 'reserveToken', type: 'address' }, { name: 'reserveBalance', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'getReserveForToken', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }, { name: 'tokensToMint', type: 'uint256' }],
    outputs: [{ name: 'reserveAmount', type: 'uint256' }, { name: 'royalty', type: 'uint256' }],
  },
  { type: 'function', name: 'getRefundForTokens', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }, { name: 'tokensToBurn', type: 'uint256' }],
    outputs: [{ name: 'refundAmount', type: 'uint256' }, { name: 'royalty', type: 'uint256' }],
  },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const SPOT_ABI = [
  { type: 'function', name: 'getRate', stateMutability: 'view',
    inputs: [{ name: 'srcToken', type: 'address' }, { name: 'dstToken', type: 'address' }, { name: 'useWrappers', type: 'bool' }],
    outputs: [{ name: 'weightedRate', type: 'uint256' }],
  },
] as const;

// ── Client ──────────────────────────────────────────────────────────────

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// ── Helpers ─────────────────────────────────────────────────────────────

function resolveToken(input: string): Address {
  if (input.startsWith('0x') && input.length === 42) return getAddress(input);
  const t = TOKENS[input.toUpperCase()];
  if (t) return t.address;
  throw new Error(`Unknown token: ${input}`);
}

async function getUsdPrice(token: Address): Promise<number> {
  try {
    const rate = await client.readContract({
      address: SPOT, abi: SPOT_ABI, functionName: 'getRate',
      args: [token, USDC, true],
    });
    return Number(rate) / 1e6;
  } catch { return 0; }
}

function runCli(args: string): string {
  try {
    return execSync(`mc ${args}`, { encoding: 'utf-8', timeout: 60000 }).trim();
  } catch (e: any) {
    return `Error: ${e.stderr?.trim() || e.message}`;
  }
}

// ── Server Factory ──────────────────────────────────────────────────────

function createServer() {
  const s = new Server(
    { name: 'mintclub', version: '0.1.2' },
    { capabilities: { tools: {} } },
  );

  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'token_info',
        description: 'Get Mint Club V2 token info: price, supply, reserve, bonding curve, USD values',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token address or symbol' } }, required: ['token'] },
      },
      {
        name: 'token_price',
        description: 'Get token price in reserve token and USD',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token address or symbol' } }, required: ['token'] },
      },
      {
        name: 'wallet_balance',
        description: 'Get wallet address and balances (ETH + known tokens)',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'buy_token',
        description: 'Buy (mint) bonding curve tokens with reserve token',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token address or symbol' }, amount: { type: 'string', description: 'Amount of tokens to buy' } }, required: ['token', 'amount'] },
      },
      {
        name: 'sell_token',
        description: 'Sell (burn) bonding curve tokens for reserve token',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token address or symbol' }, amount: { type: 'string', description: 'Amount of tokens to sell' } }, required: ['token', 'amount'] },
      },
      {
        name: 'swap',
        description: 'Smart swap — auto-routes via buy/sell/zap/Uniswap V3/V4',
        inputSchema: { type: 'object' as const, properties: { inputToken: { type: 'string', description: 'Input token (ETH, HUNT, USDC, or address)' }, outputToken: { type: 'string', description: 'Output token' }, amount: { type: 'string', description: 'Amount of input token' }, slippage: { type: 'string', description: 'Slippage tolerance % (default: 1)' } }, required: ['inputToken', 'outputToken', 'amount'] },
      },
      {
        name: 'zap_buy',
        description: 'Buy bonding curve tokens with any token (auto-swaps via Uniswap)',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token to buy' }, inputToken: { type: 'string', description: 'Token to pay with (ETH, USDC, etc.)' }, amount: { type: 'string', description: 'Amount of input token to spend' } }, required: ['token', 'inputToken', 'amount'] },
      },
      {
        name: 'zap_sell',
        description: 'Sell bonding curve tokens for any token (auto-swaps via Uniswap)',
        inputSchema: { type: 'object' as const, properties: { token: { type: 'string', description: 'Token to sell' }, outputToken: { type: 'string', description: 'Token to receive (ETH, USDC, etc.)' }, amount: { type: 'string', description: 'Amount of tokens to sell' } }, required: ['token', 'outputToken', 'amount'] },
      },
      {
        name: 'send_token',
        description: 'Send ETH or ERC-20 tokens to an address',
        inputSchema: { type: 'object' as const, properties: { to: { type: 'string', description: 'Recipient address' }, amount: { type: 'string', description: 'Amount to send' }, token: { type: 'string', description: 'Token symbol or address (omit for ETH)' } }, required: ['to', 'amount'] },
      },
      {
        name: 'create_token',
        description: 'Create a new bonding curve token',
        inputSchema: { type: 'object' as const, properties: { name: { type: 'string', description: 'Token name' }, symbol: { type: 'string', description: 'Token symbol' }, reserve: { type: 'string', description: 'Reserve token address or symbol' }, maxSupply: { type: 'string', description: 'Maximum supply' }, curve: { type: 'string', description: 'Curve preset: linear, exponential, logarithmic, flat' }, initialPrice: { type: 'string', description: 'Starting price' }, finalPrice: { type: 'string', description: 'Final price' } }, required: ['name', 'symbol', 'reserve', 'maxSupply'] },
      },
    ],
  }));

  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'token_info': return { content: [{ type: 'text', text: runCli(`info ${args!.token}`) }] };
        case 'token_price': return { content: [{ type: 'text', text: runCli(`price ${args!.token}`) }] };
        case 'wallet_balance': return { content: [{ type: 'text', text: runCli('wallet') }] };
        case 'buy_token': return { content: [{ type: 'text', text: runCli(`buy ${args!.token} -a ${args!.amount}`) }] };
        case 'sell_token': return { content: [{ type: 'text', text: runCli(`sell ${args!.token} -a ${args!.amount}`) }] };
        case 'swap': return { content: [{ type: 'text', text: runCli(`swap -i ${args!.inputToken} -o ${args!.outputToken} -a ${args!.amount} -s ${args!.slippage || '1'}`) }] };
        case 'zap_buy': return { content: [{ type: 'text', text: runCli(`zap-buy ${args!.token} -i ${args!.inputToken} -a ${args!.amount}`) }] };
        case 'zap_sell': return { content: [{ type: 'text', text: runCli(`zap-sell ${args!.token} -a ${args!.amount} -o ${args!.outputToken}`) }] };
        case 'send_token': return { content: [{ type: 'text', text: runCli(`send ${args!.to} -a ${args!.amount} ${args!.token ? `-t ${args!.token}` : ''}`) }] };
        case 'create_token': {
          let cmd = `create -n "${args!.name}" -s ${args!.symbol} -r ${args!.reserve} -x ${args!.maxSupply} -y`;
          if (args!.curve) cmd += ` --curve ${args!.curve}`;
          if (args!.initialPrice) cmd += ` --initial-price ${args!.initialPrice}`;
          if (args!.finalPrice) cmd += ` --final-price ${args!.finalPrice}`;
          return { content: [{ type: 'text', text: runCli(cmd) }] };
        }
        default: return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  });

  return s;
}

// ── Sandbox (for Smithery scanning) ─────────────────────────────────────

export function createSandboxServer() {
  return createServer();
}

// ── Start ───────────────────────────────────────────────────────────────

async function main() {
  const s = createServer();
  const transport = new StdioServerTransport();
  await s.connect(transport);
  console.error('Mint Club MCP server running on stdio');
}

// Don't auto-start when imported for scanning
if (!process.env.SMITHERY_SCAN) {
  main().catch(console.error);
}
