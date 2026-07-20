import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/program';

const MC_TOKEN = '0x2222222222222222222222222222222222222222';
const PRIVATE_KEY = `0x${'11'.repeat(32)}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('CLI program', () => {
  it('exposes protocol commands with global supported-chain selection and no generic swap', () => {
    const program = createProgram('test');
    const commandNames = program.commands.map((command) => command.name());
    const chainOption = program.options.find((option) => option.long === '--chain')!;

    expect(chainOption.description).toContain('ethereum');
    expect(chainOption.description).toContain('sepolia');
    expect(commandNames).toContain('buy');
    expect(commandNames).toContain('sell');
    expect(commandNames).toContain('zap-buy');
    expect(commandNames).toContain('zap-sell');
    expect(commandNames).not.toContain('swap');
    expect(program.description()).not.toContain('Base and Robinhood');
  });

  it('uses exact-input arbitrary-token ZapV2 options', () => {
    const program = createProgram('test');
    const zapBuy = program.commands.find((command) => command.name() === 'zap-buy')!;
    const zapSell = program.commands.find((command) => command.name() === 'zap-sell')!;

    expect(zapBuy.options.map((option) => option.long)).toEqual([
      '--input-token',
      '--input-amount',
      '--min-tokens',
      '--slippage',
      '--yes',
    ]);
    expect(zapSell.options.map((option) => option.long)).toEqual([
      '--amount',
      '--output-token',
      '--min-output',
      '--slippage',
      '--yes',
    ]);
    expect(zapBuy.description()).toContain('MCV2_ZapV2');
    expect(zapSell.description()).toContain('MCV2_ZapV2');
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

  it('maps zap-buy arguments to exact-input handler parameters', async () => {
    vi.stubEnv('PRIVATE_KEY', PRIVATE_KEY);
    const calls: unknown[] = [];
    const program = createProgram('test', {
      zapBuy: async (params) => {
        calls.push(params);
      },
    });
    program.exitOverride();

    await program.parseAsync([
      'node',
      'mc',
      '--chain',
      'arbitrum',
      'zap-buy',
      MC_TOKEN,
      '--input-token',
      'USDT',
      '--input-amount',
      '10',
      '--min-tokens',
      '2',
      '--slippage',
      '0.5',
      '--yes',
    ]);

    expect(calls).toEqual([
      {
        privateKey: PRIVATE_KEY,
        token: MC_TOKEN,
        inputToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        inputAmount: '10',
        minTokens: '2',
        slippageBps: 50,
        chain: 'arbitrum',
      },
    ]);
  });

  it('maps zap-sell output token and minimum to handler parameters', async () => {
    vi.stubEnv('PRIVATE_KEY', PRIVATE_KEY);
    const calls: unknown[] = [];
    const program = createProgram('test', {
      zapSell: async (params) => {
        calls.push(params);
      },
    });
    program.exitOverride();

    await program.parseAsync([
      'node',
      'mc',
      '--chain',
      'unichain',
      'zap-sell',
      MC_TOKEN,
      '--amount',
      '5',
      '--output-token',
      'USDC',
      '--min-output',
      '4.5',
      '--yes',
    ]);

    expect(calls).toEqual([
      {
        privateKey: PRIVATE_KEY,
        token: MC_TOKEN,
        amount: '5',
        outputToken: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
        minOutput: '4.5',
        slippageBps: 100,
        chain: 'unichain',
      },
    ]);
  });

  it('requires explicit --yes before non-interactive write handlers run', async () => {
    vi.stubEnv('PRIVATE_KEY', PRIVATE_KEY);
    const calls: string[] = [];
    const overrides = {
      buy: async () => {
        calls.push('buy');
      },
      sell: async () => {
        calls.push('sell');
      },
      zapBuy: async () => {
        calls.push('zap-buy');
      },
      zapSell: async () => {
        calls.push('zap-sell');
      },
      send: async () => {
        calls.push('send');
      },
    };
    const commands = [
      ['buy', MC_TOKEN, '--amount', '1'],
      ['sell', MC_TOKEN, '--amount', '1'],
      [
        'zap-buy',
        MC_TOKEN,
        '--input-token',
        MC_TOKEN,
        '--input-amount',
        '1',
      ],
      [
        'zap-sell',
        MC_TOKEN,
        '--amount',
        '1',
        '--output-token',
        MC_TOKEN,
      ],
      ['send', MC_TOKEN, '--amount', '1'],
    ];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const argv of commands) {
      const program = createProgram('test', overrides);
      const command = program.commands.find(
        (candidate) => candidate.name() === argv[0],
      )!;
      expect(command.options.map((option) => option.long)).toContain('--yes');
      await program.parseAsync(['node', 'mc', ...argv]);
    }

    expect(calls).toEqual([]);
    expect(console.error).toHaveBeenCalledTimes(commands.length);
    expect(console.error).toHaveBeenCalledWith(
      '❌',
      expect.stringContaining('rerun with --yes'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('does not accept private keys through command-line arguments', async () => {
    const program = createProgram('test');
    const wallet = program.commands.find((command) => command.name() === 'wallet')!;

    expect(wallet.options.map((option) => option.long)).not.toContain(
      '--set-private-key',
    );
  });

  it('normalizes --token NATIVE to a native-currency send', async () => {
    vi.stubEnv('PRIVATE_KEY', PRIVATE_KEY);
    const calls: unknown[] = [];
    const program = createProgram('test', {
      send: async (...args) => {
        calls.push(args);
      },
    });

    await program.parseAsync([
      'node',
      'mc',
      '--chain',
      'avalanche',
      'send',
      MC_TOKEN,
      '--amount',
      '0.1',
      '--token',
      'NATIVE',
      '--yes',
    ]);

    expect(calls).toEqual([
      [
        MC_TOKEN,
        '0.1',
        PRIVATE_KEY,
        { token: undefined, tokenId: undefined },
        'avalanche',
      ],
    ]);
  });

  it.each([
    ['without --token', []],
    ['with --token NATIVE', ['--token', 'NATIVE']],
  ])('rejects --token-id %s', async (_label, tokenArgs) => {
    vi.stubEnv('PRIVATE_KEY', PRIVATE_KEY);
    const sendHandler = vi.fn();
    const program = createProgram('test', { send: sendHandler });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await program.parseAsync([
      'node',
      'mc',
      'send',
      MC_TOKEN,
      '--amount',
      '1',
      ...tokenArgs,
      '--token-id',
      '7',
      '--yes',
    ]);

    expect(sendHandler).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '❌',
      '--token-id requires an ERC-1155 contract address',
    );
    expect(process.exitCode).toBe(1);
  });
});
