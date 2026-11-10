import { describe, expect, it, vi } from 'vitest';
import {
  encodeFunctionData,
  formatUnits,
  parseAbi,
  parseEther,
  type Address,
  type PublicClient,
} from 'viem';
import { getPublicClient } from '../src/client';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import { ZAP_V2_ABI } from '../src/abi/zap-v2';
import {
  getChainConfig,
  SUPPORTED_CHAIN_KEYS,
  ZERO_ADDRESS,
  type SupportedChain,
  type UniversalRouterVersion,
} from '../src/config/chains';
import {
  getBondAddress,
  getTokenImplementation,
  getWrappedNativeAddress,
  getZapV2Address,
  resolveToken,
  resolveTokenAsync,
} from '../src/config/contracts';
import { getBurnRefund, getMintCost } from '../src/utils/bond';
import { generateCurve } from '../src/utils/curves';
import { defillamaUsdRate } from '../src/utils/price';
import {
  encodeUniversalRouterPlan,
  type UniversalRouterPlan,
} from '../src/utils/uniswap/encode';
import { findBestRoute } from '../src/utils/uniswap/quote';
import { previewTokensReceived } from '../src/utils/zap-v2';
import { HUNT, SIGNET } from './helpers';

const ROBINHOOD_WETH_RESERVE_TOKEN =
  '0x06797F32891DD210bA085A2aB39d204Df4f11488' as Address;
const ELYSIUM_USDC_RESERVE_TOKEN =
  '0x5d32C26FF3866621Fd41289BE3bf384b938b3d03' as Address;
const ELYSIUM_WHYPE_RESERVE_TOKEN =
  '0x576D62e301e2317C203Dd70b0667470f4dDCa5A5' as Address;

const UNIVERSAL_ROUTER_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
]);
const REPLAY_ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const REPLAY_STATE_OVERRIDE = [
  { address: REPLAY_ACCOUNT, balance: parseEther('10') },
];
const REPLAY_AMOUNT_IN = parseEther('0.01');

const UNIVERSAL_ROUTER_ADDRESSES: Record<SupportedChain, Address> = {
  ethereum: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
  optimism: '0x851116D9223fabED8E56C0E6b8Ad0c31d98B3507',
  arbitrum: '0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3',
  avalanche: '0x94b75331AE8d42C1b61065089B7d48FE14aA73b7',
  base: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
  polygon: '0x1095692A6237d83C6a72F3F5eFEdb9A670C49223',
  bsc: '0x1906c1d672b88cD1B9aC7593301cA990F94Eae07',
  zora: '0x3315ef7cA28dB74aBADC6c44570efDF06b04B020',
  unichain: '0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3',
  robinhood: '0x8876789976dEcBfCbBbe364623C63652db8C0904',
  elysium: '0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a',
  sepolia: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
  'base-sepolia': '0x492E6456D9528771018DeB9E87ef7750EF184104',
};

vi.setConfig({ testTimeout: 120_000 });

const integration = describe.skipIf(
  process.env.RUN_INTEGRATION_TESTS !== '1',
);

const ZAP_DEPENDENCY_ABI = [
  {
    type: 'function',
    name: 'BOND',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'WETH',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'UNIVERSAL_ROUTER',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

async function expectContractCode(
  chain: SupportedChain,
  addresses: Address[],
) {
  const client = getPublicClient(chain);
  for (const address of addresses) {
    const code = await client.getCode({ address });
    expect(code).toBeTruthy();
    expect(code).not.toBe('0x');
  }
}

function replayDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1_000) + 1_200);
}

/** eth_call the live Universal Router with an encoded plan from a funded synthetic account. */
function replayOnRouter(
  client: PublicClient,
  router: Address,
  plan: UniversalRouterPlan,
  deadline: bigint,
) {
  return client.call({
    account: REPLAY_ACCOUNT,
    to: router,
    data: encodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: [plan.commands, plan.inputs, deadline],
    }),
    value: plan.value,
    stateOverride: REPLAY_STATE_OVERRIDE,
  });
}

