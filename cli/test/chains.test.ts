import { describe, expect, it } from 'vitest';
import { getPublicClient } from '../src/client';
import { getChainConfig } from '../src/config/chains';
import { resolveToken } from '../src/config/contracts';
import { txUrl } from '../src/utils/format';
import { getSymbol } from '../src/utils/symbol';

describe('chain configuration', () => {
  it('returns the official Robinhood chain and protocol contracts', () => {
    const config = getChainConfig('robinhood');

    expect(config.chain.id).toBe(4663);
    expect(config.chain.name).toBe('Robinhood Chain');
    expect(config.contracts.tokenImplementation).toBe(
      '0xEb54dACB4C2ccb64F8074eceEa33b5eBb38E5387',
    );
    expect(config.contracts.bond).toBe(
      '0x91523b39813F3F4E406ECe406D0bEAaA9dE251fa',
    );
    expect(config.contracts.zap).toBe(
      '0xA3dCf3Ca587D9929d540868c924f208726DC9aB6',
    );
    expect(config.tokens.WETH.address).toBe(
      '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    );
    expect(config.tokens.USDG.address).toBe(
      '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    );
    expect(config.chain.blockExplorers?.default.url).toBe(
      'https://robinhoodchain.blockscout.com',
    );
  });

  it('resolves known token symbols within the selected chain', () => {
    expect(resolveToken('WETH', 'robinhood')).toBe(
      '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    );
    expect(resolveToken('WETH', 'base')).toBe(
      '0x4200000000000000000000000000000000000006',
    );
    expect(() => resolveToken('HUNT', 'robinhood')).toThrow(
      'Unknown token "HUNT" on Robinhood Chain',
    );
  });

  it('creates clients for the selected chain', () => {
    expect(getPublicClient('base').chain?.id).toBe(8453);
    expect(getPublicClient('robinhood').chain?.id).toBe(4663);
  });

  it('builds transaction links for the selected chain explorer', () => {
    expect(txUrl('0xabc', 'base')).toBe('https://basescan.org/tx/0xabc');
    expect(txUrl('0xabc', 'robinhood')).toBe(
      'https://robinhoodchain.blockscout.com/tx/0xabc',
    );
  });

  it('recognizes known token symbols on the selected chain', async () => {
    const client = {
      readContract: async () => {
        throw new Error('known tokens should not require an RPC read');
      },
    };
    await expect(
      getSymbol(
        client,
        '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        'robinhood',
      ),
    ).resolves.toBe('WETH');
  });
});
