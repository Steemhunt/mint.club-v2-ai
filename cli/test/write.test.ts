import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
  type Hex,
  type PublicClient,
  type TestClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { accessSync, constants } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { delimiter, resolve } from 'path';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import {
  getBondAddress,
  getZapV2Address,
  resolveToken,
} from '../src/config/contracts';
import { ZERO_ADDRESS } from '../src/config/chains';
import { zapBuy } from '../src/commands/zap-buy';
import { zapSell } from '../src/commands/zap-sell';
import { ensureApproval } from '../src/utils/approve';
import {
  DEFAULT_ZAP_DEPENDENCIES,
  type ZapCommandDependencies,
} from '../src/utils/zap-v2';
import { findBestRoute } from '../src/utils/uniswap/quote';
import type { TransactionOptions } from '../src/utils/transaction';
import { FORK_BLOCK, HUNT, SIGNET, WHALE } from './helpers';

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

const RUN_FORK_TESTS = process.env.RUN_FORK_TESTS === '1';
const ANVIL_PORT = Number.parseInt(process.env.ANVIL_PORT ?? '8546', 10);
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const FORK_RPC =
  process.env.BASE_FORK_RPC_URL ??
  process.env.MINTCLUB_RPC_BASE ??
  'https://mainnet.base.org';
const TEST_KEY =
  '0xf5657151f2e7c31ce130ed8bf6a28a19398a68ea83cb49e5e47ed5a91ec2c8df' as `0x${string}`;
const TEST_ACCOUNT = privateKeyToAccount(TEST_KEY);
const BOND = getBondAddress('base');
const ZAP_V2 = getZapV2Address('base');
const WETH = resolveToken('WETH', 'base');

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findAnvil(): string | undefined {
  const explicit = process.env.ANVIL_PATH?.trim();
  if (explicit && isExecutable(explicit)) return explicit;

  const executable = process.platform === 'win32' ? 'anvil.exe' : 'anvil';
  return (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => resolve(directory, executable))
    .find(isExecutable);
}

const ANVIL = findAnvil();
if (RUN_FORK_TESTS && !ANVIL) {
  throw new Error(
    'RUN_FORK_TESTS=1 requires Anvil. Set ANVIL_PATH or add anvil to PATH.',
  );
}

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

const FORK_BOND_ABI = [
  ...BOND_ABI,
  {
    type: 'function',
    name: 'createMultiToken',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'tp',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'uri', type: 'string' },
        ],
      },
      {
        name: 'bp',
        type: 'tuple',
        components: [
          { name: 'mintRoyalty', type: 'uint16' },
          { name: 'burnRoyalty', type: 'uint16' },
          { name: 'reserveToken', type: 'address' },
          { name: 'maxSupply', type: 'uint128' },
          { name: 'stepRanges', type: 'uint128[]' },
          { name: 'stepPrices', type: 'uint128[]' },
        ],
      },
    ],
    outputs: [{ type: 'address' }],
  },
] as const;

const ERC1155_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const WETH_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const;

