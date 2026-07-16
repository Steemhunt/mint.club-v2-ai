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
});
