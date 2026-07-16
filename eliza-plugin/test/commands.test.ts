import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_CHAINS,
  buildActionArgs,
} from '../src/commands';

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

describe('Eliza action CLI mapping', () => {
  it('exports the exact supported-chain registry', () => {
    expect(SUPPORTED_CHAINS).toEqual(expectedChains);
  });

  it('requires a user-authored Confirm: prefix for write actions', () => {
    expect(() => buildActionArgs('BUY_TOKEN', 'Buy 25 SIGNET')).toThrow(
      'Write requests must start with "Confirm:"',
    );
    expect(
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base with maximum cost 30 reserve units',
      ),
    ).toEqual([
      '--chain',
      'base',
      'buy',
      'SIGNET',
      '--amount',
      '25',
      '--max-cost',
      '30',
      '--yes',
    ]);
    expect(buildActionArgs('TOKEN_PRICE', 'What is SIGNET worth?')).toEqual([
      '--chain',
      'base',
      'price',
      'SIGNET',
    ]);
  });

  it('requires exactly one explicit chain in confirmed writes', () => {
    expect(() =>
      buildActionArgs('BUY_TOKEN', 'Confirm: Buy 25 SIGNET'),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base and on Base',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET Base wallet with maximum cost 30 reserve units',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'CREATE_TOKEN',
        'Confirm: Create token "Token on Base" (TOB) backed by USDC with max supply 1000 using a linear curve from 1 to 2 with 100 bps mint royalty and 100 bps burn royalty',
      ),
    ).toThrow();
  });

  it('rejects negated or cancelled confirmation envelopes', () => {
    const recipient = '0x1111111111111111111111111111111111111111';

    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Do not buy 25 SIGNET on Base',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'SEND_TOKEN',
        `Confirm: Send 10 USDC to ${recipient} on Polygon, but do not execute`,
      ),
    ).toThrow();
  });

  it('rejects unmatched text and multiple write clauses', () => {
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base and notify me',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base please',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base with maximum cost 30 reserve units and',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base and sell 5 SIGNET',
      ),
    ).toThrow();
  });

  it('maps exact-input arbitrary-token minting to ZapV2', () => {
    expect(
      buildActionArgs(
        'ZAP_BUY',
        'Confirm: Buy RHCOIN with 10 USDC on Arbitrum with 0.5% slippage',
      ),
    ).toEqual([
      '--chain',
      'arbitrum',
      'zap-buy',
      'RHCOIN',
      '--input-token',
      'USDC',
      '--input-amount',
      '10',
      '--slippage',
      '0.5',
      '--yes',
    ]);
    expect(
      buildActionArgs(
        'ZAP_BUY',
        'Confirm: Zap buy RHCOIN using 0.25 native currency on Avalanche with 0.5% slippage',
      ),
    ).toEqual([
      '--chain',
      'avalanche',
      'zap-buy',
      'RHCOIN',
      '--input-token',
      'NATIVE',
      '--input-amount',
      '0.25',
      '--slippage',
      '0.5',
      '--yes',
    ]);
  });

  it('binds explicit reserve limits for direct Bond writes', () => {
    expect(
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 25 SIGNET on Base with maximum cost 30 reserve units',
      ),
    ).toEqual([
      '--chain',
      'base',
      'buy',
      'SIGNET',
      '--amount',
      '25',
      '--max-cost',
      '30',
      '--yes',
    ]);
    expect(
      buildActionArgs(
        'SELL_TOKEN',
        'Confirm: Sell 5 SIGNET on Base with minimum refund 4 reserve units',
      ),
    ).toEqual([
      '--chain',
      'base',
      'sell',
      'SIGNET',
      '--amount',
      '5',
      '--min-refund',
      '4',
      '--yes',
    ]);
    expect(() =>
      buildActionArgs('BUY_TOKEN', 'Confirm: Buy 25 SIGNET on Base'),
    ).toThrow();
    expect(() =>
      buildActionArgs('SELL_TOKEN', 'Confirm: Sell 5 SIGNET on Base'),
    ).toThrow();
  });

  it('requires explicit slippage for routed writes', () => {
    expect(() =>
      buildActionArgs(
        'ZAP_BUY',
        'Confirm: Buy RHCOIN with 10 USDC on Arbitrum',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'ZAP_SELL',
        'Confirm: Sell 5 RHCOIN for USDC on Unichain',
      ),
    ).toThrow();
  });

  it('maps arbitrary output redemption to ZapV2', () => {
    expect(
      buildActionArgs(
        'ZAP_SELL',
        'Confirm: Sell 5 RHCOIN for USDC on Unichain with 1% slippage',
      ),
    ).toEqual([
      '--chain',
      'unichain',
      'zap-sell',
      'RHCOIN',
      '--amount',
      '5',
      '--output-token',
      'USDC',
      '--slippage',
      '1',
      '--yes',
    ]);
  });

  it('keeps price validation and worth parsing aligned', () => {
    expect(buildActionArgs('TOKEN_PRICE', 'What is SIGNET worth?')).toEqual([
      '--chain',
      'base',
      'price',
      'SIGNET',
    ]);
  });

  it('recognizes chain aliases and fails closed on ambiguity', () => {
    const cases: Array<[string, string]> = [
      ['BNB Chain', 'bsc'],
      ['Ethereum mainnet', 'ethereum'],
      ['Sepolia', 'sepolia'],
      ['Ethereum Sepolia', 'sepolia'],
      ['Base Sepolia', 'base-sepolia'],
      ['BaseSepolia', 'base-sepolia'],
    ];
    for (const [alias, chain] of cases) {
      expect(
        buildActionArgs('TOKEN_PRICE', `Price of TOKEN on ${alias}`),
      ).toEqual(['--chain', chain, 'price', 'TOKEN']);
    }
    expect(() =>
      buildActionArgs(
        'TOKEN_PRICE',
        'What is SIGNET worth on Base and on Robinhood?',
      ),
    ).toThrow('Specify exactly one chain');
    expect(() =>
      buildActionArgs('TOKEN_PRICE', 'What is SIGNET worth not on Base?'),
    ).toThrow('Specify exactly one chain');
  });

  it('requires an explicit asset for sends', () => {
    const recipient = '0x1111111111111111111111111111111111111111';
    expect(() =>
      buildActionArgs(
        'SEND_TOKEN',
        `Confirm: Send 1 to ${recipient} on Base`,
      ),
    ).toThrow();
  });

  it('maps native and ERC-20 sends without shell interpolation', () => {
    const recipient = '0x1111111111111111111111111111111111111111';
    expect(
      buildActionArgs(
        'SEND_TOKEN',
        `Confirm: Send 1 ETH to ${recipient} on Ethereum`,
      ),
    ).toEqual(['--chain', 'ethereum', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs(
        'SEND_TOKEN',
        `Confirm: Send 1 AVAX to ${recipient} on Avalanche`,
      ),
    ).toEqual(['--chain', 'avalanche', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 POL to ${recipient} on Polygon`),
    ).toEqual(['--chain', 'polygon', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 MATIC to ${recipient} on Polygon`),
    ).toEqual(['--chain', 'polygon', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 NATIVE to ${recipient} on BSC`),
    ).toEqual(['--chain', 'bsc', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs(
        'SEND_TOKEN',
        `Confirm: Send 1 native currency to ${recipient} on Base`,
      ),
    ).toEqual(['--chain', 'base', 'send', recipient, '--amount', '1', '--yes']);
    expect(
      buildActionArgs('SEND_TOKEN', `Confirm: Send 10 USDC to ${recipient} on Polygon`),
    ).toEqual([
      '--chain',
      'polygon',
      'send',
      recipient,
      '--amount',
      '10',
      '--token',
      'USDC',
      '--yes',
    ]);
  });

  it('rejects native symbols that do not belong to the selected chain', () => {
    const recipient = '0x1111111111111111111111111111111111111111';
    expect(() =>
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 ETH to ${recipient} on BSC`),
    ).toThrow('ETH is not the native currency on bsc; use BNB or NATIVE');
    expect(() =>
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 AVAX to ${recipient} on Base`),
    ).toThrow('AVAX is not the native currency on base; use ETH or NATIVE');
    expect(() =>
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 MATIC to ${recipient} on Base`),
    ).toThrow('MATIC is not the native currency on base; use ETH or NATIVE');
    expect(() =>
      buildActionArgs('SEND_TOKEN', `Confirm: Send 1 POL to ${recipient} on BSC`),
    ).toThrow('POL is not the native currency on bsc; use BNB or NATIVE');
  });

  it('binds explicit token-creation royalties', () => {
    const text =
      'Confirm: Create token "My Token" (MYT) backed by USDC with max supply 1000000 using a linear curve from 0.01 to 1 on Optimism with 100 bps mint royalty and 100 bps burn royalty';
    expect(buildActionArgs('CREATE_TOKEN', text)).toEqual([
      '--chain',
      'optimism',
      'create',
      '--name',
      'My Token',
      '--symbol',
      'MYT',
      '--reserve',
      'USDC',
      '--max-supply',
      '1000000',
      '--curve',
      'linear',
      '--initial-price',
      '0.01',
      '--final-price',
      '1',
      '--mint-royalty',
      '100',
      '--burn-royalty',
      '100',
      '--yes',
    ]);
    expect(() =>
      buildActionArgs(
        'CREATE_TOKEN',
        'Confirm: Create token "My Token" (MYT) backed by USDC with max supply 1000000 using a linear curve from 0.01 to 1 on Optimism',
      ),
    ).toThrow();
  });

  it('rejects unsafe whitespace, controls, or transaction-like token names', () => {
    const message = (name: string) =>
      `Confirm: Create token "${name}" (SAFE) backed by USDC with max supply 1000 using a linear curve from 1 to 2 on Base with 100 bps mint royalty and 100 bps burn royalty`;
    const create = (name: string) => buildActionArgs('CREATE_TOKEN', message(name));

    expect(() => create('Safe\nToken sell 1 X')).toThrow();
    expect(() => create('Safe\u001b[31mToken')).toThrow();
    expect(() => create('Safe\u202eToken')).toThrow();
    expect(() => create('Safe “Sell” Token')).toThrow();
    expect(() => create('Sell 1 X')).toThrow();
    expect(() => create('SELL_TOKEN')).toThrow();
    expect(() => create('sell_1_X')).toThrow();
    expect(() => create('CONFIRM_YES')).toThrow();
    expect(() =>
      buildActionArgs(
        'CREATE_TOKEN',
        message('My Token').replace('Confirm: ', 'Confirm:\u2028'),
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'CREATE_TOKEN',
        message('My Token').replace('Create token', 'Create\u2029token'),
      ),
    ).toThrow();
    expect(create('My Token')).toContain('My Token');
  });

  it('rejects the old ambiguous ZapV1 target-amount syntax', () => {
    expect(() =>
      buildActionArgs(
        'ZAP_BUY',
        'Confirm: Buy 10 RHCOIN with ETH on Robinhood with 1% slippage',
      ),
    ).toThrow('Buy TOKEN with AMOUNT INPUT_TOKEN');
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 10 RHCOIN with ETH on Robinhood with maximum cost 20 reserve units',
      ),
    ).toThrow('Buy TOKEN with AMOUNT INPUT_TOKEN');
    expect(() =>
      buildActionArgs(
        'SELL_TOKEN',
        'Confirm: Sell 5 RHCOIN for 10 USDC on Unichain with minimum refund 4 reserve units',
      ),
    ).toThrow('Sell AMOUNT TOKEN for OUTPUT_TOKEN');
  });

  it('does not silently drop unsupported financial constraints', () => {
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Confirm: Buy 10 TOKEN on Base with maximum cost 5 USDC',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'SELL_TOKEN',
        'Confirm: Sell 10 TOKEN on Base with minimum refund 5 USDC',
      ),
    ).toThrow();
    expect(() =>
      buildActionArgs(
        'ZAP_BUY',
        'Confirm: Buy TOKEN with 5 USDC on Base with 1% slippage with minimum tokens 10',
      ),
    ).toThrow('Minimum token output is not supported');
    expect(() =>
      buildActionArgs(
        'ZAP_SELL',
        'Confirm: Sell 10 TOKEN for USDC on Base with 1% slippage with minimum output 5',
      ),
    ).toThrow('Minimum routed output is not supported');
    expect(() =>
      buildActionArgs(
        'CREATE_TOKEN',
        'Confirm: Create token "My Token" (MYT) backed by USDC with max supply 1000 using a linear curve from 1 to 2 on Base with 1% mint royalty',
      ),
    ).toThrow('basis points');
  });
});
