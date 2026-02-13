import { type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { fmt, parse, shortHash, txUrl } from '../utils/format';
import { saveToken } from '../utils/tokens';
import { ensureApproval } from '../utils/approve';

export async function sell(token: Address, amount: string, minRefund: string | undefined, privateKey: `0x${string}`) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;
  const tokensToBurn = parse(amount);
  console.log(`🔥 Selling ${amount} tokens of ${token} on Base...`);
  const [refundAmount, royalty] = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getRefundForTokens', args: [token, tokensToBurn] });
  const netRefund = refundAmount - royalty;
  console.log(`   Refund: ${fmt(refundAmount)} | Royalty: ${fmt(royalty)} | Net: ${fmt(netRefund)}`);
  if (minRefund && netRefund < parse(minRefund)) throw new Error(`Refund ${fmt(netRefund)} below minimum ${minRefund}`);
  const minRef = minRefund ? parse(minRefund) : 0n;
  await ensureApproval(pub, wallet, token, BOND, tokensToBurn);
  const args = [token, tokensToBurn, minRef, account.address] as const;
  await pub.simulateContract({ account, address: BOND, abi: BOND_ABI, functionName: 'burn', args });
  console.log('📤 Sending...');
  const hash = await wallet.writeContract({ address: BOND, abi: BOND_ABI, functionName: 'burn', args });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') { saveToken(token); console.log(`✅ Sold ${amount} tokens for ${fmt(netRefund)} reserve (block ${receipt.blockNumber})`); }
  else throw new Error('Transaction failed');
}
