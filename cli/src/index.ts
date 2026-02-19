#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { type Address } from 'viem';
import { info } from './commands/info';
import { buy } from './commands/buy';
import { sell } from './commands/sell';
import { create } from './commands/create';
import { zapBuy } from './commands/zap-buy';
import { zapSell } from './commands/zap-sell';
import { wallet } from './commands/wallet';
import { send } from './commands/send';
import { price } from './commands/price';
import { swap } from './commands/swap';
import { resolveToken, resolveTokenAsync } from './config/contracts';
import { getPublicClient } from './client';
import { resolve } from 'path';
import { homedir } from 'os';
declare const __VERSION__: string;

config({ path: resolve(homedir(), '.mintclub', '.env') });
config();

function requireKey(): `0x${string}` {
  const k = process.env.PRIVATE_KEY;
  if (!k) { console.error('❌ Set PRIVATE_KEY in ~/.mintclub/.env or export it'); process.exit(1); }
  return (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;
}

/** Parse token address or symbol (sync — hardcoded tokens only) */
function tok(input: string): Address {
  try { return resolveToken(input); }
  catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
}

/** Parse token address or symbol (async — includes on-chain Mint Club token lookup) */
async function tokAsync(input: string): Promise<Address> {
  try { return await resolveTokenAsync(input, getPublicClient()); }
  catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
  return '' as Address; // unreachable
}

// Chain validation removed - CLI only supports Base

function cleanError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const msg = e.message;
  const funds = msg.match(/insufficient funds.*have (\d+) want (\d+)/);
  if (funds) return `Insufficient funds: have ${(Number(funds[1]) / 1e18).toFixed(4)} ETH, need ${(Number(funds[2]) / 1e18).toFixed(4)} ETH`;
  const reason = msg.match(/reverted with the following reason:\s*\n?\s*(.+?)(?:\n|$)/);
  if (reason && reason[1].trim()) return `Transaction reverted: ${reason[1].trim()}`;
  const revert = msg.match(/execution reverted[:\s]*(.+?)(?:\n|$)/);
  if (revert) return `Transaction reverted: ${revert[1].trim()}`;
  const details = msg.match(/Details:\s*(.+?)(?:\n|$)/);
  if (details) return details[1].trim();
  return msg.split('\n').find(l => l.trim().length > 0)?.trim() ?? msg;
}

function run(fn: () => Promise<void>) {
  return async () => { try { await fn(); } catch (e) { console.error('❌', cleanError(e)); process.exit(1); } };
}

const cli = new Command().name('mc').description('Mint Club V2 CLI — bonding curve tokens on Base').version(__VERSION__);

cli.command('price').description('Get token price in reserve and USD').argument('<token>', 'Token address or symbol')
  .action((token, opts) => run(async () => price(await tokAsync(token)))());

cli.command('info').description('Get token info').argument('<token>', 'Token address or symbol')
  .action((token, opts) => run(async () => info(await tokAsync(token)))());

cli.command('buy').description('Buy (mint) tokens with reserve token').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to buy').option('-m, --max-cost <n>', 'Max reserve cost')
  .action((token, opts) => run(async () => buy(await tokAsync(token), opts.amount, opts.maxCost, requireKey()))());

cli.command('sell').description('Sell (burn) tokens for reserve token').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to sell').option('-m, --min-refund <n>', 'Min reserve refund')
  .action((token, opts) => run(async () => sell(await tokAsync(token), opts.amount, opts.minRefund, requireKey()))());

