import { execSync } from 'child_process';
import { Command } from 'commander';
import type { Address } from 'viem';
import { getPublicClient } from './client';
import { validateChain, type SupportedChain } from './config/chains';
import { resolveTokenAsync } from './config/contracts';
import { buy } from './commands/buy';
import { create, type CreateOptions } from './commands/create';
import { info } from './commands/info';
import { price } from './commands/price';
import { sell } from './commands/sell';
import { send } from './commands/send';
import { wallet } from './commands/wallet';
import { zapBuy } from './commands/zap-buy';
import { zapSell } from './commands/zap-sell';

export type ProgramHandlers = {
  price: (token: Address, chain: SupportedChain) => Promise<void>;
  info: (token: Address, chain: SupportedChain) => Promise<void>;
  buy: (
    token: Address,
    amount: string,
    maxCost: string | undefined,
    privateKey: `0x${string}`,
    chain: SupportedChain,
  ) => Promise<void>;
  sell: (
    token: Address,
    amount: string,
    minRefund: string | undefined,
    privateKey: `0x${string}`,
    chain: SupportedChain,
  ) => Promise<void>;
  create: (
    name: string,
    symbol: string,
    reserve: Address,
    maxSupply: string,
    privateKey: `0x${string}`,
    options: CreateOptions,
    chain: SupportedChain,
  ) => Promise<void>;
  zapBuy: (
    token: Address,
    amount: string,
    maxCost: string | undefined,
    slippage: number,
    privateKey: `0x${string}`,
    chain: SupportedChain,
  ) => Promise<void>;
  zapSell: (
    token: Address,
    amount: string,
    minRefund: string | undefined,
    slippage: number,
    privateKey: `0x${string}`,
    chain: SupportedChain,
  ) => Promise<void>;
  send: (
    to: Address,
    amount: string,
    privateKey: `0x${string}`,
    options: { token?: Address; tokenId?: string },
    chain: SupportedChain,
  ) => Promise<void>;
  wallet: (
    options: { generate?: boolean; setPrivateKey?: string },
    chain: SupportedChain,
  ) => Promise<void>;
  upgrade: () => Promise<void>;
};

const defaultHandlers: ProgramHandlers = {
  price,
  info,
  buy,
  sell,
  create,
  zapBuy,
  zapSell,
  send,
  wallet,
  upgrade: async () => {
    console.log('⬆️  Upgrading mint.club-cli...');
    try {
      const before = execSync('mc --version', { encoding: 'utf-8' }).trim();
      execSync('npm install -g mint.club-cli@latest', { stdio: 'pipe' });
      const after = execSync('mc --version', { encoding: 'utf-8' }).trim();
      console.log(
        before === after
          ? `✅ Already on latest (v${after})`
          : `✅ Upgraded: v${before} → v${after}`,
      );
    } catch {
      throw new Error('Upgrade failed. Try: npm update -g mint.club-cli');
    }
  },
};

function requireKey(): `0x${string}` {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error('Set PRIVATE_KEY in ~/.mintclub/.env or export it');
  }
  return (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
}

function cleanError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const message = error.message;
  const funds = message.match(/insufficient funds.*have (\d+) want (\d+)/);
  if (funds) {
    return `Insufficient funds: have ${(Number(funds[1]) / 1e18).toFixed(4)} ETH, need ${(Number(funds[2]) / 1e18).toFixed(4)} ETH`;
  }
  const reason = message.match(
    /reverted with the following reason:\s*\n?\s*(.+?)(?:\n|$)/,
  );
  if (reason?.[1].trim()) {
    return `Transaction reverted: ${reason[1].trim()}`;
  }
  const revert = message.match(/execution reverted[:\s]*(.+?)(?:\n|$)/);
  if (revert) return `Transaction reverted: ${revert[1].trim()}`;
  const details = message.match(/Details:\s*(.+?)(?:\n|$)/);
  if (details) return details[1].trim();
  return message.split('\n').find((line) => line.trim())?.trim() ?? message;
}

function action(task: () => Promise<void>) {
  return async () => {
    try {
      await task();
    } catch (error) {
      console.error('❌', cleanError(error));
      process.exitCode = 1;
    }
  };
}

