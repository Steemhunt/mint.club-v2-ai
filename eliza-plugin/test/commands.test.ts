import { describe, expect, it } from 'vitest';
import { buildActionArgs } from '../src/commands';

describe('Eliza action CLI mapping', () => {
  it('maps Robinhood native ETH minting to ZapV1', () => {
    expect(
      buildActionArgs(
        'ZAP_BUY',
        'Buy 10 RHCOIN with ETH on Robinhood',
      ),
    ).toEqual([
      '--chain',
      'robinhood',
      'zap-buy',
      'RHCOIN',
      '--amount',
      '10',
    ]);
  });

  it('maps direct reserve-token trades to Bond buy and sell', () => {
    expect(buildActionArgs('BUY_TOKEN', 'Buy 25 SIGNET')).toEqual([
      '--chain',
      'base',
      'buy',
      'SIGNET',
      '--amount',
      '25',
    ]);
    expect(buildActionArgs('SELL_TOKEN', 'Sell 5 SIGNET')).toEqual([
      '--chain',
      'base',
      'sell',
      'SIGNET',
      '--amount',
      '5',
    ]);
  });

  it('maps native ETH redemption to ZapV1 burnToEth', () => {
    expect(
      buildActionArgs('ZAP_SELL', 'Sell 5 RHCOIN for ETH on Robinhood'),
    ).toEqual([
      '--chain',
      'robinhood',
      'zap-sell',
      'RHCOIN',
      '--amount',
      '5',
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

  it('honors an explicit Base chain and fails closed on mixed chains', () => {
    expect(
      buildActionArgs('BUY_TOKEN', 'Buy 10 SIGNET on Base, not Robinhood'),
    ).toEqual(['--chain', 'base', 'buy', 'SIGNET', '--amount', '10']);
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Buy 10 SIGNET on Base and on Robinhood',
      ),
    ).toThrow('Specify exactly one chain');
  });

  it('maps native and ERC-20 sends without shell interpolation', () => {
    const recipient = '0x1111111111111111111111111111111111111111';
    expect(
      buildActionArgs(
        'SEND_TOKEN',
        `Send 1 ETH to ${recipient} on Robinhood`,
      ),
    ).toEqual(['--chain', 'robinhood', 'send', recipient, '--amount', '1']);
    expect(
      buildActionArgs('SEND_TOKEN', `Send 10 USDG to ${recipient} on Base`),
    ).toEqual([
      '--chain',
      'base',
      'send',
      recipient,
      '--amount',
      '10',
      '--token',
      'USDG',
    ]);
  });

  it('maps complete token creation parameters', () => {
    expect(
      buildActionArgs(
        'CREATE_TOKEN',
        'Create token "My Token" (MYT) backed by USDG with max supply 1000000 using a linear curve from 0.01 to 1 on Robinhood',
      ),
    ).toEqual([
      '--chain',
      'robinhood',
      'create',
      '--name',
      'My Token',
      '--symbol',
      'MYT',
      '--reserve',
      'USDG',
      '--max-supply',
      '1000000',
      '--curve',
      'linear',
      '--initial-price',
      '0.01',
      '--final-price',
      '1',
      '--yes',
    ]);
  });
});
