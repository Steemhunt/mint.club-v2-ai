import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SUPPORTED_CHAINS,
  TOOL_DEFINITIONS,
  buildCliArgs,
  resolveCliInvocation,
} from '../src/index';

const originalCli = process.env.MINTCLUB_CLI;
const require = createRequire(import.meta.url);
const expectedChains = [
  'ethereum',
  'optimism',
  'arbitrum',
  'avalanche',
  'base',
  'polygon',
  'bsc',
  'zora',
  'unichain',
  'robinhood',
  'sepolia',
  'base-sepolia',
];

afterEach(() => {
  if (originalCli === undefined) delete process.env.MINTCLUB_CLI;
  else process.env.MINTCLUB_CLI = originalCli;
});

describe('MCP tool surface', () => {
  it('publishes resolvable CLI and MCP module entrypoints', () => {
    const registryPath = require.resolve(
      '@mint.club/v2-cli/chain-registry.json',
    );
    const cliPackage = JSON.parse(
      readFileSync(join(dirname(registryPath), 'package.json'), 'utf8'),
    );
    const mcpPackage = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(cliPackage.exports['.']).toBe('./dist/index.js');
    expect(mcpPackage.main).toBe('dist/index.js');
    expect(mcpPackage.module).toBe('./dist/index.js');
    expect(mcpPackage.exports['.']).toBe('./dist/index.js');
  });

  it('exposes only protocol-native tools with exact supported-chain selection', () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.name);

    expect(SUPPORTED_CHAINS).toEqual(expectedChains);
    expect(names).toEqual([
      'token_info',
      'token_price',
      'wallet_balance',
      'buy_token',
      'sell_token',
      'zap_buy',
      'zap_sell',
      'send_token',
      'create_token',
    ]);
    expect(names).not.toContain('swap');

    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema.properties.chain).toMatchObject({
        enum: expectedChains,
        default: 'base',
      });
      const isReadOnly = [
        'token_info',
        'token_price',
        'wallet_balance',
      ].includes(tool.name);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: isReadOnly,
        destructiveHint: !isReadOnly,
      });
    }
  });

  it('requires a complete curve definition for create_token', () => {
    const tool = TOOL_DEFINITIONS.find(
      (definition) => definition.name === 'create_token',
    );

    expect(tool?.inputSchema.required).toEqual([
      'name',
      'symbol',
      'reserve',
      'maxSupply',
      'curve',
      'initialPrice',
      'finalPrice',
    ]);
    expect(() =>
      buildCliArgs('create_token', {
        name: 'Token',
        symbol: 'TKN',
        reserve: 'USDC',
        maxSupply: '1000',
      }),
    ).toThrow('Missing required argument: curve');
  });

  it('defines exact-input arbitrary-token ZapV2 schemas', () => {
    const buy = TOOL_DEFINITIONS.find(({ name }) => name === 'zap_buy')!;
    const sell = TOOL_DEFINITIONS.find(({ name }) => name === 'zap_sell')!;

    expect(buy.description).toContain('MCV2_ZapV2');
    expect(buy.inputSchema.required).toEqual([
      'token',
      'inputToken',
      'inputAmount',
    ]);
    expect(Object.keys(buy.inputSchema.properties)).toEqual([
      'chain',
      'token',
      'inputToken',
      'inputAmount',
      'minTokens',
      'slippage',
    ]);
    expect(sell.inputSchema.required).toEqual([
      'token',
      'amount',
      'outputToken',
    ]);
    expect(Object.keys(sell.inputSchema.properties)).not.toContain('minRefund');
  });

  it('builds multichain ZapV2 buy argv without shell interpolation', () => {
    const token = 'TOKEN; touch /tmp/should-not-run';

    expect(
      buildCliArgs('zap_buy', {
        chain: 'arbitrum',
        token,
        inputToken: 'USDT',
        inputAmount: '10',
        minTokens: '2',
        slippage: '0.5',
      }),
    ).toEqual([
      '--chain',
      'arbitrum',
      'zap-buy',
      token,
      '--input-token',
      'USDT',
      '--input-amount',
      '10',
      '--min-tokens',
      '2',
      '--slippage',
      '0.5',
    ]);
  });

  it('maps ZapV2 sell output token and minimum options', () => {
    expect(
      buildCliArgs('zap_sell', {
        chain: 'unichain',
        token: 'TOKEN',
        amount: '5',
        outputToken: 'USDC',
        minOutput: '4.5',
      }),
    ).toEqual([
      '--chain',
      'unichain',
      'zap-sell',
      'TOKEN',
      '--amount',
      '5',
      '--output-token',
      'USDC',
      '--min-output',
      '4.5',
    ]);
    expect(() => buildCliArgs('wallet_balance', { chain: 'degen' })).toThrow(
      'Unsupported chain: degen',
    );
  });

  it('passes an explicit CLI override as an executable plus argv array', () => {
    process.env.MINTCLUB_CLI = '/tmp/fake-mc';
    expect(resolveCliInvocation(['--chain', 'base', 'wallet'])).toEqual({
      command: '/tmp/fake-mc',
      args: ['--chain', 'base', 'wallet'],
    });
  });
});