cli.command('create').description('Create a bonding curve token')
  .requiredOption('-n, --name <name>', 'Token name').requiredOption('-s, --symbol <sym>', 'Token symbol')
  .requiredOption('-r, --reserve <addr>', 'Reserve token address').requiredOption('-x, --max-supply <n>', 'Max supply')
  .option('-t, --steps <s>', 'Custom steps: "range:price,range:price,..."')
  .option('--curve <type>', 'Curve preset: linear, exponential, logarithmic, flat')
  .option('--initial-price <n>', 'Starting price (with --curve)').option('--final-price <n>', 'Final price (with --curve)')
  .option('--mint-royalty <bp>', 'Mint royalty (bps)', '100').option('--burn-royalty <bp>', 'Burn royalty (bps)', '100')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action((opts) => run(async () => create(opts.name, opts.symbol, await tokAsync(opts.reserve), opts.maxSupply, requireKey(), {
    steps: opts.steps, curve: opts.curve, initialPrice: opts.initialPrice, finalPrice: opts.finalPrice,
    mintRoyalty: parseInt(opts.mintRoyalty), burnRoyalty: parseInt(opts.burnRoyalty), yes: opts.yes,
  }))());

cli.command('zap-buy').description('Buy tokens with any token via ZapV2 (auto-routes swap)').argument('<token>', 'Token address or symbol')
  .requiredOption('-i, --input-token <addr>', 'Input token (ETH or address/symbol)')
  .requiredOption('-a, --amount <n>', 'Amount of input token to spend (e.g. 0.01 ETH)')
  .option('-p, --path <p>', 'Manual swap path: token,fee,token,...').option('-m, --min-tokens <n>', 'Min tokens out')
  .action((token, opts) => run(async () => zapBuy(await tokAsync(token), await tokAsync(opts.inputToken), opts.amount, opts.minTokens, opts.path, requireKey()))());

cli.command('zap-sell').description('Sell tokens for any token via ZapV2 (auto-routes swap)').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to sell').requiredOption('-o, --output-token <addr>', 'Output token (ETH or address/symbol)')
  .option('-p, --path <p>', 'Manual swap path: token,fee,token,...').option('-m, --min-output <n>', 'Min output')
  .action((token, opts) => run(async () => zapSell(await tokAsync(token), opts.amount, await tokAsync(opts.outputToken), opts.minOutput, opts.path, requireKey()))());

cli.command('swap').description('Swap tokens via Uniswap V3 (any token pair)')
  .requiredOption('-i, --input <token>', 'Input token (ETH, USDC, HUNT, or address)')
  .requiredOption('-o, --output <token>', 'Output token (ETH, USDC, HUNT, or address)')
  .requiredOption('-a, --amount <n>', 'Amount of input token to swap')
  .option('-m, --min-output <n>', 'Min output amount')
  .option('-p, --path <p>', 'Manual swap path: token,fee,token,...')
  .option('-s, --slippage <pct>', 'Slippage tolerance %', '1')
  .action((opts) => run(() => swap(opts.input, opts.output, opts.amount, opts.minOutput, opts.path, parseFloat(opts.slippage), requireKey()))());

cli.command('send').description('Send ETH, ERC-20, or ERC-1155 tokens').argument('<to>', 'Recipient address')
  .requiredOption('-a, --amount <n>', 'Amount to send').option('-t, --token <addr>', 'Token contract (omit for ETH)')
  .option('--token-id <id>', 'ERC-1155 token ID')
  .action((to, opts) => run(async () => send(to as Address, opts.amount, requireKey(), { token: opts.token ? await tokAsync(opts.token) : undefined, tokenId: opts.tokenId }))());

cli.command('wallet').description('Show wallet address and balances, or generate/import a key')
  .option('-g, --generate', 'Generate a new wallet').option('-s, --set-private-key <key>', 'Import an existing private key')
  .action((opts) => run(() => wallet(opts))());

cli.command('upgrade').description('Upgrade mint.club-cli to the latest version').action(() => {
  const { execSync } = require('child_process');
  console.log('⬆️  Upgrading mint.club-cli...');
  try {
    const before = execSync('mc --version', { encoding: 'utf-8' }).trim();
    execSync('npm install -g mint.club-cli@latest', { stdio: 'pipe' });
    const after = execSync('mc --version', { encoding: 'utf-8' }).trim();
    console.log(before === after ? `✅ Already on latest (v${after})` : `✅ Upgraded: v${before} → v${after}`);
  } catch { console.error('❌ Upgrade failed. Try: npm update -g mint.club-cli'); process.exit(1); }
});

cli.parse();
