import { describe, expect, it, vi } from 'vitest';
import { formatUnits, parseEther, type Address } from 'viem';
import { getPublicClient } from '../src/client';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import {
  getChainConfig,
  type SupportedChain,
} from '../src/config/chains';
import {
  getBondAddress,
  getTokenImplementation,
  resolveToken,
  resolveTokenAsync,
} from '../src/config/contracts';
import { getBurnRefund, getMintCost } from '../src/utils/bond';
import { generateCurve } from '../src/utils/curves';
import { HUNT, SIGNET } from './helpers';

const ROBINHOOD_WETH_RESERVE_TOKEN =
  '0x06797F32891DD210bA085A2aB39d204Df4f11488' as Address;

vi.setConfig({ testTimeout: 30_000 });

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

describe('Base protocol integration', () => {
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

describe('Robinhood protocol integration', () => {
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