const ZAP_VIEW_ABI = [
  {
    type: 'function',
    name: 'UNIVERSAL_ROUTER',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

function format(value: bigint) {
  return formatUnits(value, 18);
}

async function waitForAnvil(anvil: ChildProcess): Promise<void> {
  let stderr = '';
  anvil.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  await new Promise<void>((resolveStartup, rejectStartup) => {
    const cleanup = () => {
      clearInterval(check);
      clearTimeout(timeout);
      anvil.off('error', onError);
      anvil.off('exit', onExit);
    };
    const succeed = () => {
      cleanup();
      resolveStartup();
    };
    const fail = (error: Error) => {
      cleanup();
      rejectStartup(error);
    };
    const onError = (error: Error) => fail(error);
    const onExit = (code: number | null) =>
      fail(
        new Error(
          `Anvil exited during startup with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
        ),
      );
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            `Anvil startup timeout${stderr ? `: ${stderr.trim()}` : ''}`,
          ),
        ),
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
        if (response.ok) succeed();
      } catch {
        // Keep polling while Anvil starts.
      }
    }, 250);

    anvil.once('error', onError);
    anvil.once('exit', onExit);
  });
}

describe.skipIf(!RUN_FORK_TESTS)('Anvil Base fork write tests', () => {
  let anvil: ChildProcess;
  let publicClient: PublicClient;
  let testClient: TestClient;
  let whaleWallet: WalletClient;
  let testWallet: WalletClient;
  let snapshot: Hex;
  let lastCliReceipt: TransactionReceipt;
  let forkTimestamp: bigint;
  let router: Address;
  let wethReserveERC20: Address;
  let wethReserveERC1155: Address;

  async function waitForSuccess(hash: Hex): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Fork transaction failed');
  }

  async function createWethReserveERC20(): Promise<Address> {
    const creationFee = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'creationFee',
    });
    const simulation = await publicClient.simulateContract({
      account: TEST_ACCOUNT,
      address: BOND,
      abi: BOND_ABI,
      functionName: 'createToken',
      args: [
        { name: 'Fork Zap ERC20', symbol: 'FORKZAP20' },
        {
          mintRoyalty: 100,
          burnRoyalty: 100,
          reserveToken: WETH,
          maxSupply: parseEther('10000'),
          stepRanges: [parseEther('10000')],
          stepPrices: [parseEther('0.01')],
        },
      ],
      value: creationFee,
    });
    const hash = await testWallet.writeContract(simulation.request);
    await waitForSuccess(hash);
    return simulation.result;
  }

  async function createWethReserveERC1155(): Promise<Address> {
    const creationFee = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'creationFee',
    });
    const simulation = await publicClient.simulateContract({
      account: TEST_ACCOUNT,
      address: BOND,
      abi: FORK_BOND_ABI,
      functionName: 'createMultiToken',
      args: [
        {
          name: 'Fork Zap ERC1155',
          symbol: 'FORKZAP1155',
          uri: 'ipfs://fork-zap/{id}.json',
        },
        {
          mintRoyalty: 100,
          burnRoyalty: 100,
          reserveToken: WETH,
          maxSupply: 10_000n,
          stepRanges: [10_000n],
          stepPrices: [parseEther('0.01')],
        },
      ],
      value: creationFee,
    });
    const hash = await testWallet.writeContract(simulation.request);
    await waitForSuccess(hash);
    return simulation.result;
  }

  function zapDependencies(
    overrides: Partial<ZapCommandDependencies> = {},
  ): ZapCommandDependencies {
    return {
      ...DEFAULT_ZAP_DEPENDENCIES,
      setupClients: () => ({
        publicClient,
        walletClient: testWallet as never,
        account: TEST_ACCOUNT.address,
      }),
      executeTransaction: async (
        client,
        wallet,
        _token,
        options: TransactionOptions,
      ) => {
        await client.simulateContract({
          account: wallet.account,
          ...options,
        } as never);
        const hash = await wallet.writeContract(options as never);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          throw new Error('Fork CLI transaction failed');
        }
        lastCliReceipt = receipt;
      },
      nowSeconds: () => forkTimestamp,
      ...overrides,
    };
  }

  const findDirectV3Route: ZapCommandDependencies['findBestRoute'] =
    (options) =>
      findBestRoute({
        ...options,
        protocols: ['v3'],
        intermediaries: [],
      });

  async function erc20Balance(token: Address, account: Address): Promise<bigint> {
    return publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    });
  }

  async function erc1155Balance(
    token: Address,
    account: Address,
  ): Promise<bigint> {
    return publicClient.readContract({
      address: token,
      abi: ERC1155_ABI,
      functionName: 'balanceOf',
      args: [account, 0n],
    });
  }

  async function depositWeth(amount: bigint): Promise<void> {
    const hash = await testWallet.writeContract({
      address: WETH,
      abi: WETH_ABI,
      functionName: 'deposit',
      value: amount,
    });
    await waitForSuccess(hash);
  }

  beforeAll(async () => {
    anvil = spawn(
      ANVIL!,
      [
        '--fork-url',
        FORK_RPC,
        '--fork-block-number',
        String(FORK_BLOCK),
        '--port',
        String(ANVIL_PORT),
        '--retries',
        '5',
        '--timeout',
        '120000',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    await waitForAnvil(anvil);

    const transport = http(ANVIL_URL, { timeout: 60_000 });
    publicClient = createPublicClient({
      chain: base,
      transport,
      cacheTime: 0,
    }) as PublicClient;
    testClient = createTestClient({ chain: base, transport, mode: 'anvil' });
    await testClient.setAutomine(true);
    await testClient.impersonateAccount({ address: WHALE });
    await testClient.setBalance({ address: WHALE, value: parseEther('10') });
    await testClient.setBalance({
      address: TEST_ACCOUNT.address,
      value: parseEther('10000'),
    });

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

    router = await publicClient.readContract({
      address: ZAP_V2,
      abi: ZAP_VIEW_ABI,
      functionName: 'UNIVERSAL_ROUTER',
    });
    wethReserveERC20 = await createWethReserveERC20();
    wethReserveERC1155 = await createWethReserveERC1155();
    forkTimestamp = (await publicClient.getBlock()).timestamp;
  });

  beforeEach(async () => {
    snapshot = await testClient.snapshot();
  });

  afterEach(async () => {
    await testClient.revert({ id: snapshot });
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

  it('round-trips native ETH through a WETH-reserve ERC-20 ZapV2 bond', async () => {
    const dependencies = zapDependencies();
    const routerWethBefore = await erc20Balance(WETH, router);
    const tokenBefore = await erc20Balance(
      wethReserveERC20,
      TEST_ACCOUNT.address,
    );

    await zapBuy(
      {
        privateKey: TEST_KEY,
        token: wethReserveERC20,
        inputToken: ZERO_ADDRESS,
        inputAmount: '1',
        slippageBps: 100,
        chain: 'base',
      },
      dependencies,
    );

    const tokenAfterBuy = await erc20Balance(
      wethReserveERC20,
      TEST_ACCOUNT.address,
    );
    const minted = tokenAfterBuy - tokenBefore;
    expect(minted).toBeGreaterThan(0n);

    const burnAmount = minted / 2n;
    const ethBeforeSell = await publicClient.getBalance({
      address: TEST_ACCOUNT.address,
      blockTag: 'pending',
    });
    await zapSell(
      {
        privateKey: TEST_KEY,
        token: wethReserveERC20,
        amount: formatUnits(burnAmount, 18),
        outputToken: ZERO_ADDRESS,
        slippageBps: 100,
        chain: 'base',
      },
      dependencies,
    );

    expect(
      await erc20Balance(wethReserveERC20, TEST_ACCOUNT.address),
    ).toBe(tokenAfterBuy - burnAmount);
    expect(
      await publicClient.getBalance({
        address: TEST_ACCOUNT.address,
        blockNumber: lastCliReceipt.blockNumber,
      }),
    ).toBeGreaterThan(ethBeforeSell);
    expect(await erc20Balance(WETH, router)).toBe(routerWethBefore);
  });

  it('round-trips native ETH through a WETH-reserve ERC-1155 ZapV2 bond', async () => {
    const dependencies = zapDependencies();
    const routerWethBefore = await erc20Balance(WETH, router);
    const tokenBefore = await erc1155Balance(
      wethReserveERC1155,
      TEST_ACCOUNT.address,
    );

    await zapBuy(
      {
        privateKey: TEST_KEY,
        token: wethReserveERC1155,
        inputToken: ZERO_ADDRESS,
        inputAmount: '1',
        slippageBps: 100,
        chain: 'base',
      },
      dependencies,
    );

    const tokenAfterBuy = await erc1155Balance(
      wethReserveERC1155,
      TEST_ACCOUNT.address,
    );
    const minted = tokenAfterBuy - tokenBefore;
    expect(minted).toBeGreaterThan(1n);

    const burnAmount = minted / 2n;
    const ethBeforeSell = await publicClient.getBalance({
      address: TEST_ACCOUNT.address,
      blockTag: 'pending',
    });
    await zapSell(
      {
        privateKey: TEST_KEY,
        token: wethReserveERC1155,
        amount: formatUnits(burnAmount, 0),
        outputToken: ZERO_ADDRESS,
        slippageBps: 100,
        chain: 'base',
      },
      dependencies,
    );

    expect(
      await erc1155Balance(wethReserveERC1155, TEST_ACCOUNT.address),
    ).toBe(tokenAfterBuy - burnAmount);
    expect(
      await publicClient.getBalance({
        address: TEST_ACCOUNT.address,
        blockNumber: lastCliReceipt.blockNumber,
      }),
    ).toBeGreaterThan(ethBeforeSell);
    expect(await erc20Balance(WETH, router)).toBe(routerWethBefore);
  });

  it('routes WETH through SIGNET/HUNT and sweeps a larger runtime burn refund', async () => {
    await depositWeth(parseEther('0.05'));
    const dependencies = zapDependencies({
      findBestRoute: findDirectV3Route,
    });
    const signetBefore = await erc20Balance(SIGNET, TEST_ACCOUNT.address);

    await zapBuy(
      {
        privateKey: TEST_KEY,
        token: SIGNET,
        inputToken: WETH,
        inputAmount: '0.02',
        slippageBps: 500,
        chain: 'base',
      },
      dependencies,
    );

    const signetAfterBuy = await erc20Balance(SIGNET, TEST_ACCOUNT.address);
    expect(signetAfterBuy).toBeGreaterThan(signetBefore + parseEther('1'));

    const burnAmount = parseEther('1');
    const [quotedRefund] = await publicClient.readContract({
      address: BOND,
      abi: BOND_ABI,
      functionName: 'getRefundForTokens',
      args: [SIGNET, burnAmount],
    });
    const routerHuntBefore = await erc20Balance(HUNT, router);
    expect(routerHuntBefore).toBe(0n);

    let runtimeRefund = 0n;
    let accountHuntAfterShift = 0n;
    let shifted = false;
    const shiftingDependencies = zapDependencies({
      findBestRoute: findDirectV3Route,
      ensureApproval: async (pub, wallet, token, spender, amount) => {
        await ensureApproval(pub, wallet, token, spender, amount);
        if (shifted || token.toLowerCase() !== SIGNET.toLowerCase()) return;

        const shiftAmount = parseEther('2100');
        const [shiftCost] = await publicClient.readContract({
          address: BOND,
          abi: BOND_ABI,
          functionName: 'getReserveForToken',
          args: [SIGNET, shiftAmount],
        });
        await ensureApproval(
          publicClient,
          whaleWallet,
          HUNT,
          BOND,
          shiftCost,
        );
        const shiftHash = await whaleWallet.writeContract({
          address: BOND,
          abi: BOND_ABI,
          functionName: 'mint',
          args: [SIGNET, shiftAmount, shiftCost, WHALE],
        });
        await waitForSuccess(shiftHash);

        [runtimeRefund] = await publicClient.readContract({
          address: BOND,
          abi: BOND_ABI,
          functionName: 'getRefundForTokens',
          args: [SIGNET, burnAmount],
        });
        accountHuntAfterShift = await erc20Balance(
          HUNT,
          TEST_ACCOUNT.address,
        );
        shifted = true;
      },
    });
    const wethBeforeSell = await erc20Balance(WETH, TEST_ACCOUNT.address);

    await zapSell(
      {
        privateKey: TEST_KEY,
        token: SIGNET,
        amount: '1',
        outputToken: WETH,
        slippageBps: 500,
        chain: 'base',
      },
      shiftingDependencies,
    );

    expect(shifted).toBe(true);
    expect(runtimeRefund).toBeGreaterThan(quotedRefund);
    expect(await erc20Balance(HUNT, router)).toBe(0n);
    expect(
      (await erc20Balance(HUNT, TEST_ACCOUNT.address)) -
        accountHuntAfterShift,
    ).toBe(runtimeRefund - quotedRefund);
    expect(await erc20Balance(WETH, TEST_ACCOUNT.address)).toBeGreaterThan(
      wethBeforeSell,
    );
    expect(await erc20Balance(SIGNET, TEST_ACCOUNT.address)).toBe(
      signetAfterBuy - burnAmount,
    );
  });
});
