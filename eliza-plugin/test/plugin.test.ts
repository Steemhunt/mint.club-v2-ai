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
      { content: { text: 'Show my Robinhood wallet balance' } } as never,
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
