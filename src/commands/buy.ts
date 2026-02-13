import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash } from '../utils/format';

export async function buy(token: Address, amount: string, maxCost: string | undefined, privateKey: `0x${string}`) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;
  const tokensToMint = parse(amount);
  console.log(`🛒 Buying ${amount} tokens of ${token} on Base...`);
  const [reserveAmount, royalty] = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getReserveForToken', args: [token, tokensToMint] });
  const totalCost = reserveAmount + royalty;
  console.log(`   Reserve: ${fmt(reserveAmount)} | Royalty: ${fmt(royalty)} | Total: ${fmt(totalCost)}`);
  if (maxCost && totalCost > parse(maxCost)) throw new Error(`Cost ${fmt(totalCost)} exceeds max ${maxCost}`);
  const args = [token, tokensToMint, totalCost, account.address] as const;
  await pub.simulateContract({ account, address: BOND, abi: BOND_ABI, functionName: 'mint', args });
  console.log('📤 Sending...');
  const hash = await wallet.writeContract({ address: BOND, abi: BOND_ABI, functionName: 'mint', args });
  console.log(`   TX: ${shortHash(hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') console.log(`✅ Bought ${amount} tokens for ${fmt(totalCost)} reserve (block ${receipt.blockNumber})`);
  else throw new Error('Transaction failed');
}
