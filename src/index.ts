#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { type Address, getAddress } from 'viem';
import { info } from './commands/info';
import { buy } from './commands/buy';
import { sell } from './commands/sell';
import { create } from './commands/create';
import { zapBuy } from './commands/zap-buy';
import { zapSell } from './commands/zap-sell';
import { wallet } from './commands/wallet';
import { send } from './commands/send';
import { validateChain } from './config/chains';
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

/** Parse token address */
function tok(input: string): Address {
  if (input.toUpperCase() === 'ETH') return '0x0000000000000000000000000000000000000000' as Address;
  if (!input.startsWith('0x') || input.length !== 42) { console.error('❌ Invalid token address'); process.exit(1); }
  return getAddress(input);
}

/** Validate chain and throw friendly error if not Base */
function chain(opts: { chain?: string }) {
  validateChain(opts.chain ?? 'base');
}

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

cli.command('info').description('Get token info').argument('<token>', 'Token address or symbol')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => { chain(opts); return info(tok(token)); })());

cli.command('buy').description('Buy (mint) tokens with reserve token').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to buy').option('-m, --max-cost <n>', 'Max reserve cost')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => { chain(opts); return buy(tok(token), opts.amount, opts.maxCost, requireKey()); })());

cli.command('sell').description('Sell (burn) tokens for reserve token').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to sell').option('-m, --min-refund <n>', 'Min reserve refund')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => { chain(opts); return sell(tok(token), opts.amount, opts.minRefund, requireKey()); })());

cli.command('create').description('Create a bonding curve token')
  .requiredOption('-n, --name <name>', 'Token name').requiredOption('-s, --symbol <sym>', 'Token symbol')
  .requiredOption('-r, --reserve <addr>', 'Reserve token address').requiredOption('-x, --max-supply <n>', 'Max supply')
  .option('-t, --steps <s>', 'Custom steps: "range:price,range:price,..."')
  .option('--curve <type>', 'Curve preset: linear, exponential, logarithmic, flat')
  .option('--initial-price <n>', 'Starting price (with --curve)').option('--final-price <n>', 'Final price (with --curve)')
  .option('--mint-royalty <bp>', 'Mint royalty (bps)', '100').option('--burn-royalty <bp>', 'Burn royalty (bps)', '100')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action((opts) => run(() => { chain(opts); return create(opts.name, opts.symbol, tok(opts.reserve), opts.maxSupply, requireKey(), {
    steps: opts.steps, curve: opts.curve, initialPrice: opts.initialPrice, finalPrice: opts.finalPrice,
    mintRoyalty: parseInt(opts.mintRoyalty), burnRoyalty: parseInt(opts.burnRoyalty), yes: opts.yes,
  }); })());

cli.command('zap-buy').description('Buy tokens with any token via ZapV2 (auto-routes swap)').argument('<token>', 'Token address or symbol')
  .requiredOption('-i, --input-token <addr>', 'Input token (ETH or address/symbol)')
  .requiredOption('-a, --amount <n>', 'Amount of input token to spend (e.g. 0.01 ETH)')
  .option('-p, --path <p>', 'Manual swap path: token,fee,token,...').option('-m, --min-tokens <n>', 'Min tokens out')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => { chain(opts); return zapBuy(tok(token), tok(opts.inputToken), opts.amount, opts.minTokens, opts.path, requireKey()); })());

cli.command('zap-sell').description('Sell tokens for any token via ZapV2 (auto-routes swap)').argument('<token>', 'Token address or symbol')
  .requiredOption('-a, --amount <n>', 'Tokens to sell').requiredOption('-o, --output-token <addr>', 'Output token (ETH or address/symbol)')
  .option('-p, --path <p>', 'Manual swap path: token,fee,token,...').option('-m, --min-output <n>', 'Min output')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => { chain(opts); return zapSell(tok(token), opts.amount, tok(opts.outputToken), opts.minOutput, opts.path, requireKey()); })());

cli.command('send').description('Send ETH, ERC-20, or ERC-1155 tokens').argument('<to>', 'Recipient address')
  .requiredOption('-a, --amount <n>', 'Amount to send').option('-t, --token <addr>', 'Token contract (omit for ETH)')
  .option('--token-id <id>', 'ERC-1155 token ID').option('-c, --chain <chain>', 'Chain', 'base')
  .action((to, opts) => run(() => { chain(opts); return send(to as Address, opts.amount, requireKey(), { token: opts.token ? tok(opts.token) : undefined, tokenId: opts.tokenId }); })());

cli.command('wallet').description('Show wallet address and balances, or generate/import a key')
  .option('-g, --generate', 'Generate a new wallet').option('-s, --set-private-key <key>', 'Import an existing private key')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((opts) => run(() => { chain(opts); return wallet(opts); })());

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
