import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type Address, formatUnits } from 'viem';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getPublicClient } from '../client';
import { ERC20_ABI } from '../abi/erc20';

const ENV_DIR = resolve(homedir(), '.mintclub');
const ENV_PATH = resolve(ENV_DIR, '.env');

const KNOWN_TOKENS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'HUNT', address: '0x37f0A65b0491c49F4bDdE04F0b5dF27b214FfCf5', decimals: 18 },
];

function printKeyWarning() {
  console.log('⚠️  WARNING: Back up your private key in a secure, encrypted location!');
  console.log('   If you lose ~/.mintclub/.env or your private key, your funds are');
  console.log('   gone forever — there is no way to recover them.');
  console.log('   If your key is leaked, anyone can drain your wallet immediately.');
}

export async function wallet(opts: { generate?: boolean; setPrivateKey?: string }) {
  if (opts.setPrivateKey) {
    const key = (opts.setPrivateKey.startsWith('0x') ? opts.setPrivateKey : `0x${opts.setPrivateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(key);
    mkdirSync(ENV_DIR, { recursive: true });
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8');
      if (content.includes('PRIVATE_KEY=')) writeFileSync(ENV_PATH, content.replace(/PRIVATE_KEY=.*/g, `PRIVATE_KEY=${key}`));
      else writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);
    } else writeFileSync(ENV_PATH, `PRIVATE_KEY=${key}\n`);
    console.log(`✅ Private key saved!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n`);
    printKeyWarning();
    return;
  }

  if (opts.generate) {
    if (existsSync(ENV_PATH) && readFileSync(ENV_PATH, 'utf-8').includes('PRIVATE_KEY=')) {
      console.error('⚠️  PRIVATE_KEY already exists in ~/.mintclub/.env\n   Delete it manually if you want to generate a new one.');
      process.exit(1);
    }
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    mkdirSync(ENV_DIR, { recursive: true });
    const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
    writeFileSync(ENV_PATH, content + (content.endsWith('\n') || !content ? '' : '\n') + `PRIVATE_KEY=${key}\n`);
    console.log(`✅ New wallet created!\n\n   Address: ${account.address}\n   Saved to: ~/.mintclub/.env\n\n💰 Fund this address to start using mc buy/sell/create.\n`);
    printKeyWarning();
    return;
  }

  const key = process.env.PRIVATE_KEY;
  if (!key) { console.log('No wallet configured.\n\nRun `mc wallet --generate` to create one, or add PRIVATE_KEY to ~/.mintclub/.env'); return; }

  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`👛 Wallet: ${account.address}\n`);

  const client = getPublicClient();
  const ethBalance = await client.getBalance({ address: account.address });
  console.log(`💰 Balances on Base:\n   ETH: ${formatUnits(ethBalance, 18)}`);

  const results = await client.multicall({
    contracts: KNOWN_TOKENS.map(t => ({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] })),
  });
  for (let i = 0; i < KNOWN_TOKENS.length; i++) {
    const bal = results[i].status === 'success' ? results[i].result as bigint : 0n;
    if (bal > 0n) console.log(`   ${KNOWN_TOKENS[i].symbol}: ${formatUnits(bal, KNOWN_TOKENS[i].decimals)}`);
  }
}
