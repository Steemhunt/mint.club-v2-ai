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
});
