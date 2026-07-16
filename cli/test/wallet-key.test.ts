import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { savePrivateKey } from '../src/commands/wallet';

const dirs: string[] = [];

function permissions(path: string): number {
  return statSync(path).mode & 0o777;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('wallet key persistence', () => {
  it('locks down both the config directory and private-key file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mintclub-wallet-'));
    dirs.push(dir);
    const file = join(dir, '.env');
    chmodSync(dir, 0o777);
    writeFileSync(file, 'OTHER=value\nPRIVATE_KEY=old\n');
    chmodSync(file, 0o666);

    savePrivateKey(
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      dir,
    );

    expect(permissions(dir)).toBe(0o700);
    expect(permissions(file)).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toBe(
      'OTHER=value\nPRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111\n',
    );
  });

  it('does not overwrite similarly named or commented settings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mintclub-wallet-'));
    dirs.push(dir);
    const file = join(dir, '.env');
    writeFileSync(
      file,
      'BACKUP_PRIVATE_KEY=keep\n# PRIVATE_KEY=commented\n',
    );

    savePrivateKey(
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      dir,
    );

    expect(readFileSync(file, 'utf8')).toBe(
      'BACKUP_PRIVATE_KEY=keep\n# PRIVATE_KEY=commented\n' +
        'PRIVATE_KEY=0x2222222222222222222222222222222222222222222222222222222222222222\n',
    );
  });
});
