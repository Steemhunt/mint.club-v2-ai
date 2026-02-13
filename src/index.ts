#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { type Address } from 'viem';
import { validateChain } from './client';
import { info } from './commands/info';
import { buy } from './commands/buy';
import { sell } from './commands/sell';
import { create } from './commands/create';
import { zapBuy } from './commands/zap-buy';
import { zapSell } from './commands/zap-sell';
import { wallet } from './commands/wallet';
import { send } from './commands/send';
import { getZapV2Address } from './config/contracts';
import { resolve } from 'path';
import { homedir } from 'os';
declare const __VERSION__: string;

// Load from ~/.mintclub/.env first, then cwd/.env as fallback
config({ path: resolve(homedir(), '.mintclub', '.env') });
config();

function requireKey(): `0x${string}` {
  const k = process.env.PRIVATE_KEY;
  if (!k) { console.error('❌ Set PRIVATE_KEY in ~/.mintclub/.env or export it'); process.exit(1); }
  return (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;
}

/** Wrap command action with error handling */
function run(fn: () => Promise<void>) {
  return async () => {
    try { await fn(); }
    catch (e) { console.error('❌', e instanceof Error ? e.message : e); process.exit(1); }
  };
}

const cli = new Command()
  .name('mc')
  .description('Mint Club V2 CLI — bonding curve tokens')
  .version(__VERSION__);

cli.command('info')
  .description('Get token info')
  .argument('<token>', 'Token address')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => info(token as Address, validateChain(opts.chain)))());

cli.command('buy')
  .description('Buy (mint) tokens with reserve token')
  .argument('<token>', 'Token address')
  .requiredOption('-a, --amount <n>', 'Tokens to buy')
  .option('-m, --max-cost <n>', 'Max reserve cost')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() =>
    buy(token as Address, opts.amount, opts.maxCost, validateChain(opts.chain), requireKey())
  )());

cli.command('sell')
  .description('Sell (burn) tokens for reserve token')
  .argument('<token>', 'Token address')
  .requiredOption('-a, --amount <n>', 'Tokens to sell')
  .option('-m, --min-refund <n>', 'Min reserve refund')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() =>
    sell(token as Address, opts.amount, opts.minRefund, validateChain(opts.chain), requireKey())
  )());

cli.command('create')
  .description('Create a bonding curve token')
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <sym>', 'Token symbol')
  .requiredOption('-r, --reserve <addr>', 'Reserve token address')
  .requiredOption('-x, --max-supply <n>', 'Max supply')
  .option('-t, --steps <s>', 'Custom steps: "range:price,range:price,..."')
  .option('--curve <type>', 'Curve preset: linear, exponential, logarithmic, flat')
  .option('--initial-price <n>', 'Starting price (with --curve)')
  .option('--final-price <n>', 'Final price (with --curve)')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .option('--mint-royalty <bp>', 'Mint royalty (bps)', '100')
  .option('--burn-royalty <bp>', 'Burn royalty (bps)', '100')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action((opts) => run(() =>
    create(
      opts.name, opts.symbol, opts.reserve as Address, opts.maxSupply,
      validateChain(opts.chain), requireKey(), {
        steps: opts.steps, curve: opts.curve,
        initialPrice: opts.initialPrice, finalPrice: opts.finalPrice,
        mintRoyalty: parseInt(opts.mintRoyalty), burnRoyalty: parseInt(opts.burnRoyalty),
        yes: opts.yes,
      },
    )
  )());

cli.command('zap-buy')
  .description('Buy tokens with any token via ZapV2 (Base only)')
  .argument('<token>', 'Token address')
  .requiredOption('-i, --input-token <addr>', 'Input token (0x0 for ETH)')
  .requiredOption('-a, --input-amount <n>', 'Input amount')
  .requiredOption('-p, --path <p>', 'Swap path: token,fee,token,...')
  .option('-m, --min-tokens <n>', 'Min tokens out')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => {
    const chain = validateChain(opts.chain);
    if (!getZapV2Address(chain)) throw new Error('ZapV2 is Base only');
    return zapBuy(
      token as Address, opts.inputToken as Address, opts.inputAmount,
      opts.minTokens, opts.path, chain, requireKey(),
    );
  })());

cli.command('zap-sell')
  .description('Sell tokens for any token via ZapV2 (Base only)')
  .argument('<token>', 'Token address')
  .requiredOption('-a, --amount <n>', 'Tokens to sell')
  .requiredOption('-o, --output-token <addr>', 'Output token (0x0 for ETH)')
  .requiredOption('-p, --path <p>', 'Swap path: token,fee,token,...')
  .option('-m, --min-output <n>', 'Min output')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((token, opts) => run(() => {
    const chain = validateChain(opts.chain);
    if (!getZapV2Address(chain)) throw new Error('ZapV2 is Base only');
    return zapSell(
      token as Address, opts.amount, opts.outputToken as Address,
      opts.minOutput, opts.path, chain, requireKey(),
    );
  })());

cli.command('send')
  .description('Send ETH, ERC-20, or ERC-1155 tokens to another wallet')
  .argument('<to>', 'Recipient address')
  .requiredOption('-a, --amount <n>', 'Amount to send (token units for ERC-20, quantity for ERC-1155)')
  .option('-t, --token <addr>', 'Token contract address (omit for native ETH)')
  .option('--token-id <id>', 'ERC-1155 token ID')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .action((to, opts) => run(() =>
    send(to as Address, opts.amount, validateChain(opts.chain), requireKey(), { token: opts.token, tokenId: opts.tokenId })
  )());

cli.command('wallet')
  .description('Show wallet address and balances, or generate/import a key')
  .option('-g, --generate', 'Generate a new wallet and save to ~/.mintclub/.env')
  .option('-s, --set-private-key <key>', 'Import an existing private key to ~/.mintclub/.env')
  .option('-c, --chain <chain>', 'Chain for balance check', 'base')
  .action((opts) => run(() => wallet(opts))());

cli.parse();
