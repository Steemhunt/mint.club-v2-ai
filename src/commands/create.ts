import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { getBondAddress } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, parseSteps, shortHash } from '../utils/format';
import type { SupportedChain } from '../config/chains';

export async function create(
  name: string, symbol: string, reserve: Address, maxSupply: string,
  steps: string, chain: SupportedChain, privateKey: `0x${string}`,
  mintRoyalty = 0, burnRoyalty = 0,
) {
  const pub = getPublicClient(chain);
  const wallet = getWalletClient(chain, privateKey);
  const bond = getBondAddress(chain);
  const account = wallet.account;

  const { ranges, prices } = parseSteps(steps);

  console.log(`🚀 Creating "${name}" (${symbol}) on ${chain}...`);
  console.log(`   Reserve: ${reserve} | Max supply: ${maxSupply} | Steps: ${ranges.length}`);
  console.log(`   Royalties: mint ${mintRoyalty / 100}% / burn ${burnRoyalty / 100}%`);

  const creationFee = await pub.readContract({ address: bond, abi: BOND_ABI, functionName: 'creationFee' });
  if (creationFee > 0n) console.log(`   Creation fee: ${fmt(creationFee)} ETH`);

  const tp = { name, symbol };
  const bp = {
    mintRoyalty, burnRoyalty,
    reserveToken: reserve,
    maxSupply: parse(maxSupply),
    stepRanges: ranges,
    stepPrices: prices,
  };

  const { result: tokenAddr } = await pub.simulateContract({
    account, address: bond, abi: BOND_ABI, functionName: 'createToken',
    args: [tp, bp], value: creationFee,
  });

  console.log(`   Expected address: ${tokenAddr}`);
  console.log('📤 Sending...');

  const hash = await wallet.writeContract({
    address: bond, abi: BOND_ABI, functionName: 'createToken',
    args: [tp, bp], value: creationFee,
  });
  console.log(`   TX: ${shortHash(hash)}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`✅ Token created at ${tokenAddr} (block ${receipt.blockNumber})`);
  } else {
    throw new Error('Transaction failed');
  }
}
