import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type Address, formatUnits } from 'viem';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getPublicClient } from '../client';
import { validateChain } from '../client';
import { ERC20_ABI } from '../abi/erc20';
import type { SupportedChain } from '../config/chains';

const ENV_DIR = resolve(homedir(), '.mintclub');
const ENV_PATH = resolve(ENV_DIR, '.env');

function printKeyWarning() {
  console.log('⚠️  WARNING: Back up your private key in a secure, encrypted location!');
  console.log('   If you lose ~/.mintclub/.env or your private key, your funds are');
  console.log('   gone forever — there is no way to recover them.');
  console.log('   If your key is leaked, anyone can drain your wallet immediately.');
}

export async function wallet(opts: { generate?: boolean; setPrivateKey?: string; chain?: string }) {
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
    console.log(`   Saved to: ~/.mintclub/.env\n`);
    printKeyWarning();
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
    console.log('💰 Fund this address to start using mc buy/sell/create.\n');
    printKeyWarning();
    return;
  }

  // Default: show current wallet info + balances
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.log('No wallet configured.\n');
    console.log('Run `mc wallet --generate` to create one, or add PRIVATE_KEY to ~/.mintclub/.env');
    return;
  }

  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`👛 Wallet: ${account.address}\n`);

  await showBalances(account.address, validateChain(opts.chain ?? 'base'));
}

// Well-known tokens per chain
const KNOWN_TOKENS: Partial<Record<SupportedChain, { symbol: string; address: Address; decimals: number }[]>> = {
  base: [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    { symbol: 'HUNT', address: '0x37f0A65b0491c49F4bDdE04F0b5dF27b214FfCf5', decimals: 18 },
  ],
  mainnet: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  ],
  arbitrum: [
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  ],
  optimism: [
    { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
};

async function showBalances(address: Address, chain: SupportedChain) {
  const client = getPublicClient(chain);

  // Native balance
  const ethBalance = await client.getBalance({ address });
  console.log(`💰 Balances on ${chain}:`);
  console.log(`   ETH: ${formatUnits(ethBalance, 18)}`);

  // Known token balances
  const tokens = KNOWN_TOKENS[chain] ?? [];
  if (tokens.length === 0) return;

  const results = await client.multicall({
    contracts: tokens.map(t => ({
      address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
    })),
  });

  for (let i = 0; i < tokens.length; i++) {
    const bal = results[i].status === 'success' ? results[i].result as bigint : 0n;
    if (bal > 0n) {
      console.log(`   ${tokens[i].symbol}: ${formatUnits(bal, tokens[i].decimals)}`);
    }
  }
}
