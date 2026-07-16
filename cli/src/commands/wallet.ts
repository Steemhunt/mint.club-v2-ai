import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { resolve } from 'path';
import { homedir } from 'os';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { getPublicClient } from '../client';
import type { SupportedChain } from '../config/chains';
import { getWalletBalances, displayWalletBalances } from '../utils/wallet';

const ENV_DIR = resolve(homedir(), '.mintclub');
const ENV_PATH = resolve(ENV_DIR, '.env');

function printKeyWarning() {
  console.log('⚠️  WARNING: Back up your private key in a secure, encrypted location!');
  console.log('   If you lose ~/.mintclub/.env or your private key, your funds are');
  console.log('   gone forever — there is no way to recover them.');
  console.log('   If your key is leaked, anyone can drain your wallet immediately.');
}

export function savePrivateKey(
  key: `0x${string}`,
  envDir: string = ENV_DIR,
): void {
  const envPath = resolve(envDir, '.env');
  mkdirSync(envDir, { recursive: true, mode: 0o700 });
  chmodSync(envDir, 0o700);

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    if (/^PRIVATE_KEY=.*$/m.test(content)) {
      writeFileSync(
        envPath,
        content.replace(/^PRIVATE_KEY=.*$/gm, `PRIVATE_KEY=${key}`),
        { mode: 0o600 },
      );
    } else {
      writeFileSync(
        envPath,
        `${content}${content.endsWith('\n') || !content ? '' : '\n'}PRIVATE_KEY=${key}\n`,
        { mode: 0o600 },
      );
    }
  } else {
    writeFileSync(envPath, `PRIVATE_KEY=${key}\n`, { mode: 0o600 });
  }
  chmodSync(envPath, 0o600);
}

export async function wallet(
  opts: { generate?: boolean; setPrivateKey?: string },
  chain: SupportedChain = 'base',
) {
  // Handle private key import
  if (opts.setPrivateKey) {
    const key = (opts.setPrivateKey.startsWith('0x') ? opts.setPrivateKey : `0x${opts.setPrivateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(key);
    
    savePrivateKey(key);
    console.log(`✅ Private key saved!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n`);
    printKeyWarning();
    return;
  }

  // Handle new wallet generation
  if (opts.generate) {
    if (
      existsSync(ENV_PATH) &&
      /^PRIVATE_KEY=.*$/m.test(readFileSync(ENV_PATH, 'utf-8'))
    ) {
      throw new Error(
        'PRIVATE_KEY already exists in ~/.mintclub/.env. Delete it manually if you want to generate a new one.',
      );
    }
    
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    
    savePrivateKey(key);
    console.log(`✅ New wallet created!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n\n💰 Fund this address to start using mc buy/sell/create.\n`);
    printKeyWarning();
    return;
  }

  // Handle wallet balance display
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.log('No wallet configured.\n\nRun `mc wallet --generate` to create one, or add PRIVATE_KEY to ~/.mintclub/.env');
    return;
  }

  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`👛 Wallet: ${account.address}\n`);

  // Get and display all balances
  const client = getPublicClient(chain);
  const balances = await getWalletBalances(client, account.address, chain);
  displayWalletBalances(balances, chain);
}