import { type Address, formatUnits } from 'viem';
import { getPublicClient, getWalletClient } from '../client';
import { BOND, tokenDecimals } from '../config/contracts';
import { BOND_ABI } from '../abi/bond';
import { parse, shortHash, txUrl } from '../utils/format';
import { saveToken } from '../utils/tokens';
import { ensureApproval } from '../utils/approve';
import { getSymbol } from '../utils/symbol';

export async function sell(token: Address, amount: string, minRefund: string | undefined, privateKey: `0x${string}`) {
  const pub = getPublicClient();
  const wallet = getWalletClient(privateKey);
  const account = wallet.account;
  const tokensToBurn = parse(amount);

  // Get token info
  const bondData = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'tokenBond', args: [token] });
  const reserveToken = bondData[4] as Address;
  const [tokenSym, reserveSym] = await Promise.all([getSymbol(pub, token), getSymbol(pub, reserveToken)]);
  const reserveDec = tokenDecimals(reserveToken);
  const fmtR = (v: bigint) => formatUnits(v, reserveDec);

  console.log(`🔥 Selling ${amount} ${tokenSym}...`);
  const [refundAmount, royalty] = await pub.readContract({ address: BOND, abi: BOND_ABI, functionName: 'getRefundForTokens', args: [token, tokensToBurn] });
  const netRefund = refundAmount - royalty;
  console.log(`   Refund: ${fmtR(refundAmount)} - ${fmtR(royalty)} royalty = ${fmtR(netRefund)} ${reserveSym}`);
  if (minRefund && netRefund < parse(minRefund)) throw new Error(`Refund ${fmtR(netRefund)} ${reserveSym} below minimum ${minRefund}`);

  const minRef = minRefund ? parse(minRefund) : 0n;
  await ensureApproval(pub, wallet, token, BOND, tokensToBurn);
  const args = [token, tokensToBurn, minRef, account.address] as const;
  await pub.simulateContract({ account, address: BOND, abi: BOND_ABI, functionName: 'burn', args });
  console.log('📤 Sending...');
  const hash = await wallet.writeContract({ address: BOND, abi: BOND_ABI, functionName: 'burn', args });
  console.log(`   TX: ${shortHash(hash)}`);
  console.log(`   ${txUrl(hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') { saveToken(token); console.log(`✅ Sold ${amount} ${tokenSym} for ${fmtR(netRefund)} ${reserveSym}`); }
  else throw new Error('Transaction failed');
}
