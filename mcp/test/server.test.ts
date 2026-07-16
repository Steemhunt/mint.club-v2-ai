import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, buildCliArgs } from '../src/index';

describe('MCP tool surface', () => {
  it('exposes only protocol-native tools with chain selection', () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.name);

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
        enum: ['base', 'robinhood'],
        default: 'base',
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
        reserve: 'USDG',
        maxSupply: '1000',
      }),
    ).toThrow('Missing required argument: curve');
  });

  it('builds Robinhood ZapV1 argv without shell interpolation', () => {
    const token = 'TOKEN; touch /tmp/should-not-run';

    expect(
      buildCliArgs('zap_buy', {
        chain: 'robinhood',
        token,
        amount: '10',
        maxCost: '0.01',
        slippage: '0.5',
      }),
    ).toEqual([
      '--chain',
      'robinhood',
      'zap-buy',
      token,
      '--amount',
      '10',
      '--max-cost',
      '0.01',
      '--slippage',
      '0.5',
    ]);
  });

  it('maps ZapV1 sell to native ETH refund options', () => {
    expect(
      buildCliArgs('zap_sell', {
        token: 'TOKEN',
        amount: '5',
        minRefund: '0.001',
      }),
    ).toEqual([
      '--chain',
      'base',
      'zap-sell',
      'TOKEN',
      '--amount',
      '5',
      '--min-refund',
      '0.001',
    ]);
  });
});
