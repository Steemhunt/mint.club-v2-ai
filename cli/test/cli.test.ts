import { describe, expect, it, vi } from 'vitest';
import { formatUnits, parseEther, type Address } from 'viem';
import { getPublicClient } from '../src/client';
import { BOND_ABI } from '../src/abi/bond';
import { ERC20_ABI } from '../src/abi/erc20';
import { ZAP_ABI } from '../src/abi/zap';
import { getChainConfig } from '../src/config/chains';
import {
  getBondAddress,
  getTokenImplementation,
  getWethAddress,
  getZapAddress,
  resolveToken,
  resolveTokenAsync,
} from '../src/config/contracts';
import { getBurnRefund, getMintCost } from '../src/utils/bond';
import { HUNT, SIGNET, WHALE } from './helpers';

const BASE_WETH_RESERVE_TOKEN =
  '0xDc52F068dc87353CEC580711A7013625e39A4ea4' as Address;
const ROBINHOOD_WETH_RESERVE_TOKEN =
  '0x06797F32891DD210bA085A2aB39d204Df4f11488' as Address;

vi.setConfig({ testTimeout: 30_000 });

async function expectContractCode(
  chain: 'base' | 'robinhood',
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
  it('has deployed Bond, ZapV1, and token implementation contracts', async () => {
    await expectContractCode('base', [
      getBondAddress('base'),
      getZapAddress('base'),
      getTokenImplementation('base'),
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

  it('simulates MCV2_ZapV1 mintWithEth for a live WETH-reserve token', async () => {
    const client = getPublicClient('base');
    const tokensToMint = parseEther('1');
    const [maxEthAmount] = await client.readContract({
      address: getBondAddress('base'),
      abi: BOND_ABI,
      functionName: 'getReserveForToken',
      args: [BASE_WETH_RESERVE_TOKEN, tokensToMint],
    });

    const simulation = await client.simulateContract({
      account: WHALE,
      address: getZapAddress('base'),
      abi: ZAP_ABI,
      functionName: 'mintWithEth',
      args: [BASE_WETH_RESERVE_TOKEN, tokensToMint, WHALE],
      value: maxEthAmount,
    });

    expect(simulation.request.address.toLowerCase()).toBe(
      getZapAddress('base').toLowerCase(),
    );
    expect(maxEthAmount).toBeGreaterThan(0n);
  });
});

describe('Robinhood protocol integration', () => {
  const chain = getChainConfig('robinhood');
  const weth = resolveToken('WETH', 'robinhood');
  const usdg = resolveToken('USDG', 'robinhood');

  it('has deployed protocol and canonical token contracts', async () => {
    await expectContractCode('robinhood', [
      chain.contracts.bond,
      chain.contracts.zap,
      chain.contracts.tokenImplementation,
      weth,
      usdg,
    ]);
  });

  it('wires MCV2_ZapV1 to the official Bond and WETH contracts', async () => {
    const client = getPublicClient('robinhood');
    const [bond, wrappedNative] = await Promise.all([
      client.readContract({
        address: getZapAddress('robinhood'),
        abi: ZAP_ABI,
        functionName: 'BOND',
      }),
      client.readContract({
        address: getZapAddress('robinhood'),
        abi: ZAP_ABI,
        functionName: 'WETH',
      }),
    ]);

    expect(bond.toLowerCase()).toBe(getBondAddress('robinhood').toLowerCase());
    expect(wrappedNative.toLowerCase()).toBe(
      getWethAddress('robinhood').toLowerCase(),
    );
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

  it('resolves a live Robinhood token symbol through the deployed implementation', async () => {
    await expect(
      resolveTokenAsync('RERE', getPublicClient('robinhood'), 'robinhood'),
    ).resolves.toBe(ROBINHOOD_WETH_RESERVE_TOKEN);
  });

  it('reads live Robinhood Mint Club quotes with protocol royalty semantics', async () => {
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

  it('simulates MCV2_ZapV1 mintWithEth on Robinhood', async () => {
    const client = getPublicClient('robinhood');
    const tokensToMint = parseEther('1');
    const bond = await client.readContract({
      address: getBondAddress('robinhood'),
      abi: BOND_ABI,
      functionName: 'tokenBond',
      args: [ROBINHOOD_WETH_RESERVE_TOKEN],
    });
    const quote = await getMintCost(
      client,
      ROBINHOOD_WETH_RESERVE_TOKEN,
      tokensToMint,
      'robinhood',
    );

    const simulation = await client.simulateContract({
      account: bond[0],
      address: getZapAddress('robinhood'),
      abi: ZAP_ABI,
      functionName: 'mintWithEth',
      args: [ROBINHOOD_WETH_RESERVE_TOKEN, tokensToMint, bond[0]],
      value: quote.totalCost,
    });

    expect(simulation.request.address.toLowerCase()).toBe(
      getZapAddress('robinhood').toLowerCase(),
    );
    expect(quote.totalCost).toBeGreaterThan(0n);
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