export function createProgram(
  version: string,
  overrides: Partial<ProgramHandlers> = {},
): Command {
  const handlers = { ...defaultHandlers, ...overrides };
  const program = new Command()
    .name('mc')
    .description('Mint Club V2 CLI — bonding curve tokens on Base and Robinhood')
    .version(version)
    .option('-c, --chain <chain>', 'Blockchain to use: base or robinhood', 'base');

  const selectedChain = () => validateChain(program.opts().chain);
  const token = (input: string, chain: SupportedChain) =>
    resolveTokenAsync(input, getPublicClient(chain), chain);

  program
    .command('price')
    .description('Get token price in reserve and USD')
    .argument('<token>', 'Token address or symbol')
    .action((input: string) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.price(await token(input, chain), chain);
      })(),
    );

  program
    .command('info')
    .description('Get token info')
    .argument('<token>', 'Token address or symbol')
    .action((input: string) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.info(await token(input, chain), chain);
      })(),
    );

  program
    .command('buy')
    .description('Buy (mint) tokens with the reserve token')
    .argument('<token>', 'Token address or symbol')
    .requiredOption('-a, --amount <n>', 'Tokens to buy')
    .option('-m, --max-cost <n>', 'Maximum reserve-token cost')
    .action((input: string, options: { amount: string; maxCost?: string }) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.buy(
          await token(input, chain),
          options.amount,
          options.maxCost,
          requireKey(),
          chain,
        );
      })(),
    );

  program
    .command('sell')
    .description('Sell (burn) tokens for the reserve token')
    .argument('<token>', 'Token address or symbol')
    .requiredOption('-a, --amount <n>', 'Tokens to sell')
    .option('-m, --min-refund <n>', 'Minimum reserve-token refund')
    .action((input: string, options: { amount: string; minRefund?: string }) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.sell(
          await token(input, chain),
          options.amount,
          options.minRefund,
          requireKey(),
          chain,
        );
      })(),
    );

  program
    .command('create')
    .description('Create a bonding curve token')
    .requiredOption('-n, --name <name>', 'Token name')
    .requiredOption('-s, --symbol <sym>', 'Token symbol')
    .requiredOption('-r, --reserve <token>', 'Reserve token address or symbol')
    .requiredOption('-x, --max-supply <n>', 'Maximum supply')
    .option('-t, --steps <s>', 'Custom steps: "range:price,range:price,..."')
    .option('--curve <type>', 'Curve preset: linear, exponential, logarithmic, flat')
    .option('--initial-price <n>', 'Starting price (with --curve)')
    .option('--final-price <n>', 'Final price (with --curve)')
    .option('--mint-royalty <bp>', 'Mint royalty (bps)', '100')
    .option('--burn-royalty <bp>', 'Burn royalty (bps)', '100')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action((options) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.create(
          options.name,
          options.symbol,
          await token(options.reserve, chain),
          options.maxSupply,
          requireKey(),
          {
            steps: options.steps,
            curve: options.curve,
            initialPrice: options.initialPrice,
            finalPrice: options.finalPrice,
            mintRoyalty: Number.parseInt(options.mintRoyalty, 10),
            burnRoyalty: Number.parseInt(options.burnRoyalty, 10),
            yes: options.yes,
          },
          chain,
        );
      })(),
    );

  program
    .command('zap-buy')
    .description('Buy WETH-reserve tokens with native ETH via MCV2_ZapV1')
    .argument('<token>', 'Token address or symbol')
    .requiredOption('-a, --amount <n>', 'Tokens to buy')
    .option('-m, --max-cost <n>', 'Maximum native ETH cost')
    .option('-s, --slippage <pct>', 'Slippage tolerance %', '1')
    .action((input: string, options) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.zapBuy(
          await token(input, chain),
          options.amount,
          options.maxCost,
          Number.parseFloat(options.slippage),
          requireKey(),
          chain,
        );
      })(),
    );

  program
    .command('zap-sell')
    .description('Sell WETH-reserve tokens for native ETH via MCV2_ZapV1')
    .argument('<token>', 'Token address or symbol')
    .requiredOption('-a, --amount <n>', 'Tokens to sell')
    .option('-m, --min-refund <n>', 'Minimum native ETH refund')
    .option('-s, --slippage <pct>', 'Slippage tolerance %', '1')
    .action((input: string, options) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.zapSell(
          await token(input, chain),
          options.amount,
          options.minRefund,
          Number.parseFloat(options.slippage),
          requireKey(),
          chain,
        );
      })(),
    );

  program
    .command('send')
    .description('Send native currency, ERC-20, or ERC-1155 tokens')
    .argument('<to>', 'Recipient address')
    .requiredOption('-a, --amount <n>', 'Amount to send')
    .option('-t, --token <token>', 'Token address or symbol')
    .option('--token-id <id>', 'ERC-1155 token ID')
    .action((to: Address, options) =>
      action(async () => {
        const chain = selectedChain();
        await handlers.send(
          to,
          options.amount,
          requireKey(),
          {
            token: options.token
              ? await token(options.token, chain)
              : undefined,
            tokenId: options.tokenId,
          },
          chain,
        );
      })(),
    );

  program
    .command('wallet')
    .description('Show wallet balances, or generate/import a key')
    .option('-g, --generate', 'Generate a new wallet')
    .option('-s, --set-private-key <key>', 'Import an existing private key')
    .action((options) =>
      action(() => handlers.wallet(options, selectedChain()))(),
    );

  program
    .command('upgrade')
    .description('Upgrade mint.club-cli to the latest version')
    .action(() => action(() => handlers.upgrade())());

  return program;
}
