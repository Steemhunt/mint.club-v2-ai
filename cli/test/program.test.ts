import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/program';

describe('CLI program', () => {
  it('exposes protocol commands with global chain selection and no generic swap', () => {
    const program = createProgram('test');
    const commandNames = program.commands.map((command) => command.name());

    expect(program.options.map((option) => option.long)).toContain('--chain');
    expect(commandNames).toContain('buy');
    expect(commandNames).toContain('sell');
    expect(commandNames).toContain('zap-buy');
    expect(commandNames).toContain('zap-sell');
    expect(commandNames).not.toContain('swap');
  });

  it('uses native-ETH ZapV1 options instead of arbitrary-token swap options', () => {
    const program = createProgram('test');
    const zapBuy = program.commands.find((command) => command.name() === 'zap-buy')!;
    const zapSell = program.commands.find((command) => command.name() === 'zap-sell')!;

    expect(zapBuy.options.map((option) => option.long)).toEqual([
      '--amount',
      '--max-cost',
      '--slippage',
    ]);
    expect(zapSell.options.map((option) => option.long)).toEqual([
      '--amount',
      '--min-refund',
      '--slippage',
    ]);
    expect(zapBuy.options.map((option) => option.long)).not.toContain('--input-token');
    expect(zapSell.options.map((option) => option.long)).not.toContain('--output-token');
    expect(zapBuy.options.map((option) => option.long)).not.toContain('--path');
  });

  it('passes the selected chain and chain-local token address to handlers', async () => {
    const calls: Array<{ token: string; chain: string }> = [];
    const program = createProgram('test', {
      info: async (token, chain) => {
        calls.push({ token, chain });
      },
    });
    program.exitOverride();

    await program.parseAsync([
      'node',
      'mc',
      '--chain',
      'robinhood',
      'info',
      'WETH',
    ]);

    expect(calls).toEqual([
      {
        token: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        chain: 'robinhood',
      },
    ]);
  });
});
