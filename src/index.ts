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
import { getZapV2Address } from './config/contracts';
import { resolve } from 'path';
import { homedir } from 'os';

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
  .version('1.0.0');

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
  .requiredOption('-t, --steps <s>', 'Steps: "range:price,range:price,..."')
  .option('-c, --chain <chain>', 'Chain', 'base')
  .option('--mint-royalty <bp>', 'Mint royalty (bps)', '0')
  .option('--burn-royalty <bp>', 'Burn royalty (bps)', '0')
  .action((opts) => run(() =>
    create(
      opts.name, opts.symbol, opts.reserve as Address, opts.maxSupply, opts.steps,
      validateChain(opts.chain), requireKey(),
      parseInt(opts.mintRoyalty), parseInt(opts.burnRoyalty),
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

cli.command('wallet')
  .description('Show wallet address or generate a new one')
  .option('-g, --generate', 'Generate a new wallet and save to ~/.mintclub/.env')
  .option('-s, --set-private-key <key>', 'Import an existing private key to ~/.mintclub/.env')
  .action((opts) => run(() => wallet(opts))());

cli.parse();
