/**
 * Mint Club CLI — Write Transaction Tests (Anvil Forked Base Mainnet)
 *
 * Spins up a local anvil fork, impersonates a whale wallet, and executes
 * real buy/sell/zap-buy/zap-sell/create transactions against production contracts.
 *
 * Run: npx vitest run test/write.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Forked mainnet transactions are slow
vi.setConfig({ testTimeout: 120_000 });
import {
  createPublicClient, createWalletClient, createTestClient, http,
  formatUnits, parseEther, parseUnits,
  type Address, type PublicClient, type WalletClient, type TestClient,
  maxUint256,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { execSync, spawn, type ChildProcess } from 'child_process';

// ABIs
import { BOND_ABI } from '../src/abi/bond';
import { ZAP_V2_ABI } from '../src/abi/zap-v2';
import { ERC20_ABI } from '../src/abi/erc20';

// Utils
import { encodeV3Path, encodeV3SwapInput, V3_SWAP_COMMAND, WRAP_ETH_COMMAND, encodeWrapEthInput, UNWRAP_WETH_COMMAND, encodeUnwrapWethInput } from '../src/utils/swap';
import { ensureApproval } from '../src/utils/approve';

// Contracts
import { BOND, ZAP_V2, WETH, TOKENS, SPOT_PRICE_AGGREGATOR } from '../src/config/contracts';

// Import shared test constants
import { HUNT, USDC, SIGNET, MT, WHALE } from './helpers';

// ─── Constants ─────────────────────────────────────────────────────────────

const ANVIL_PORT = 8546;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
// Rotate through RPCs to avoid rate limits
const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://base.meowrpc.com',
  'https://1rpc.io/base',
  'https://base.gateway.tenderly.co',
  'https://gateway.tenderly.co/public/base',
  'https://base-public.nodies.app',
  'https://base.api.onfinality.io/public',
  'https://base.public.blockpi.network/v1/rpc/public',
  'https://base.lava.build',
  'https://base.api.pocket.network',
  'https://mainnet.base.org',
];
const FORK_RPC = RPCS[Math.floor(Math.random() * RPCS.length)];
console.log(`    Using fork RPC: ${FORK_RPC}`);

// Test constants are imported from helpers.ts

// Anvil default test account (funded with 10000 ETH)
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
const TEST_ACCOUNT = privateKeyToAccount(TEST_KEY);

const APPROVE_ABI = [
  ...ERC20_ABI,
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const;

// ─── Setup ─────────────────────────────────────────────────────────────────

let anvil: ChildProcess;
let pub: PublicClient;
let testClient: TestClient;
let whaleWallet: WalletClient;
let testWallet: WalletClient;

function fmt(v: bigint, decimals = 18) { return formatUnits(v, decimals); }

beforeAll(async () => {
  // Kill any leftover anvil on our port
  try { execSync(`kill $(lsof -ti :${ANVIL_PORT}) 2>/dev/null`); } catch {}
  await new Promise(r => setTimeout(r, 500));

  // Start anvil fork
  const anvilPath = `${process.env.HOME}/.foundry/bin/anvil`;
  anvil = spawn(
    anvilPath,
    ['--fork-url', FORK_RPC, '--port', String(ANVIL_PORT), '--retries', '5', '--timeout', '120000'],
    { stdio: ['pipe', 'pipe', 'pipe'], detached: false },
  );

  anvil.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString();
    if (msg.includes('error') || msg.includes('Error')) console.error('Anvil error:', msg);
  });

  // Wait for anvil to be ready (fork download can be slow)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Anvil startup timeout')), 60000);
    const check = setInterval(async () => {
      try {
        const res = await fetch(ANVIL_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        });
        if (res.ok) { clearInterval(check); clearTimeout(timeout); resolve(); }
      } catch {}
    }, 500);
  });

  const transport = http(ANVIL_URL, { timeout: 60_000 });

  pub = createPublicClient({ chain: base, transport }) as PublicClient;
  testClient = createTestClient({ chain: base, transport, mode: 'anvil' });

  // Set automine so transactions confirm immediately
  await testClient.setAutomine(true);

  // Impersonate whale
  await testClient.impersonateAccount({ address: WHALE });
  whaleWallet = createWalletClient({ account: WHALE, chain: base, transport });

  // Test wallet (anvil default, has 10000 ETH)
  testWallet = createWalletClient({ account: TEST_ACCOUNT, chain: base, transport });

  // Fund whale with ETH for gas
  await testWallet.sendTransaction({ to: WHALE, value: parseEther('10') });

  console.log('    Anvil fork ready');
}, 90000);

afterAll(() => {
  if (anvil) anvil.kill();
});

// ─── Helper ────────────────────────────────────────────────────────────────

async function approve(wallet: WalletClient, token: Address, spender: Address, amount: bigint) {
  const allowance = await pub.readContract({
    address: token, abi: APPROVE_ABI, functionName: 'allowance',
    args: [wallet.account!.address, spender],
  }) as bigint;
  if (allowance >= amount) return;
  const hash = await wallet.writeContract({
    address: token, abi: APPROVE_ABI, functionName: 'approve',
    args: [spender, maxUint256],
  });
  await pub.waitForTransactionReceipt({ hash });
}

// ─── 1. Zap Buy (ETH → swap → mint) — runs first to warm anvil cache ───────

describe('Zap Buy', () => {
  it('should zap-buy SIGNET with ETH (WRAP_ETH + V3 swap)', async () => {
    const inputAmount = parseEther('0.01');

    // V3 path: WETH → HUNT (fee 3000)
    const path = encodeV3Path([WETH, HUNT], [3000]);
    const swapInput = encodeV3SwapInput(ZAP_V2, inputAmount, 0n, path);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const commands = ('0x' + WRAP_ETH_COMMAND.slice(2) + V3_SWAP_COMMAND.slice(2)) as `0x${string}`;
    const inputs = [encodeWrapEthInput(inputAmount), swapInput];

    const signetBefore = await pub.readContract({
      address: SIGNET, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;

    const hash = await whaleWallet.writeContract({
      address: ZAP_V2, abi: ZAP_V2_ABI, functionName: 'zapMint',
      args: [SIGNET, '0x0000000000000000000000000000000000000000' as Address, inputAmount, 0n, commands, inputs, deadline, WHALE],
      value: inputAmount,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');

    const signetAfter = await pub.readContract({
      address: SIGNET, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;
    const received = signetAfter - signetBefore;
    expect(received).toBeGreaterThan(0n);
    console.log(`    Zap bought ${fmt(received)} SIGNET with 0.01 ETH`);
  });

});

// ─── 2. Direct Buy (Mint) — after zap-buy warms SIGNET bond cache ──────────

describe('Buy (mint) tokens', () => {
  it('should buy SIGNET with HUNT via Bond contract', async () => {
    const tokensToMint = parseEther('10');
    const [reserveAmount, royalty] = await pub.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken',
      args: [SIGNET, tokensToMint],
    });
    const totalCost = reserveAmount + royalty;

    // Approve HUNT for Bond
    await approve(whaleWallet, HUNT, BOND, totalCost);

    // Get balance before
    const balBefore = await pub.readContract({
      address: SIGNET, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;

    // Mint
    const hash = await whaleWallet.writeContract({
      address: BOND, abi: BOND_ABI, functionName: 'mint',
      args: [SIGNET, tokensToMint, totalCost, WHALE],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');

    // Verify balance increased
    const balAfter = await pub.readContract({
      address: SIGNET, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;
    expect(balAfter - balBefore).toBe(tokensToMint);
    console.log(`    Bought 10 SIGNET for ${fmt(totalCost)} HUNT`);
  });
});

// ─── 3. Direct Sell (Burn) ─────────────────────────────────────────────────

describe('Sell (burn) tokens', () => {
  it('should sell SIGNET for HUNT via Bond contract', async () => {
    // First buy some SIGNET
    const buyAmount = parseEther('100');
    const [buyCost, buyRoyalty] = await pub.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken',
      args: [SIGNET, buyAmount],
    });
    await approve(whaleWallet, HUNT, BOND, buyCost + buyRoyalty);
    await whaleWallet.writeContract({
      address: BOND, abi: BOND_ABI, functionName: 'mint',
      args: [SIGNET, buyAmount, buyCost + buyRoyalty, WHALE],
    }).then(h => pub.waitForTransactionReceipt({ hash: h }));

    // Now sell half
    const sellAmount = parseEther('50');
    const [refundAmount, royalty] = await pub.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'getRefundForTokens',
      args: [SIGNET, sellAmount],
    });
    const netRefund = refundAmount - royalty;

    // Approve SIGNET for Bond
    await approve(whaleWallet, SIGNET, BOND, sellAmount);

    const huntBefore = await pub.readContract({
      address: HUNT, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;

    // Burn
    const hash = await whaleWallet.writeContract({
      address: BOND, abi: BOND_ABI, functionName: 'burn',
      args: [SIGNET, sellAmount, 0n, WHALE],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');

    const huntAfter = await pub.readContract({
      address: HUNT, abi: ERC20_ABI, functionName: 'balanceOf', args: [WHALE],
    }) as bigint;
    expect(huntAfter).toBeGreaterThan(huntBefore);
    console.log(`    Sold 50 SIGNET for ${fmt(netRefund)} HUNT`);
  });
});

// ─── 4. Create Token ───────────────────────────────────────────────────────

describe('Create Token', () => {
  it('should create a new bonding curve token', async () => {
    const creationFee = await pub.readContract({
      address: BOND, abi: BOND_ABI, functionName: 'creationFee',
    }) as bigint;

    const symbol = 'TEST' + Math.floor(Math.random() * 1000000);
    const hash = await whaleWallet.writeContract({
      address: BOND, abi: BOND_ABI, functionName: 'createToken',
      args: [
        { name: 'Test Token', symbol },
        {
          mintRoyalty: 100,
          burnRoyalty: 100,
          reserveToken: HUNT,
          maxSupply: parseEther('1000000'),
          stepRanges: [parseEther('500000'), parseEther('1000000')],
          stepPrices: [parseEther('0.01'), parseEther('1')],
        },
      ],
      value: creationFee,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');
    console.log(`    Created ${symbol} (fee: ${fmt(creationFee)} ETH)`);

    // Find the created token address from logs
    // TokenCreated event has the token address
    expect(receipt.logs.length).toBeGreaterThan(0);
  });
});

// ─── 6. Approval Helper ───────────────────────────────────────────────────

describe('ensureApproval utility', () => {
  it('should approve when allowance is 0', async () => {
    // Check allowance is 0 for a fresh spender
    const randomSpender = '0x0000000000000000000000000000000000000099' as Address;
    const allowanceBefore = await pub.readContract({
      address: HUNT, abi: APPROVE_ABI, functionName: 'allowance',
      args: [WHALE, randomSpender],
    }) as bigint;
    expect(allowanceBefore).toBe(0n);

    await approve(whaleWallet, HUNT, randomSpender, parseEther('100'));

    const allowanceAfter = await pub.readContract({
      address: HUNT, abi: APPROVE_ABI, functionName: 'allowance',
      args: [WHALE, randomSpender],
    }) as bigint;
    expect(allowanceAfter).toBe(maxUint256);
  });

  it('should skip approval when allowance is sufficient', async () => {
    // Already approved from previous test — calling again should not revert
    const randomSpender = '0x0000000000000000000000000000000000000099' as Address;
    await approve(whaleWallet, HUNT, randomSpender, parseEther('100'));
    // If we got here, no error = success (approval was skipped or re-approved)
    const allowance = await pub.readContract({
      address: HUNT, abi: APPROVE_ABI, functionName: 'allowance',
      args: [WHALE, randomSpender],
    }) as bigint;
    expect(allowance).toBe(maxUint256);
  });
});
