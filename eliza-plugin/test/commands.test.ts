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
  'blast',
  'zora',
  'unichain',
  'robinhood',
  'sepolia',
];

describe('Eliza action CLI mapping', () => {
  it('exports the exact supported-chain registry', () => {
    expect(SUPPORTED_CHAINS).toEqual(expectedChains);
  });

  it('maps exact-input arbitrary-token minting to ZapV2', () => {
    expect(
      buildActionArgs(
        'ZAP_BUY',
        'Buy RHCOIN with 10 USDC on Arbitrum with 0.5% slippage',
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
    ]);
    expect(
      buildActionArgs(
        'ZAP_BUY',
        'Zap buy RHCOIN using 0.25 native currency on Avalanche',
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

  it('maps arbitrary output redemption to ZapV2', () => {
    expect(
      buildActionArgs('ZAP_SELL', 'Sell 5 RHCOIN for USDC on Unichain'),
    ).toEqual([
      '--chain',
      'unichain',
      'zap-sell',
      'RHCOIN',
      '--amount',
      '5',
      '--output-token',
      'USDC',
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
    expect(buildActionArgs('BUY_TOKEN', 'Buy 10 TOKEN on BNB Chain')).toEqual([
      '--chain',
      'bsc',
      'buy',
      'TOKEN',
      '--amount',
      '10',
    ]);
    expect(buildActionArgs('BUY_TOKEN', 'Buy 10 TOKEN on Ethereum mainnet')).toEqual([
      '--chain',
      'ethereum',
      'buy',
      'TOKEN',
      '--amount',
      '10',
    ]);
    expect(buildActionArgs('BUY_TOKEN', 'Buy 10 TOKEN on Sepolia')).toEqual([
      '--chain',
      'sepolia',
      'buy',
      'TOKEN',
      '--amount',
      '10',
    ]);
    expect(
      buildActionArgs('BUY_TOKEN', 'Buy 10 SIGNET on Base, not Robinhood'),
    ).toEqual(['--chain', 'base', 'buy', 'SIGNET', '--amount', '10']);
    expect(() =>
      buildActionArgs(
        'BUY_TOKEN',
        'Buy 10 SIGNET on Base and on Robinhood',
      ),
    ).toThrow('Specify exactly one chain');
    expect(() =>
      buildActionArgs('BUY_TOKEN', 'Buy 10 SIGNET not on Base'),
    ).toThrow('Specify exactly one chain');
  });

  it('maps native and ERC-20 sends without shell interpolation', () => {
    const recipient = '0x1111111111111111111111111111111111111111';
    expect(
      buildActionArgs(
        'SEND_TOKEN',
        `Send 1 AVAX to ${recipient} on Avalanche`,
      ),
    ).toEqual(['--chain', 'avalanche', 'send', recipient, '--amount', '1']);
    expect(
      buildActionArgs('SEND_TOKEN', `Send 10 USDC to ${recipient} on Polygon`),
    ).toEqual([
      '--chain',
      'polygon',
      'send',
      recipient,
      '--amount',
      '10',
      '--token',
      'USDC',
    ]);
  });

  it('maps complete token creation parameters', () => {
    expect(
      buildActionArgs(
        'CREATE_TOKEN',
        'Create token "My Token" (MYT) backed by USDC with max supply 1000000 using a linear curve from 0.01 to 1 on Optimism',
      ),
    ).toEqual([
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
      '--yes',
    ]);
  });

  it('rejects the old ambiguous ZapV1 target-amount syntax', () => {
    expect(() =>
      buildActionArgs('ZAP_BUY', 'Buy 10 RHCOIN with ETH on Robinhood'),
    ).toThrow('Buy TOKEN with AMOUNT INPUT_TOKEN');
  });
});
