import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadTokens, mergeTrackedToken } from '../src/utils/tokens';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('token tracking', () => {
  it('loads tracked token addresses only for the selected chain', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mintclub-tokens-'));
    tempDirs.push(dir);
    const file = join(dir, 'tokens.json');
    writeFileSync(
      file,
      JSON.stringify({
        base: ['0x1111111111111111111111111111111111111111'],
        robinhood: ['0x2222222222222222222222222222222222222222'],
      }),
    );

    expect(loadTokens('base', file)).toEqual([
      '0x1111111111111111111111111111111111111111',
    ]);
    expect(loadTokens('robinhood', file)).toEqual([
      '0x2222222222222222222222222222222222222222',
    ]);
  });

  it('migrates legacy Base arrays while adding a Robinhood token', () => {
    expect(
      mergeTrackedToken(
        ['0x1111111111111111111111111111111111111111'],
        '0x2222222222222222222222222222222222222222',
        'robinhood',
      ),
    ).toEqual({
      base: ['0x1111111111111111111111111111111111111111'],
      robinhood: ['0x2222222222222222222222222222222222222222'],
    });
  });
});
