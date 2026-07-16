import { describe, expect, it, vi } from 'vitest';
import { formatUnits, parseEther, type Address } from 'viem';
import { getPublicClient } from '../src/client';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import {
  getChainConfig,
  SUPPORTED_CHAIN_KEYS,
  type SupportedChain,
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
import { findBestRoute } from '../src/utils/uniswap/quote';
import { HUNT, SIGNET } from './helpers';

const ROBINHOOD_WETH_RESERVE_TOKEN =
  '0x06797F32891DD210bA085A2aB39d204Df4f11488' as Address;

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
  const codes = await Promise.all(
    addresses.map((address) => client.getCode({ address })),
  );
  for (const code of codes) {
    expect(code).toBeTruthy();
    expect(code).not.toBe('0x');
  }
}

integration('Supported-chain deployment integration', () => {
  for (const chain of SUPPORTED_CHAIN_KEYS) {
    it(`validates ${chain} protocol and routing deployments`, async () => {
      const config = getChainConfig(chain);
      const addresses = [
        config.contracts.bond,
        config.contracts.tokenImplementation,
        getZapV2Address(chain),
        UNIVERSAL_ROUTER_ADDRESSES[chain],
        config.uniswap.v2Factory,
        config.uniswap.v3Quoter.address,
        config.uniswap.v4Quoter,
        getWrappedNativeAddress(chain),
      ].filter((address): address is Address => address !== null);

      await expectContractCode(chain, addresses);

      const client = getPublicClient(chain);
      const [chainId, bond, weth, universalRouter] = await Promise.all([
        client.getChainId(),
        client.readContract({
          address: getZapV2Address(chain),
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'BOND',
        }),
        client.readContract({
          address: getZapV2Address(chain),
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'WETH',
        }),
        client.readContract({
          address: getZapV2Address(chain),
          abi: ZAP_DEPENDENCY_ABI,
          functionName: 'UNIVERSAL_ROUTER',
        }),
      ]);

      expect(chainId).toBe(config.chain.id);
      expect(bond.toLowerCase()).toBe(config.contracts.bond.toLowerCase());
      expect(weth.toLowerCase()).toBe(
        getWrappedNativeAddress(chain).toLowerCase(),
      );
      expect(universalRouter.toLowerCase()).toBe(
        UNIVERSAL_ROUTER_ADDRESSES[chain].toLowerCase(),
      );

      if (config.usdToken) {
        const wrappedNative = getWrappedNativeAddress(chain);
        const route = await findBestRoute({
          client,
          chain,
          input: wrappedNative,
          output: config.usdToken,
          amountIn: parseEther('0.01'),
        });
        expect(route.protocol).not.toBe('none');
        expect(route.inputToken.address.toLowerCase()).toBe(
          wrappedNative.toLowerCase(),
        );
        expect(route.outputToken.address.toLowerCase()).toBe(
          config.usdToken.toLowerCase(),
        );
        expect(route.amountOut).toBeGreaterThan(0n);
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
      config.uniswap.v3Quoter.address,
      config.uniswap.v4Quoter,
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
      chain.uniswap.v3Quoter.address,
      chain.uniswap.v4Quoter,
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
