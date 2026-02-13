import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const ENV_DIR = resolve(homedir(), '.mintclub');
const ENV_PATH = resolve(ENV_DIR, '.env');

export async function wallet(opts: { generate?: boolean; setPrivateKey?: string }) {
  // Set an existing private key
  if (opts.setPrivateKey) {
    const key = (opts.setPrivateKey.startsWith('0x') ? opts.setPrivateKey : `0x${opts.setPrivateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(key);

    mkdirSync(ENV_DIR, { recursive: true });

    // Replace existing key or append
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8');
      if (content.includes('PRIVATE_KEY=')) {
        writeFileSync(ENV_PATH, content.replace(/PRIVATE_KEY=.*/g, `PRIVATE_KEY=${key}`));
      } else {
        writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);
      }
    } else {
      writeFileSync(ENV_PATH, `PRIVATE_KEY=${key}\n`);
    }

    console.log('✅ Private key saved!\n');
    console.log(`   Address: ${account.address}`);
    console.log(`   Saved to: ~/.mintclub/.env`);
    return;
  }

  // If --generate, create a new key
  if (opts.generate) {
    if (existsSync(ENV_PATH)) {
      const existing = readFileSync(ENV_PATH, 'utf-8');
      if (existing.includes('PRIVATE_KEY=')) {
        console.error('⚠️  PRIVATE_KEY already exists in ~/.mintclub/.env');
        console.error('   Delete it manually if you want to generate a new one.');
        process.exit(1);
      }
    }

    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);

    mkdirSync(ENV_DIR, { recursive: true });

    // Append or create
    const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
    writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);

    console.log('✅ New wallet created!\n');
    console.log(`   Address: ${account.address}`);
    console.log(`   Saved to: ~/.mintclub/.env\n`);
    console.log('💰 Fund this address to start using mc buy/sell/create.');
    return;
  }

  // Default: show current wallet info
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.log('No wallet configured.\n');
    console.log('Run `mc wallet --generate` to create one, or add PRIVATE_KEY to ~/.mintclub/.env');
    return;
  }

  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`👛 Wallet: ${account.address}`);
}
