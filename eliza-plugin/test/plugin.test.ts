import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mintclubPlugin } from '../src/plugin';

const dirs: string[] = [];
const originalCli = process.env.MINTCLUB_CLI;
const originalKey = process.env.PRIVATE_KEY;

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (originalCli === undefined) delete process.env.MINTCLUB_CLI;
  else process.env.MINTCLUB_CLI = originalCli;
  if (originalKey === undefined) delete process.env.PRIVATE_KEY;
  else process.env.PRIVATE_KEY = originalKey;
});

describe('Eliza action execution', () => {
  it('registers the complete protocol, wallet, send, and create surface', () => {
    expect(mintclubPlugin.actions?.map((action) => action.name)).toEqual([
      'TOKEN_INFO',
      'TOKEN_PRICE',
      'BUY_TOKEN',
      'SELL_TOKEN',
      'ZAP_BUY',
      'ZAP_SELL',
      'WALLET_BALANCE',
      'SEND_TOKEN',
      'CREATE_TOKEN',
    ]);
  });

  it('delegates wallet configuration checks to the CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mintclub-eliza-'));
    dirs.push(dir);
    const executable = join(dir, 'fake-mc');
    writeFileSync(
      executable,
      '#!/usr/bin/env node\nprocess.stdout.write(process.argv.slice(2).join("|"));\n',
    );
    chmodSync(executable, 0o755);
    process.env.MINTCLUB_CLI = executable;
    delete process.env.PRIVATE_KEY;

    const action = mintclubPlugin.actions?.find(
      (candidate) => candidate.name === 'WALLET_BALANCE',
    );
    if (!action) throw new Error('WALLET_BALANCE action not found');

    const result = await action.handler(
      {} as never,
      { content: { text: 'Show my wallet balance on Robinhood' } } as never,
      undefined,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: true,
      text: '--chain|robinhood|wallet',
    });
  });

  it('selects ZapV2 actions without also selecting direct Bond actions', async () => {
    const zapBuy = mintclubPlugin.actions?.find(({ name }) => name === 'ZAP_BUY')!;
    const buy = mintclubPlugin.actions?.find(({ name }) => name === 'BUY_TOKEN')!;
    const zapSell = mintclubPlugin.actions?.find(({ name }) => name === 'ZAP_SELL')!;
    const sell = mintclubPlugin.actions?.find(({ name }) => name === 'SELL_TOKEN')!;
    const runtime = {} as never;
    const buyMessage = {
      content: { text: 'Buy TOKEN with 10 USDC on Arbitrum' },
    } as never;
    const sellMessage = {
      content: { text: 'Sell 5 TOKEN for USDC on Unichain' },
    } as never;

    await expect(zapBuy.validate(runtime, buyMessage)).resolves.toBe(true);
    await expect(buy.validate(runtime, buyMessage)).resolves.toBe(false);
    await expect(zapSell.validate(runtime, sellMessage)).resolves.toBe(true);
    await expect(sell.validate(runtime, sellMessage)).resolves.toBe(false);
    expect(zapBuy.description).toContain('MCV2_ZapV2');
    expect(zapSell.description).toContain('MCV2_ZapV2');
  });

  it('publishes the exact all-chain ZapV2 context', async () => {
    const provider = mintclubPlugin.providers?.[0];
    if (!provider) throw new Error('MINTCLUB_PROVIDER not found');
    const result = await provider.get({} as never, {} as never);

    expect(result.text).toContain('MCV2_ZapV2');
    expect(result.text).not.toContain('ZapV1');
    expect(result.text).toContain('ethereum, optimism, arbitrum');
    expect(result.text).toContain('sepolia');
    expect(result.values?.chains).toBe(
      'ethereum,optimism,arbitrum,avalanche,base,polygon,bsc,blast,zora,unichain,robinhood,sepolia',
    );
    expect(mintclubPlugin.description).not.toContain('Base and Robinhood');
  });
});
