import { type Address, formatEther, formatUnits } from 'viem';
import { createInterface } from 'readline';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress } from '../config/contracts';
import { CHAIN_CONFIGS, type SupportedChain } from '../config/chains';
import { BOND_ABI } from '../abi/bond';
import { parse, parseSteps, shortHash, txUrl } from '../utils/format';
import {
  generateCurve,
  isCurveType,
  calculateMilestones,
  compactNum,
  type CurveType,
} from '../utils/curves';
import { getDecimals, getSymbol } from '../utils/symbol';
import { saveToken } from '../utils/tokens';

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export type CreateOptions = {
  steps?: string;
  curve?: string;
  initialPrice?: string;
  finalPrice?: string;
  mintRoyalty?: number;
  burnRoyalty?: number;
  yes?: boolean;
};

export async function create(
  name: string,
  symbol: string,
  reserve: Address,
  maxSupply: string,
  privateKey: `0x${string}`,
  opts: CreateOptions,
  chain: SupportedChain = 'base',
) {
  const pub = getPublicClient(chain);
  const wallet = getWalletClient(privateKey, chain);
  const account = wallet.account;
  const bond = getBondAddress(chain);
  const chainConfig = CHAIN_CONFIGS[chain];

  const [reserveDecimals, reserveSymbol] = await Promise.all([
    getDecimals(pub, reserve, chain),
    getSymbol(pub, reserve, chain),
  ]);

  let ranges: bigint[];
  let prices: bigint[];

  if (opts.curve) {
    if (!isCurveType(opts.curve)) {
      throw new Error(
        `Invalid curve: ${opts.curve}. Options: linear, exponential, logarithmic, flat`,
      );
    }
    if (!opts.initialPrice || !opts.finalPrice) {
      throw new Error(
        '--initial-price and --final-price are required with --curve',
      );
    }
    ({ ranges, prices } = generateCurve(
      opts.curve as CurveType,
      maxSupply,
      opts.initialPrice,
      opts.finalPrice,
      reserveDecimals,
    ));
    console.log(
      `🚀 Creating "${name}" (${symbol}) on ${chainConfig.chain.name}...`,
    );
    console.log(`   Reserve: ${reserveSymbol} (${reserve}) | Max supply: ${maxSupply}`);
    console.log(
      `   Curve: ${opts.curve} | ${opts.initialPrice} → ${opts.finalPrice} | ${ranges.length} steps`,
    );
  } else if (opts.steps) {
    ({ ranges, prices } = parseSteps(opts.steps, reserveDecimals));
    console.log(
      `🚀 Creating "${name}" (${symbol}) on ${chainConfig.chain.name}...`,
    );
    console.log(
      `   Reserve: ${reserveSymbol} (${reserve}) | Max supply: ${maxSupply} | Steps: ${ranges.length}`,
    );
  } else {
    throw new Error(
      'Provide either --steps or --curve (with --initial-price and --final-price)',
    );
  }

  const mintRoyalty = opts.mintRoyalty ?? 0;
  const burnRoyalty = opts.burnRoyalty ?? 0;
  console.log(
    `   Royalties: mint ${mintRoyalty / 100}% / burn ${burnRoyalty / 100}%`,
  );

  const creationFee = await pub.readContract({
    address: bond,
    abi: BOND_ABI,
    functionName: 'creationFee',
  });
  if (creationFee > 0n) {
    console.log(
      `   Creation fee: ${formatEther(creationFee)} ${chainConfig.chain.nativeCurrency.symbol}`,
    );
  }

  console.log(
    `\n📊 Price Range: ${formatUnits(prices[0], reserveDecimals)} → ${formatUnits(prices[prices.length - 1], reserveDecimals)} ${reserveSymbol} per token`,
  );

  const milestones = calculateMilestones(ranges, prices);
  const maxTvl = milestones[milestones.length - 1].cost;
  console.log('\n💰 Accumulated reserve required to mint:');
  console.log(
    `  ${milestones.map((milestone) => `${milestone.milestone}%`.padStart(12)).join('')}`,
  );
  console.log(
    `  ${milestones.map((milestone) => compactNum(milestone.cost, reserveDecimals).padStart(12)).join('')}`,
  );
  console.log(
    `\n🏦 Max TVL (fully minted): ${compactNum(maxTvl, reserveDecimals)} ${reserveSymbol}`,
  );

  if (!opts.yes) {
    const ok = await confirm('\n⚡ Proceed with token creation? (y/N) ');
    if (!ok) {
      console.log('❌ Cancelled.');
      return;
    }
  }

  const tokenParams = { name, symbol };
  const bondParams = {
    mintRoyalty,
    burnRoyalty,
    reserveToken: reserve,
    maxSupply: parse(maxSupply),
    stepRanges: ranges,
    stepPrices: prices,
  };

  const { result: tokenAddress } = await pub.simulateContract({
    account,
    address: bond,
    abi: BOND_ABI,
    functionName: 'createToken',
    args: [tokenParams, bondParams],
    value: creationFee,
  });

  console.log(`   Expected address: ${tokenAddress}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({
    address: bond,
    abi: BOND_ABI,
    functionName: 'createToken',
    args: [tokenParams, bondParams],
    value: creationFee,
  });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash, chain)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Transaction failed');

  saveToken(tokenAddress, chain);
  console.log(
    `✅ Token created at ${tokenAddress} (block ${receipt.blockNumber})`,
  );
}
