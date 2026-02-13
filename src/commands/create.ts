import { type Address } from 'viem';
import { createInterface } from 'readline';
import { getPublicClient, getWalletClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, parseSteps, shortHash, txUrl } from '../utils/format';
import { generateCurve, isCurveType, calculateMilestones, compactNum, type CurveType } from '../utils/curves';

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'); });
  });
}

export async function create(
  name: string, symbol: string, reserve: Address, maxSupply: string,
  privateKey: `0x${string}`,
  opts: { steps?: string; curve?: string; initialPrice?: string; finalPrice?: string; mintRoyalty?: number; burnRoyalty?: number; yes?: boolean },
) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;

  let ranges: bigint[], prices: bigint[];

  if (opts.curve) {
    if (!isCurveType(opts.curve)) throw new Error(`Invalid curve: ${opts.curve}. Options: linear, exponential, logarithmic, flat`);
    if (!opts.initialPrice || !opts.finalPrice) throw new Error('--initial-price and --final-price are required with --curve');
    ({ ranges, prices } = generateCurve(opts.curve as CurveType, maxSupply, opts.initialPrice, opts.finalPrice));
    console.log(`🚀 Creating "${name}" (${symbol}) on Base...`);
    console.log(`   Reserve: ${reserve} | Max supply: ${maxSupply}`);
    console.log(`   Curve: ${opts.curve} | ${opts.initialPrice} → ${opts.finalPrice} | ${ranges.length} steps`);
  } else if (opts.steps) {
    ({ ranges, prices } = parseSteps(opts.steps));
    console.log(`🚀 Creating "${name}" (${symbol}) on Base...`);
    console.log(`   Reserve: ${reserve} | Max supply: ${maxSupply} | Steps: ${ranges.length}`);
  } else {
    throw new Error('Provide either --steps or --curve (with --initial-price and --final-price)');
  }

  const mintRoyalty = opts.mintRoyalty ?? 0;
  const burnRoyalty = opts.burnRoyalty ?? 0;
  console.log(`   Royalties: mint ${mintRoyalty / 100}% / burn ${burnRoyalty / 100}%`);

  const creationFee = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'creationFee' });
  if (creationFee > 0n) console.log(`   Creation fee: ${fmt(creationFee)} ETH`);

  console.log(`\n📊 Price Range: ${fmt(prices[0])} → ${fmt(prices[prices.length - 1])} reserve per token`);

  const milestones = calculateMilestones(ranges, prices);
  const maxTvl = milestones[milestones.length - 1].cost;
  console.log(`\n💰 Accumulated reserve required to mint:`);
  console.log(`  ${milestones.map(m => `${m.milestone}%`.padStart(12)).join('')}`);
  console.log(`  ${milestones.map(m => compactNum(m.cost).padStart(12)).join('')}`);
  console.log(`\n🏦 Max TVL (fully minted): ${compactNum(maxTvl)} reserve`);

  if (!opts.yes) {
    const ok = await confirm('\n⚡ Proceed with token creation? (y/N) ');
    if (!ok) { console.log('❌ Cancelled.'); return; }
  }

  const tp = { name, symbol };
  const bp = { mintRoyalty, burnRoyalty, reserveToken: reserve, maxSupply: parse(maxSupply), stepRanges: ranges, stepPrices: prices };

  const { result: tokenAddr } = await pub.simulateContract({
    account, address: BOND, abi: BOND_ABI, functionName: 'createToken', args: [tp, bp], value: creationFee,
  });

  console.log(`   Expected address: ${tokenAddr}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({ address: BOND, abi: BOND_ABI, functionName: 'createToken', args: [tp, bp], value: creationFee });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') console.log(`✅ Token created at ${tokenAddr} (block ${receipt.blockNumber})`);
  else throw new Error('Transaction failed');
}