integration('Supported-chain deployment integration', () => {
  for (const chain of SUPPORTED_CHAIN_KEYS) {
    it(`validates ${chain} protocol and routing deployments`, async () => {
      const config = getChainConfig(chain);
      const addresses = [
        config.contracts.bond,
        config.contracts.tokenImplementation,
        config.contracts.zapV2,
        UNIVERSAL_ROUTER_ADDRESSES[chain],
        config.uniswap.v2Factory,
        config.uniswap.v3Quoter?.address ?? null,
        config.uniswap.v4Quoter,
        getWrappedNativeAddress(chain),
      ].filter((address): address is Address => address !== null);

      await expectContractCode(chain, addresses);

      const client = getPublicClient(chain);
      expect(await client.getChainId()).toBe(config.chain.id);

      const zapV2 = getZapV2Address(chain);
      const [bond, weth, universalRouter] = await Promise.all([
        client.readContract({
          address: zapV2,
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'BOND',
        }),
        client.readContract({
          address: zapV2,
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'WETH',
        }),
        client.readContract({
          address: zapV2,
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'UNIVERSAL_ROUTER',
        }),
      ]);

      expect(bond.toLowerCase()).toBe(config.contracts.bond.toLowerCase());
      expect(weth.toLowerCase()).toBe(
        getWrappedNativeAddress(chain).toLowerCase(),
      );
      expect(universalRouter.toLowerCase()).toBe(
        UNIVERSAL_ROUTER_ADDRESSES[chain].toLowerCase(),
      );

      if (config.usdToken) {
        const route = await findBestRoute({
          client,
          chain,
          input: ZERO_ADDRESS,
          output: config.usdToken,
          amountIn: REPLAY_AMOUNT_IN,
        });
        expect(route.protocol).not.toBe('none');
        expect(route.inputToken.address).toBe(ZERO_ADDRESS);
        expect(route.outputToken.address.toLowerCase()).toBe(
          config.usdToken.toLowerCase(),
        );
        expect(route.amountOut).toBeGreaterThan(0n);

        // Replay the plan on the live router: the configured release must accept
        // it, and a release with a different swap input layout must reject it.
        const deadline = replayDeadline();
        const planFor = (universalRouterVersion: UniversalRouterVersion) =>
          encodeUniversalRouterPlan(route, {
            recipient: zapV2,
            universalRouterVersion,
            slippageBps: 1_000,
            deadline,
            inputRefund: { token: ZERO_ADDRESS, recipient: REPLAY_ACCOUNT },
          });
        const router = UNIVERSAL_ROUTER_ADDRESSES[chain];
        await replayOnRouter(
          client,
          router,
          planFor(config.uniswap.universalRouterVersion),
          deadline,
        );
        if (config.uniswap.universalRouterVersion !== '2.0') {
          await expect(
            replayOnRouter(client, router, planFor('2.0'), deadline),
          ).rejects.toThrow();
        }
      }
    });
  }
});

integration('Base protocol integration', () => {
  it('has deployed Mint Club and Uniswap routing contracts', async () => {
    const config = getChainConfig('base');
    await expectContractCode('base', [
      getBondAddress('base'),
      getTokenImplementation('base'),
      config.uniswap.v2Factory!,
      config.uniswap.v3Quoter!.address,
      config.uniswap.v4Quoter!,
    ]);
  });

  it('reads a live Mint Club bond', async () => {
    const client = getPublicClient('base');
    const bond = await client.readContract({
      address: getBondAddress('base'),
      abi: BOND_ABI,
      functionName: 'tokenBond',
      args: [SIGNET],
    });

    expect(bond[4].toLowerCase()).toBe(HUNT.toLowerCase());
    expect(bond[5]).toBeGreaterThan(0n);
  });

  it('treats live mint and burn quotes as royalty-adjusted totals', async () => {
    const client = getPublicClient('base');
    const amount = parseEther('1');
    const mint = await getMintCost(client, SIGNET, amount, 'base');
    const burn = await getBurnRefund(client, SIGNET, amount, 'base');

    expect(mint.totalCost).toBe(mint.reserveAmount);
    expect(mint.totalCost).toBeGreaterThan(mint.royalty);
    expect(burn.netRefund).toBe(burn.refundAmount);
    expect(burn.netRefund).toBeGreaterThan(0n);
    expect(mint.totalCost).toBeGreaterThan(burn.netRefund);
  });
});

