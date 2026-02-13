#!/usr/bin/env bun

import { Command } from 'commander';
import { config } from 'dotenv';
import { validateChain } from './client.js';
import { infoCommand } from './commands/info.js';
import { buyCommand } from './commands/buy.js';
import { sellCommand } from './commands/sell.js';
import { createCommand } from './commands/create.js';
import { zapBuyCommand } from './commands/zap-buy.js';
import { zapSellCommand } from './commands/zap-sell.js';
import { isZapV2Supported } from './config/contracts.js';

// Load environment variables
config();

const program = new Command();

program
  .name('mintclub')
  .description('CLI for Mint Club V2 bonding curve tokens')
  .version('1.0.0');

// Global options
const defaultChain = 'base';

function getPrivateKey(): `0x${string}` {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY environment variable is required for this operation');
    console.error('   Please set it in your .env file or environment');
    process.exit(1);
  }
  
  if (!privateKey.startsWith('0x')) {
    return `0x${privateKey}`;
  }
  
  return privateKey as `0x${string}`;
}

// Info command
program
  .command('info')
  .description('Get token information')
  .argument('<token>', 'Token contract address')
  .option('-c, --chain <chain>', 'Blockchain to use', defaultChain)
  .action(async (token, options) => {
    try {
      const chain = validateChain(options.chain);
      await infoCommand(token, chain);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Buy command
program
  .command('buy')
  .description('Buy (mint) tokens with reserve token')
  .argument('<token>', 'Token contract address')
  .requiredOption('-a, --amount <amount>', 'Amount of tokens to buy')
  .option('-m, --max-cost <amount>', 'Maximum cost in reserve tokens')
  .option('-c, --chain <chain>', 'Blockchain to use', defaultChain)
  .action(async (token, options) => {
    try {
      const chain = validateChain(options.chain);
      const privateKey = getPrivateKey();
      await buyCommand(token, options.amount, options.maxCost, chain, privateKey);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Sell command
program
  .command('sell')
  .description('Sell (burn) tokens for reserve token')
  .argument('<token>', 'Token contract address')
  .requiredOption('-a, --amount <amount>', 'Amount of tokens to sell')
  .option('-m, --min-refund <amount>', 'Minimum refund in reserve tokens')
  .option('-c, --chain <chain>', 'Blockchain to use', defaultChain)
  .action(async (token, options) => {
    try {
      const chain = validateChain(options.chain);
      const privateKey = getPrivateKey();
      await sellCommand(token, options.amount, options.minRefund, chain, privateKey);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Create command
program
  .command('create')
  .description('Create a new bonding curve token')
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <symbol>', 'Token symbol')
  .requiredOption('-r, --reserve <address>', 'Reserve token address')
  .requiredOption('-m, --max-supply <amount>', 'Maximum token supply')
  .requiredOption('-t, --steps <steps>', 'Bonding curve steps (format: "range1:price1,range2:price2")')
  .option('-c, --chain <chain>', 'Blockchain to use', defaultChain)
  .option('--mint-royalty <royalty>', 'Mint royalty in basis points (default: 0)', '0')
  .option('--burn-royalty <royalty>', 'Burn royalty in basis points (default: 0)', '0')
  .action(async (options) => {
    try {
      const chain = validateChain(options.chain);
      const privateKey = getPrivateKey();
      const mintRoyalty = parseInt(options.mintRoyalty);
      const burnRoyalty = parseInt(options.burnRoyalty);
      
      if (isNaN(mintRoyalty) || isNaN(burnRoyalty)) {
        throw new Error('Royalty values must be valid numbers');
      }
      
      await createCommand(
        options.name,
        options.symbol,
        options.reserve,
        options.maxSupply,
        options.steps,
        chain,
        privateKey,
        mintRoyalty,
        burnRoyalty
      );
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Zap buy command
program
  .command('zap-buy')
  .description('Buy tokens with any input token via ZapV2 (Base only)')
  .argument('<token>', 'Token contract address')
  .requiredOption('-i, --input-token <address>', 'Input token address (use 0x0 for ETH)')
  .requiredOption('-a, --input-amount <amount>', 'Amount of input tokens')
  .requiredOption('-p, --path <path>', 'Swap path (format: "token0,fee0,token1,fee1,token2")')
  .option('-m, --min-tokens <amount>', 'Minimum tokens to receive')
  .option('-c, --chain <chain>', 'Blockchain to use (only base supported)', 'base')
  .action(async (token, options) => {
    try {
      const chain = validateChain(options.chain);
      if (!isZapV2Supported(chain)) {
        throw new Error(`ZapV2 is only supported on Base, but you specified ${chain}`);
      }
      const privateKey = getPrivateKey();
      await zapBuyCommand(
        token,
        options.inputToken,
        options.inputAmount,
        options.minTokens,
        options.path,
        chain,
        privateKey
      );
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Zap sell command
program
  .command('zap-sell')
  .description('Sell tokens for any output token via ZapV2 (Base only)')
  .argument('<token>', 'Token contract address')
  .requiredOption('-a, --amount <amount>', 'Amount of tokens to sell')
  .requiredOption('-o, --output-token <address>', 'Output token address (use 0x0 for ETH)')
  .requiredOption('-p, --path <path>', 'Swap path (format: "token0,fee0,token1,fee1,token2")')
  .option('-m, --min-output <amount>', 'Minimum output tokens to receive')
  .option('-c, --chain <chain>', 'Blockchain to use (only base supported)', 'base')
  .action(async (token, options) => {
    try {
      const chain = validateChain(options.chain);
      if (!isZapV2Supported(chain)) {
        throw new Error(`ZapV2 is only supported on Base, but you specified ${chain}`);
      }
      const privateKey = getPrivateKey();
      await zapSellCommand(
        token,
        options.amount,
        options.outputToken,
        options.minOutput,
        options.path,
        chain,
        privateKey
      );
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse CLI arguments
program.parse();