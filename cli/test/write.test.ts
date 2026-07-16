import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  formatUnits,
  http,
  maxUint256,
  parseEther,
  type Address,
  type PublicClient,
  type TestClient,
  type WalletClient,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import { ZAP_ABI } from '../src/abi/zap';
import { getBondAddress, getZapAddress } from '../src/config/contracts';
import { ensureApproval } from '../src/utils/approve';
import { HUNT, SIGNET, WHALE } from './helpers';

vi.setConfig({ testTimeout: 120_000 });

const ANVIL_PORT = 8546;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const ANVIL_PATH = `${process.env.HOME}/.foundry/bin/anvil`;
const FORK_RPC = 'https://base-rpc.publicnode.com';
const RUN_WRITE_TESTS = existsSync(ANVIL_PATH);
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
const TEST_ACCOUNT = privateKeyToAccount(TEST_KEY);
const BOND = getBondAddress('base');
const ZAP = getZapAddress('base');
const WETH_RESERVE_TOKEN =
  '0xDc52F068dc87353CEC580711A7013625e39A4ea4' as Address;

const APPROVE_ABI = [
  ...ERC20_ABI,
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

function format(value: bigint) {
  return formatUnits(value, 18);
}

describe.skipIf(!RUN_WRITE_TESTS)('Anvil protocol write tests', () => {
  let anvil: ChildProcess;
  let publicClient: PublicClient;
  let testClient: TestClient;
  let whaleWallet: WalletClient;
  let testWallet: WalletClient;

  beforeAll(async () => {
    anvil = spawn(
      ANVIL_PATH,
      [
        '--fork-url',
        FORK_RPC,
        '--port',
        String(ANVIL_PORT),
        '--retries',
        '5',
        '--timeout',
        '120000',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Anvil startup timeout')),
        60_000,
      );
      const check = setInterval(async () => {
        try {
          const response = await fetch(ANVIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1,
            }),
          });
          if (response.ok) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // Keep polling while Anvil starts.
        }
      }, 500);
    });

    const transport = http(ANVIL_URL, { timeout: 60_000 });
    publicClient = createPublicClient({ chain: base, transport }) as PublicClient;
    testClient = createTestClient({ chain: base, transport, mode: 'anvil' });
    await testClient.setAutomine(true);
    await testClient.impersonateAccount({ address: WHALE });

    whaleWallet = createWalletClient({
      account: WHALE,
      chain: base,
      transport,
    });
    testWallet = createWalletClient({
      account: TEST_ACCOUNT,
      chain: base,
      transport,
    });
    await testWallet.sendTransaction({ to: WHALE, value: parseEther('10') });
  });

  afterAll(() => {
    anvil?.kill();
  });

  it('mints through MCV2_Bond using the royalty-inclusive quote', async () => {
    const tokensToMint = parseEther('10');
    const [totalCost] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getReserveForToken',
      args: [SIGNET, tokensToMint],
    });

    await ensureApproval(
      publicClient,
      whaleWallet,
      HUNT,
      BOND,
      totalCost,
    );
    const before = await publicClient.readContract({
      address: SIGNET,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });
    const hash = await whaleWallet.writeContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'mint',
      args: [SIGNET, tokensToMint, totalCost, WHALE],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.readContract({
      address: SIGNET,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    expect(receipt.status).toBe('success');
    expect(after - before).toBe(tokensToMint);
  });

  it('burns through MCV2_Bond using the royalty-exclusive refund', async () => {
    const tokensToBurn = parseEther('1');
    const [netRefund] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getRefundForTokens',
      args: [SIGNET, tokensToBurn],
    });
    await ensureApproval(
      publicClient,
      whaleWallet,
      SIGNET,
      BOND,
      tokensToBurn,
    );

    const before = await publicClient.readContract({
      address: HUNT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });
    const hash = await whaleWallet.writeContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'burn',
      args: [SIGNET, tokensToBurn, netRefund, WHALE],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.readContract({
      address: HUNT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    expect(receipt.status).toBe('success');
    expect(after - before).toBe(netRefund);
  });

  it('mints a WETH-reserve token through MCV2_ZapV1', async () => {
    const tokensToMint = parseEther('1');
    const [maxEthAmount] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getReserveForToken',
      args: [WETH_RESERVE_TOKEN, tokensToMint],
    });
    const before = await publicClient.readContract({
      address: WETH_RESERVE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    const hash = await whaleWallet.writeContract({
      address: ZAP,
      abi: ZAP_ABI,
      functionName: 'mintWithEth',
      args: [WETH_RESERVE_TOKEN, tokensToMint, WHALE],
      value: maxEthAmount,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.readContract({
      address: WETH_RESERVE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    expect(receipt.status).toBe('success');
    expect(after - before).toBe(tokensToMint);
  });

  it('burns a WETH-reserve token through MCV2_ZapV1', async () => {
    const tokensToMint = parseEther('2');
    const tokensToBurn = parseEther('1');
    const [maxEthAmount] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getReserveForToken',
      args: [WETH_RESERVE_TOKEN, tokensToMint],
    });
    const mintHash = await whaleWallet.writeContract({
      address: ZAP,
      abi: ZAP_ABI,
      functionName: 'mintWithEth',
      args: [WETH_RESERVE_TOKEN, tokensToMint, WHALE],
      value: maxEthAmount,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    await ensureApproval(
      publicClient,
      whaleWallet,
      WETH_RESERVE_TOKEN,
      ZAP,
      tokensToBurn,
    );
    const [minRefund] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getRefundForTokens',
      args: [WETH_RESERVE_TOKEN, tokensToBurn],
    });
    const before = await publicClient.readContract({
      address: WETH_RESERVE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    const burnHash = await whaleWallet.writeContract({
      address: ZAP,
      abi: ZAP_ABI,
      functionName: 'burnToEth',
      args: [WETH_RESERVE_TOKEN, tokensToBurn, minRefund, WHALE],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: burnHash,
    });
    const after = await publicClient.readContract({
      address: WETH_RESERVE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE],
    });

    expect(receipt.status).toBe('success');
    expect(before - after).toBe(tokensToBurn);
  });

  it('creates a bonding curve token', async () => {
    const creationFee = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'creationFee',
    });
    const symbol = `TEST${Date.now()}`;
    const hash = await whaleWallet.writeContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'createToken',
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
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe('success');
    expect(receipt.logs.length).toBeGreaterThan(0);
    console.log(`Created ${symbol}; fee ${format(creationFee)} ETH`);
  });

  it('approves once and skips when allowance is already sufficient', async () => {
    const spender =
      '0x0000000000000000000000000000000000000099' as Address;
    const amount = parseEther('100');

    await ensureApproval(
      publicClient,
      whaleWallet,
      HUNT,
      spender,
      amount,
    );
    const first = await publicClient.readContract({
      address: HUNT,
      abi: APPROVE_ABI,
      functionName: 'allowance',
      args: [WHALE, spender],
    });
    await ensureApproval(
      publicClient,
      whaleWallet,
      HUNT,
      spender,
      amount,
    );
    const second = await publicClient.readContract({
      address: HUNT,
      abi: APPROVE_ABI,
      functionName: 'allowance',
      args: [WHALE, spender],
    });

    expect(first).toBe(maxUint256);
    expect(second).toBe(first);
  });
});