integration('Robinhood protocol integration', () => {
  const chain = getChainConfig('robinhood');
  const weth = resolveToken('WETH', 'robinhood');
  const usdg = resolveToken('USDG', 'robinhood');

  it('has deployed protocol, canonical token, and Uniswap routing contracts', async () => {
    await expectContractCode('robinhood', [
      chain.contracts.bond,
      chain.contracts.tokenImplementation,
      chain.uniswap.v2Factory!,
      chain.uniswap.v3Quoter!.address,
      chain.uniswap.v4Quoter!,
      weth,
      usdg,
    ]);
  });

  it('reads canonical WETH and USDG metadata', async () => {
    const client = getPublicClient('robinhood');
    const [wethSymbol, wethDecimals, usdgSymbol, usdgDecimals] =
      await Promise.all([
        client.readContract({
          address: weth,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: weth,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
        client.readContract({
          address: usdg,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: usdg,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);

    expect(wethSymbol).toBe('WETH');
    expect(wethDecimals).toBe(18);
    expect(usdgSymbol).toBe('USDG');
    expect(usdgDecimals).toBe(6);
  });

  it('resolves a live Robinhood Mint Club token symbol', async () => {
    await expect(
      resolveTokenAsync('RERE', getPublicClient('robinhood'), 'robinhood'),
    ).resolves.toBe(ROBINHOOD_WETH_RESERVE_TOKEN);
  });

  it('reads live Mint Club quotes with protocol royalty semantics', async () => {
    const client = getPublicClient('robinhood');
    const amount = parseEther('1');
    const bond = await client.readContract({
      address: getBondAddress('robinhood'),
      abi: BOND_ABI,
      functionName: 'tokenBond',
      args: [ROBINHOOD_WETH_RESERVE_TOKEN],
    });
    const [mint, burn] = await Promise.all([
      getMintCost(client, ROBINHOOD_WETH_RESERVE_TOKEN, amount, 'robinhood'),
      getBurnRefund(client, ROBINHOOD_WETH_RESERVE_TOKEN, amount, 'robinhood'),
    ]);

    expect(bond[4].toLowerCase()).toBe(weth.toLowerCase());
    expect(mint.totalCost).toBe(mint.reserveAmount);
    expect(mint.totalCost).toBeGreaterThan(mint.royalty);
    expect(burn.netRefund).toBe(burn.refundAmount);
    expect(burn.netRefund).toBeGreaterThan(0n);
  });

  it('simulates a strictly increasing 6-decimal createToken curve', async () => {
    const client = getPublicClient('robinhood');
    const { ranges, prices } = generateCurve(
      'linear',
      '1000000',
      '0.01',
      '0.0101',
      6,
    );
    const [liveBond, creationFee] = await Promise.all([
      client.readContract({
        address: getBondAddress('robinhood'),
        abi: BOND_ABI,
        functionName: 'tokenBond',
        args: [ROBINHOOD_WETH_RESERVE_TOKEN],
      }),
      client.readContract({
        address: getBondAddress('robinhood'),
        abi: BOND_ABI,
        functionName: 'creationFee',
      }),
    ]);
    const symbol = `SIM${Date.now()}`;

    const simulation = await client.simulateContract({
      account: liveBond[0],
      address: getBondAddress('robinhood'),
      abi: BOND_ABI,
      functionName: 'createToken',
      args: [
        { name: 'Six Decimal Simulation', symbol },
        {
          mintRoyalty: 100,
          burnRoyalty: 100,
          reserveToken: usdg,
          maxSupply: parseEther('1000000'),
          stepRanges: ranges,
          stepPrices: prices,
        },
      ],
      value: creationFee,
    });

    expect(simulation.result).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(ranges.length).toBeLessThanOrEqual(101);
  });

  it('reads the Robinhood Bond creation fee', async () => {
    const client = getPublicClient('robinhood');
    const creationFee = await client.readContract({
      address: getBondAddress('robinhood'),
      abi: BOND_ABI,
      functionName: 'creationFee',
    });

    expect(creationFee).toBeGreaterThanOrEqual(0n);
    expect(Number(formatUnits(creationFee, 18))).toBeGreaterThanOrEqual(0);
  });
});

integration('Elysium protocol integration', () => {
  const chain = getChainConfig('elysium');
  const whype = resolveToken('WHYPE', 'elysium');
  const usdc = resolveToken('USDC', 'elysium');

  it('has deployed the canonical token contracts and targets Universal Router 2.2.0', async () => {
    await expectContractCode(
      'elysium',
      Object.values(chain.tokens)
        .map(({ address }) => address)
        .filter((address) => address !== ZERO_ADDRESS),
    );

    expect(chain.uniswap.universalRouterVersion).toBe('2.2.0');
  });

  it('reads canonical WHYPE and USDC metadata', async () => {
    const client = getPublicClient('elysium');
    const [whypeSymbol, whypeDecimals, usdcSymbol, usdcDecimals] =
      await Promise.all([
        client.readContract({
          address: whype,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: whype,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
        client.readContract({
          address: usdc,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: usdc,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);

    expect(whypeSymbol).toBe('WHYPE');
    expect(whypeDecimals).toBe(18);
    expect(usdcSymbol).toBe('USDC');
    expect(usdcDecimals).toBe(6);
  });

  it('resolves a live Elysium Mint Club token symbol', async () => {
    await expect(
      resolveTokenAsync('BELLY', getPublicClient('elysium'), 'elysium'),
    ).resolves.toBe(ELYSIUM_USDC_RESERVE_TOKEN);
  });

  it('reads live Mint Club mint quotes against the USDC reserve', async () => {
    const client = getPublicClient('elysium');
    const [bond, mint] = await Promise.all([
      client.readContract({
        address: getBondAddress('elysium'),
        abi: BOND_ABI,
        functionName: 'tokenBond',
        args: [ELYSIUM_USDC_RESERVE_TOKEN],
      }),
      getMintCost(client, ELYSIUM_USDC_RESERVE_TOKEN, parseEther('1'), 'elysium'),
    ]);

    expect(bond[4].toLowerCase()).toBe(usdc.toLowerCase());
    expect(mint.totalCost).toBe(mint.reserveAmount);
    expect(mint.totalCost).toBeGreaterThan(mint.royalty);
  });

  it('charges the Bond creation fee in HYPE', async () => {
    const creationFee = await getPublicClient('elysium').readContract({
      address: getBondAddress('elysium'),
      abi: BOND_ABI,
      functionName: 'creationFee',
    });

    expect(creationFee).toBe(parseEther('0.01'));
  });

  it('prices WHYPE through its HyperEVM original on DefiLlama', async () => {
    const price = await defillamaUsdRate('elysium', whype);

    expect(price).not.toBeNull();
    expect(price!).toBeGreaterThan(0);
  });

  it('mints through ZapV2 with a 2.2.0 routed plan and rejects the 2.0 layout', async () => {
    const client = getPublicClient('elysium');
    const zapV2 = getZapV2Address('elysium');
    const route = await findBestRoute({
      client,
      chain: 'elysium',
      input: ZERO_ADDRESS,
      output: usdc,
      amountIn: REPLAY_AMOUNT_IN,
    });
    expect(route.protocol).not.toBe('none');

    const deadline = replayDeadline();
    const zapMint = (universalRouterVersion: UniversalRouterVersion) => {
      const plan = encodeUniversalRouterPlan(route, {
        recipient: zapV2,
        universalRouterVersion,
        slippageBps: 1_000,
        deadline,
        inputRefund: { token: ZERO_ADDRESS, recipient: REPLAY_ACCOUNT },
      });
      return client.simulateContract({
        account: REPLAY_ACCOUNT,
        address: zapV2,
        abi: ZAP_V2_ABI,
        functionName: 'zapMint',
        args: [
          ELYSIUM_USDC_RESERVE_TOKEN,
          ZERO_ADDRESS,
          REPLAY_AMOUNT_IN,
          0n,
          plan.commands,
          plan.inputs,
          deadline,
          REPLAY_ACCOUNT,
        ],
        value: plan.value,
        stateOverride: REPLAY_STATE_OVERRIDE,
      });
    };
    const preview = await zapMint('2.2.0');
    expect(previewTokensReceived(preview.result)).toBeGreaterThan(0n);
    await expect(zapMint('2.0')).rejects.toThrow();
  });

  it('mints through ZapV2 with the direct wrap path for a WHYPE reserve', async () => {
    const preview = await getPublicClient('elysium').simulateContract({
      account: REPLAY_ACCOUNT,
      address: getZapV2Address('elysium'),
      abi: ZAP_V2_ABI,
      functionName: 'zapMint',
      args: [
        ELYSIUM_WHYPE_RESERVE_TOKEN,
        ZERO_ADDRESS,
        REPLAY_AMOUNT_IN,
        0n,
        '0x',
        [],
        replayDeadline(),
        REPLAY_ACCOUNT,
      ],
      value: REPLAY_AMOUNT_IN,
      stateOverride: REPLAY_STATE_OVERRIDE,
    });

    expect(previewTokensReceived(preview.result)).toBeGreaterThan(0n);
  });
});
